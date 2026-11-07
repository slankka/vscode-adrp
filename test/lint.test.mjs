import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lintProposal } from '../out/lint.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const plansDir = path.resolve(here, '../../../develop/plans');

const VALID = `# DBIP-040 参数批量下发

| 属性 | 内容 |
|---|---|
| 状态 | Draft |
| 负责人 | 张三 |
| 创建 / 更新日期 | 2026-11-07 |

## 1. 背景与目标

需要批量下发参数。

## 2. 事实与证据

依据现场验证。

## 3. 范围与非目标

范围内：参数下发。
`;

const codes = (issues) => issues.map((issue) => issue.code);

test('合规提案没有任何提示', () => {
  assert.deepEqual(lintProposal('DBIP-040-x.md', VALID), []);
});

test('缺少一级标题报 Error', () => {
  const issues = lintProposal('DBIP-041-x.md', '没有标题的正文\n\n状态 | Draft\n');
  assert.ok(codes(issues).includes('adrp/missing-title'));
  assert.equal(issues.find((issue) => issue.code === 'adrp/missing-title').severity, 'error');
});

test('标题不以编号开头时给出 warning', () => {
  const issues = lintProposal('DBIP-042-x.md', VALID.replace('# DBIP-040 参数批量下发', '# 参数批量下发'));
  assert.ok(codes(issues).includes('adrp/title-prefix'));
});

test('标题规则跟随 idPrefix', () => {
  const adr = VALID.replace('# DBIP-040 参数批量下发', '# ADR-040 参数批量下发');
  assert.deepEqual(
    codes(lintProposal('ADR-040-x.md', adr, { idPrefix: 'ADR' })).filter((code) => code === 'adrp/title-prefix'),
    []
  );
  // 前缀配置为 ADR 时，DBIP- 开头的标题会被判为不合规
  const wrong = lintProposal('ADR-040-x.md', VALID, { idPrefix: 'ADR' });
  const issue = wrong.find((item) => item.code === 'adrp/title-prefix');
  assert.ok(issue, '应提示标题未以 ADR- 开头');
  assert.match(issue.message, /ADR-040/);
});

test('缺少状态行时给出 warning', () => {
  const text = VALID.replace('| 状态 | Draft |\n', '');
  assert.ok(codes(lintProposal('DBIP-043-x.md', text)).includes('adrp/missing-status'));
});

test('未知状态提示可用取值与别名设置', () => {
  const text = VALID.replace('| 状态 | Draft |', '| 状态 | 待确认 |');
  const issue = lintProposal('DBIP-044-x.md', text).find((item) => item.code === 'adrp/unknown-status');
  assert.ok(issue, '应报 unknown-status');
  assert.match(issue.message, /adrp\.statusAliases/);
});

test('配置别名后未知状态变为可识别', () => {
  const text = VALID.replace('| 状态 | Draft |', '| 状态 | 待确认 |');
  const issues = lintProposal('DBIP-045-x.md', text, { statusAliases: { 待确认: 'Ready' } });
  assert.ok(!codes(issues).includes('adrp/unknown-status'));
});

test('复核日期到期时给出 info，且不提供基准日期时不检查', () => {
  const text = VALID.replace('| 创建 / 更新日期 | 2026-11-07 |', '| 更新日期 | 2026-11-07 |\n| 复核日期 | 2026-06-01 |');
  const issue = lintProposal('DBIP-047-x.md', text, { today: '2026-11-07' }).find(
    (item) => item.code === 'adrp/overdue-review'
  );
  assert.ok(issue, '应报 overdue-review');
  assert.equal(issue.severity, 'info');
  assert.ok(!codes(lintProposal('DBIP-047-x.md', text)).includes('adrp/overdue-review'));
});

test('复核日期未到期时不提示', () => {
  const text = VALID.replace('| 创建 / 更新日期 | 2026-11-07 |', '| 更新日期 | 2026-11-07 |\n| 复核日期 | 2099-01-01 |');
  const issues = lintProposal('DBIP-048-x.md', text, { today: '2026-11-07' });
  assert.ok(!codes(issues).includes('adrp/overdue-review'));
});

test('Ready 状态缺少证据类章节时给出语义 warning', () => {
  const text = VALID.replace('| 状态 | Draft |', '| 状态 | Ready |').replace('## 2. 事实与证据', '## 2. 实施方案');
  const issue = lintProposal('DBIP-046-x.md', text).find((item) => item.code === 'adrp/status-without-evidence');
  assert.ok(issue, '应报 status-without-evidence');
  assert.equal(issue.severity, 'warning');
});

test('缺少负责人只报 info', () => {
  const text = VALID.replace('| 负责人 | 张三 |\n', '');
  const issue = lintProposal('DBIP-049-x.md', text).find((item) => item.code === 'adrp/missing-owner');
  assert.equal(issue?.severity, 'info');
});

test('空章节被发现，且代码块内的 # 不算标题', () => {
  const text = `${VALID}\n## 4. 方案\n\n## 5. 验证\n\n\`\`\`bash\n# 这是注释不是标题\n\`\`\`\n`;
  const issues = lintProposal('DBIP-050-x.md', text);
  const empties = issues.filter((issue) => issue.code === 'adrp/empty-section');
  assert.equal(empties.length, 1, '只有「4. 方案」是空章节');
  assert.match(empties[0].message, /方案/);
});

test('现有提案：无标题级错误，且不误判状态', { skip: !existsSync(plansDir) }, () => {
  const files = readdirSync(plansDir).filter((name) => /^DBIP-.*\.md$/.test(name));
  assert.ok(files.length >= 25, `提案数量异常：${files.length}`);

  const broken = [];
  for (const name of files) {
    const issues = lintProposal(name, readFileSync(path.join(plansDir, name), 'utf8'));
    for (const issue of issues) {
      if (issue.code === 'adrp/missing-title' || issue.code === 'adrp/title-prefix') {
        broken.push(`${name}:${issue.line + 1} ${issue.code}`);
      }
    }
  }
  assert.deepEqual(broken, [], '现有提案不应出现标题级错误');
});
