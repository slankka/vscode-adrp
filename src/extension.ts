import * as vscode from 'vscode';
import { LintController } from './diagnostics';
import { GraphNode, renderOverview } from './graph';
import { idPattern, viewTitle } from './naming';
import {
  formatDate,
  isValidSlug,
  nextProposalId,
  proposalFileName,
  renderProposalScaffold,
  slugify
} from './newProposal';
import { displayTitle } from './proposal';
import { getConfig, ProposalEntry } from './scan';
import { ProposalTreeProvider, statusLabel, TreeSnapshotNode } from './tree';

const VIEW_ID = 'adrp.proposals';
/** 关系概览输出文件名，与提案索引 README.md 并列。 */
const OVERVIEW_FILE = 'OVERVIEW.md';

export interface DbipExtensionApi {
  /** 当前扫描到的提案列表（供集成测试与外部调用使用） */
  getEntries(): ProposalEntry[];
  /** 侧边栏视图的层级快照 */
  getTreeSnapshot(): TreeSnapshotNode[];
  /** 当前引用关系图 */
  getGraph(): GraphNode[];
  /** 重新扫描并刷新视图 */
  refresh(): Promise<void>;
}

export function activate(context: vscode.ExtensionContext): DbipExtensionApi {
  const output = vscode.window.createOutputChannel(vscode.l10n.t('ADR Proposals'), { log: true });
  context.subscriptions.push(output);

  const provider = new ProposalTreeProvider(output);
  const watchers = new WatcherRegistry(provider);
  const lint = new LintController(output);
  const treeView = vscode.window.createTreeView(VIEW_ID, { treeDataProvider: provider });

  // 静态视图名已是“ADR提案”，动态标题只显示配置前缀。
  const applyViewTitle = (): void => {
    const config = getConfig();
    treeView.title = viewTitle(config.titlePrefix || config.idPrefix);
  };
  applyViewTitle();

  context.subscriptions.push(
    treeView,
    watchers,
    lint,
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('adrp')) {
        applyViewTitle();
        watchers.rebuild();
        lint.relintAll();
        void provider.refresh();
      }
    })
  );

  // 激活时先给已打开的提案做一次健康检查
  for (const document of vscode.workspace.textDocuments) {
    lint.lint(document);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('adrp.refresh', async () => {
      await provider.refresh();
    }),

    vscode.commands.registerCommand('adrp.openProposal', async (uri: vscode.Uri, line?: number) => {
      if (!uri) {
        return;
      }
      const document = await vscode.workspace.openTextDocument(uri);
      const target = typeof line === 'number' && line >= 0 ? line : 0;
      const editor = await vscode.window.showTextDocument(document, {
        preview: true,
        selection: new vscode.Range(target, 0, target, 0)
      });
      editor.revealRange(new vscode.Range(target, 0, target, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }),

    vscode.commands.registerCommand('adrp.quickOpen', async () => {
      const entries = provider.getEntries();
      if (entries.length === 0) {
        await provider.refresh();
      }
      const items = provider.getEntries().map((entry) => ({
        label: displayTitle(entry.id, entry.title),
        description: statusLabel(entry.status),
        detail: entry.path,
        entry
      }));
      if (items.length === 0) {
        const prefix = getConfig().idPrefix;
        void vscode.window.showWarningMessage(
          vscode.l10n.t(
            'No {0}-* proposal files found. Check the adrp.idPrefix, adrp.include, and adrp.exclude settings.',
            prefix
          )
        );
        return;
      }
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: vscode.l10n.t('Open a proposal by ID or title'),
        matchOnDescription: true,
        matchOnDetail: true
      });
      if (picked) {
        await vscode.commands.executeCommand('adrp.openProposal', picked.entry.uri, picked.entry.titleLine);
      }
    }),

    vscode.commands.registerCommand('adrp.openIndex', async () => {
      const folder = await resolvePlansFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(vscode.l10n.t('Proposal directory not found: {0}', getConfig().plansDir));
        return;
      }
      const index = vscode.Uri.joinPath(folder, 'README.md');
      try {
        await vscode.workspace.fs.stat(index);
      } catch {
        void vscode.window.showWarningMessage(vscode.l10n.t('Proposal index not found: {0}/README.md', getConfig().plansDir));
        return;
      }
      const document = await vscode.workspace.openTextDocument(index);
      await vscode.window.showTextDocument(document, { preview: true });
    }),

    vscode.commands.registerCommand('adrp.newProposal', async () => {
      const folder = await resolvePlansFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(vscode.l10n.t('Proposal directory not found: {0}', getConfig().plansDir));
        return;
      }
      if (provider.getEntries().length === 0) {
        await provider.refresh();
      }
      const nextId = nextProposalId(
        provider.getEntries().map((entry) => entry.id),
        getConfig().idPrefix
      );

      const title = await vscode.window.showInputBox({
        title: vscode.l10n.t('New {0}', nextId),
        prompt: vscode.l10n.t('Proposal title (without ID)'),
        placeHolder: vscode.l10n.t('For example: Batch update database parameters'),
        ignoreFocusOut: true,
        validateInput: (value) => (value.trim().length === 0 ? vscode.l10n.t('Title cannot be empty') : undefined)
      });
      if (!title) {
        return;
      }

      const slug = await vscode.window.showInputBox({
        title: vscode.l10n.t('New {0}', nextId),
        prompt: vscode.l10n.t('File name slug (lowercase letters, numbers, and hyphens)'),
        value: slugify(title) || 'proposal',
        ignoreFocusOut: true,
        validateInput: (value) =>
          isValidSlug(value.trim()) ? undefined : vscode.l10n.t('Use only lowercase letters, numbers, and hyphens')
      });
      if (!slug) {
        return;
      }

      const fileName = proposalFileName(nextId, slug.trim());
      const uri = vscode.Uri.joinPath(folder, fileName);
      try {
        await vscode.workspace.fs.stat(uri);
        void vscode.window.showWarningMessage(vscode.l10n.t('{0} already exists. It was not overwritten.', fileName));
        return;
      } catch {
        // 文件不存在，可安全创建
      }

      const content = renderProposalScaffold({
        id: nextId,
        title: title.trim(),
        owner: '待分配',
        date: formatDate(new Date())
      });
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      await vscode.commands.executeCommand('adrp.openProposal', uri, 0);
      await provider.refresh();
      output.info(vscode.l10n.t('Created {0}', uri.fsPath));
    }),

    vscode.commands.registerCommand('adrp.generateOverview', async () => {
      const folder = await resolvePlansFolder();
      if (!folder) {
        void vscode.window.showWarningMessage(vscode.l10n.t('Proposal directory not found: {0}', getConfig().plansDir));
        return;
      }
      if (provider.getEntries().length === 0) {
        await provider.refresh();
      }
      const nodes = provider.getGraph();
      if (nodes.length === 0) {
        void vscode.window.showWarningMessage(vscode.l10n.t('No proposals found. Overview generation was cancelled.'));
        return;
      }
      const today = formatDate(new Date());
      const config = getConfig();
      const content = renderOverview(nodes, {
        generatedAt: today,
        today,
        idPrefix: config.idPrefix,
        source: `${config.plansDir}/${OVERVIEW_FILE}`
      });
      const uri = vscode.Uri.joinPath(folder, OVERVIEW_FILE);
      await vscode.workspace.fs.writeFile(uri, Buffer.from(content, 'utf8'));
      await vscode.commands.executeCommand('adrp.openProposal', uri, 0);
      output.info(vscode.l10n.t('Generated {0} ({1} proposals)', uri.fsPath, nodes.length));
    })
  );

  watchers.rebuild();
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (document.uri.scheme !== 'file') {
        return;
      }
      const fileName = document.uri.path.split('/').pop() ?? '';
      if (idPattern(getConfig().idPrefix).test(fileName)) {
        void provider.refresh();
      }
    })
  );

  void provider.refresh();

  return {
    getEntries: () => provider.getEntries(),
    getTreeSnapshot: () => provider.getTreeSnapshot(),
    getGraph: () => provider.getGraph(),
    refresh: () => provider.refresh()
  };
}

