#!/usr/bin/env node

/**
 * 解码海关钢材出口看板的 codebook + 按年 gzip 二进制分片，生成前端图表专用快照。
 * 不把多维海关明细强行塞进 MarketQuote，避免污染原有行情、成本和风险口径。
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { fetchWithRetry, retrySummary, writeFileAtomic } from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultConfig = path.join(here, 'steel-export-dashboard-source.json');
const defaultOutput = path.join(here, '..', 'frontend', 'public', 'data', 'external_steel_export.json');

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function fail(message) {
  console.error(`[steel-export-dashboard] ${message}`);
  process.exitCode = 1;
}

async function fetchBytes(url, retry) {
  const response = await fetchWithRetry(`${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`, { headers: { accept: '*/*' } }, retry);
  return Buffer.from(await response.arrayBuffer());
}

function parseBin(compressed) {
  const buffer = gunzipSync(compressed);
  const count = buffer.readUInt32LE(0);
  let offset = 4;
  const read = (bytes, getter) => {
    const values = new Array(count);
    for (let index = 0; index < count; index += 1) values[index] = getter(buffer, offset + index * bytes);
    offset += bytes * count;
    return values;
  };
  return {
    y: read(2, (b, o) => b.readUInt16LE(o)),
    m: read(1, (b, o) => b.readUInt8(o)),
    hs: read(2, (b, o) => b.readUInt16LE(o)),
    p: read(2, (b, o) => b.readUInt16LE(o)),
    r: read(1, (b, o) => b.readUInt8(o)),
    q: read(4, (b, o) => b.readFloatLE(o)),
    u: read(4, (b, o) => b.readFloatLE(o)),
  };
}

function mapAccumulator(map, key, label) {
  const current = map.get(key) || { key, label, qty_t: 0, amount_usd: 0 };
  return current;
}

function add(map, key, label, quantity, amount) {
  const current = mapAccumulator(map, key, label);
  current.qty_t += quantity;
  current.amount_usd += amount;
  map.set(key, current);
}

function toOutputRows(map) {
  return [...map.values()].map((item) => ({
    ...item,
    avg_price_usd_t: item.qty_t ? item.amount_usd / item.qty_t : 0,
  }));
}

function sortRows(rows) {
  return rows.sort((left, right) => right.qty_t - left.qty_t || left.label.localeCompare(right.label, 'zh-CN'));
}

