import * as vscode from 'vscode';
import { lintProposal, LintIssue, LintSeverity } from './lint';
import { idPattern } from './naming';
import { formatDate } from './newProposal';
import { getConfig } from './scan';

const SEVERITY_MAP: Record<LintSeverity, vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  info: vscode.DiagnosticSeverity.Information
};

/** 文件名是否属于当前编号前缀的提案。 */
function isProposalFile(path: string, idPrefix: string): boolean {
  const fileName = path.split('/').pop() ?? path;
  return /\.md$/i.test(fileName) && idPattern(idPrefix).test(fileName);
}

/**
 * 把 lint 结果映射为 Problems 面板里的诊断。
 * 只在打开、保存、配置变更时执行；不做文件扫描，开销可忽略。
 */
export class LintController implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly output: vscode.LogOutputChannel) {
    this.collection = vscode.languages.createDiagnosticCollection('adrp');
    this.disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => this.lint(document)),
      vscode.workspace.onDidSaveTextDocument((document) => this.lint(document)),
      vscode.workspace.onDidCloseTextDocument((document) => this.collection.delete(document.uri))
    );
  }

  /** 对单个文档执行校验；非提案文件会被清空诊断后跳过。 */
  lint(document: vscode.TextDocument): void {
    const config = getConfig(document.uri);
    if (!isProposalFile(document.uri.path, config.idPrefix)) {
      if (document.languageId === 'markdown') {
        this.collection.delete(document.uri);
      }
      return;
    }
    if (!config.lintEnabled) {
      this.collection.delete(document.uri);
      return;
    }

    const fileName = document.uri.path.split('/').pop() ?? document.uri.path;
    const issues = lintProposal(fileName, document.getText(), {
      statusAliases: config.statusAliases,
      idPrefix: config.idPrefix,
      today: formatDate(new Date()),
      localize: (message, ...args) => vscode.l10n.t(message, ...args)
    });
    this.collection.set(
      document.uri,
      issues.map((issue) => toDiagnostic(document, issue))
    );
    if (issues.length > 0) {
      this.output.debug(vscode.l10n.t('lint {0}: {1} issue(s)', fileName, issues.length));
    }
  }

  /** 配置变更后重新校验所有已打开的提案。 */
  relintAll(): void {
    for (const document of vscode.workspace.textDocuments) {
      this.lint(document);
    }
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}

function toDiagnostic(document: vscode.TextDocument, issue: LintIssue): vscode.Diagnostic {
  const line = Math.min(Math.max(issue.line, 0), Math.max(document.lineCount - 1, 0));
  const lineText = document.lineAt(line).text;
  const startColumn = Math.min(Math.max(issue.startColumn, 0), lineText.length);
  const endColumn = Math.min(Math.max(issue.endColumn, startColumn + 1), lineText.length);
  const diagnostic = new vscode.Diagnostic(
    new vscode.Range(line, startColumn, line, endColumn),
    issue.message,
    SEVERITY_MAP[issue.severity]
  );
  diagnostic.source = 'adrp';
  diagnostic.code = issue.code;
  return diagnostic;
}
