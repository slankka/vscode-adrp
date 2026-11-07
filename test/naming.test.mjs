import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_ID_PREFIX,
  PROPOSAL_NOUN,
  formatId,
  idPattern,
  idScanPattern,
  normalizePrefix,
  startsWithId,
  titlePrefixPattern,
  viewTitle
} from '../out/naming.js';

test('默认前缀为 DBIP，空值回落默认前缀', () => {
  assert.equal(DEFAULT_ID_PREFIX, 'DBIP');
  assert.equal(normalizePrefix(undefined), 'DBIP');
  assert.equal(normalizePrefix(''), 'DBIP');
  assert.equal(normalizePrefix('   '), 'DBIP');
  assert.equal(normalizePrefix('!!'), 'DBIP');
});

test('前缀归一化：大写、去空白与首尾分隔符', () => {
  assert.equal(normalizePrefix('adr'), 'ADR');
  assert.equal(normalizePrefix(' Adr '), 'ADR');
  assert.equal(normalizePrefix('adr-'), 'ADR');
  assert.equal(normalizePrefix('-rfc_'), 'RFC');
  assert.equal(normalizePrefix('my-adr'), 'MY-ADR');
});

test('idPattern 按前缀匹配编号', () => {
  assert.equal(idPattern().exec('见 DBIP-7')?.[0].toUpperCase(), 'DBIP-7');
  assert.equal(idPattern('adr').exec('见 ADR-001')?.[0], 'ADR-001');
  assert.equal(idPattern('ADR').test('见 DBIP-001'), false);
  assert.equal(idPattern('DBIP').test('见 DBIP-001'), true);
});

test('idScanPattern 是全量扫描且可重复使用', () => {
  const pattern = idScanPattern('ADR');
  assert.deepEqual(
    [...'ADR-1 ADR-002 adr-0003'.matchAll(pattern)].map((match) => match[0]),
    ['ADR-1', 'ADR-002', 'adr-0003']
  );
  // 每次调用返回新实例，不会残留上次的 lastIndex
  assert.equal(idScanPattern('ADR').lastIndex, 0);
});

test('formatId 按前缀补零', () => {
  assert.equal(formatId('DBIP', 7), 'DBIP-007');
  assert.equal(formatId('adr', '12'), 'ADR-012');
  assert.equal(formatId(undefined, 1), 'DBIP-001');
});

test('titlePrefixPattern 去掉标题里的编号前缀', () => {
  assert.equal('DBIP-001：白名单'.replace(titlePrefixPattern(), ''), '白名单');
  assert.equal('ADR-001 白名单'.replace(titlePrefixPattern('adr'), ''), '白名单');
  // 前缀不匹配时不应误伤正文
  assert.equal('ADR-001 白名单'.replace(titlePrefixPattern('DBIP'), ''), 'ADR-001 白名单');
});

test('startsWithId 只认行首编号', () => {
  assert.equal(startsWithId('DBIP-001 白名单'), true);
  assert.equal(startsWithId('ADR-001 白名单', 'adr'), true);
  assert.equal(startsWithId('关于 ADR-001 的说明', 'adr'), false);
  assert.equal(startsWithId('ADR-001 白名单', 'DBIP'), false);
});

test('viewTitle 只渲染动态前缀，固定名称由视图贡献项提供', () => {
  assert.equal(PROPOSAL_NOUN, 'ADR提案');
  assert.equal(viewTitle('DBIP'), 'DBIP');
  assert.equal(viewTitle('ERP 数据库'), 'ERP 数据库');
  assert.equal(viewTitle(''), '');
  assert.equal(viewTitle(undefined), '');
});
