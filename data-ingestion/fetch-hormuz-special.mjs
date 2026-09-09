#!/usr/bin/env node

/**
 * ShipXY 霍尔木兹专题适配器。
 * 仅保存页面提供的公开文字、图片和链接；不能访问或页面结构变化时退出非零，
 * 由 sync-all 保留最近一次成功快照，避免把空数据当成最新态势。
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithRetry, retrySummary, writeFileAtomic } from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, '..', 'frontend', 'public', 'data', 'external_hormuz.json');
const dashboardUrl = 'https://www.shipxy.com/special/hormuz';
const retry = { attempts: 3, timeoutMs: 45_000, baseDelayMs: 1_000, maxDelayMs: 8_000 };

function strip(value) { return String(value || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/\s+/g, ' ').trim(); }
function absolute(value) { try { return new URL(value, dashboardUrl).toString(); } catch { return null; } }
function firstMatch(html, patterns) { for (const pattern of patterns) { const match = html.match(pattern); if (match?.[1]) return strip(match[1]); } return ''; }
function imageCandidates(html) { return [...html.matchAll(/(?:src|data-src|poster)=["']([^"']+)["']/gi)].map((match) => absolute(match[1])).filter(Boolean).filter((url) => !/(?:logo|cxw|favicon|avatar|icon|_ico|ico\.)/i.test(url)).filter((url) => /\.(?:png|jpe?g|webp|gif|svg)(?:\?|$)/i.test(url) || /\/upload(?:s)?\//i.test(url)).filter((url, index, all) => all.indexOf(url) === index); }
function extractLinks(html) { return [...html.matchAll(/href=["']([^"']+)["']/gi)].map((match) => absolute(match[1])).filter(Boolean).filter((url) => !/\.(?:css|js|woff2?|ttf)(?:\?|$)/i.test(url) && !/\/Content\//i.test(url)).filter((url, index, all) => all.indexOf(url) === index); }
function section(html, keywords) { const text = strip(html); const index = keywords.findIndex((keyword) => text.includes(keyword)); return index < 0 ? '' : text.slice(Math.max(0, text.indexOf(keywords[index]) - 40), text.indexOf(keywords[index]) + 420); }
function mainText(html) {
  const text = strip(html);
  const start = text.indexOf('霍尔木兹态势综合研判');
  const end = text.indexOf('免责声明：');
  return text.slice(start >= 0 ? start : 0, end > start && end >= 0 ? end : undefined).trim();
}

async function main() {
  const response = await fetchWithRetry(dashboardUrl, { headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'trade-analysis-platform/1.0' } }, retry);
  const raw = Buffer.from(await response.arrayBuffer());
  const html = raw.toString('utf8');
  const text = mainText(html);
  if (text.length < 200) throw new Error('专题页面返回内容过少，未生成快照');
  const images = imageCandidates(html);
  const links = extractLinks(html);
  const liveSummary = section(html, ['实时态势', '实时动态', '态势图']);
  const distributionSummary = section(html, ['分布画像', '船舶分布', '船舶态势']);
  const items = links.filter((url) => /hormuz|strait/i.test(url) && /\.html?(?:\?|$)/i.test(url)).slice(0, 8).map((url) => ({ title: url.split('/').filter(Boolean).at(-1)?.split('?')[0] || '专题链接', source_url: url, summary: '来源于 ShipXY 霍尔木兹专题页面的关联入口。', category: '专题入口' }));
  const snapshot = {
    schema_version: '1.0',
    source: { source_id: 'hormuz-special', name: 'ShipXY 霍尔木兹海峡专题', dashboard_url: dashboardUrl, captured_at: new Date().toISOString(), coverage_end: new Date().toISOString().slice(0, 10), fetch_mode: 'html', raw_sha256: crypto.createHash('sha256').update(raw).digest('hex'), retry: retrySummary(retry) },
    situation: { title: '霍尔木兹海峡最新态势', summary: text.slice(0, 900), updated_at: new Date().toISOString() },
    live: { title: '实时态势', summary: liveSummary || '专题页面已采集；实时态势由原页面脚本持续更新。', image_url: images[0] || null, image_alt: '霍尔木兹海峡实时态势' },
    distribution: { title: '分布画像', summary: distributionSummary || '专题页面已采集；船舶分布画像以源页面为准。', image_url: images[1] || images[0] || null, image_alt: '霍尔木兹海峡船舶分布画像' },
    items,
  };
  await fs.mkdir(path.dirname(output), { recursive: true });
  await writeFileAtomic(output, `${JSON.stringify(snapshot, null, 2)}\n`);
  console.log(`[hormuz-special] 已写入 ${output}，图片 ${images.length} 个，专题链接 ${items.length} 个`);
}
main().catch((error) => { console.error(`[hormuz-special] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
