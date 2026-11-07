const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const EXTENSION_ID = 'knowledgeBits.adrp-proposals';

async function run() {
  const vscode = require('vscode');
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `未找到扩展 ${EXTENSION_ID}`);

  // 打开侧边栏容器，验证视图贡献本身能触发扩展激活（无需手动 activate）。
  await vscode.commands.executeCommand('workbench.view.extension.adrp');
  const deadline = Date.now() + 10000;
  while (!extension.isActive && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(extension.isActive, '展开 ADR提案 侧边栏后扩展未激活');

  const api = await extension.activate();
  await api.refresh();

  const entries = api.getEntries();
  console.log(`[adrp] 扫描到 ${entries.length} 份提案`);
  assert.ok(entries.length >= 25, `期望至少 25 份提案，实际 ${entries.length}`);

  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const latest = byId.get('DBIP-039');
  assert.ok(latest, '列表中缺少 DBIP-039');
  assert.equal(latest.title, '数据库实例入口 IP 白名单');
  assert.equal(latest.status, 'Draft');

  const implemented = byId.get('DBIP-037');
  assert.ok(implemented, '列表中缺少 DBIP-037');
  assert.equal(implemented.status, 'Implemented');
  assert.equal(implemented.title, '按需开放 ProxySQL Admin 端口');

  for (const entry of entries) {
    assert.match(entry.id, /^DBIP-\d{3}$/, entry.path);
    assert.ok(entry.title.length > 0, entry.path);
    assert.ok(entry.path.includes('DBIP-'), entry.path);
  }

  // 点击标题等价的命令：打开文件并定位到标题行。
  const target = byId.get('DBIP-001');
  await vscode.commands.executeCommand('adrp.openProposal', target.uri, target.titleLine);
  const document = await vscode.workspace.openTextDocument(target.uri);
  assert.equal(document.uri.fsPath, target.uri.fsPath);
  const firstLine = document.lineAt(0).text;
  assert.match(firstLine, /^#\s*DBIP-001/, `首行应为提案标题，实际 ${firstLine}`);
  assert.equal(target.titleLine, 0);
  const active = vscode.window.activeTextEditor;
  assert.ok(active, '打开提案后没有活动编辑器');
  assert.equal(active.document.uri.fsPath, target.uri.fsPath, '活动编辑器不是被点击的提案文件');
  assert.equal(active.selection.active.line, target.titleLine, '光标未定位到提案标题行');

  // 视图树能正常渲染出分组节点。
  const snapshot = api.getTreeSnapshot();
  assert.ok(Array.isArray(snapshot), '树视图未返回根节点');
  assert.ok(snapshot.length > 0, '树视图根节点为空');
  const draftGroup = snapshot.find((node) => node.label === '草稿');
  assert.ok(draftGroup, '缺少“草稿”分组');
  assert.ok(
    draftGroup.children.some((child) => child.label === 'DBIP-039 数据库实例入口 IP 白名单'),
    '“草稿”分组中缺少 DBIP-039 标题'
  );
  const implementedGroup = snapshot.find((node) => node.label === '已实施');
  assert.ok(implementedGroup, '缺少“已实施”分组');
  assert.ok(
    implementedGroup.children.some((child) => child.label === 'DBIP-037 按需开放 ProxySQL Admin 端口'),
    '“已实施”分组中缺少 DBIP-037 标题'
  );
  const leaf = draftGroup.children.find((child) => child.label === 'DBIP-039 数据库实例入口 IP 白名单');
  assert.equal(leaf.command, 'adrp.openProposal', '提案标题未绑定打开文件的命令');
  assert.match(leaf.description ?? '', /草稿/, '提案条目缺少状态说明');

  // 视图容器已注册到工作台：聚焦命令存在且可执行。
  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('adrp.proposals.focus'), '工作台未注册 ADR提案 树视图');
  await vscode.commands.executeCommand('adrp.proposals.focus');

  // 快速打开命令应弹出包含提案标题的 Quick Pick。
  const quickOpenPromise = vscode.commands.executeCommand('adrp.quickOpen');
  await new Promise((resolve) => setTimeout(resolve, 500));
  await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
  await quickOpenPromise;

  // 打开提案索引命令应打开 develop/plans/README.md。
  await vscode.commands.executeCommand('adrp.openIndex');
  const indexEditor = vscode.window.activeTextEditor;
  assert.ok(indexEditor, '打开索引后没有活动编辑器');
  assert.ok(indexEditor.document.uri.fsPath.endsWith('develop/plans/README.md'), '索引命令打开的文件不对');

  const workspaceRoots = vscode.workspace.workspaceFolders.map((folder) => folder.uri.fsPath);
  assert.ok(
    entries.every((entry) => workspaceRoots.some((root) => entry.path.startsWith(root))),
    '存在工作区之外的提案条目'
  );
  assert.ok(
    !entries.some((entry) => entry.path.includes(`${path.sep}history${path.sep}`)),
    '历史快照目录不应出现在提案列表'
  );

  // 新增/删除提案文件后列表应随之更新。
  const scratchRoot = vscode.workspace.workspaceFolders.find((folder) =>
    folder.uri.fsPath.includes('adrp-scratch')
  );
  assert.ok(scratchRoot, '缺少用于验证刷新的临时工作区');
  const scratchFile = path.join(scratchRoot.uri.fsPath, 'DBIP-901-scratch-proposal.md');
  fs.writeFileSync(scratchFile, '# DBIP-901 临时验证提案\n\n| 属性 | 内容 |\n|---|---|\n| 状态 | Ready |\n', 'utf8');
  try {
    await api.refresh();
    const created = api.getEntries().find((entry) => entry.id === 'DBIP-901');
    assert.ok(created, '新增提案文件后未出现在列表中');
    assert.equal(created.title, '临时验证提案');
    assert.equal(created.status, 'Ready');
  } finally {
    fs.rmSync(scratchFile, { force: true });
    await api.refresh();
  }
  assert.ok(
    !api.getEntries().some((entry) => entry.id === 'DBIP-901'),
    '删除提案文件后仍残留在列表中'
  );
}

module.exports = { run };
