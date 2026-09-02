#!/usr/bin/env node

/**
 * 抓取公开钢材市场看板快照并转换为平台 MarketQuote 兼容数据。
 *
 * 用法：
 *   node fetch-steel-dashboard.mjs
 *   node fetch-steel-dashboard.mjs --input ./data.json --output ../frontend/public/data/external_steel_dashboard.json
 *
 * 生产环境建议由受控的 cron / launchd / CI 调用，每天 Asia/Shanghai 18:00 执行。
 * 抓取失败时不覆盖最近成功快照；脚本退出码为 1，方便调度器告警。
 */

import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithRetry, retrySummary, writeFileAtomic } from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultConfig = path.join(here, 'steel-dashboard-source.json');
const defaultOutput = path.join(here, '..', 'frontend', 'public', 'data', 'external_steel_dashboard.json');
const defaultUrl = 'https://sleepycat-db612-d4flpypa62d30215-1466100115.tcloudbaseapp.com/steel-dashboard/data.json';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function fail(message) {
  console.error(`[steel-dashboard] ${message}`);
  process.exitCode = 1;
}

function isPair(value) {
  return Array.isArray(value) && value.length >= 2 && typeof value[0] === 'string' && Number.isFinite(Number(value[1]));
}

function readSeries(data, key) {
  const value = key.split('.').reduce((current, part) => current?.[part], data);
  if (!Array.isArray(value)) throw new Error(`缺少数组字段：${key}`);
  const series = value.map((point, index) => {
    if (!isPair(point)) throw new Error(`${key}[${index}] 不是有效的 [日期, 数值] 数据点`);
    const [date, amount] = point;
    const normalizedDate = date.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate) || Number.isNaN(Date.parse(normalizedDate))) {
      throw new Error(`${key}[${index}] 日期无效：${date}`);
    }
    return { date: normalizedDate, value: Number(amount) };
  });
  const dates = new Set(series.map((point) => point.date));
  if (dates.size !== series.length) throw new Error(`${key} 存在重复日期`);
  return series.sort((left, right) => left.date.localeCompare(right.date));
}

function quoteFromSeries(series, target, generatedAt) {
  return series.map((point, index) => ({
    quote_id: `EXT-${target.indicator_code}-${point.date}`,
    date: point.date,
    source: 'steel-dashboard-public',
    indicator_code: target.indicator_code,
    indicator_name: target.indicator_name,
    value: point.value,
    unit: target.unit,
    currency: target.unit === 'USD/ton' ? 'USD' : undefined,
    frequency: target.frequency === '日' ? 'daily' : target.frequency === '周' ? 'weekly' : target.frequency === '旬' ? 'dekadal' : 'monthly',
    publish_time: generatedAt || `${point.date}T18:00:00+08:00`,
    quality_flag: ['external_public_snapshot', ...(index > 0 ? ['baseline_previous_observation'] : [])],
    citation: `钢材市场数据看板 · ${target.chinese_name}`,
    fetch_mode: 'scrape',
    baseline: index > 0 ? series[index - 1].value : undefined,
  }));
}

async function readInput(inputPath, url, retry) {
  if (inputPath) {
    const raw = await fs.readFile(path.resolve(inputPath));
    return { data: JSON.parse(raw.toString('utf8')), rawSha256: crypto.createHash('sha256').update(raw).digest('hex') };
  }

  const response = await fetchWithRetry(`${url}?v=${Date.now()}`, { headers: { accept: 'application/json' } }, retry);
  const raw = Buffer.from(await response.arrayBuffer());
  return { data: JSON.parse(raw.toString('utf8')), rawSha256: crypto.createHash('sha256').update(raw).digest('hex') };
}

async function main() {
  const config = JSON.parse(await fs.readFile(argument('--config', defaultConfig), 'utf8'));
  const output = path.resolve(argument('--output', defaultOutput));
  const input = argument('--input', '');
  const url = argument('--url', config.data_url || defaultUrl);
  const retry = config.retry || {};
  const { data, rawSha256 } = await readInput(input, url, retry);

  if (!data || typeof data !== 'object' || !data.inventory || !Array.isArray(data.platts_daily)) {
    throw new Error('目标快照未包含 inventory 与 platts_daily，未生成输出');
  }

  const generatedAt = typeof data.generated_at === 'string' ? data.generated_at : new Date().toISOString();
  const seriesByTarget = config.targets.map((target) => ({ target, series: readSeries(data, target.source_key) }));
  if (seriesByTarget.some(({ series }) => series.length === 0)) throw new Error('至少一个目标序列没有有效数据点，未生成输出');
  const quotes = seriesByTarget.flatMap(({ target, series }) => quoteFromSeries(series, target, generatedAt));
  if (!quotes.length) throw new Error('没有通过校验的有效数据点，未生成输出');

  const dates = quotes.map((quote) => quote.date).sort();
  const snapshot = {
    schema_version: '1.0',
    source: {
      source_id: config.source_id,
      name: config.name,
      dashboard_url: config.dashboard_url,
      data_url: url,
      generated_at: generatedAt,
      captured_at: new Date().toISOString(),
      raw_sha256: rawSha256,
      coverage_start: dates[0],
      coverage_end: dates[dates.length - 1],
      schedule: config.schedule,
      excel_role: config.excel_role,
      retry: retrySummary(retry),
    },
    market_quotes: quotes,
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await writeFileAtomic(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`[steel-dashboard] 已写入 ${output}`);
  console.log(`[steel-dashboard] ${quotes.length} 条行情记录，覆盖 ${dates[0]} 至 ${dates[dates.length - 1]}，源数据生成于 ${generatedAt}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
