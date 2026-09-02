#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithRetry, writeFileAtomic } from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultConfig = path.join(here, 'forex-dashboard-source.json');
const defaultOutput = path.join(here, '..', 'frontend', 'public', 'data', 'external_forex.json');
const defaultUrl = 'https://sleepycat-db612-d4flpypa62d30215-1466100115.tcloudbaseapp.com/forex-dashboard/data.json';

function argument(name, fallback) { const i = process.argv.indexOf(name); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; }
function fail(message) { console.error(`[forex-dashboard] ${message}`); process.exitCode = 1; }
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function percentile(values, value) { return values.filter((item) => item <= value).length / values.length * 100; }
function movingAverage(values, size, index) {
  if (index + 1 < size) return null;
  const start = index - size + 1;
  return mean(values.slice(start, index + 1));
}
function standardDeviation(values) { const avg = mean(values); return Math.sqrt(mean(values.map((value) => (value - avg) ** 2))); }
function maxDrawdown(values) { let peak = values[0] || 0; let worst = 0; values.forEach((value) => { peak = Math.max(peak, value); worst = Math.min(worst, peak ? value / peak - 1 : 0); }); return worst * 100; }

async function readPayload(input, url) {
  if (input) { const raw = await fs.readFile(path.resolve(input)); return { data: JSON.parse(raw.toString('utf8')), hash: crypto.createHash('sha256').update(raw).digest('hex') }; }
  const response = await fetchWithRetry(`${url}?v=${Date.now()}`, { headers: { accept: 'application/json' } }, readPayload.retry);
  const raw = Buffer.from(await response.arrayBuffer());
  return { data: JSON.parse(raw.toString('utf8')), hash: crypto.createHash('sha256').update(raw).digest('hex') };
}

function normalizeSymbol(symbol, start, end) {
  const rows = symbol.data.filter((row) => Array.isArray(row) && row.length >= 3 && row[0] >= start && row[0] <= end && Number.isFinite(Number(row[2]))).map((row) => ({ date: row[0], open: Number(row[1]), close: Number(row[2]), high: Number(row[3]), low: Number(row[4]) }));
  if (rows.length < 60) throw new Error(`${symbol.code} 共同区间有效数据不足`);
  return rows;
}