async function main() {
  const config = JSON.parse(await fs.readFile(argument('--config', defaultConfig), 'utf8'));
  const output = path.resolve(argument('--output', defaultOutput));
  const inputDir = argument('--input-dir', '');
  const retry = config.retry || {};
  const codebookUrl = `${config.assets_base_url}/codebook.json`;
  const codebookRaw = inputDir
    ? await fs.readFile(path.join(path.resolve(inputDir), 'codebook.json'))
    : await fetchBytes(codebookUrl, retry);
  const codebook = JSON.parse(codebookRaw.toString('utf8'));
  const years = (codebook.filters?.year || []).map(Number).sort((a, b) => a - b);
  if (!years.length) throw new Error('codebook 没有可用年份');

  const monthly = new Map();
  const partner = new Map();
  const region = new Map();
  const region6 = new Map();
  const kind = new Map();
  const big = new Map();
  const commodity = new Map();
  const registration = new Map();
  const defaultMonthly = new Map();
  const defaultPartner = new Map();
  const defaultRegion = new Map();
  const defaultRegion6 = new Map();
  const defaultKind = new Map();
  const defaultBig = new Map();
  const defaultCommodity = new Map();
  const defaultRegistration = new Map();
  const partnerMeta = new Map();
  const defaultPartnerMeta = new Map();
  let rawSha256 = crypto.createHash('sha256').update(codebookRaw);
  let totalQty = 0;
  let totalAmount = 0;
  let factRows = 0;
  const defaultYear = Math.max(...years);

  for (const year of years) {
    const binPath = inputDir ? path.join(path.resolve(inputDir), `data_${year}.bin`) : null;
    const compressed = binPath ? await fs.readFile(binPath) : await fetchBytes(`${config.assets_base_url}/data_${year}.bin`, retry);
    rawSha256.update(compressed);
    const fact = parseBin(compressed);
    factRows += fact.y.length;
    for (let index = 0; index < fact.y.length; index += 1) {
      const hs = codebook.codebook.hs[fact.hs[index]];
      const p = codebook.codebook.partner[fact.p[index]];
      const reg = codebook.codebook.reg[fact.r[index]];
      const quantity = Number(fact.q[index]);
      const amount = Number(fact.u[index]);
      if (!hs || !p || !reg || !Number.isFinite(quantity) || !Number.isFinite(amount)) continue;
      totalQty += quantity;
      totalAmount += amount;
      const month = `${fact.y[index]}-${String(fact.m[index]).padStart(2, '0')}`;
      add(monthly, month, month, quantity, amount);
      add(partner, p.name, p.name, quantity, amount);
      add(region, p.region, p.region, quantity, amount);
      add(region6, p.region6, p.region6, quantity, amount);
      add(kind, hs.kind, hs.kind, quantity, amount);
      add(big, hs.big, hs.big, quantity, amount);
      add(commodity, hs.commodity, hs.commodity, quantity, amount);
      add(registration, reg.name, reg.name, quantity, amount);
      partnerMeta.set(p.name, { name: p.name, world: p.world || null, region: p.region, region6: p.region6, special: p.special || null });
      if (fact.y[index] === defaultYear && hs.kind === '板材') {
        add(defaultMonthly, month, month, quantity, amount);
        add(defaultPartner, p.name, p.name, quantity, amount);
        add(defaultRegion, p.region, p.region, quantity, amount);
        add(defaultRegion6, p.region6, p.region6, quantity, amount);
        add(defaultKind, hs.kind, hs.kind, quantity, amount);
        add(defaultBig, hs.big, hs.big, quantity, amount);
        add(defaultCommodity, hs.commodity, hs.commodity, quantity, amount);
        add(defaultRegistration, reg.name, reg.name, quantity, amount);
        defaultPartnerMeta.set(p.name, { name: p.name, world: p.world || null, region: p.region, region6: p.region6, special: p.special || null });
      }
    }
  }

  const partnerRows = sortRows(toOutputRows(partner)).map((row) => ({ ...row, ...(partnerMeta.get(row.label) || {}) }));
  const allPartnerQty = partnerRows.reduce((sum, row) => sum + row.qty_t, 0);
  const concentration = partnerRows.reduce((sum, row) => sum + (allPartnerQty ? (row.qty_t / allPartnerQty) ** 2 : 0), 0);
  const cr5 = partnerRows.slice(0, 5).reduce((sum, row) => sum + row.qty_t, 0);
  const monthlyRows = [...monthly.values()].sort((left, right) => left.key.localeCompare(right.key));
  const defaultPartnerRows = sortRows(toOutputRows(defaultPartner)).map((row) => ({ ...row, ...(defaultPartnerMeta.get(row.label) || {}) }));
  const defaultPartnerQty = defaultPartnerRows.reduce((sum, row) => sum + row.qty_t, 0);
  const defaultCr5 = defaultPartnerRows.slice(0, 5).reduce((sum, row) => sum + row.qty_t, 0);
  const defaultHhi = defaultPartnerRows.reduce((sum, row) => sum + (defaultPartnerQty ? (row.qty_t / defaultPartnerQty) ** 2 : 0), 0) * 10000;
  const defaultMonthlyRows = [...defaultMonthly.values()].sort((left, right) => left.key.localeCompare(right.key));
  const defaultTotalQty = defaultMonthlyRows.reduce((sum, row) => sum + row.qty_t, 0);
  const defaultTotalAmount = defaultMonthlyRows.reduce((sum, row) => sum + row.amount_usd, 0);
  const dates = monthlyRows.map((row) => row.key);
  const snapshot = {
    schema_version: '1.0',
    source: {
      source_id: config.source_id,
      name: config.name,
      dashboard_url: config.dashboard_url,
      assets_base_url: config.assets_base_url,
      generated_at: codebook.meta?.generated || null,
      captured_at: new Date().toISOString(),
      raw_sha256: rawSha256.digest('hex'),
      years,
      coverage_start: dates[0],
      coverage_end: dates.at(-1),
      schedule: config.schedule,
      excel_role: config.excel_role,
      source_note: codebook.meta?.source || '海关出口明细数据',
      retry: retrySummary(retry),
    },
    summary: {
      total_qty_t: totalQty,
      total_amount_usd: totalAmount,
      average_price_usd_t: totalQty ? totalAmount / totalQty : 0,
      partner_count: partnerRows.length,
      fact_rows: factRows,
    },
    concentration: { cr5_pct: allPartnerQty ? cr5 / allPartnerQty * 100 : 0, hhi: concentration * 10000, partner_count: partnerRows.length },
    monthly: monthlyRows,
    partner: partnerRows,
    region: sortRows(toOutputRows(region)),
    region6: sortRows(toOutputRows(region6)),
    kind: sortRows(toOutputRows(kind)),
    big: sortRows(toOutputRows(big)),
    commodity: sortRows(toOutputRows(commodity)),
    registration: sortRows(toOutputRows(registration)),
    default_view: {
      filter: { year: defaultYear, kind: '板材', months: defaultMonthlyRows.map((row) => Number(row.key.slice(5))) },
      summary: {
        total_qty_t: defaultTotalQty,
        total_amount_usd: defaultTotalAmount,
        average_price_usd_t: defaultTotalQty ? defaultTotalAmount / defaultTotalQty : 0,
        partner_count: defaultPartnerRows.length,
        fact_rows: defaultMonthlyRows.length,
      },
      concentration: { cr5_pct: defaultPartnerQty ? defaultCr5 / defaultPartnerQty * 100 : 0, hhi: defaultHhi, partner_count: defaultPartnerRows.length },
      monthly: defaultMonthlyRows,
      partner: defaultPartnerRows,
      region: sortRows(toOutputRows(defaultRegion)),
      region6: sortRows(toOutputRows(defaultRegion6)),
      kind: sortRows(toOutputRows(defaultKind)),
      big: sortRows(toOutputRows(defaultBig)),
      commodity: sortRows(toOutputRows(defaultCommodity)),
      registration: sortRows(toOutputRows(defaultRegistration)),
    },
  };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await writeFileAtomic(output, `${JSON.stringify(snapshot)}\n`);
  console.log(`[steel-export-dashboard] 已写入 ${output}`);
  console.log(`[steel-export-dashboard] ${factRows} 条明细聚合为 ${monthlyRows.length} 个月、${partnerRows.length} 个伙伴，覆盖 ${dates[0]} 至 ${dates.at(-1)}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
