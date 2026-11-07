/**
 * 提案元数据解析。该模块不依赖 vscode，可在纯 Node 环境下测试。
 */

import { formatId, idPattern, idScanPattern, titlePrefixPattern } from './naming';

export type ProposalStatus = 'Draft' | 'Ready' | 'Implemented' | 'Archived' | 'Unknown';

/** 状态的中文展示文案。放在纯模块里，供树视图与概览渲染共用。 */
export const STATUS_TEXT: Record<ProposalStatus, string> = {
  Implemented: '已实施',
  Ready: '已确定',
  Draft: '草稿',
  Archived: '已归档',
  Unknown: '未标注状态'
};

export interface ProposalMeta {
  /** 提案编号，如 DBIP-039 */
  id: string;
  /** 提案标题（已去掉编号前缀） */
  title: string;
  /** 规范化后的状态 */
  status: ProposalStatus;
  /** 原始状态文本，来自提案元信息表 */
  statusRaw?: string;
  /** 负责人 */
  owner?: string;
  /** 更新日期 */
  updated?: string;
  /** 复核到期日（元信息表「复核 / 复审 / 有效期」行），YYYY-MM-DD */
  reviewBy?: string;
  /** 标签（元信息表「标签 / Tag」行，逗号分隔） */
  tags: string[];
  /** 元信息表显式声明的关联提案编号（关联 / 相关 / 补充 / 依赖 / 前置 / 取代 行） */
  related: string[];
  /** 全文提到的其它提案编号（去重、去自身），用于引用关系与孤立判定 */
  mentions: string[];
}

/** 状态关键词。顺序不影响结果，取最先出现的匹配。 */
const STATUS_KEYWORDS: { status: ProposalStatus; pattern: RegExp }[] = [
  { status: 'Implemented', pattern: /implemented|已实施|已实现/gi },
  { status: 'Ready', pattern: /\bready\b|已确定/gi },
  { status: 'Archived', pattern: /archived|已归档/gi },
  { status: 'Draft', pattern: /\bdraft\b|草稿/gi }
];

/** 元信息表里只用来占位、等价于"没填"的取值。 */
const EMPTY_VALUE = /^(?:[-—–]+|待定|待补充|待认领|n\/a|none|tbd)$/i;

/** 关联关系行：任一关键字命中即视为声明了引用。 */
const RELATED_ROW = /关联|相关|补充|依赖|前置|取代|supersed/i;
/** 复核日期行。 */
const REVIEW_ROW = /复核|复审|有效期|review/i;
/** 标签行。 */
const TAG_ROW = /标签|tag/i;

/**
 * 把 `DBIP-7` / `dbip-007` 统一成 `DBIP-007`。
 *
 * @param prefix 编号前缀，默认 DBIP；见 adrp.idPrefix
 */
export function normalizeId(value: string, prefix?: string): string {
  const match = idPattern(prefix).exec(value);
  return match ? formatId(prefix, match[1]) : '';
}

/**
 * 抽取文本里出现的全部提案编号（去重、按出现顺序）。
 *
 * @param prefix 编号前缀，默认 DBIP；见 adrp.idPrefix
 */
export function collectIds(text: string, prefix?: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const scanner = idScanPattern(prefix);
  let match = scanner.exec(text);
  while (match) {
    const id = formatId(prefix, match[1]);
    if (!seen.has(id)) {
      seen.add(id);
      found.push(id);
    }
    match = scanner.exec(text);
  }
  return found;
}

const VALID_STATUSES: readonly ProposalStatus[] = ['Draft', 'Ready', 'Implemented', 'Archived'];

/** 把任意写法（draft / DRAFT / 草稿）归一化为规范状态名，无法识别时返回 undefined。 */
export function normalizeStatusName(value: string | undefined): ProposalStatus | undefined {
  if (!value) {
    return undefined;
  }
  const lower = value.trim().toLowerCase();
  return VALID_STATUSES.find((status) => status.toLowerCase() === lower);
}

/** 先按 adrp.statusAliases 做原文映射，命中即返回，避免内部叫法被降级为 Unknown。 */
function resolveAlias(raw: string, aliases?: Record<string, string>): ProposalStatus | undefined {
  if (!aliases) {
    return undefined;
  }
  const needle = raw.trim().toLowerCase();
  if (!needle) {
    return undefined;
  }
  for (const [key, target] of Object.entries(aliases)) {
    const normalizedTarget = normalizeStatusName(target);
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedTarget || !normalizedKey) {
      continue;
    }
    if (needle === normalizedKey || needle.includes(normalizedKey)) {
      return normalizedTarget;
    }
  }
  return undefined;
}

/**
 * 从文本中定位状态关键词，取出现位置最靠前的匹配。
 *
 * @param aliases 原文 → 规范状态的映射，用于「待确认」这类内部叫法
 */
export function detectStatus(
  raw: string | undefined,
  aliases?: Record<string, string>
): { status: ProposalStatus; raw?: string } {
  if (!raw) {
    return { status: 'Unknown' };
  }
  const aliased = resolveAlias(raw, aliases);
  if (aliased) {
    return { status: aliased, raw };
  }
  let best: { status: ProposalStatus; index: number } | undefined;
  for (const { status, pattern } of STATUS_KEYWORDS) {
    pattern.lastIndex = 0;
    const match = pattern.exec(raw);
    if (match && (best === undefined || match.index < best.index)) {
      best = { status, index: match.index };
    }
  }
  return best ? { status: best.status, raw } : { status: 'Unknown', raw };
}

/** 去掉标题里的编号前缀与首尾空白。 */
export function cleanTitle(rawTitle: string, prefix?: string): string {
  return rawTitle.replace(titlePrefixPattern(prefix), '').replace(/\s+$/, '').trim();
}

/**
 * 侧边栏展示用标题：以编号开头，如「DBIP-039 数据库实例入口 IP 白名单」。
 */
export function displayTitle(id: string, title: string): string {
  return id ? `${id} ${title}` : title;
}

/**
 * 从文件名解析编号，如 DBIP-039-instance-xxx.md → DBIP-039。
 *
 * @param prefix 编号前缀，默认 DBIP；见 adrp.idPrefix
 */
export function parseIdFromFileName(fileName: string, prefix?: string): string | undefined {
  const match = idPattern(prefix).exec(fileName);
  return match ? formatId(prefix, match[1]) : undefined;
}

/** 从任意文本里抽出一个 YYYY-MM-DD / YYYY/M/D 日期，规范化成 YYYY-MM-DD。 */
export function extractDate(value: string): string | undefined {
  const match = /(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/.exec(value);
  if (!match) {
    return undefined;
  }
  const month = match[2].padStart(2, '0');
  const day = match[3].padStart(2, '0');
  return `${match[1]}-${month}-${day}`;
}

/**
 * 提案开头的元信息表列名在不同作者之间不统一（状态 / 编号 / 状态 / 负责人 / 创建 / 更新日期…），
 * 这里按“列名包含关键字”匹配，不依赖具体表头写法。
 */
export interface ParseOptions {
  /** 状态别名映射，见 adrp.statusAliases */
  statusAliases?: Record<string, string>;
  /** 编号前缀，见 adrp.idPrefix（默认 DBIP） */
  idPrefix?: string;
}

/**
 * 解析一份提案正文。
 *
 * @param options 状态别名与编号前缀
 */
export function parseProposalText(
  fileName: string,
  text: string,
  options: ParseOptions = {}
): ProposalMeta {
  const { statusAliases, idPrefix } = options;
  const lines = text.split(/\r?\n/);

  let title = '';
  let titleLine = -1;
  for (let i = 0; i < lines.length; i++) {
    const heading = /^#\s+(.+?)\s*$/.exec(lines[i]);
    if (heading) {
      title = heading[1];
      titleLine = i;
      break;
    }
  }

  const id =
    parseIdFromFileName(fileName, idPrefix) ??
    (idPattern(idPrefix).exec(title)?.[0].toUpperCase() ?? '');
  const cleanedTitle = title ? cleanTitle(title, idPrefix) : '';

  let statusRaw: string | undefined;
  let owner: string | undefined;
  let updated: string | undefined;
  let reviewBy: string | undefined;
  let tags: string[] = [];
  const related: string[] = [];

  const start = titleLine >= 0 ? titleLine : 0;
  for (const line of lines.slice(start, start + 80)) {
    const row = /^\s*\|\s*([^|]*?)\s*\|\s*(.*?)\s*\|\s*$/.exec(line);
    if (!row) {
      continue;
    }
    const key = row[1];
    const value = row[2];
    if (!value || value === '---' || EMPTY_VALUE.test(value)) {
      continue;
    }
    if (RELATED_ROW.test(key)) {
      for (const ref of collectIds(value, idPrefix)) {
        if (!related.includes(ref)) {
          related.push(ref);
        }
      }
    } else if (REVIEW_ROW.test(key)) {
      if (!reviewBy) {
        reviewBy = extractDate(value);
      }
    } else if (TAG_ROW.test(key)) {
      if (tags.length === 0) {
        tags = value
          .split(/[,，、;/\s]+/)
          .map((item) => item.trim())
          .filter((item) => item.length > 0 && !EMPTY_VALUE.test(item));
      }
    } else if (!statusRaw && key.includes('状态')) {
      statusRaw = value;
    } else if (!owner && key.includes('负责人')) {
      owner = value;
    } else if (!updated && key.includes('更新')) {
      updated = value;
    }
  }

  const { status, raw } = detectStatus(statusRaw, statusAliases);
  const fallbackTitle = fileName.replace(/\.md$/i, '').replace(titlePrefixPattern(idPrefix), '');
  const mentions = collectIds(text, idPrefix).filter((ref) => ref !== id);

  return {
    id,
    title: cleanedTitle || fallbackTitle,
    status,
    statusRaw: raw,
    owner,
    updated: updated ? updated.split('/').pop()!.trim() : undefined,
    reviewBy,
    tags,
    related: related.filter((ref) => ref !== id),
    mentions
  };
}
