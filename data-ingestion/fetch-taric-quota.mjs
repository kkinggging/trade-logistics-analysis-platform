#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithRetry, retrySummary, writeFileAtomic } from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultConfig = path.join(here, 'taric-quota-source.json');
const defaultOutput = path.join(here, '..', 'frontend', 'public', 'data', 'external_taric_quota.json');
const argument = (name, fallback = '') => { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback; };
const number = (value) => { const parsed = Number(String(value ?? '').replace(/,/g, '').trim()); return Number.isFinite(parsed) ? parsed : null; };

function splitRecords(raw) {
  const records = []; let value = ''; let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === '"' && raw[index + 1] === '"' && quoted) { value += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; value += char; continue; }
    if ((char === '\n' || char === '\r') && !quoted) { if (char === '\r' && raw[index + 1] === '\n') index += 1; if (value.trim()) records.push(value); value = ''; continue; }
    value += char;
  }
  if (value.trim()) records.push(value);
  return records;
}

function parseLine(line) {
  const values = []; let value = ''; let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === ',' && !quoted) { values.push(value.trim()); value = ''; }
    else value += char;
  }
  values.push(value.trim());
  return values;
}

function parseCsv(raw, requiredHeaders) {
  const records = splitRecords(raw.replace(/^\uFEFF/, '')); const header = records.shift();
  if (!header) throw new Error('CSV 缺少表头');
  const headers = parseLine(header); const missing = requiredHeaders.filter((item) => !headers.includes(item));
  if (missing.length) throw new Error(`CSV 缺少字段：${missing.join(', ')}`);
  const accepted = []; const rejected = []; const repaired = []; const rawRecords = [];
  records.forEach((record, index) => {
    let values = parseLine(record); const originalValues = [...values]; let structuralRepair = false;
    // 源站曾出现过一次“重复抓取时间 + 重复订单号”的 23 列行。
    // 原始行仍会完整保存在快照中；这里仅修复可明确识别的结构性重复，避免丢失有效业务记录。
    if (values.length === headers.length + 2 && isDateTime(values[1]) && isDateTime(values[2]) && isDate(values[3]) && /^\d{6}$/.test(values[4]) && /^\d{6}$/.test(values[5]) && /^\d{6}$/.test(values[6])) {
      values = values.filter((_, valueIndex) => valueIndex !== 2 && valueIndex !== 6);
      repaired.push({ row: index + 2, reason: '删除重复 fetch_datetime 与 order_number 后恢复标准列数' });
      structuralRepair = true;
    }
    const data = Object.fromEntries(headers.map((name, fieldIndex) => [name, values[fieldIndex] || '']));
    const rawRecord = { row: index + 2, raw: record, values: originalValues, normalized_values: values, structural_repair: structuralRepair };
    if (values.length !== headers.length) {
      const issue = { row: index + 2, reason: `字段数 ${values.length}，应为 ${headers.length}`, field_count: values.length, expected_field_count: headers.length };
      rejected.push(issue); rawRecord.parse_status = 'rejected'; rawRecord.rejection = issue;
    } else { accepted.push({ row: index + 2, data }); rawRecord.parse_status = 'accepted'; }
    rawRecords.push(rawRecord);
  });
  return { headers, accepted, rejected, repaired, rawRecords };
}

const tons = (value, unit) => unit?.toLowerCase() === 'kilogram' ? value / 1000 : value;
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const isDateTime = (value) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(value || '')) && isDate(String(value).slice(0, 10));
const isSourceDate = (value) => isDate(value) || /^\d{1,2} [A-Za-z]{3} \d{4}$/.test(String(value || '').trim());
const present = (value) => String(value ?? '').trim().length > 0;

