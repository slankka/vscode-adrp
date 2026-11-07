/**
 * 新建提案的纯逻辑：编号递增、文件名 slug、骨架渲染。
 * 不依赖 vscode，可在纯 Node 环境下测试。
 */

import { formatId, idPattern } from './naming';

export interface ScaffoldInput {
  /** 形如 DBIP-040 / ADR-001 */
  id: string;
  title: string;
  owner: string;
  /** YYYY-MM-DD */
  date: string;
}

/**
 * 根据已有编号算出下一个可用编号。
 * 传入值可以是 `DBIP-001`、`001` 或 `1`，无法解析的项会被忽略。
 *
 * @param prefix 编号前缀，默认 DBIP；见 adrp.idPrefix
 */
export function nextProposalId(existing: readonly string[], prefix?: string): string {
  const pattern = idPattern(prefix);
  let max = 0;
  for (const raw of existing) {
    const match = pattern.exec(raw) ?? /^(\d{1,4})$/.exec(raw.trim());
    if (!match) {
      continue;
    }
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > max) {
      max = value;
    }
  }
  return formatId(prefix, max + 1);
}

/**
 * 由标题生成文件名 slug。中文会被全部过滤，因此结果可能为空，
 * 调用方需要让用户补一个英文短名。
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

/** 校验 slug 是否可作为文件名主体。 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(slug) && !slug.includes('--');
}

/** 拼出提案文件名，如 DBIP-040-mysql-account-rotation.md */
export function proposalFileName(id: string, slug: string): string {
  return `${id}-${slug}.md`;
}

/** 渲染提案骨架。章节顺序与 develop/plans 现有提案的通用结构一致。 */
export function renderProposalScaffold(input: ScaffoldInput): string {
  const title = input.title.trim() || '未命名提案';
  const owner = input.owner.trim() || '待分配';
  return [
    `# ${input.id} ${title}`,
    '',
    '| 属性 | 内容 |',
    '|---|---|',
    '| 状态 | Draft |',
    `| 负责人 | ${owner} |`,
    `| 创建 / 更新日期 | ${input.date} |`,
    '| 关联提案 | - |',
    '| 复核日期 | - |',
    '| 标签 | - |',
    '',
    '## 1. 背景与目标',
    '',
    '待补充：要解决的问题、期望达成的目标。',
    '',
    '## 2. 事实与证据',
    '',
    '待补充：依据的文档、现场核实结论或验证方式。',
    '',
    '- ',
    '',
    '## 3. 范围与非目标',
    '',
    '范围内：待补充。',
    '',
    '非目标：待补充。',
    '',
    '## 4. 方案',
    '',
    '待补充。',
    '',
    '## 5. 验证与欠缺',
    '',
    '待补充：如何验收，以及当前仍未确认的事项。',
    ''
  ].join('\n');
}

/** 生成 YYYY-MM-DD 形式的本地日期。 */
export function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
