/**
 * 编号前缀与展示命名。该模块不依赖 vscode，可在纯 Node 环境下测试。
 *
 * 扩展本身不假设提案编号一定叫 DBIP：前缀由 `adrp.idPrefix` 决定（如 DBIP / ADR / RFC），
 * 静态视图名为 `ADR提案`，动态标题只显示 `adrp.titlePrefix`。
 */

/** 默认编号前缀，与本仓库现有提案（DBIP-001 …）保持一致。 */
export const DEFAULT_ID_PREFIX = 'DBIP';

/** 提案类文档的静态视图名称。 */
export const PROPOSAL_NOUN = 'ADR提案';

/** 编号补零位数，与现有提案（DBIP-001 … DBIP-039）保持一致。 */
export const ID_PAD = 3;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 归一化前缀：去掉首尾空白与多余符号，只保留字母、数字、下划线与连字符，统一大写。
 * 归一化后为空时回落到 `DEFAULT_ID_PREFIX`，保证解析逻辑永远不会拿到空模式。
 */
export function normalizePrefix(prefix?: string): string {
  const cleaned = (prefix ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '')
    .replace(/^[_-]+|[_-]+$/g, '');
  return cleaned ? cleaned.toUpperCase() : DEFAULT_ID_PREFIX;
}

/** 编号匹配模式（不带 g 标志，避免 lastIndex 状态污染）。 */
export function idPattern(prefix?: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(normalizePrefix(prefix))}-(\\d{1,4})\\b`, 'i');
}

/** 编号扫描模式（带 g）。调用方需要自行重置 lastIndex。 */
export function idScanPattern(prefix?: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(normalizePrefix(prefix))}-(\\d{1,4})\\b`, 'gi');
}

/** 标题行开头「编号 + 分隔符」的模式，用于把 `DBIP-001 标题` 还原成纯标题。 */
export function titlePrefixPattern(prefix?: string): RegExp {
  return new RegExp(`^${escapeRegExp(normalizePrefix(prefix))}-\\d{1,4}\\s*[：:、]?\\s*`, 'i');
}

/** 生成规范编号：formatId('ADR', 7) → ADR-007。 */
export function formatId(prefix: string | undefined, value: string | number): string {
  return `${normalizePrefix(prefix)}-${String(value).padStart(ID_PAD, '0')}`;
}

/** 判断一行文本是否以编号开头（用于 lint 的标题校验）。 */
export function startsWithId(text: string, prefix?: string): boolean {
  const match = idPattern(prefix).exec(text);
  return match !== null && match.index === 0;
}

/** 动态视图标题只显示前缀；固定视图名称由 package.json 提供。 */
export function viewTitle(titlePrefix?: string): string {
  return (titlePrefix ?? '').trim();
}