const originDictionary = {
  'China': { id: 'CN', name_zh: '中国', name_en: 'China', type: 'country' },
  'European Union': { id: 'EU', name_zh: '欧盟', name_en: 'European Union', type: 'region' },
  'India': { id: 'IN', name_zh: '印度', name_en: 'India', type: 'country' },
  'Korea, Republic of (South Korea)': { id: 'KR', name_zh: '韩国', name_en: 'Korea, Republic of (South Korea)', type: 'country' },
  'Türkiye': { id: 'TR', name_zh: '土耳其', name_en: 'Türkiye', type: 'country' },
  'United Kingdom': { id: 'UK', name_zh: '英国', name_en: 'United Kingdom', type: 'country' },
  'Viet Nam': { id: 'VN', name_zh: '越南', name_en: 'Viet Nam', type: 'country' },
  'Taiwan': { id: 'TW', name_zh: '中国台湾', name_en: 'Taiwan', type: 'area' },
  'Japan': { id: 'JP', name_zh: '日本', name_en: 'Japan', type: 'country' },
  'Egypt': { id: 'EG', name_zh: '埃及', name_en: 'Egypt', type: 'country' },
  'South Africa': { id: 'ZA', name_zh: '南非', name_en: 'South Africa', type: 'country' },
  'Switzerland': { id: 'CH', name_zh: '瑞士', name_en: 'Switzerland', type: 'country' },
  'ERGA OMNES': { id: 'ERGA_OMNES', name_zh: '全球公共配额', name_en: 'ERGA OMNES', type: 'group' },
  'FTA partners': { id: 'FTA_PARTNERS', name_zh: 'FTA伙伴', name_en: 'FTA partners', type: 'group' },
};

function splitOrigin(origin) {
  return String(origin || '').split('|').map((item) => item.trim()).filter(Boolean).map((item) => originDictionary[item] || ({ id: `RAW_${item.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}`, name_zh: item, name_en: item, type: 'unmapped' }));
}

function buildOriginIndex(rows) {
  const index = [];
  rows.forEach((row) => splitOrigin(row.origin).forEach((origin) => index.push({
    origin_group_id: origin.id,
    origin_group_name_zh: origin.name_zh,
    origin_group_name_en: origin.name_en,
    origin_group_type: origin.type,
    origin_text: row.origin,
    region: row.region,
    source_row: row.source_row || null,
    fetch_date: row.fetch_date,
    fetch_datetime: row.fetch_datetime,
    code: row.code || row.order_number,
    order_number: row.order_number || null,
    validity_period: row.validity_period || row.period || null,
    balance_t: row.balance_t ?? null,
    initial_amount_t: row.initial_amount_t ?? row.opening_balance_t ?? null,
    amount_t: row.amount_t ?? null,
    status: row.status || null,
    critical: row.critical ?? null,
  })));
  return index;
}

function buildOriginGroups(rows) {
  const groups = new Map();
  rows.forEach((row) => splitOrigin(row.origin).forEach((origin) => {
    const current = groups.get(origin.id) || { ...origin, record_count: 0, code_count: 0, codes: new Set(), regions: new Set(), latest_fetch_date: null, latest_records: [] };
    current.record_count += 1; current.codes.add(row.code || row.order_number); current.regions.add(row.region);
    if (!current.latest_fetch_date || row.fetch_date > current.latest_fetch_date) current.latest_fetch_date = row.fetch_date;
    groups.set(origin.id, current);
  }));
  return [...groups.values()].map((item) => ({ ...item, code_count: item.codes.size, codes: [...item.codes].sort(), regions: [...item.regions].sort(), shared_pool_note: '同一配额池可能对应多个原产地组；展示国家维度时不得直接相加余额。' }));
}

