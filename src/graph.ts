/**
 * 提案引用关系图与概览渲染。该模块不依赖 vscode，可在纯 Node 环境下测试。
 *
 * 关系来源是已有的元信息表与正文里出现的 `DBIP-NNN` 编号，不要求引入 frontmatter，
 * 因此对现存 30 份提案零改造成本。
 */

import { normalizePrefix } from './naming';
import { ProposalMeta, ProposalStatus, STATUS_TEXT } from './proposal';

export interface GraphNode {
  id: string;
  title: string;
  status: ProposalStatus;
  owner?: string;
  updated?: string;
  reviewBy?: string;
  tags: string[];
  /** 本提案明确声明或正文提到的其它提案 */
  outgoing: string[];
  /** 提到本提案的其它提案 */
  incoming: string[];
}

/** 一条指向不存在提案的引用。 */
export interface DanglingRef {
  from: string;
  to: string;
}

export interface OverviewOptions {
  /** 生成日期，YYYY-MM-DD */
  generatedAt: string;
  /** 概览文件相对工作区根的路径，写进文件头 */
  source: string;
  /** 判定"超期未复核"的基准日期，默认取 generatedAt */
  today?: string;
  /** 编号前缀，默认 DBIP；决定概览标题，见 adrp.idPrefix */
  idPrefix?: string;
}

/** 编号里的数字，用于稳定排序。 */
function idNumber(id: string): number {
  const value = Number(id.replace(/\D/g, ''));
  return Number.isFinite(value) ? value : 0;
}

/**
 * 构建引用关系图。
 *
 * outgoing 合并元信息表声明的关联提案与正文提及，保证像 DBIP-030 那样把引用写在
 * 「补充 / 相关」行里的写法也能识别。
 */
export function buildGraph(entries: readonly ProposalMeta[]): GraphNode[] {
  const nodes = new Map<string, GraphNode>();
  for (const entry of entries) {
    const outgoing: string[] = [];
    for (const ref of [...entry.related, ...entry.mentions]) {
      if (ref !== entry.id && !outgoing.includes(ref)) {
        outgoing.push(ref);
      }
    }
    nodes.set(entry.id, {
      id: entry.id,
      title: entry.title,
      status: entry.status,
      owner: entry.owner,
      updated: entry.updated,
      reviewBy: entry.reviewBy,
      tags: entry.tags,
      outgoing,
      incoming: []
    });
  }

  for (const node of nodes.values()) {
    for (const target of node.outgoing) {
      const other = nodes.get(target);
      if (other && !other.incoming.includes(node.id)) {
        other.incoming.push(node.id);
      }
    }
  }

  return [...nodes.values()].sort((a, b) => idNumber(a.id) - idNumber(b.id));
}

/** 既没有引用别人、也没有被别人引用的孤立提案。 */
export function findOrphans(nodes: readonly GraphNode[]): GraphNode[] {
  return nodes.filter((node) => node.outgoing.length === 0 && node.incoming.length === 0);
}

/** 引用了不存在提案的条目（写错编号、提案被删、跨仓库引用）。 */
export function findDanglingRefs(nodes: readonly GraphNode[]): DanglingRef[] {
  const known = new Set(nodes.map((node) => node.id));
  const refs: DanglingRef[] = [];
  for (const node of nodes) {
    for (const target of node.outgoing) {
      if (!known.has(target)) {
        refs.push({ from: node.id, to: target });
      }
    }
  }
  return refs;
}

/** 复核日期已过（含当天）的提案。无复核日期的不算超期。 */
export function findOverdueReview(nodes: readonly GraphNode[], today: string): GraphNode[] {
  return nodes.filter((node) => node.reviewBy !== undefined && node.reviewBy <= today);
}

/** 按状态统计数量，只保留出现过的状态。 */
export function countByStatus(nodes: readonly GraphNode[]): { status: ProposalStatus; count: number }[] {
  const order: ProposalStatus[] = ['Implemented', 'Ready', 'Draft', 'Archived', 'Unknown'];
  return order
    .map((status) => ({ status, count: nodes.filter((node) => node.status === status).length }))
    .filter((item) => item.count > 0);
}

function cell(value: string | undefined): string {
  const text = (value ?? '').replace(/\|/g, '\\|').trim();
  return text.length > 0 ? text : '-';
}

function refList(ids: readonly string[], limit = 4): string {
  if (ids.length === 0) {
    return '-';
  }
  const head = ids.slice(0, limit);
  const rest = ids.length - head.length;
  return rest > 0 ? `${head.join('、')} 等 ${ids.length} 份` : head.join('、');
}

/**
 * 渲染 `OVERVIEW.md`。
 *
 * 输出是普通 Markdown 表格，用 VS Code 自带预览即可看，不需要 webview 或图表库。
 */
export function renderOverview(nodes: readonly GraphNode[], options: OverviewOptions): string {
  const today = options.today ?? options.generatedAt;
  const orphans = findOrphans(nodes);
  const dangling = findDanglingRefs(nodes);
  const overdue = findOverdueReview(nodes, today);
  const counts = countByStatus(nodes);

  const lines: string[] = [];
  lines.push(`# ${normalizePrefix(options.idPrefix)} 提案关系概览`, '');
  lines.push(
    `> 本文件由 VS Code 扩展「生成关系概览」自动生成，请勿手工编辑。生成日期 ${options.generatedAt}，来源 \`${options.source}\`。`,
    ''
  );

  lines.push('## 汇总', '');
  lines.push('| 项 | 值 |', '|---|---|');
  lines.push(`| 提案总数 | ${nodes.length} |`);
  lines.push(`| 状态分布 | ${counts.map((item) => `${STATUS_TEXT[item.status]} ${item.count}`).join('、') || '-'} |`);
  lines.push(`| 孤立提案（无引用进出） | ${orphans.length} |`);
  lines.push(`| 悬空引用（指向不存在编号） | ${dangling.length} |`);
  lines.push(`| 超期未复核 | ${overdue.length} |`, '');

  lines.push('## 提案清单', '');
  lines.push('| 编号 | 标题 | 状态 | 负责人 | 更新日期 | 引用 | 被引用 | 复核日期 |', '|---|---|---|---|---|---|---|---|');
  for (const node of nodes) {
    lines.push(
      `| ${node.id} | ${cell(node.title)} | ${STATUS_TEXT[node.status]} | ${cell(node.owner)} | ${cell(
        node.updated
      )} | ${refList(node.outgoing)} | ${refList(node.incoming)} | ${cell(node.reviewBy)} |`
    );
  }
  lines.push('');

  if (orphans.length > 0) {
    lines.push('## 孤立提案', '');
    lines.push('既未引用其它提案，也未被其它提案引用。通常是新立项或已归档的独立主题，可考虑补上关联。', '');
    for (const node of orphans) {
      lines.push(`- ${node.id} ${node.title}（${STATUS_TEXT[node.status]}）`);
    }
    lines.push('');
  }

  if (dangling.length > 0) {
    lines.push('## 悬空引用', '');
    lines.push(
      '引用的编号在当前提案目录里找不到对应文件。常见原因是提案已移入 `develop/plans/history/` 快照，或编号写错。请人工确认后改写或删除引用。',
      ''
    );
    lines.push('| 来源 | 指向 |', '|---|---|');
    for (const ref of dangling) {
      lines.push(`| ${ref.from} | ${ref.to} |`);
    }
    lines.push('');
  }

  if (overdue.length > 0) {
    lines.push('## 超期未复核', '');
    lines.push(`以 ${today} 为基准，元信息表复核日期已到期。`, '');
    for (const node of overdue) {
      lines.push(`- ${node.id} ${node.title}：复核日期 ${node.reviewBy}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
