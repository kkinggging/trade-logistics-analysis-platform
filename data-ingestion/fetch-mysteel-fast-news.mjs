#!/usr/bin/env node

/**
 * 我的钢铁网快讯适配器：读取公开 JSON API，规范化为前端离线快照。
 * 失败时退出非零；sync-all 负责保留最近成功快照，避免半成品覆盖。
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithRetry, retrySummary, writeFileAtomic } from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const configFile = path.join(here, 'mysteel-fast-news-source.json');
const defaultOutput = path.join(here, '..', 'frontend', 'public', 'data', 'external_fast_news.json');
const sourcePage = 'https://www.mysteel.com/fastcomment/#/';

function argument(name, fallback) { const index = process.argv.indexOf(name); return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback; }
function todayShanghai() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function textFromHtml(value) { return String(value || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/\s+/g, ' ').trim(); }
function asList(value) { if (Array.isArray(value)) return value; if (typeof value === 'string') return value.split(/[|,、]/).map((item) => item.trim()).filter(Boolean); return value == null ? [] : [value]; }
function idName(value, fallback = '') { if (value && typeof value === 'object') return { id: value.id ?? value.value ?? fallback, name: String(value.name ?? value.label ?? value.text ?? fallback) }; return { id: value ?? fallback, name: String(value || fallback) }; }
function categoryName(row) { return String(row.categoryName ?? row.category_name ?? row.category ?? row.columnName ?? ''); }
function sectionName(row) { return String(row.sectionName ?? row.section_name ?? row.section ?? row.column ?? ''); }
function mapProductLine(products) { const joined = products.map((item) => item.name).join(''); if (/热轧/.test(joined)) return 'hot-rolled'; if (/冷轧/.test(joined)) return 'cold-rolled'; if (/硅钢/.test(joined)) return 'silicon-steel'; return null; }
function sourceUrl(row) { const valid = (value) => typeof value === 'string' && /^https?:\/\//i.test(value) ? value : null; return valid(row.inArticleUrl) || valid(row.outArticleUrl) || null; }
function extractPayload(json) { return json?.data?.list || json?.data?.rows || json?.result?.data?.list || json?.result?.list || json?.list || json?.rows || []; }
function reportedTotal(json) { const value = json?.data?.total ?? json?.result?.data?.total ?? json?.total; return Number.isFinite(Number(value)) ? Number(value) : null; }
function normalize(row, index) {
  const raw = String(row.content ?? row.newsContent ?? row.text ?? '').trim(); const content = textFromHtml(raw); if (!content) return null;
  const publishedMs = Number(row.publisherTime ?? row.publisher_time ?? row.publishTime ?? row.publish_time); if (!Number.isFinite(publishedMs)) return null;
  const products = [...asList(row.relationBreed ?? row.relation_breed).map((item) => ({ ...idName(item), source: 'relationBreed' })), ...asList(row.breedTags ?? row.breedTagIdNames ?? row.breed_tags).map((item) => ({ ...idName(item), source: 'breedTag' }))].filter((item, itemIndex, list) => item.name && list.findIndex((other) => other.name === item.name) === itemIndex);
  const url = sourceUrl(row); const productLine = mapProductLine(products); const category = idName(row.categoryId ?? row.category_id, categoryName(row)); const section = idName(row.sectionId ?? row.section_id, sectionName(row));
  return { news_id: String(row.id ?? row.newsId ?? row.news_id ?? `mysteel-${publishedMs}-${index}`), published_at: new Date(publishedMs).toISOString(), published_at_ms: publishedMs, timezone: 'Asia/Shanghai', content_text: content, content_html: raw, raw_content: raw, category: { id: Number.isFinite(Number(category.id)) ? Number(category.id) : null, name: category.name }, section: { id: Number.isFinite(Number(section.id)) ? Number(section.id) : null, name: section.name }, products, regions: asList(row.relationCity ?? row.relation_city).map((item) => idName(item)), source_name: row.source ? String(row.source) : null, source_url: url, in_article_url: row.inArticleUrl || null, out_article_url: row.outArticleUrl || null, in_article_title: row.inArticleTitle || null, out_article_title: row.outArticleTitle || null, source_link_status: url ? 'article_link' : 'no_link', data_source: Number.isFinite(Number(row.dataSource)) ? Number(row.dataSource) : null, publisher_id: Number.isFinite(Number(row.publisherId)) ? Number(row.publisherId) : null, relation_id: Number.isFinite(Number(row.relationId)) ? Number(row.relationId) : null, ai_flag: Number.isFinite(Number(row.aiFlag)) ? Number(row.aiFlag) : null, platform_product_line: productLine, mapping_status: productLine ? 'mapped' : products.length ? 'ambiguous' : 'unmapped', quality_flags: url ? [] : ['source_link_missing'] };
}

async function main() {
  const config = JSON.parse(await fs.readFile(argument('--config', configFile), 'utf8')); const output = path.resolve(argument('--output', defaultOutput)); const targetDate = argument('--date', todayShanghai()); const apiUrl = argument('--url', config.api_url); const retry = config.retry || {}; const rows = []; const responseHashes = []; let total = null; let pageCount = 0; let truncated = false;
  const taxonomyResponse = await fetchWithRetry(config.taxonomy_url, { headers: { accept: 'application/json', 'user-agent': 'trade-analysis-platform/1.0' } }, retry); const taxonomyRaw = Buffer.from(await taxonomyResponse.arrayBuffer()); const taxonomy = JSON.parse(taxonomyRaw.toString('utf8')); const taxonomySha256 = crypto.createHash('sha256').update(taxonomyRaw).digest('hex');
  for (let pageNo = 1; pageNo <= Number(config.max_pages || 100); pageNo += 1) {
    const params = new URLSearchParams({ advertisementFlag: '0', keyword: '', pageNo: String(pageNo), pageSize: String(config.page_size || 100), sortByScore: 'false', columnIds: encodeURIComponent(JSON.stringify(config.target_categories || [[2, 84, 584]])) });
    const response = await fetchWithRetry(`${apiUrl}?${params.toString()}`, { headers: { accept: 'application/json', 'user-agent': 'trade-analysis-platform/1.0' } }, retry); const raw = Buffer.from(await response.arrayBuffer()); const hash = crypto.createHash('sha256').update(raw).digest('hex'); responseHashes.push(hash); const json = JSON.parse(raw.toString('utf8')); const pageRows = extractPayload(json); total ??= reportedTotal(json); pageCount = pageNo; if (!Array.isArray(pageRows) || pageRows.length === 0) break;
    rows.push(...pageRows); const normalizedDates = pageRows.map((row) => Number(row.publisherTime ?? row.publisher_time ?? row.publishTime ?? 0)).filter(Number.isFinite).map((time) => new Date(time).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })); if (normalizedDates.some((date) => date < targetDate)) break;
  }
  const items = rows.map(normalize).filter(Boolean).filter((item) => item.published_at.slice(0, 10) >= targetDate).sort((a, b) => b.published_at_ms - a.published_at_ms || b.news_id.localeCompare(a.news_id)); const byId = new Map(items.map((item) => [item.news_id, item])); const accepted = [...byId.values()]; if (!accepted.length) throw new Error(`目标日期 ${targetDate} 没有有效快讯，未生成输出`); if (total != null && total > rows.length) truncated = true;
  const coverageStart = accepted[accepted.length - 1].published_at.slice(0, 10); const latest = accepted[0]; const rawSha = crypto.createHash('sha256').update(responseHashes.join('')).digest('hex'); const snapshot = { schema_version: '1.0', source: { source_id: config.source_id, name: config.name, dashboard_url: sourcePage, api_url: config.api_url, taxonomy_url: config.taxonomy_url, captured_at: new Date().toISOString(), coverage_start: coverageStart, coverage_end: latest.published_at.slice(0, 10), latest_published_at: latest.published_at, timezone: 'Asia/Shanghai', fetch_mode: 'api', request_params: { pageSize: config.page_size, target_date: targetDate, columnIds: config.target_categories }, raw_sha256: rawSha, taxonomy_sha256: taxonomySha256, response_sha256: responseHashes, page_count: pageCount, reported_total: total, truncation_detected: truncated, watermark: { publisher_time_ms: latest.published_at_ms, id: latest.news_id }, retry: retrySummary(retry) }, items: accepted, quality: { raw_count: rows.length, accepted_count: accepted.length, rejected_count: rows.length - items.length, deduped_count: items.length - accepted.length, missing_source_link_count: accepted.filter((item) => !item.source_url).length, missing_product_count: accepted.filter((item) => !item.products.length).length, malformed_content_count: rows.length - items.length, duplicate_group_count: 0, warnings: truncated ? ['API 报告总量超过本次分页采集量；快照仅覆盖目标日期窗口，需按分类/地区拆分请求补全。'] : [] } , taxonomy };
  await fs.mkdir(path.dirname(output), { recursive: true }); await writeFileAtomic(output, `${JSON.stringify(snapshot, null, 2)}\n`); console.log(`[mysteel-fast-news] 已写入 ${output}，${accepted.length} 条，覆盖 ${coverageStart} 至 ${latest.published_at.slice(0, 10)}`);
}
main().catch((error) => { console.error(`[mysteel-fast-news] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });
