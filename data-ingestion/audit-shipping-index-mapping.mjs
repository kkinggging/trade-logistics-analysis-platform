#!/usr/bin/env node

/**
 * 航运指数“数据快照—前端契约—图表角色”独立审计。
 *
 * 用法：
 *   node audit-shipping-index-mapping.mjs
 *   node audit-shipping-index-mapping.mjs --snapshot /tmp/external_shipping_indices.json
 *
 * 该脚本不修改前端文件；退出码为 1 表示快照或映射契约不满足验收标准。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const mappingPath = path.join(here, 'shipping-index-chart-mapping.json');
const defaultSnapshot = path.join(root, 'frontend', 'public', 'data', 'external_shipping_indices.json');
const codes = ['CCFI', 'SCFI', 'BSI', 'BDI', 'BRENT', 'NYMEX'];
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
};

const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

async function main() {
  const mapping = JSON.parse(await fs.readFile(mappingPath, 'utf8'));
  const snapshotPath = path.resolve(arg('--snapshot', defaultSnapshot));
  let snapshot;
  try { snapshot = JSON.parse(await fs.readFile(snapshotPath, 'utf8')); }
  catch (error) { throw new Error(`无法读取快照 ${snapshotPath}：${error instanceof Error ? error.message : String(error)}`); }

  check(snapshot.schema_version === '1.1', `快照 schema_version 应为 1.1，实际为 ${snapshot.schema_version}`);
  check(snapshot.source?.source_id === mapping.source_id, '快照 source_id 与映射契约不一致');
  check(snapshot.source?.raw_sha256 && typeof snapshot.source.raw_sha256 === 'object', '缺少六个源文件 raw_sha256');
  check(snapshot.source?.captured_at && !Number.isNaN(Date.parse(snapshot.source.captured_at)), '缺少合法 captured_at');
  check(Array.isArray(snapshot.source?.source_files) && snapshot.source.source_files.length === 6, 'source_files 未完整列出六个 JSON');
  check(snapshot.series && typeof snapshot.series === 'object', '缺少 series');

  for (const code of codes) {
    const series = snapshot.series?.[code];
    const expected = mapping.series.find((item) => item.code === code);
    check(series, `缺少序列 ${code}`);
    check(expected, `映射契约缺少序列 ${code}`);
    if (!series || !expected) continue;
    check(series.code === code, `${code}.code 不一致`);
    check(series.category === expected.category, `${code}.category 不符合映射契约`);
    check(series.frequency === expected.frequency, `${code}.frequency 不符合映射契约`);
    check(series.unit === expected.unit, `${code}.unit 不符合映射契约`);
    check(Array.isArray(series.points) && series.points.length >= 2, `${code}.points 少于 2 条`);
    check(Number.isInteger(series.observationCount) && series.observationCount === series.points?.length, `${code}.observationCount 与 points 不一致`);
    const keys = new Set();
    for (const point of series.points || []) {
      check(isDate(point.date), `${code} 存在非法日期 ${point.date}`);
      check(Number.isFinite(point.value), `${code} 存在非有限 value`);
      const key = `${point.date}|${point.routeName || code}`;
      check(!keys.has(key), `${code} 存在重复日期/航线 ${key}`);
      keys.add(key);
      if (point.changeRatePct != null) check(Number.isFinite(point.changeRatePct), `${code} 存在非有限 changeRatePct`);
    }
    const corePoints = expected.core_route_cn ? series.points.filter((point) => point.routeName === expected.core_route_cn) : series.points;
    check(corePoints.length > 0, `${code} 缺少核心口径数据`);
    const latest = series.latest;
    check(latest && corePoints.some((point) => point.date === latest.date && point.value === latest.value), `${code}.latest 不属于核心口径点集`);
    check(latest?.changeRatePct != null, `${code}.latest.changeRatePct 为空，无法支持核心指标卡环比展示`);
  }

  const expectedBindings = mapping.chart_bindings || [];
  for (const binding of expectedBindings) {
    check(binding.series.every((code) => codes.includes(code)), `${binding.chart_id} 引用了未定义序列`);
    check(binding.required_fields?.length > 0, `${binding.chart_id} 未定义 required_fields`);
    check(binding.type && binding.placement, `${binding.chart_id} 缺少 type 或 placement`);
  }

  const provider = await fs.readFile(path.join(root, 'frontend', 'src', 'core', 'data', 'provider.ts'), 'utf8');
  const strategyData = await fs.readFile(path.join(root, 'frontend', 'src', 'core', 'strategy', 'data.ts'), 'utf8');
  const engine = await fs.readFile(path.join(root, 'frontend', 'src', 'core', 'strategy', 'engine.ts'), 'utf8');
  check(provider.includes("getShippingIndexSnapshot") && provider.includes("external_shipping_indices.json"), 'Provider 未读取航运快照');
  check(strategyData.includes('shippingIndices') && strategyData.includes('getShippingIndexSnapshot'), '策略数据包未传递 shippingIndices');
  check(engine.includes('shippingIndices'), '策略引擎未声明 shippingIndices');
  const analysis = await fs.readFile(path.join(root, 'frontend', 'src', 'features', 'analysis', 'UnifiedAnalysis.tsx'), 'utf8');
  const requiredAnalysisMarkers = ['ShippingIndexPanel', 'shipping-index-panel', 'shippingIndexOrder', "lineOption(['CCFI', 'SCFI']", "lineOption(['BSI', 'BDI']", "lineOption(['BRENT', 'NYMEX']", 'dataProvider.getShippingIndexSnapshot()', 'shippingIndices: nextShippingIndices'];
  requiredAnalysisMarkers.forEach((marker) => check(analysis.includes(marker), `综合分析缺少航运图表接入标记：${marker}`));

  if (failures.length) {
    console.error(`[shipping-index-audit] FAIL (${failures.length})`);
    failures.forEach((message) => console.error(`- ${message}`));
    process.exitCode = 1;
    return;
  }
  console.log(`[shipping-index-audit] PASS：六组序列、快照字段、图表契约、Provider/策略链路及综合分析三类航运图表均通过。`);
}

main().catch((error) => { console.error(`[shipping-index-audit] ERROR：${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