function rowReasons(kind, row) {
  const reasons = [];
  const required = kind === 'eu'
    ? ['fetch_date', 'fetch_datetime', 'code', 'validity_period', 'initial_amount_number', 'initial_amount_unit', 'amount_number', 'amount_unit', 'balance_number', 'balance_unit']
    : ['fetch_date', 'fetch_datetime', 'order_number', 'as_of_date', 'balance_kg', 'opening_balance_kg', 'pending_balance_kg', 'status', 'period'];
  required.forEach((field) => { if (!present(row[field])) reasons.push(`缺少 ${field}`); });
  if (present(row.fetch_date) && !isDate(row.fetch_date)) reasons.push('fetch_date 非法');
  if (present(row.fetch_datetime) && !isDateTime(row.fetch_datetime)) reasons.push('fetch_datetime 非法');
  if (kind === 'eu') {
    if (present(row.code) && !/^\d{6}$/.test(row.code)) reasons.push('code 不是 6 位数字');
    ['initial_amount_number', 'amount_number', 'balance_number', 'allocated_percentage'].forEach((field) => { if (present(row[field]) && number(row[field]) == null) reasons.push(`${field} 非数字`); });
  } else {
    if (present(row.order_number) && !/^\d{6}$/.test(row.order_number)) reasons.push('order_number 不是 6 位数字');
    if (present(row.as_of_date) && !isSourceDate(row.as_of_date)) reasons.push('as_of_date 非法');
    ['balance_kg', 'opening_balance_kg', 'pending_balance_kg'].forEach((field) => { if (present(row[field]) && number(row[field]) == null) reasons.push(`${field} 非数字`); });
  }
  return reasons;
}

function normalizeEu(row) {
  const initial = number(row.initial_amount_number); const amount = number(row.amount_number); const balance = number(row.balance_number); const awaiting = number(row.total_awaiting_allocation);
  if (rowReasons('eu', row).length || initial == null || amount == null || balance == null) return null;
  return { region: 'EU', fetch_date: row.fetch_date, fetch_datetime: row.fetch_datetime, start_date_param: row.start_date_param, code: row.code, order_number: row.order_number, validity_period: row.validity_period, origin: row.origin, initial_amount_t: tons(initial, row.initial_amount_unit), amount_t: tons(amount, row.amount_unit), balance_t: tons(balance, row.balance_unit), exhaustion_date: row.exhaustion_date || null, critical: String(row.critical).toLowerCase() === 'yes', last_import_date: row.last_import_date || null, last_allocation_date: row.last_allocation_date || null, total_awaiting_allocation_t: awaiting == null ? null : tons(awaiting, row.amount_unit), blocking_period: row.blocking_period || null, suspension_period: row.suspension_period || null, allocated_percentage: number(row.allocated_percentage) };
}

function normalizeUk(row) {
  const balance = number(row.balance_kg); const opening = number(row.opening_balance_kg); const pending = number(row.pending_balance_kg);
  if (rowReasons('uk', row).length || balance == null || opening == null || pending == null) return null;
  return { region: 'UK', fetch_date: row.fetch_date, fetch_datetime: row.fetch_datetime, order_number: row.order_number, as_of_date: row.as_of_date, balance_t: balance / 1000, opening_balance_t: opening / 1000, pending_balance_t: pending / 1000, status: row.status, period: row.period, last_allocation_date: row.last_allocation_date || null, blocking_period: row.blocking_period || null, country_group: row.country_group, country_group_id: row.country_group_id, commodity_codes: row.commodity_codes };
}

function latestByKey(rows, keyOf) {
  const latest = new Map();
  rows.forEach((row) => { const key = keyOf(row); const current = latest.get(key); if (!current || `${row.fetch_date} ${row.fetch_datetime}` > `${current.fetch_date} ${current.fetch_datetime}`) latest.set(key, row); });
  return [...latest.values()];
}
const euKey = (row) => `${row.region}|${row.code}|${row.validity_period}|${row.origin}|${row.fetch_date}`;
const ukKey = (row) => `${row.region}|${row.order_number}|${row.period}|${row.country_group_id}|${row.commodity_codes}|${row.fetch_date}`;
const latestEu = (rows) => latestByKey(rows, euKey).sort((a, b) => a.code.localeCompare(b.code));
const latestUk = (rows) => latestByKey(rows, ukKey).sort((a, b) => a.order_number.localeCompare(b.order_number));

