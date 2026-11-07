import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGraph, findDanglingRefs, findOrphans, findOverdueReview, renderOverview } from '../out/graph.js';

/** 构造一份最小 ProposalMeta，字段缺省值可按需覆盖。 */
function meta(id, overrides = {}) {
  return {
    id,
    title: `${id} 标题`,
    status: 'Draft',
    tags: [],
    related: [],
    mentions: [],
    ...overrides
  };
}

test('buildGraph 汇总引用与被引用（related 与 mentions 合并去重）', () => {
  const nodes = buildGraph([
    meta('DBIP-001', { related: ['DBIP-002'], mentions: ['DBIP-002', 'DBIP-003'] }),
    meta('DBIP-002'),
    meta('DBIP-003', { mentions: ['DBIP-099'] })
  ]);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  assert.deepEqual(byId.get('DBIP-001').outgoing, ['DBIP-002', 'DBIP-003']);
  assert.deepEqual(byId.get('DBIP-002').incoming, ['DBIP-001']);
  assert.deepEqual(byId.get('DBIP-003').incoming, ['DBIP-001']);
  assert.deepEqual(byId.get('DBIP-003').outgoing, ['DBIP-099']);
});

test('buildGraph 不把自身算作引用', () => {
  const nodes = buildGraph([meta('DBIP-005', { related: ['DBIP-005'], mentions: ['DBIP-005'] })]);
  assert.deepEqual(nodes[0].outgoing, []);
  assert.deepEqual(nodes[0].incoming, []);
});

test('buildGraph 按编号升序排列', () => {
  const nodes = buildGraph([meta('DBIP-010'), meta('DBIP-002'), meta('DBIP-007')]);
  assert.deepEqual(
    nodes.map((node) => node.id),
    ['DBIP-002', 'DBIP-007', 'DBIP-010']
  );
});

test('findOrphans 只挑出无进出引用的提案', () => {
  const nodes = buildGraph([
    meta('DBIP-001', { mentions: ['DBIP-002'] }),
    meta('DBIP-002'),
    meta('DBIP-003')
  ]);
  assert.deepEqual(
    findOrphans(nodes).map((node) => node.id),
    ['DBIP-003']
  );
});

test('findDanglingRefs 报告指向不存在编号的引用', () => {
  const nodes = buildGraph([meta('DBIP-001', { mentions: ['DBIP-002', 'DBIP-077'] }), meta('DBIP-002')]);
  assert.deepEqual(findDanglingRefs(nodes), [{ from: 'DBIP-001', to: 'DBIP-077' }]);
});

test('findOverdueReview 只判定已到期的复核日期，未填的不算', () => {
  const nodes = buildGraph([
    meta('DBIP-001', { reviewBy: '2026-01-01' }),
    meta('DBIP-002', { reviewBy: '2099-01-01' }),
    meta('DBIP-003')
  ]);
  assert.deepEqual(
    findOverdueReview(nodes, '2026-11-07').map((node) => node.id),
    ['DBIP-001']
  );
});

test('renderOverview 输出汇总、清单与三个问题小节', () => {
  const nodes = buildGraph([
    meta('DBIP-001', { status: 'Implemented', owner: 'alice', updated: '2026-10-01', related: ['DBIP-002'] }),
    meta('DBIP-002', { related: ['DBIP-404'], reviewBy: '2026-01-01' }),
    meta('DBIP-003')
  ]);
  const text = renderOverview(nodes, { generatedAt: '2026-11-07', source: 'develop/plans/OVERVIEW.md' });

  assert.match(text, /^# DBIP 提案关系概览/);
  assert.match(text, /自动生成，请勿手工编辑/);
  assert.match(text, /\| 提案总数 \| 3 \|/);
  assert.match(text, /\| 孤立提案（无引用进出） \| 1 \|/);
  assert.match(text, /\| 悬空引用（指向不存在编号） \| 1 \|/);
  assert.match(text, /\| 超期未复核 \| 1 \|/);
  assert.match(text, /\| DBIP-001 \| DBIP-001 标题 \| 已实施 \| alice \| 2026-10-01 \|/);
  assert.match(text, /## 孤立提案[\s\S]*DBIP-003/);
  assert.match(text, /## 悬空引用[\s\S]*\| DBIP-002 \| DBIP-404 \|/);
  assert.match(text, /## 超期未复核[\s\S]*DBIP-002/);
});

test('renderOverview 没有问题时省略问题小节', () => {
  const nodes = buildGraph([meta('DBIP-001', { related: ['DBIP-002'] }), meta('DBIP-002', { related: ['DBIP-001'] })]);
  const text = renderOverview(nodes, { generatedAt: '2026-11-07', source: 'x.md' });
  assert.ok(!text.includes('## 孤立提案'));
  assert.ok(!text.includes('## 悬空引用'));
  assert.ok(!text.includes('## 超期未复核'));
});

test('renderOverview 转义表格内的竖线', () => {
  const nodes = buildGraph([meta('DBIP-001', { title: 'A|B 标题' })]);
  const text = renderOverview(nodes, { generatedAt: '2026-11-07', source: 'x.md' });
  assert.match(text, /A\\\|B 标题/);
});

test('renderOverview 标题跟随 idPrefix', () => {
  const nodes = buildGraph([meta('ADR-001')]);
  const text = renderOverview(nodes, {
    generatedAt: '2026-11-07',
    source: 'x.md',
    idPrefix: 'adr'
  });
  assert.match(text, /^# ADR 提案关系概览/);
  assert.ok(!text.includes('DBIP:'));
});