/** 定位提案目录（默认 develop/plans），用于新建提案与打开索引。 */
async function resolvePlansFolder(): Promise<vscode.Uri | undefined> {
  const plansDir = getConfig().plansDir;
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const candidate = vscode.Uri.joinPath(folder.uri, plansDir);
    try {
      const stat = await vscode.workspace.fs.stat(candidate);
      if (stat.type & vscode.FileType.Directory) {
        return candidate;
      }
    } catch {
      // 继续尝试下一个工作区
    }
  }
  return undefined;
}

/**
 * 监听提案文件变化并触发视图刷新。配置变更时重建文件监听。
 */
class WatcherRegistry implements vscode.Disposable {
  private watchers: vscode.FileSystemWatcher[] = [];
  private timer: NodeJS.Timeout | undefined;

  constructor(private readonly provider: ProposalTreeProvider) {}

  rebuild(): void {
    this.disposeWatchers();
    const include = getConfig().include;
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      for (const pattern of include) {
        const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, pattern));
        watcher.onDidCreate(this.scheduleRefresh, this);
        watcher.onDidChange(this.scheduleRefresh, this);
        watcher.onDidDelete(this.scheduleRefresh, this);
        this.watchers.push(watcher);
      }
    }
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.disposeWatchers();
  }

  private disposeWatchers(): void {
    for (const watcher of this.watchers) {
      watcher.dispose();
    }
    this.watchers = [];
  }

  private scheduleRefresh(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.provider.refresh();
    }, 300);
  }
}

export function deactivate(): void {
  // 无需清理：所有资源都通过 context.subscriptions 释放。
}
