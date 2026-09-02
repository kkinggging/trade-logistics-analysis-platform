#!/usr/bin/env node

/** 配额全量接入仲裁验收：不访问网络，只审计已生成快照的闭环与关键国家组。 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, '..', 'frontend', 'public', 'data', 'external_taric_quota.json');
const data = JSON.parse(await fs.readFile(file, 'utf8'));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const check = (name, section, requiredFields) => {
  const rawRows = section.raw?.rows || [];
  const normalized = section.normalized_rows || [];
  const latest = section.rows || [];
  const quality = section.quality || {};
  expect(rawRows.length === quality.raw_rows, `${name}: raw 行数与 quality.raw_rows 不一致`);
  expect(quality.accepted_rows + quality.rejected_rows === quality.raw_rows, `${name}: raw != accepted + rejected`);
  expect(quality.accepted_rows === (section.accepted_rows || []).length, `${name}: accepted_rows 未完整落盘`);
  expect(quality.deduped_rows === normalized.length, `${name}: deduped 与 normalized 不一致`);
  expect(latest.length === normalized.filter((row) => row.fetch_date === section.as_of).length, `${name}: latest 不是最新日期全部记录`);
  normalized.forEach((row) => requiredFields.forEach((field) => expect(row[field] !== undefined, `${name}: ${field} 缺失（${row.raw_record_ref || '无引用'}）`)));
};

expect(data.schema_version === '2.1', '快照 schema 不是 2.1');
check('EU', data.eu, ['source_id', 'source_file', 'source_url', 'source_row_number', 'raw_record_ref', 'code', 'validity_period', 'origin', 'initial_amount_t', 'balance_t']);
check('UK', data.uk, ['source_id', 'source_file', 'source_url', 'source_row_number', 'raw_record_ref', 'order_number', 'period', 'balance_t', 'country_group_id']);
expect(data.source.record_counts.total === data.source.record_counts.EU + data.source.record_counts.UK, '总 accepted 记录数未闭环');
expect(data.source.raw_record_counts.total === data.source.raw_record_counts.EU + data.source.raw_record_counts.UK, '总 raw 记录数未闭环');
for (const [id, name] of [['IN', '印度'], ['TR', '土耳其']]) {
  const rows = data.eu.origin_index?.filter((row) => row.origin_group_id === id) || [];
  expect(rows.length > 0, `国家组索引缺少${name}`);
  expect(data.eu.origin_groups?.some((row) => row.id === id), `国家组汇总缺少${name}`);
}
expect(data.eu.rows.some((row) => row.code === '099835'), '最新 EU 缺少印度 Code 099835');
expect(data.eu.rows.some((row) => row.code === '099840'), '最新 EU 缺少土耳其 Code 099840');
const result = { ok: failures.length === 0, failures, report: { schema: data.schema_version, raw: data.source.raw_record_counts, accepted: data.source.record_counts, latest: { eu: data.eu.rows.length, uk: data.uk.rows.length }, origin_groups: (data.eu.origin_groups || []).map((row) => ({ id: row.id, name_zh: row.name_zh, code_count: row.code_count })) } };
console.log(JSON.stringify(result, null, 2));
if (failures.length) process.exitCode = 1;
