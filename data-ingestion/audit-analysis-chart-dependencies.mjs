#!/usr/bin/env node

/**
 * 综合分析图表依赖审计。
 *
 * 目标不是验证“网页能否打开”，而是验证每一类图表所依赖的快照：
 * 1. 有来源身份、抓取时间、覆盖范围和原始哈希；
 * 2. 图表实际读取的数组/字段存在，且数值、日期、单位满足基本口径；
 * 3. 聚合总数与事实层能够闭环时，必须闭环；
 * 4. 派生指标只作为派生指标，不把缺失数据默认为 0。
 *
 * 用法：
 *   node data-ingestion/audit-analysis-chart-dependencies.mjs
 *   node data-ingestion/audit-analysis-chart-dependencies.mjs --data /path/to/data
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const here = path.dirname(decodeURIComponent(new URL(import.meta.url).pathname));
const defaultDataDir = path.resolve(here, '../frontend/public/data');
const argument = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};
const dataDir = path.resolve(argument('--data', defaultDataDir));
const failures = [];
const warnings = [];

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const isDate = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const nonEmpty = (value) => typeof value === 'string' && value.trim().length > 0;
const addFailure = (name, detail) => failures.push(`${name}: ${detail}`);
const addWarning = (name, detail) => warnings.push(`${name}: ${detail}`);
const check = (condition, name, detail) => {
  if (!condition) addFailure(name, detail);
};
const readJson = async (name) => JSON.parse(await fs.readFile(path.join(dataDir, name), 'utf8'));

function checkSource(name, snapshot) {
  const source = snapshot?.source;
  check(Boolean(source), `${name}.source`, '缺少来源元数据');
  check(nonEmpty(source?.source_id), `${name}.source_id`, '缺少 source_id');
  check(isDate(source?.captured_at), `${name}.captured_at`, '缺少合法 captured_at');
  const hash = source?.raw_sha256;
  const hasHash = nonEmpty(hash) || (hash && typeof hash === 'object' && Object.values(hash).every(nonEmpty));
  check(Boolean(hasHash), `${name}.raw_sha256`, '缺少原始数据哈希');
  if (source?.coverage_start != null) check(nonEmpty(source.coverage_start), `${name}.coverage_start`, '覆盖起始时间为空');
  if (source?.coverage_end != null) check(nonEmpty(source.coverage_end), `${name}.coverage_end`, '覆盖结束时间为空');
  if (source?.coverage_start && source?.coverage_end && isDate(source.coverage_start) && isDate(source.coverage_end)) {
    check(Date.parse(source.coverage_start) <= Date.parse(source.coverage_end), `${name}.coverage`, 'coverage_start 晚于 coverage_end');
  }
}

function checkRows(name, rows, required, numeric = []) {
  check(Array.isArray(rows) && rows.length > 0, name, '图表依赖数组为空');
  if (!Array.isArray(rows)) return;
  rows.forEach((row, index) => {
    required.forEach((field) => check(row?.[field] !== undefined && row?.[field] !== null && row?.[field] !== '', `${name}[${index}].${field}`, '缺少必需字段'));
    numeric.forEach((field) => check(isFiniteNumber(row?.[field]), `${name}[${index}].${field}`, '不是有限数值'));
  });
}

async function main() {
  const [market, aggregates, costs, scenarios, policies, risks, shippingOptions, steel, steelExport, forex, quota, shipping, remedy, sync] = await Promise.all([
    readJson('market_quotes.json'),
    readJson('internal_aggregates.json'),
    readJson('product_costs.json'),
    readJson('fx_scenarios.json'),
    readJson('policy_events.json'),
    readJson('risk_signals.json'),
    readJson('shipping_options.json'),
    readJson('external_steel_dashboard.json'),
    readJson('external_steel_export.json'),
    readJson('external_forex.json'),
    readJson('external_taric_quota.json'),
    readJson('external_shipping_indices.json'),
    readJson('external_trade_remedy.json'),
    readJson('data_sync_status.json'),
  ]);

  checkRows('market_quotes', market, ['quote_id', 'source', 'indicator_code', 'indicator_name', 'date', 'unit', 'frequency'], ['value']);
  checkRows('internal_aggregates', aggregates, ['aggregate_id', 'period', 'start_date', 'end_date', 'as_of'], ['volume_t']);
  checkRows('product_costs', costs, ['cost_id', 'product_code', 'component_code', 'currency', 'effective_date', 'source'], ['value_per_ton']);
  checkRows('fx_scenarios', scenarios, ['scenario_id', 'base_currency', 'quote_currency', 'as_of'], ['base_rate', 'scenario_pct', 'scenario_rate']);
  checkRows('policy_events', policies, ['event_id', 'title', 'issuer', 'publish_date', 'country_region', 'event_type', 'summary', 'verify_status'], ['severity']);
  checkRows('risk_signals', risks, ['signal_id', 'as_of', 'factor', 'metric', 'level', 'freshness', 'review_status'], ['value', 'score']);
  checkRows('shipping_options', shippingOptions, ['option_id', 'route', 'port_origin', 'destination_port', 'eta', 'freight_currency'], ['freight_per_ton']);

  // 01 客观信息：外部市场、出口、配额、航运和贸易救济图表。
  checkSource('steel_dashboard', steel);
  checkRows('steel_dashboard.market_quotes', steel.market_quotes, ['quote_id', 'source', 'indicator_code', 'indicator_name', 'date', 'unit', 'frequency', 'publish_time'], ['value']);
  checkSource('steel_export', steelExport);
  const exportView = steelExport.default_view;
  check(Boolean(exportView), 'steel_export.default_view', '缺少默认展示视图');
  checkRows('steel_export.monthly', exportView?.monthly, ['label'], ['qty_t', 'amount_usd']);
  (exportView?.monthly || []).forEach((row, index) => {
    if (row.qty_t > 0) check(isFiniteNumber(row.amount_usd / row.qty_t), `steel_export.monthly[${index}].avg_price_usd_t`, '无法由出口量和出口额计算');
  });
  checkRows('steel_export.partner', exportView?.partner, ['label'], ['qty_t', 'amount_usd', 'avg_price_usd_t']);
  checkRows('steel_export.partner.map', (exportView?.partner || []).filter((row) => row.world || row.special), ['label'], ['qty_t']);
  checkSource('forex', forex);
  for (const code of ['DINIW', 'EURUSD', 'USDCNY']) {
    const rows = forex.symbols?.[code];
    checkRows(`forex.symbols.${code}`, rows, ['date'], ['close']);
  }
  checkRows('forex.relative_yield', forex.relative_yield, ['date'], ['rel_yield_EUR', 'rel_yield_CNY']);
  for (const code of ['EUR', 'CNY', 'USD']) {
    check(isFiniteNumber(forex.risk?.[code]?.volatility_pct), `forex.risk.${code}.volatility_pct`, '缺少波动率');
    check(isFiniteNumber(forex.risk?.[code]?.max_drawdown_pct), `forex.risk.${code}.max_drawdown_pct`, '缺少最大回撤');
  }
  checkSource('quota', quota);
  for (const region of ['eu', 'uk']) {
    const section = quota[region];
    check(Boolean(section), `quota.${region}`, '缺少区域配额快照');
    checkRows(`quota.${region}.history`, section?.history, ['date'], ['balance_t']);
    checkRows(`quota.${region}.rows`, section?.rows, ['fetch_date'], ['balance_t']);
  }
  checkSource('shipping_indices', shipping);
  for (const code of ['CCFI', 'SCFI', 'BSI', 'BDI', 'BRENT', 'NYMEX']) {
    const series = shipping.series?.[code];
    check(Boolean(series), `shipping_indices.${code}`, '缺少指数序列');
    checkRows(`shipping_indices.${code}.points`, series?.points, ['date'], ['value']);
  }
  checkSource('trade_remedy', remedy);
  check(Array.isArray(remedy.cases) && remedy.cases.length === remedy.summary?.total_cases, 'trade_remedy.case_count', '案件事实数与 summary.total_cases 未闭环');
  checkRows('trade_remedy.cases', remedy.cases, ['case_id', 'case_name', 'case_type', 'case_state', 'country', 'region', 'source_url']);
  checkRows('trade_remedy.aggregates.country', remedy.aggregates?.country, ['name'], ['case_count']);
  const aggregateCases = (remedy.aggregates?.country || []).reduce((sum, row) => sum + row.case_count, 0);
  check(aggregateCases === remedy.cases.length, 'trade_remedy.country_aggregate', `国家聚合 ${aggregateCases} 与案件数 ${remedy.cases.length} 不一致`);

  // 02-05：静态事实和规则派生图表都必须有输入，派生值不作为事实层计数。
  check(policies.every((row) => isDate(row.publish_date) && row.severity >= 0 && row.severity <= 10), 'policy_timeline.input', '政策时间线存在非法日期或严重度');
  check(aggregates.every((row) => isDate(row.start_date) && isDate(row.end_date)), 'processed.target_progress.input', '经营目标完成率存在非法日期');
  check(costs.every((row) => row.is_estimate === true || row.is_estimate === false), 'processed.cost_mix.input', '成本数据缺少 is_estimate 标记');
  check(scenarios.every((row) => row.base_rate > 0 && row.scenario_rate > 0), 'processed.fx_sensitivity.input', '汇率情景存在非正汇率');
  check(risks.every((row) => row.score >= 0 && row.score <= 100), 'conclusion.risk.input', '风险评分不在 0-100 范围');

  // 同步状态是运行可信度的一部分：fallback 是可用兜底，不等于 fresh。
  check(sync?.sources && Object.keys(sync.sources).length >= 6, 'sync.sources', '同步状态未覆盖全部外部来源');
  Object.values(sync?.sources || {}).forEach((source) => {
    if (source.state === 'fallback') addWarning(`sync.${source.source_id}`, '本次未取得新数据，图表使用上一成功快照');
    if (source.state === 'unavailable') addFailure(`sync.${source.source_id}`, '无可用快照，相关图表不应伪造数据');
  });

  const report = {
    ok: failures.length === 0,
    data_dir: dataDir,
    failures,
    warnings,
    counts: {
      market_quotes: market.length,
      internal_aggregates: aggregates.length,
      product_costs: costs.length,
      fx_scenarios: scenarios.length,
      policy_events: policies.length,
      risk_signals: risks.length,
      steel_market_quotes: steel.market_quotes?.length || 0,
      steel_export_facts: steelExport.summary?.fact_rows || 0,
      trade_remedy_cases: remedy.cases?.length || 0,
    },
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`[analysis-chart-audit] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
