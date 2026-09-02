#!/usr/bin/env node

/**
 * 抓取航运指数看板的六组结构化 JSON，生成平台统一快照。
 * 页面中的“导出图表/导出 Excel”用于人工校核；定时任务直接读取公开 JSON。
 * 输出采用临时文件 + 原子替换，失败时不覆盖最近一次成功快照。
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithRetry, retrySummary, writeFileAtomic } from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(here, 'shipping-index-source.json');
const defaultOutput = path.join(here, '..', 'frontend', 'public', 'data', 'external_shipping_indices.json');
const definitions = [
  { code: 'CCFI', file: 'ccfi.json', label: 'CCFI 中国出口集装箱运价指数', category: '集装箱', frequency: '周频', unit: '指数点', coreRoute: '中国出口集装箱运价综合指数' },
  { code: 'SCFI', file: 'scfi.json', label: 'SCFI 上海集装箱运价指数', category: '集装箱', frequency: '周频', unit: '指数点' },
  { code: 'BSI', file: 'bsi.json', label: 'BSI 超灵便型船运价指数', category: '干散货', frequency: '日频', unit: '指数点' },
  { code: 'BDI', file: 'bdi.json', label: 'BDI 波罗的海干散货指数', category: '干散货', frequency: '日频', unit: '指数点' },
  { code: 'BRENT', file: 'brent.json', label: 'Brent 布伦特原油期货', category: '能源', frequency: '日频', unit: 'USD/bbl' },
  { code: 'NYMEX', file: 'nymex.json', label: 'NYMEX 原油期货', category: '能源', frequency: '日频', unit: 'USD/bbl' },
];

const arg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const fail = (message) => { console.error(`[shipping-index] ${message}`); process.exitCode = 1; };
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

function normaliseRows(raw, definition, validation = {}) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error(`${definition.file} 不是非空数组`);
  const rows = raw.map((row, index) => {
    if (!row || typeof row !== 'object' || !validDate(row.date) || !Number.isFinite(Number(row.value))) throw new Error(`${definition.file}[${index}] 缺少合法 date/value`);
    const previousValue = Number.isFinite(Number(row.prev_value)) ? Number(row.prev_value) : null;
    const changeRatePct = Number.isFinite(Number(row.change_rate))
      ? Number(row.change_rate)
      : previousValue != null && previousValue !== 0
        ? (Number(row.value) - previousValue) / previousValue * 100
        : null;
    return { date: row.date, value: Number(row.value), previousValue, previousDate: validDate(row.prev_date) ? row.prev_date : null, changeRatePct, routeName: typeof row.route_cn === 'string' ? row.route_cn : null, routeCode: typeof row.route_en === 'string' ? row.route_en : null };
  }).sort((a, b) => `${a.date}${a.routeName || ''}`.localeCompare(`${b.date}${b.routeName || ''}`));
  const keys = new Set(rows.map((row) => `${row.date}|${row.routeName || definition.code}`));
  if (keys.size !== rows.length) throw new Error(`${definition.file} 存在重复日期/航线记录`);
  const minimumPoints = Number(validation.minimum_points_per_series || 2);
  if (rows.length < minimumPoints) throw new Error(`${definition.file} 有效数据点不足：${rows.length} < ${minimumPoints}`);
  if (definition.coreRoute && !rows.some((row) => row.routeName === definition.coreRoute)) throw new Error(`${definition.file} 缺少核心航线：${definition.coreRoute}`);
  return rows;
}

async function readPayload(file, baseUrl, inputDir, retry) {
  if (inputDir) { const raw = await fs.readFile(path.resolve(inputDir, file)); return { raw, data: JSON.parse(raw.toString('utf8')) }; }
  const response = await fetchWithRetry(`${baseUrl}/${file}?v=${Date.now()}`, { headers: { accept: 'application/json' } }, retry);
  const raw = Buffer.from(await response.arrayBuffer());
  return { raw, data: JSON.parse(raw.toString('utf8')) };
}

const latest = (rows) => [...rows].sort((a, b) => a.date.localeCompare(b.date)).at(-1);

async function main() {
  const config = JSON.parse(await fs.readFile(arg('--config', configPath), 'utf8'));
  const retry = config.retry || {};
  const validation = config.validation || {};
  const expectedCodes = definitions.map((definition) => definition.code);
  if (Array.isArray(validation.required_series) && (validation.required_series.length !== expectedCodes.length || validation.required_series.some((code) => !expectedCodes.includes(code)))) throw new Error('validation.required_series 必须完整包含 CCFI、SCFI、BSI、BDI、BRENT、NYMEX');
  if (!Array.isArray(config.sources) || expectedCodes.some((code) => !config.sources.includes(definitions.find((definition) => definition.code === code).file))) throw new Error('sources 必须完整列出六个公开 JSON 文件');
  const output = path.resolve(arg('--output', defaultOutput));
  const inputDir = arg('--input-dir');
  const loaded = [];
  for (const definition of definitions) {
    const payload = await readPayload(definition.file, config.data_base_url, inputDir, retry);
    const rows = normaliseRows(payload.data, definition, validation);
    loaded.push({ definition, rows, hash: crypto.createHash('sha256').update(payload.raw).digest('hex') });
  }
  const series = Object.fromEntries(loaded.map(({ definition, rows }) => {
    const coreRows = definition.coreRoute ? rows.filter((row) => row.routeName === definition.coreRoute) : rows;
    return [definition.code, { code: definition.code, label: definition.label, category: definition.category, frequency: definition.frequency, unit: definition.unit, points: rows, latest: latest(coreRows.length ? coreRows : rows), observationCount: rows.length }];
  }));
  const allDates = loaded.flatMap(({ rows }) => rows.map((row) => row.date)).sort();
  const snapshot = { schema_version: '1.1', source: { source_id: config.source_id, name: config.name, dashboard_url: config.dashboard_url, data_base_url: config.data_base_url, captured_at: new Date().toISOString(), raw_sha256: Object.fromEntries(loaded.map(({ definition, hash }) => [definition.code, hash])), coverage_start: allDates[0], coverage_end: allDates.at(-1), schedule: config.schedule, transport: config.transport, excel_role: config.excel_role, source_files: config.sources, retry: retrySummary(retry) }, series, methodology: { change_rate: '优先使用源站 change_rate；缺失时由 value 与 prev_value 计算百分比变化，避免 CCFI/SCFI 周环比在图表中为空。', core: `CCFI 取“${validation.ccfi_core_route || '中国出口集装箱运价综合指数'}”，其余五组取各自最新发布点。`, limitation: '航运指数用于市场环境判断，不等同于某条实际船期、舱位或 ETA。' } };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await writeFileAtomic(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`[shipping-index] 已写入 ${output}；六组指数覆盖 ${snapshot.source.coverage_start} 至 ${snapshot.source.coverage_end}`);
}
main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
