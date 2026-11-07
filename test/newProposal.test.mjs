import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDate,
  isValidSlug,
  nextProposalId,
  proposalFileName,
  renderProposalScaffold,
  slugify
} from '../out/newProposal.js';

test('nextProposalId 从最大编号递增并补零', () => {
  assert.equal(nextProposalId(['DBIP-037', 'DBIP-039', 'DBIP-038']), 'DBIP-040');
  assert.equal(nextProposalId([]), 'DBIP-001');
  assert.equal(nextProposalId(['DBIP-009']), 'DBIP-010');
});

test('nextProposalId 支持自定前缀', () => {
  assert.equal(nextProposalId(['ADR-001', 'ADR-002'], 'ADR'), 'ADR-003');
  assert.equal(nextProposalId([], 'adr'), 'ADR-001');
  // 前缀不匹配的编号不参与递增
  assert.equal(nextProposalId(['DBIP-039'], 'ADR'), 'ADR-001');
});

test('nextProposalId 容忍纯数字与脏数据', () => {
  assert.equal(nextProposalId(['9', 'DBIP-012', 'oops', 'DBIP-']), 'DBIP-013');
});

test('slugify 过滤中文并折叠连字符', () => {
  assert.equal(slugify('MySQL Account Rotation!'), 'mysql-account-rotation');
  assert.equal(slugify('数据库  参数 下发'), '');
  assert.equal(slugify('a--b'), 'a-b');
});

test('isValidSlug 拒绝非法文件名', () => {
  assert.ok(isValidSlug('mysql-account'));
  assert.ok(!isValidSlug('Mysql-Account'));
  assert.ok(!isValidSlug('mysql--account'));
  assert.ok(!isValidSlug('-mysql'));
  assert.ok(!isValidSlug('mysql account'));
});

test('proposalFileName 拼接编号与 slug', () => {
  assert.equal(proposalFileName('DBIP-040', 'mysql-account'), 'DBIP-040-mysql-account.md');
});

test('骨架包含标题、元信息表与五节正文', () => {
  const content = renderProposalScaffold({
    id: 'DBIP-040',
    title: '参数批量下发',
    owner: '待分配',
    date: '2026-11-07'
  });
  assert.ok(content.startsWith('# DBIP-040 参数批量下发'));
  assert.match(content, /\| 状态 \| Draft \|/);
  assert.match(content, /\| 负责人 \| 待分配 \|/);
  assert.match(content, /\| 创建 \/ 更新日期 \| 2026-11-07 \|/);
  for (const section of ['## 1. 背景与目标', '## 2. 事实与证据', '## 3. 范围与非目标', '## 4. 方案', '## 5. 验证与欠缺']) {
    assert.ok(content.includes(section), `缺少章节 ${section}`);
  }
  assert.ok(content.endsWith('\n'));
});

test('骨架的空白标题与负责人有兜底值', () => {
  const content = renderProposalScaffold({ id: 'DBIP-001', title: '  ', owner: ' ', date: '2026-01-01' });
  assert.match(content, /^# DBIP-001 未命名提案/);
  assert.match(content, /\| 负责人 \| 待分配 \|/);
});

test('formatDate 使用本地时区并补零', () => {
  assert.equal(formatDate(new Date(2026, 0, 5)), '2026-01-05');
  assert.equal(formatDate(new Date(2026, 10, 17)), '2026-11-17');
});