function latestIndependent(symbol) {
  const rows = symbol.data
    .filter((row) => Array.isArray(row) && row.length >= 3 && typeof row[0] === 'string' && Number.isFinite(Number(row[2])))
    .map((row) => ({ date: row[0], open: Number(row[1]), close: Number(row[2]), high: Number(row[3]), low: Number(row[4]) }))
    .sort((a, b) => a.date.localeCompare(b.date));
  const latest = rows.at(-1);
  if (!latest) throw new Error(`${symbol.code} 缺少有效最新数据`);
  const cutoff = new Date(`${latest.date}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - 365);
  const windowRows = rows.filter((row) => row.date >= cutoff.toISOString().slice(0, 10));
  const percentileValues = windowRows.map((row) => row.close);
  const previous = rows.at(-2) || null;
  const change = previous ? latest.close - previous.close : null;
  return {
    ...latest,
    previous_date: previous?.date || null,
    previous_close: previous?.close ?? null,
    change,
    change_pct: previous ? change / previous.close * 100 : null,
    percentile: percentile(percentileValues, latest.close),
  };
}

function calcSeries(rows, baseClose, inverse = false) {
  const closes = rows.map((row) => row.close);
  const sim = rows.map((row) => (inverse ? baseClose / row.close : row.close / baseClose) * 100);
  return rows.map((row, index) => ({ ...row, ma20: movingAverage(closes, 20, index), ma60: movingAverage(closes, 60, index), return_20d: index >= 20 ? closes[index] / closes[index - 20] - 1 : null, percentile: percentile(closes, row.close), sim_usd: sim[index] }));
}

function backtest(rows, code, days) {
  const results = [];
  for (let i = 0; i + days < rows.length; i += 1) {
    const start = rows[i].close; const end = rows[i + days].close;
    results.push({ date: rows[i].date, settlement_date: rows[i + days].date, return_pct: code === 'EURUSD' ? (end / start - 1) * 100 : (start / end - 1) * 100 });
  }
  return results;
}

function lossProbability(results) {
  if (!results.length) return null;
  return results.filter((result) => result.return_pct < 0).length / results.length * 100;
}

async function main() {
  const config = JSON.parse(await fs.readFile(argument('--config', defaultConfig), 'utf8'));
  readPayload.retry = config.retry || {};
  const input = argument('--input', ''); const url = argument('--url', config.data_url || defaultUrl);
  const { data, hash } = await readPayload(input, url);
  const selected = config.symbols.map((code) => data.symbols?.find((symbol) => symbol.code === code));
  if (selected.some((symbol) => !symbol)) throw new Error(`缺少目标品种：${config.symbols.filter((code, index) => !selected[index]).join('、')}`);
  const commonEnd = selected.reduce((date, symbol) => { const last = symbol.data.at(-1)?.[0]; return !date || last < date ? last : date; }, '');
  const endDate = new Date(`${commonEnd}T00:00:00`); endDate.setUTCDate(endDate.getUTCDate() - 365); const start = endDate.toISOString().slice(0, 10);
  const normalized = Object.fromEntries(selected.map((symbol) => [symbol.code, normalizeSymbol(symbol, start, commonEnd)]));
  const dates = normalized.DINIW.map((row) => row.date).filter((date) => normalized.USDCNY.some((row) => row.date === date) && normalized.EURUSD.some((row) => row.date === date));
  const rows = Object.fromEntries(config.symbols.map((code) => [code, normalized[code].filter((row) => dates.includes(row.date))]));
  const base = { EURUSD: rows.EURUSD[0].close, USDCNY: rows.USDCNY[0].close };
  const series = { DINIW: calcSeries(rows.DINIW, rows.DINIW[0].close), USDCNY: calcSeries(rows.USDCNY, base.USDCNY, true), EURUSD: calcSeries(rows.EURUSD, base.EURUSD) };
  const relative = series.EURUSD.map((row, index) => ({ date: row.date, rel_yield_EUR: row.sim_usd - 100, rel_yield_CNY: series.USDCNY[index].sim_usd - 100 }));
  const risk = {
    EUR: { volatility_pct: standardDeviation(series.EURUSD.map((row) => row.sim_usd)), max_drawdown_pct: maxDrawdown(series.EURUSD.map((row) => row.sim_usd)), current_relative_yield_pct: relative.at(-1).rel_yield_EUR },
    CNY: { volatility_pct: standardDeviation(series.USDCNY.map((row) => row.sim_usd)), max_drawdown_pct: maxDrawdown(series.USDCNY.map((row) => row.sim_usd)), current_relative_yield_pct: relative.at(-1).rel_yield_CNY },
    USD: { volatility_pct: 0, max_drawdown_pct: 0, current_relative_yield_pct: 0 },
  };
  for (const key of ['EUR', 'CNY']) { risk[key].score_conservative = risk[key].current_relative_yield_pct - 2 * risk[key].volatility_pct; risk[key].score_aggressive = risk[key].current_relative_yield_pct - 0.8 * risk[key].volatility_pct; }
  const backtests = Object.fromEntries([30, 60, 90].map((days) => {
    const EUR = backtest(rows.EURUSD, 'EURUSD', days);
    const CNY = backtest(rows.USDCNY, 'USDCNY', days);
    const USD = rows.USDCNY.slice(0, -days).map((row, index) => ({ date: row.date, settlement_date: rows.USDCNY[index + days].date, return_pct: 0 }));
    return [days, { EUR, CNY, USD, loss_probability_pct: { EUR: lossProbability(EUR), CNY: lossProbability(CNY), USD: lossProbability(USD) } }];
  }));
  const latest_independent = Object.fromEntries(selected.map((symbol) => [symbol.code, latestIndependent(symbol)]));
  const snapshot = { schema_version: '1.1', source: { source_id: config.source_id, name: config.name, dashboard_url: config.dashboard_url, data_url: url, generated_at: data.generatedAt || null, captured_at: new Date().toISOString(), raw_sha256: hash, schedule: config.schedule, window: config.window, coverage_start: dates[0], coverage_end: dates.at(-1), observation_count: dates.length }, latest_independent, symbols: series, relative_yield: relative, risk, backtests, methodology: { base_value: 100, sim_eur: '100 × EURUSD_t / EURUSD_base', sim_cny: '100 × USDCNY_base / USDCNY_t', percentile: '近12个月共同交易日收盘价序列中的经验百分位', moving_average: 'MA20/MA60分别要求至少20/60个共同交易日；不足窗口返回null', volatility: '模拟等价美元序列的总体标准差（百分比）', max_drawdown: '模拟等价美元序列相对历史运行高点的最大跌幅', backtest: '签约日与N个交易日后交割日之间的到手美元相对变化；USD固定为0；亏损概率为return_pct<0的样本占比；历史统计不代表预测' } };
  const output = path.resolve(argument('--output', defaultOutput)); await fs.mkdir(path.dirname(output), { recursive: true }); await writeFileAtomic(output, `${JSON.stringify(snapshot)}\n`);
  console.log(`[forex-dashboard] 已写入 ${output}，${dates.length} 个共同交易日，覆盖 ${dates[0]} 至 ${dates.at(-1)}`);
}
main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