function summarizeEu(rows) {
  const valid = rows.filter((row) => row.balance_t != null && row.initial_amount_t != null); const initial = valid.reduce((sum, row) => sum + row.initial_amount_t, 0); const balance = valid.reduce((sum, row) => sum + row.balance_t, 0);
  return { code_count: rows.length, initial_amount_t: initial, balance_t: balance, used_t: initial - balance, remaining_pct: initial ? balance / initial * 100 : null, exhausted_count: valid.filter((row) => row.balance_t <= 0).length, critical_count: rows.filter((row) => row.critical).length, awaiting_allocation_t: rows.reduce((sum, row) => sum + (row.total_awaiting_allocation_t || 0), 0) };
}
function summarizeUk(rows) {
  const valid = rows.filter((row) => row.balance_t != null && row.opening_balance_t != null); const opening = valid.reduce((sum, row) => sum + row.opening_balance_t, 0); const balance = valid.reduce((sum, row) => sum + row.balance_t, 0);
  return { record_count: rows.length, opening_balance_t: opening, balance_t: balance, used_t: opening - balance, remaining_pct: opening ? balance / opening * 100 : null, pending_balance_t: valid.reduce((sum, row) => sum + (row.pending_balance_t || 0), 0), open_count: rows.filter((row) => String(row.status).toLowerCase() === 'open').length };
}

async function readPayload(input, url) {
  if (input) { const raw = await fs.readFile(path.resolve(input)); return { raw: raw.toString('utf8'), hash: crypto.createHash('sha256').update(raw).digest('hex') }; }
  const response = await fetchWithRetry(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, { headers: { accept: 'text/csv' } }, readPayload.retry); const raw = Buffer.from(await response.arrayBuffer()); return { raw: raw.toString('utf8'), hash: crypto.createHash('sha256').update(raw).digest('hex') };
}

async function readSource({ input, url, kind, sourceId, capturedAt }) {
  const payload = await readPayload(input, url); const required = kind === 'eu' ? ['fetch_date', 'fetch_datetime', 'start_date_param', 'code', 'order_number', 'validity_period', 'origin', 'initial_amount_number', 'initial_amount_unit', 'amount_number', 'amount_unit', 'balance_number', 'balance_unit', 'exhaustion_date', 'critical', 'last_import_date', 'last_allocation_date', 'total_awaiting_allocation', 'blocking_period', 'suspension_period', 'allocated_percentage'] : ['fetch_date', 'fetch_datetime', 'order_number', 'as_of_date', 'balance_kg', 'opening_balance_kg', 'pending_balance_kg', 'status', 'period', 'last_allocation_date', 'blocking_period', 'country_group', 'country_group_id', 'commodity_codes']; const parsed = parseCsv(payload.raw, required); const sourceFile = kind === 'eu' ? 'taric_quota_data.csv' : 'uk_quota_data.csv'; const sourcePrefix = kind.toUpperCase(); const sourceMeta = (row) => ({ source_id: sourceId, source_file: sourceFile, source_url: url, captured_at: capturedAt, source_sha256: payload.hash, source_row_number: row, raw_record_ref: `${sourcePrefix}:${row}` }); const normalized = []; const rejected = [...parsed.rejected.map((item) => ({ ...item, source: sourcePrefix, ...sourceMeta(item.row) }))];
  parsed.accepted.forEach(({ row, data }) => { const reasons = rowReasons(kind, data); const result = kind === 'eu' ? normalizeEu(data) : normalizeUk(data); if (result && !reasons.length) normalized.push({ ...result, ...sourceMeta(row), source_row: row }); else rejected.push({ row, source: sourcePrefix, ...sourceMeta(row), reason: reasons.join('；') || '关键字段缺失或格式无效' }); });
  parsed.rawRecords.forEach((item) => { Object.assign(item, { source_id: sourceId, source_file: kind === 'eu' ? 'taric_quota_data.csv' : 'uk_quota_data.csv', source_url: url, captured_at: capturedAt, source_sha256: payload.hash, raw_record_ref: `${kind.toUpperCase()}:${item.row}` }); });
  const deduped = kind === 'eu' ? latestByKey(normalized, euKey) : latestByKey(normalized, ukKey); const dates = [...new Set(deduped.map((item) => item.fetch_date))].sort(); const latestDate = dates.at(-1); const latestRows = kind === 'eu' ? latestEu(deduped.filter((item) => item.fetch_date === latestDate)) : latestUk(deduped.filter((item) => item.fetch_date === latestDate));
  const history = dates.map((date) => { const rows = kind === 'eu' ? latestEu(deduped.filter((item) => item.fetch_date === date)) : latestUk(deduped.filter((item) => item.fetch_date === date)); return { date, ...(kind === 'eu' ? summarizeEu(rows) : summarizeUk(rows)) }; });
  return { latest: { as_of: latestDate, summary: kind === 'eu' ? summarizeEu(latestRows) : summarizeUk(latestRows), rows: latestRows }, history, quality: { raw_rows: parsed.rawRecords.length, accepted_rows: normalized.length, rejected_rows: rejected.length, deduped_rows: deduped.length, duplicate_rows_removed: normalized.length - deduped.length, repaired_rows: parsed.repaired, quality_warnings: rejected }, rejected_rows: rejected, raw: { headers: parsed.headers, content: payload.raw, rows: parsed.rawRecords }, accepted_rows: normalized, normalized_rows: deduped, origin_index: buildOriginIndex(latestRows), origin_groups: buildOriginGroups(latestRows), history_origin_index: buildOriginIndex(deduped), hash: payload.hash, records: normalized.length };
}

