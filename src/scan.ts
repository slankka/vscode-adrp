import * as vscode from 'vscode';
import { normalizePrefix } from './naming';
import { parseProposalText, ProposalMeta } from './proposal';

export interface ProposalEntry extends ProposalMeta {
  /** 文件绝对路径 */
  path: string;
  uri: vscode.Uri;
  /** 标题所在行号（0 基） */
  titleLine: number;
}

export interface DbipConfig {
  /** 编号前缀（DBIP / ADR / …），决定文件名匹配与编号解析 */
  idPrefix: string;
  /** 侧边栏动态标题前缀；留空表示跟随 idPrefix */
  titlePrefix: string;
  include: string[];
  exclude: string[];
  groupByStatus: boolean;
  showStatusInDescription: boolean;
  /** 状态别名映射：文档原文 → 规范状态 */
  statusAliases: Record<string, string>;
  /** 是否启用结构诊断 */
  lintEnabled: boolean;
  /** 提案目录（相对工作区根） */
  plansDir: string;
}

export function getConfig(resource?: vscode.Uri): DbipConfig {
  // 仓库级配置（idPrefix / include / plansDir …）声明为 resource 作用域，
  // 传入文件 URI 后多根工作区可各自生效；不传则取用户 + 工作区设置。
  const section = vscode.workspace.getConfiguration('adrp', resource);
  const idPrefix = normalizePrefix(section.get<string>('idPrefix'));
  const configuredInclude = (section.get<string[]>('include') ?? [])
    .map((pattern) => pattern.trim())
    .filter(Boolean);
  return {
    idPrefix,
    titlePrefix: section.get<string>('titlePrefix') ?? '',
    include: configuredInclude.length > 0 ? configuredInclude : [`**/${idPrefix}-*.md`],
    exclude: section.get<string[]>('exclude') ?? [],
    groupByStatus: section.get<boolean>('groupByStatus') ?? true,
    showStatusInDescription: section.get<boolean>('showStatusInDescription') ?? true,
    statusAliases: section.get<Record<string, string>>('statusAliases') ?? {},
    lintEnabled: section.get<boolean>('lintEnabled') ?? true,
    plansDir: section.get<string>('plansDir') ?? 'develop/plans'
  };
}

/** 把多个 exclude glob 合成 VS Code 的单个 exclude 表达式。 */
function toExcludeExpression(exclude: string[]): string | null {
  const patterns = exclude.map((pattern) => pattern.trim()).filter(Boolean);
  if (patterns.length === 0) {
    return null;
  }
  return patterns.length === 1 ? patterns[0] : `{${patterns.join(',')}}`;
}

/** 计算标题在文件中的行号（0 基）。 */
function findTitleLine(text: string): number {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (/^#\s+\S/.test(lines[i])) {
      return i;
    }
  }
  return 0;
}

/** 扫描工作区内的提案文件。 */
export async function scanProposals(): Promise<ProposalEntry[]> {
  const config = getConfig();
  const folders = vscode.workspace.workspaceFolders ?? [];
  const exclude = toExcludeExpression(config.exclude);
  const entries: ProposalEntry[] = [];
  const seen = new Set<string>();

  for (const folder of folders) {
    for (const include of config.include) {
      const pattern = new vscode.RelativePattern(folder, include);
      const files = await vscode.workspace.findFiles(pattern, exclude, 2000);
      for (const uri of files) {
        const path = uri.fsPath;
        if (seen.has(path)) {
          continue;
        }
        seen.add(path);
        let text: string;
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          text = doc.getText();
        } catch {
          continue;
        }
        const meta = parseProposalText(uri.path.split('/').pop() ?? path, text, {
          statusAliases: config.statusAliases,
          idPrefix: config.idPrefix
        });
        entries.push({ ...meta, path, uri, titleLine: findTitleLine(text) });
      }
    }
  }

  entries.sort(compareEntries);
  return entries;
}

/** 按编号倒序（新的在前）排列。 */
export function compareEntries(a: ProposalEntry, b: ProposalEntry): number {
  const numA = Number(a.id.replace(/\D/g, ''));
  const numB = Number(b.id.replace(/\D/g, ''));
  if (numA !== numB) {
    return numB - numA;
  }
  return a.title.localeCompare(b.title, 'zh-Hans-CN');
}
