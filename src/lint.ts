import { normalizePrefix, startsWithId } from './naming';
import { detectStatus, extractDate, ProposalStatus } from './proposal';

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintIssue {
  line: number;
  startColumn: number;
  endColumn: number;
  severity: LintSeverity;
  code: string;
  message: string;
}

export interface LintOptions {
  statusAliases?: Record<string, string>;
  today?: string;
  idPrefix?: string;
  localize?: (message: string, ...args: Array<string | number | boolean>) => string;
}

export const ALLOWED_STATUS_TEXT = 'Draft / Ready / Implemented / Archived';

const EVIDENCE_KEYWORDS = ['事实', '证据', '依据', '验证', '验收'];

interface Heading {
  line: number;
  level: number;
  text: string;
}

interface MetaRow {
  line: number;
  key: string;
  value: string;
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function fenceMask(lines: string[]): boolean[] {
  const mask = new Array<boolean>(lines.length).fill(false);
  let fence: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    const match = /^(`{3,}|~{3,})/.exec(trimmed);
    if (fence !== undefined) {
      mask[i] = true;
      if (match && trimmed.startsWith(fence)) {
        fence = undefined;
      }
      continue;
    }
    if (match) {
      fence = match[1];
      mask[i] = true;
    }
  }
  return mask;
}

function collectHeadings(lines: string[], mask: boolean[]): Heading[] {
  const headings: Heading[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) {
      continue;
    }
    const match = /^(#{1,6})\s+(.+?)\s*$/.exec(lines[i]);
    if (match) {
      headings.push({ line: i, level: match[1].length, text: match[2] });
    }
  }
  return headings;
}

function collectMetaRows(lines: string[], mask: boolean[]): MetaRow[] {
  const rows: MetaRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (mask[i]) {
      continue;
    }
    const match = /^\s*\|\s*([^|]*?)\s*\|\s*(.*?)\s*\|\s*$/.exec(lines[i]);
    if (!match) {
      continue;
    }
    const key = match[1];
    const value = match[2];
    if (!value || /^-{2,}$/.test(value.replace(/\s/g, ''))) {
      continue;
    }
    rows.push({ line: i, key, value });
  }
  return rows;
}

function findMetaRow(rows: MetaRow[], keyword: string): MetaRow | undefined {
  return rows.find((row) => row.key.includes(keyword));
}

function defaultLocalize(message: string, ...args: Array<string | number | boolean>): string {
  return message.replace(/\{(\d+)\}/g, (placeholder, index: string) => String(args[Number(index)] ?? placeholder));
}

export function lintProposal(fileName: string, text: string, options: LintOptions = {}): LintIssue[] {
  const lines = splitLines(text);
  const mask = fenceMask(lines);
  const headings = collectHeadings(lines, mask);
  const metaRows = collectMetaRows(lines, mask);
  const issues: LintIssue[] = [];
  const prefix = normalizePrefix(options.idPrefix);
  const localize = options.localize ?? defaultLocalize;
  const h1 = headings.find((heading) => heading.level === 1);

  if (!h1) {
    issues.push({
      line: 0,
      startColumn: 0,
      endColumn: Math.max(1, (lines[0] ?? '').length),
      severity: 'error',
      code: 'adrp/missing-title',
      message: localize('Missing level-1 heading (expected "# {0}-000 Title"). File: {1}', prefix, fileName)
    });
  } else if (!startsWithId(h1.text, options.idPrefix)) {
    issues.push({
      line: h1.line,
      startColumn: 0,
      endColumn: lines[h1.line].length,
      severity: 'warning',
      code: 'adrp/title-prefix',
      message: localize(
        'Title should start with an ID, for example "# {0}-040 Proposal title", so sorting and quick open work correctly.',
        prefix
      )
    });
  }

  const statusRow = findMetaRow(metaRows, '状态');
  if (!statusRow) {
    issues.push({
      line: h1?.line ?? 0,
      startColumn: 0,
      endColumn: Math.max(1, (lines[h1?.line ?? 0] ?? '').length),
      severity: 'warning',
      code: 'adrp/missing-status',
      message: localize('No "Status" metadata row found. Add a table below the title, for example: "| Status | Draft |".')
    });
  } else {
    const { status } = detectStatus(statusRow.value, options.statusAliases);
    if (status === 'Unknown') {
      issues.push({
        line: statusRow.line,
        startColumn: 0,
        endColumn: lines[statusRow.line].length,
        severity: 'warning',
        code: 'adrp/unknown-status',
        message: localize(
          'Unrecognized status "{0}". Allowed values: {1}. If your team uses a custom status, map it with adrp.statusAliases.',
          statusRow.value,
          ALLOWED_STATUS_TEXT
        )
      });
    } else if ((status === 'Ready' || status === 'Implemented') && !hasEvidenceSection(headings)) {
      issues.push({
        line: statusRow.line,
        startColumn: 0,
        endColumn: lines[statusRow.line].length,
        severity: 'warning',
        code: 'adrp/status-without-evidence',
        message: localize(
          'Status is {0}, but the document has no evidence-related section. Add supporting evidence or change the status to Draft.',
          status
        )
      });
    }
  }

  const ownerRow = findMetaRow(metaRows, '负责人');
  if (statusRow && !ownerRow) {
    issues.push({
      line: statusRow.line,
      startColumn: 0,
      endColumn: lines[statusRow.line].length,
      severity: 'info',
      code: 'adrp/missing-owner',
      message: localize('The metadata table is missing an "Owner" row, making changes and reviews difficult to trace.')
    });
  }

  issues.push(...lintEmptySections(lines, mask, headings, localize));

  if (options.today) {
    const reviewRow = metaRows.find((row) => /复核|复审|有效期|review/i.test(row.key));
    const due = reviewRow ? extractDate(reviewRow.value) : undefined;
    if (reviewRow && due && due <= options.today) {
      issues.push({
        line: reviewRow.line,
        startColumn: 0,
        endColumn: lines[reviewRow.line].length,
        severity: 'info',
        code: 'adrp/overdue-review',
        message: localize(
          'Review date {0} has passed (as of {1}). Recheck the conclusion and update the date, or change the status to Draft.',
          due,
          options.today
        )
      });
    }
  }

  return issues.sort((a, b) => a.line - b.line || a.startColumn - b.startColumn);
}

function hasEvidenceSection(headings: Heading[]): boolean {
  return headings.some(
    (heading) => heading.level >= 2 && EVIDENCE_KEYWORDS.some((keyword) => heading.text.includes(keyword))
  );
}

function lintEmptySections(
  lines: string[],
  mask: boolean[],
  headings: Heading[],
  localize: (message: string, ...args: Array<string | number | boolean>) => string
): LintIssue[] {
  const issues: LintIssue[] = [];
  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    if (heading.level < 2) {
      continue;
    }
    let end = lines.length;
    let hasNestedHeading = false;
    for (let next = index + 1; next < headings.length; next++) {
      const candidate = headings[next];
      if (candidate.level <= heading.level) {
        end = candidate.line;
        break;
      }
      hasNestedHeading = true;
    }
    if (hasNestedHeading) {
      continue;
    }
    let hasContent = false;
    for (let i = heading.line + 1; i < end; i++) {
      const trimmed = (lines[i] ?? '').trim();
      if (trimmed.length === 0 || (mask[i] && trimmed.startsWith('```')) || trimmed.startsWith('~~~')) {
        continue;
      }
      if (/^<!--.*-->$/.test(trimmed)) {
        continue;
      }
      hasContent = true;
      break;
    }
    if (!hasContent) {
      issues.push({
        line: heading.line,
        startColumn: 0,
        endColumn: lines[heading.line].length,
        severity: 'warning',
        code: 'adrp/empty-section',
        message: localize('Section "{0}" has a heading but no content. Add a TODO note or remove the section.', heading.text)
      });
    }
  }
  return issues;
}

export function requiresEvidence(status: ProposalStatus): boolean {
  return status === 'Ready' || status === 'Implemented';
}
