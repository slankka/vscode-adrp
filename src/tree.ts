import * as vscode from 'vscode';
import { buildGraph, GraphNode } from './graph';
import { displayTitle, ProposalStatus } from './proposal';
import { compareEntries, getConfig, ProposalEntry, scanProposals } from './scan';

export type Node = GroupNode | EntryNode;

/** 视图节点的展示快照，供集成测试断言侧边栏渲染结果。 */
export interface TreeSnapshotNode {
  label: string;
  description?: string;
  /** 叶子节点绑定的命令 ID（点击标题时执行的命令） */
  command?: string;
  children: TreeSnapshotNode[];
}

export interface GroupNode {
  kind: 'group';
  status: ProposalStatus;
  label: string;
  count: number;
}

export interface EntryNode {
  kind: 'entry';
  entry: ProposalEntry;
}

const STATUS_ORDER: ProposalStatus[] = ['Implemented', 'Ready', 'Draft', 'Archived', 'Unknown'];

const STATUS_LABELS: Record<ProposalStatus, string> = {
  Implemented: vscode.l10n.t('Implemented'),
  Ready: vscode.l10n.t('Ready'),
  Draft: vscode.l10n.t('Draft'),
  Archived: vscode.l10n.t('Archived'),
  Unknown: vscode.l10n.t('Unlabeled')
};

const STATUS_ICONS: Record<ProposalStatus, string> = {
  Implemented: 'pass',
  Ready: 'run-all',
  Draft: 'edit',
  Archived: 'archive',
  Unknown: 'question'
};

export function statusLabel(status: ProposalStatus): string {
  return STATUS_LABELS[status];
}

export class ProposalTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly changeEmitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.changeEmitter.event;

  private entries: ProposalEntry[] = [];
  private groups: GroupNode[] = [];
  private graph = new Map<string, GraphNode>();

  constructor(private readonly output: vscode.LogOutputChannel) {}

  async refresh(): Promise<void> {
    try {
      this.entries = await scanProposals();
    } catch (error) {
      this.output.appendLine(vscode.l10n.t('Failed to scan proposals: {0}', String(error)));
      this.entries = [];
    }
    this.groups = this.buildGroups();
    this.graph = new Map(buildGraph(this.entries).map((node) => [node.id, node]));
    this.changeEmitter.fire(undefined);
  }

  getEntries(): ProposalEntry[] {
    return this.entries;
  }

  /** 当前引用关系快照（编号 → 节点），供概览命令与外部调用复用。 */
  getGraph(): GraphNode[] {
    return [...this.graph.values()];
  }

  /**
   * 返回当前视图的层级快照（标签与说明），供集成测试断言侧边栏渲染结果。
   */
  getTreeSnapshot(): TreeSnapshotNode[] {
    return this.getChildren().map((node) => this.toSnapshot(node));
  }

  private toSnapshot(node: Node): TreeSnapshotNode {
    const item = this.getTreeItem(node);
    const snapshot: TreeSnapshotNode = {
      label: item.label as string,
      description: item.description as string | undefined,
      command: item.command?.command,
      children: this.getChildren(node).map((child) => this.toSnapshot(child))
    };
    return snapshot;
  }

  private buildGroups(): GroupNode[] {
    const config = getConfig();
    if (!config.groupByStatus) {
      return [];
    }
    const buckets = new Map<ProposalStatus, ProposalEntry[]>();
    for (const entry of this.entries) {
      const list = buckets.get(entry.status) ?? [];
      list.push(entry);
      buckets.set(entry.status, list);
    }
    return STATUS_ORDER.filter((status) => buckets.has(status)).map((status) => {
      const list = buckets.get(status)!;
      list.sort(compareEntries);
      return { kind: 'group', status, label: STATUS_LABELS[status], count: list.length };
    });
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'group') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon(STATUS_ICONS[node.status]);
      item.description = `${node.count}`;
      item.contextValue = 'adrp.group';
      item.tooltip = vscode.l10n.t('{0} ({1})', STATUS_LABELS[node.status], node.count);
      return item;
    }

    const { entry } = node;
    const config = getConfig();
    const item = new vscode.TreeItem(displayTitle(entry.id, entry.title), vscode.TreeItemCollapsibleState.None);
    item.description = config.showStatusInDescription ? STATUS_LABELS[entry.status] : undefined;
    item.iconPath = new vscode.ThemeIcon(STATUS_ICONS[entry.status]);
    item.contextValue = 'adrp.proposal';
    item.tooltip = this.buildTooltip(entry);
    item.command = {
      command: 'adrp.openProposal',
      title: vscode.l10n.t('Open proposal'),
      arguments: [entry.uri, entry.titleLine]
    };
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      if (this.groups.length === 0) {
        return this.entries.map((entry) => ({ kind: 'entry', entry }));
      }
      return this.groups;
    }

    if (node.kind === 'group') {
      return this.entries
        .filter((entry) => entry.status === node.status)
        .sort(compareEntries)
        .map((entry) => ({ kind: 'entry', entry }));
    }

    return [];
  }

  private buildTooltip(entry: ProposalEntry): vscode.MarkdownString {
    const md = new vscode.MarkdownString(undefined, true);
    md.supportHtml = false;
    md.appendMarkdown(`**${entry.id} ${entry.title}**\n\n`);
    md.appendMarkdown(`- ${vscode.l10n.t('Status')}: ${STATUS_LABELS[entry.status]}${entry.statusRaw && entry.statusRaw !== STATUS_LABELS[entry.status] ? ` (${entry.statusRaw})` : ''}\n`);
    if (entry.owner) {
      md.appendMarkdown(`- ${vscode.l10n.t('Owner')}: ${entry.owner}\n`);
    }
    if (entry.updated) {
      md.appendMarkdown(`- ${vscode.l10n.t('Updated')}: ${entry.updated}\n`);
    }
    if (entry.reviewBy) {
      md.appendMarkdown(`- ${vscode.l10n.t('Review by')}: ${entry.reviewBy}\n`);
    }
    if (entry.tags.length > 0) {
      md.appendMarkdown(`- ${vscode.l10n.t('Tags')}: ${entry.tags.join(', ')}\n`);
    }
    this.appendReferences(md, entry);
    md.appendMarkdown(`- ${vscode.l10n.t('File')}: ${entry.path}\n`);
    return md;
  }

  /** 追加引用关系。孤立提案单独给一行提示，对应 adr-explorer 的关系图入门价值。 */
  private appendReferences(md: vscode.MarkdownString, entry: ProposalEntry): void {
    const node = this.graph.get(entry.id);
    if (!node) {
      return;
    }
    if (node.outgoing.length > 0) {
      md.appendMarkdown(`- ${vscode.l10n.t('References ({0})', node.outgoing.length)}: ${node.outgoing.join(', ')}\n`);
    }
    if (node.incoming.length > 0) {
      md.appendMarkdown(`- ${vscode.l10n.t('Referenced by ({0})', node.incoming.length)}: ${node.incoming.join(', ')}\n`);
    }
    if (node.outgoing.length === 0 && node.incoming.length === 0) {
      md.appendMarkdown(`- ${vscode.l10n.t('References')}: ${vscode.l10n.t('Orphaned (no incoming or outgoing references)')}\n`);
    }
  }
}
