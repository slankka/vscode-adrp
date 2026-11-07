import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  collectIds,
  detectStatus,
  displayTitle,
  extractDate,
  normalizeId,
  parseIdFromFileName,
  parseProposalText
} from '../out/proposal.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const plansDir = path.resolve(here, '../../../develop/plans');

function readProposal(name) {
  return readFileSync(path.join(plansDir, name), 'utf8');
}

test('detectStatus 识别四类状态与中文写法', () => {
  assert.equal(detectStatus('Draft').status, 'Draft');
  assert.equal(detectStatus('Ready').status, 'Ready');
  assert.equal(detectStatus('Implemented').status, 'Implemented');
  assert.equal(detectStatus('Archived（已归档）').status, 'Archived');
  assert.equal(detectStatus('Draft（核心准备已实现；236测试环境部分验证通过）').status, 'Draft');
  assert.equal(detectStatus('DBIP-027 / Draft').status, 'Draft');
  assert.equal(detectStatus('').status, 'Unknown');
  assert.equal(detectStatus(undefined).status, 'Unknown');
});

test('parseIdFromFileName 归一化编号', () => {
  assert.equal(parseIdFromFileName('DBIP-039-instance-ingress-ip-allowlist.md'), 'DBIP-039');
  assert.equal(parseIdFromFileName('dbip-7-x.md'), 'DBIP-007');
  assert.equal(parseIdFromFileName('notes.md'), undefined);
});

test('displayTitle 以编号开头', () => {
  assert.equal(displayTitle('DBIP-039', '数据库实例入口 IP 白名单'), 'DBIP-039 数据库实例入口 IP 白名单');
  assert.equal(displayTitle('', '无编号提案'), '无编号提案');
});

test('解析带全角冒号的标题', () => {
  const meta = parseProposalText('DBIP-001-mysql-http-api.md', readProposal('DBIP-001-mysql-http-api.md'));
  assert.equal(meta.id, 'DBIP-001');
  assert.equal(meta.title, 'MySQL 业务 HTTP API');
  assert.equal(meta.status, 'Draft');
});

test('解析以空格分隔的标题', () => {
  const meta = parseProposalText(
    'DBIP-039-instance-ingress-ip-allowlist.md',
    readProposal('DBIP-039-instance-ingress-ip-allowlist.md')
  );
  assert.equal(meta.id, 'DBIP-039');
  assert.equal(meta.title, '数据库实例入口 IP 白名单');
  assert.equal(meta.status, 'Draft');
});

test('解析编号与状态合并在一列的元信息表', () => {
  const meta = parseProposalText(
    'DBIP-027-namespace-and-runtime-identity-preparation.md',
    readProposal('DBIP-027-namespace-and-runtime-identity-preparation.md')
  );
  assert.equal(meta.id, 'DBIP-027');
  assert.equal(meta.title, '创建前 Namespace 与专用 ServiceAccount 受控准备');
  assert.equal(meta.status, 'Draft');
  assert.match(meta.owner ?? '', /jiachaokang/);
  assert.equal(meta.updated, '2026-10-28');
});

test('解析已实施与已归档状态', () => {
  const implemented = parseProposalText(
    'DBIP-037-proxysql-admin-on-demand.md',
    readProposal('DBIP-037-proxysql-admin-on-demand.md')
  );
  assert.equal(implemented.status, 'Implemented');
  assert.equal(implemented.title, '按需开放 ProxySQL Admin 端口');

  const archived = parseProposalText(
    'DBIP-005-metallb-l2-database-ingress.md',
    readProposal('DBIP-005-metallb-l2-database-ingress.md')
  );
  assert.equal(archived.status, 'Archived');
});

test('工作区内全部提案都能解析出编号、标题与状态', { skip: !existsSync(plansDir) }, () => {
  const files = readdirSync(plansDir).filter((name) => /^DBIP-\d+.*\.md$/.test(name));
  assert.ok(files.length >= 25, `期望至少 25 份提案，实际 ${files.length}`);
  for (const name of files) {
    const meta = parseProposalText(name, readProposal(name));
    assert.match(meta.id, /^DBIP-\d{3}$/, name);
    assert.ok(meta.title.length > 0, name);
    assert.ok(!meta.title.startsWith('DBIP-'), name);
    assert.notEqual(meta.status, 'Unknown', name);
  }
});