async function main() {
  try {
    const config = JSON.parse(await fs.readFile(argument('--config', defaultConfig), 'utf8')); readPayload.retry = config.retry || {}; const capturedAt = new Date().toISOString(); const eu = await readSource({ input: argument('--eu-input'), url: config.csv_url, kind: 'eu', sourceId: config.source_id, capturedAt }); const uk = await readSource({ input: argument('--uk-input'), url: config.uk_csv_url, kind: 'uk', sourceId: config.source_id, capturedAt }); const output = path.resolve(argument('--output', defaultOutput));
    const combinedHash = crypto.createHash('sha256').update(`${eu.hash}:${uk.hash}`).digest('hex');
    const snapshot = { schema_version: '2.1', source: { source_id: config.source_id, name: config.name, dashboard_url: config.dashboard_url, csv_url: config.csv_url, uk_csv_url: config.uk_csv_url, schedule: config.schedule, transport: config.transport, captured_at: capturedAt, raw_sha256: combinedHash, eu_raw_sha256: eu.hash, uk_raw_sha256: uk.hash, coverage_start: [eu.history[0]?.date, uk.history[0]?.date].filter(Boolean).sort()[0] || null, coverage_end: [eu.latest.as_of, uk.latest.as_of].filter(Boolean).sort().at(-1) || null, record_count: eu.records + uk.records, record_counts: { EU: eu.records, UK: uk.records, total: eu.records + uk.records }, raw_record_counts: { EU: eu.raw.rows.length, UK: uk.raw.rows.length, total: eu.raw.rows.length + uk.raw.rows.length }, latest_code_count: eu.latest.rows.length, latest_order_count: uk.latest.rows.length, latest_distinct_codes: [...new Set(eu.latest.rows.map((row) => row.code))].sort(), latest_distinct_orders: [...new Set(uk.latest.rows.map((row) => row.order_number))].sort(), retry: retrySummary(config.retry || {}) }, latest: eu.latest, history: eu.history, eu: { ...eu.latest, history: eu.history, quality: eu.quality, rejected_rows: eu.rejected_rows, raw: eu.raw, normalized_rows: eu.normalized_rows, origin_index: eu.origin_index, origin_groups: eu.origin_groups, history_origin_index: eu.history_origin_index }, uk: { ...uk.latest, history: uk.history, quality: uk.quality, rejected_rows: uk.rejected_rows, raw: uk.raw, normalized_rows: uk.normalized_rows, origin_index: uk.origin_index, origin_groups: uk.origin_groups, history_origin_index: uk.history_origin_index }, quality: { eu: { ...eu.quality, rejected_rows: eu.rejected_rows }, uk: { ...uk.quality, rejected_rows: uk.rejected_rows }, raw_record_counts: { EU: eu.raw.rows.length, UK: uk.raw.rows.length, total: eu.raw.rows.length + uk.raw.rows.length }, accepted_record_counts: { EU: eu.records, UK: uk.records, total: eu.records + eu.records * 0 + uk.records }, dedupe_key: 'EU: region + code + validity_period + origin + fetch_date；UK: region + order_number + period + country_group_id + commodity_codes + fetch_date', latest_policy: '同一复合键保留最新 fetch_datetime；原始层保留全部 CSV 行，国家组索引用于查询与展示' }, methodology: { unit: 'EU Kilogram ÷ 1000 转为吨；UK kg 字段 ÷ 1000 转为吨', latest: '按区域 + Code/订单号 + 配额期 + 原产地/国家组 + 商品范围 + fetch_date 去重，并保留最新 fetch_datetime；最新日期作为展示快照', remaining_pct: '余额 / 初始（或期初）配额 × 100', used_pct: '100 - remaining_pct；不将预估分摊税率当作法定税率', critical: 'EU 使用源字段 critical=Yes；UK 使用源字段 status，不跨源推导临界状态', origin_index: '按 | 拆分 origin；保留 origin_text；共享池的余额不可按国家直接相加', note: '配额源当前为 EU TARIC 与 UK 独立导出，不等同于全球配额数据库；EU/UK 之外需要继续接入各自官方源' } };
    snapshot.schema_version = '2.1'; Object.assign(snapshot.source, { record_count: eu.records + uk.records, record_counts: { EU: eu.records, UK: uk.records, total: eu.records + uk.records }, raw_record_counts: { EU: eu.raw.rows.length, UK: uk.raw.rows.length, total: eu.raw.rows.length + uk.raw.rows.length }, latest_distinct_codes: [...new Set(eu.latest.rows.map((row) => row.code))].sort(), historical_distinct_codes: [...new Set(eu.normalized_rows.map((row) => row.code))].sort(), historical_code_count: new Set(eu.normalized_rows.map((row) => row.code)).size, latest_distinct_orders: [...new Set(uk.latest.rows.map((row) => row.order_number))].sort(), historical_distinct_orders: [...new Set(uk.normalized_rows.map((row) => row.order_number))].sort(), code_count_note: '页面统计的 25 个 Code 与导出 CSV 解析出的历史不同 Code 必须以源站实际导出为准；本次导出解析出 24 个有效 Code，最新日期可用 22 个。页面统计与导出差异已作为质量提示，不静默补造记录。' });
    Object.assign(snapshot.eu, { raw: eu.raw, accepted_rows: eu.accepted_rows, normalized_rows: eu.normalized_rows, origin_index: eu.origin_index, origin_groups: eu.origin_groups, history_origin_index: eu.history_origin_index });
    Object.assign(snapshot.uk, { raw: uk.raw, accepted_rows: uk.accepted_rows, normalized_rows: uk.normalized_rows, origin_index: uk.origin_index, origin_groups: uk.origin_groups, history_origin_index: uk.history_origin_index });
    Object.assign(snapshot.quality, { raw_record_counts: { EU: eu.raw.rows.length, UK: uk.raw.rows.length, total: eu.raw.rows.length + uk.raw.rows.length }, accepted_record_counts: { EU: eu.records, UK: uk.records, total: eu.records + uk.records }, dedupe_key: 'EU: region + code + validity_period + origin + fetch_date；UK: region + order_number + period + country_group_id + commodity_codes + fetch_date', source_count_reconciliation: { page_declared_eu_code_count: 25, export_historical_distinct_eu_code_count: snapshot.source.historical_code_count, export_latest_distinct_eu_code_count: snapshot.source.latest_code_count, status: snapshot.source.historical_code_count === 25 ? 'matched' : 'warning_export_differs_from_page_declaration' } });
    await fs.mkdir(path.dirname(output), { recursive: true }); await writeFileAtomic(output, `${JSON.stringify(snapshot)}\n`); console.log(`[taric-quota] 已写入 ${output}；EU ${eu.latest.as_of}/${eu.latest.rows.length} Code，UK ${uk.latest.as_of}/${uk.latest.rows.length} 订单，异常 EU/UK ${eu.quality.rejected_rows}/${uk.quality.rejected_rows}`);
  } catch (error) { console.error(`[taric-quota] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; }
}
main();
