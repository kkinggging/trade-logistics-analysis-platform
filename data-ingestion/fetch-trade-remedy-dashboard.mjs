#!/usr/bin/env node

/**
 * 贸易救济看板适配器。
 * 源站把全量案件放在 HTML 的 window.__DATA__ 中；这里保存结构化快照，
 * 不截图、不依赖点击下载，也不把缺失税率当成 0%。
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { withRetry, writeFileAtomic } from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultConfig = path.join(here, 'trade-remedy-dashboard-source.json');
const defaultOutput = path.join(here, '..', 'frontend', 'public', 'data', 'external_trade_remedy.json');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function readSource(config) {
  const input = argument('--input');
  if (input) return fs.readFile(input, 'utf8');
  return withRetry(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.retry?.timeoutMs || 30000);
    try {
      const response = await fetch(config.dashboard_url.split('#')[0], { signal: controller.signal, headers: { accept: 'text/html,application/xhtml+xml' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    } finally { clearTimeout(timer); }
  }, config.retry || {});
}

function extractData(html) {
  const startToken = 'window.__DATA__=';
  const start = html.indexOf(startToken);
  if (start < 0) throw new Error('源页面缺少 window.__DATA__');
  const end = html.indexOf('</script>', start);
  if (end < 0) throw new Error('无法定位案件数据脚本结束位置');
  const payload = html.slice(start + startToken.length, end).replace(/;\s*$/, '').trim();
  const parsed = JSON.parse(payload);
  if (!Array.isArray(parsed.cases) || !parsed.cases.length) throw new Error('案件数据为空');
  return parsed;
}

function dateOnly(value) { return typeof value === 'string' ? value.slice(0, 10) : null; }
function numericRate(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const match = String(value || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?\s*%/);
  return match ? Number(match[0].replace('%', '').trim()) : null;
}

function normalizeCase(item) {
  const required = ['case_id', 'case_name', 'case_type', 'case_state', 'product_cn', 'country', 'region', 'source_url'];
  const missing = required.filter((key) => item[key] == null || item[key] === '');
  if (missing.length) return { error: `缺少字段：${missing.join('、')}` };
  return {
    case_id: String(item.case_id), case_no: item.case_no || null, case_name: String(item.case_name),
    case_type: String(item.case_type), case_state: String(item.case_state), latest_stage: item.latest_stage ? String(item.latest_stage) : '未披露',
    latest_stage_date: dateOnly(item.latest_stage_date), filing_date: dateOnly(item.filing_date), stages_text: item.stages_text || '',
    stages: Array.isArray(item.stages) ? item.stages.map((stage) => ({ date: dateOnly(stage.date), type: stage.type || '', url: stage.url || null, result: stage.result || '', original_url: stage.original_url || null })) : [],
    product_cn: item.product_cn || '', variety: item.variety || item.product_cn || '', variety_tags: item.variety_tags || [],
    country: String(item.country), region: String(item.region), hs_codes: Array.isArray(item.hs_codes) ? item.hs_codes : [], hs_text: item.hs_text || '',
    description: item.description || '', final_rate: item.final_rate || '', final_rate_pct: numericRate(item.final_rate || item.rate_range),
    final_measure_type: item.final_measure_type || '', final_measure: item.final_measure || '', final_measure_detail: item.final_measure_detail || '',
    final_measure_table: item.final_measure_table || [], measure_table_full: item.measure_table_full || null, product_table: item.product_table || null,
    sg_table: item.sg_table || '', commit_groups: item.commit_groups || [], rate_range: item.rate_range || '', industry_type: item.industry_type || '钢铁工业',
    source_url: item.source_url, original_article_url: item.original_article_url || null, raw_record: item.raw_row || null, first_seen: dateOnly(item.first_seen), last_updated: dateOnly(item.last_updated),
    category: item._category || '未分类', subtype: item._subtype || item.variety || item.product_cn || '未分类', year: item._year || null,
  };
}

function aggregate(cases) {
  const byCountry = new Map();
  const byRegion = new Map();
  for (const item of cases) {
    for (const [key, map] of [['country', byCountry], ['region', byRegion]]) {
      const name = item[key] || '未标注';
      const row = map.get(name) || { name, case_count: 0, anti_dumping: 0, countervailing: 0, safeguard: 0, investigating: 0, measures_in_force: 0, latest_date: null, products: new Set(), hs_codes: new Set() };
      row.case_count += 1;
      if (item.case_type === '反倾销') row.anti_dumping += 1;
      if (item.case_type === '反补贴') row.countervailing += 1;
      if (item.case_type === '保障措施') row.safeguard += 1;
      if (String(item.case_state).includes('调查')) row.investigating += 1;
      if (String(item.case_state).includes('执行') || String(item.latest_stage).includes('措施实施')) row.measures_in_force += 1;
      if (item.latest_stage_date && (!row.latest_date || item.latest_stage_date > row.latest_date)) row.latest_date = item.latest_stage_date;
      row.products.add(item.variety || item.product_cn);
      item.hs_codes.forEach((code) => row.hs_codes.add(code));
      map.set(name, row);
    }
  }
  const toRows = (map) => [...map.values()].map((row) => ({ ...row, products: [...row.products].slice(0, 20), hs_codes: [...row.hs_codes].slice(0, 40) })).sort((a, b) => b.case_count - a.case_count || a.name.localeCompare(b.name));
  return { country: toRows(byCountry), region: toRows(byRegion) };
}

async function main() {
  const config = JSON.parse(await fs.readFile(argument('--config', defaultConfig), 'utf8'));
  try {
    const html = await readSource(config);
    const raw = extractData(html);
    const normalized = raw.cases.map(normalizeCase);
    const rejected = normalized.filter((item) => item.error);
    const cases = normalized.filter((item) => !item.error);
    if (rejected.length || cases.length !== raw.cases.length) throw new Error(`案件字段校验失败：${rejected.length}/${raw.cases.length} 条`);
    const generatedAt = dateOnly(raw.updated_at) || null;
    const snapshot = {
      schema_version: '1.0',
      source: { source_id: config.source_id, name: config.name, dashboard_url: config.dashboard_url, captured_at: new Date().toISOString(), generated_at: generatedAt, coverage_start: cases.map((item) => item.filing_date).filter(Boolean).sort()[0] || null, coverage_end: cases.map((item) => item.latest_stage_date || item.filing_date).filter(Boolean).sort().at(-1) || null, raw_sha256: crypto.createHash('sha256').update(html).digest('hex'), record_count: cases.length, schedule: config.schedule, transport: config.transport },
      summary: { total_cases: cases.length, total_raw_steel: raw.total_raw_steel || cases.length, categories: raw.categories || [], case_types: [...new Set(cases.map((item) => item.case_type))], country_count: new Set(cases.map((item) => item.country)).size, region_count: new Set(cases.map((item) => item.region)).size, hs_code_count: new Set(cases.flatMap((item) => item.hs_codes)).size, active_case_count: cases.filter((item) => !String(item.case_state).includes('终止') && !String(item.case_state).includes('撤销')).length },
      cases, aggregates: aggregate(cases), quality: { raw_rows: raw.cases.length, accepted_rows: cases.length, rejected_rows: rejected.length, duplicate_case_ids: cases.length - new Set(cases.map((item) => item.case_id)).size, required_fields: ['case_id','case_name','case_type','case_state','latest_stage','filing_date','product_cn','country','region','hs_codes','source_url'], note: '税率缺失保留为 null，不按 0% 处理；欧盟等区域组织按源站主体统计，不复制到成员国。' },
      methodology: { map_case_count: '按源站案件主体 country/region 聚合；区域组织不拆分复制到成员国', active_case: '排除明确终止/撤销案件，其余作为当前案件状态参考', rate: '从结构化 final_rate 或 rate_range 提取可解析百分比；无法解析则为 null', limitation: '案件数据反映贸易救济状态，不等同于真实成交概率或自动出口决策' },
    };
    const output = path.resolve(argument('--output', defaultOutput));
    await fs.mkdir(path.dirname(output), { recursive: true });
    await writeFileAtomic(output, `${JSON.stringify(snapshot)}\n`);
    console.log(`[trade-remedy] 已写入 ${output}；${cases.length} 条案件，${snapshot.summary.country_count} 个发起国/地区，${snapshot.summary.hs_code_count} 个税号`);
  } catch (error) {
    console.error(`[trade-remedy] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
main();