test('collectIds 去重并按出现顺序抽取编号', () => {
  assert.deepEqual(collectIds('见 DBIP-7 与 DBIP-007、DBIP-039'), ['DBIP-007', 'DBIP-039']);
  assert.deepEqual(collectIds('没有编号'), []);
});

test('extractDate 兼容 YYYY-MM-DD、斜杠与中文写法', () => {
  assert.equal(extractDate('2026-06-01'), '2026-06-01');
  assert.equal(extractDate('2026/6/1 复核'), '2026-06-01');
  assert.equal(extractDate('2026年6月1日'), '2026-06-01');
  assert.equal(extractDate('待定'), undefined);
});

test('解析关联提案：元信息表声明与正文提及分开收集', () => {
  const text = `# DBIP-050 示例

| 属性 | 内容 |
|---|---|
| 状态 | Draft |
| 关联提案 | [DBIP-035](DBIP-035-x.md)、DBIP-7 |
| 复核日期 | 2026-06-01 |
| 标签 | api, kubeblocks、网络 |

正文提到 DBIP-001 与自身 DBIP-050。
`;
  const meta = parseProposalText('DBIP-050-example.md', text);
  assert.deepEqual(meta.related, ['DBIP-035', 'DBIP-007']);
  assert.deepEqual(meta.mentions, ['DBIP-035', 'DBIP-007', 'DBIP-001']);
  assert.equal(meta.reviewBy, '2026-06-01');
  assert.deepEqual(meta.tags, ['api', 'kubeblocks', '网络']);
});

test('解析相关/补充行里的关联编号', () => {
  const meta = parseProposalText(
    'DBIP-030-proxysql-external-nodeport.md',
    readProposal('DBIP-030-proxysql-external-nodeport.md')
  );
  assert.ok(meta.related.includes('DBIP-019'), `实际：${meta.related.join(',')}`);
  assert.ok(meta.related.includes('DBIP-007'));
  assert.ok(!meta.related.includes(meta.id), '不应把自身算作关联');
});

test('占位值不被当作有效元信息', () => {
  const text = `# DBIP-051 示例

| 属性 | 内容 |
|---|---|
| 状态 | Draft |
| 负责人 | 待定 |
| 复核日期 | - |
| 标签 | - |
`;
  const meta = parseProposalText('DBIP-051-example.md', text);
  assert.equal(meta.owner, undefined);
  assert.equal(meta.reviewBy, undefined);
  assert.deepEqual(meta.tags, []);
});

test('自定义编号前缀：ADR-001 能被完整解析', () => {
  const text = `# ADR-001 数据库选型

| 属性 | 内容 |
|---|---|
| 状态 | Ready |
| 负责人 | 李四 |
| 更新日期 | 2026-11-07 |
| 关联 | ADR-002、ADR-3 |
| 标签 | mysql, 选型 |

正文提到了 ADR-004 与 DBIP-005。
`;
  const meta = parseProposalText('ADR-001-database-choice.md', text, { idPrefix: 'ADR' });
  assert.equal(meta.id, 'ADR-001');
  assert.equal(meta.title, '数据库选型');
  assert.equal(meta.status, 'Ready');
  assert.deepEqual(meta.related, ['ADR-002', 'ADR-003']);
  // mentions 是全文出现的编号（含元信息表），但排除自身，且不含异前缀编号
  assert.deepEqual(meta.mentions, ['ADR-002', 'ADR-003', 'ADR-004']);
});

test('前缀不匹配时不解析编号，回落到文件名标题', () => {
  const text = `# DBIP-001 白名单\n\n| 属性 | 内容 |\n|---|---|\n| 状态 | Draft |\n`;
  const meta = parseProposalText('ADR-007-white-list.md', text, { idPrefix: 'ADR' });
  assert.equal(meta.id, 'ADR-007');
  assert.equal(meta.title, 'DBIP-001 白名单');
  assert.deepEqual(meta.mentions, []);
});

test('collectIds / normalizeId / parseIdFromFileName 支持自定前缀', () => {
  assert.deepEqual(collectIds('adr-7、ADR-007、RFC-001', 'ADR'), ['ADR-007']);
  assert.equal(normalizeId('adr-12', 'ADR'), 'ADR-012');
  assert.equal(normalizeId('DBIP-012', 'ADR'), '');
  assert.equal(parseIdFromFileName('ADR-042-x.md', 'ADR'), 'ADR-042');
  assert.equal(parseIdFromFileName('ADR-042-x.md'), undefined);
});
