#!/usr/bin/env node

/**
 * 潮汐早报：Kagi News 五板块抓取器。
 *
 * HTML 是主路径（Kagi 的 SSR 页面包含展开故事所需的正文、图片和来源），
 * RSS 只作为结构变化或 HTML 请求失败时的降级路径。每个板块独立兜底，
 * 五个板块都失败时不覆盖已有文件。
 */
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchWithRetry, retrySummary, writeFileAtomic } from './retry.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(await fs.readFile(path.join(here, 'tide-news-source.json'), 'utf8'));
const defaultOutput = path.join(here, '..', 'frontend', 'public', 'data', 'external_tide_news.json');
const outputIndex = process.argv.indexOf('--output');
const output = path.resolve(outputIndex >= 0 && process.argv[outputIndex + 1] ? process.argv[outputIndex + 1] : defaultOutput);
const capturedAt = new Date().toISOString();
const retry = config.retry || {};
const userAgent = 'trade-analysis-platform-tide-brief/3.1 (+Kagi News RSS/HTML adapter)';

function text(value = '') {
  return String(value)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\\u([\da-f]{4})/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/\\n/g, ' ').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
    .replace(/\s+/g, ' ').trim();
}

function absolute(value, base) {
  if (!value) return null;
  try { return new URL(text(value), base).toString(); } catch { return null; }
}

function dateMs(value) {
  if (!value) return null;
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function first(html, patterns) {
  for (const pattern of patterns) {
    const match = String(html).match(pattern);
    if (match?.[1]) return text(match[1]);
  }
  return '';
}

function balanced(raw, start) {
  const opening = raw[start];
  const closing = opening === '{' ? '}' : opening === '[' ? ']' : null;
  if (!closing) return '';
  let depth = 0; let quote = null; let escaped = false;
  for (let index = start; index < raw.length; index += 1) {
    const character = raw[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'") { quote = character; continue; }
    if (character === opening) depth += 1;
    if (character === closing && --depth === 0) return raw.slice(start, index + 1);
  }
  return '';
}

/** Read a JSON-like key from Kagi's SSR payload without depending on a private bundle. */
function structuredValue(raw, key, from = 0) {
  const match = String(raw).slice(from).match(new RegExp(`(?:["']?${key}["']?)\\s*:`));
  if (!match) return null;
  let cursor = from + match.index + match[0].length;
  while (/\s/.test(raw[cursor] || '')) cursor += 1;
  if (raw[cursor] === '{' || raw[cursor] === '[') return balanced(raw, cursor);
  if (raw[cursor] === '"' || raw[cursor] === "'") {
    const quote = raw[cursor]; let end = cursor + 1; let escaped = false;
    for (; end < raw.length; end += 1) {
      if (escaped) escaped = false;
      else if (raw[end] === '\\') escaped = true;
      else if (raw[end] === quote) break;
    }
    return raw.slice(cursor + 1, end);
  }
  return raw.slice(cursor).match(/^[^,}\]]+/)?.[0]?.trim() || null;
}

function objectField(raw, key) {
  const value = structuredValue(raw, key);
  if (!value || !value.startsWith('{')) return '';
  return first(value, [/(?:["']?url["']?)\s*:\s*["']([^"']+)/i, /(?:["']?src["']?)\s*:\s*["']([^"']+)/i]);
}

function extractImage(raw, base) {
  const primary = structuredValue(raw, 'primary_image') || structuredValue(raw, 'primaryImage');
  const secondary = structuredValue(raw, 'secondary_image') || structuredValue(raw, 'secondaryImage');
  const image = primary?.startsWith('{') ? primary : secondary?.startsWith('{') ? secondary : '';
  const imageValue = image ? objectField(image, 'url') : first(raw, [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i,
    /<img[^>]+src=["']([^"']+)/i,
  ]);
  return {
    url: absolute(imageValue, base),
    alt: image ? first(image, [/(?:["']?caption["']?)\s*:\s*["']([^"']+)/i, /(?:["']?alt["']?)\s*:\s*["']([^"']+)/i]) : '',
  };
}

function sourceLink(raw, base) {
  const articles = structuredValue(raw, 'articles');
  const articleLink = articles ? first(articles, [/(?:["']?link["']?)\s*:\s*["']([^"']+)/i]) : '';
  return absolute(articleLink || first(raw, [
    /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)/i,
    /<a[^>]+href=["'](https?:\/\/[^"']+)["']/i,
  ]), base);
}

function parseHtml(raw, category) {
  const blocks = [...raw.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/gi)].map((match) => match[0]);
  const candidates = blocks.length ? blocks : [raw];
  const items = []; const seen = new Set();
  for (const block of candidates) {
    const title = first(block, [
      /<h[1-4]\b[^>]*>([\s\S]*?)<\/h[1-4]>/i,
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
      /(?:["']?title["']?)\s*:\s*["']([^"']+)/i,
    ]);
    if (!title || title.length < 5) continue;
    const url = sourceLink(block, category.url);
    const image = extractImage(block, category.url);
    const published = first(block, [
      /<time\b[^>]+datetime=["']([^"']+)/i,
      /<time\b[^>]*>([\s\S]*?)<\/time>/i,
      /(?:["']?date["']?)\s*:\s*["']([^"']+)/i,
      /(?:["']?published_at["']?)\s*:\s*["']([^"']+)/i,
    ]);
    const publishedMs = dateMs(published) || Date.now();
    const location = first(block, [
      /<[^>]+class=["'][^"']*location[^"']*["'][^>]*>([\s\S]*?)<\//i,
      /(?:["']?location["']?)\s*:\s*["']([^"']+)/i,
    ]);
    const author = first(block, [
      /<[^>]+class=["'][^"']*author[^"']*["'][^>]*>([\s\S]*?)<\//i,
      /(?:["']?author["']?)\s*:\s*["']([^"']+)/i,
    ]);
    const content = first(block, [
      /<[^>]+class=["'][^"']*(?:story-content|expanded-content|summary|description)[^"']*["'][^>]*>([\s\S]*?)<\//i,
      /<p\b[^>]*>([\s\S]*?)<\/p>/i,
      /(?:["']?summary["']?)\s*:\s*["']([^"']+)/i,
      /(?:["']?content["']?)\s*:\s*["']([^"']+)/i,
    ]);
    const fullContent = text(content || block).replace(title, '').trim();
    const key = url || title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({ title, summary: fullContent.slice(0, 320), content: fullContent, image_url: image.url, image_alt: image.alt || title, location: location || null, category: category.id, source: category.label, source_id: config.source_id, url, published_at_ms: publishedMs, author: author || null });
    if (items.length >= Number(config.per_category_limit || 8)) break;
  }
  return items;
}

function parseRss(raw, category) {
  const blocks = raw.match(/<item\b[\s\S]*?<\/item>/gi) || raw.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.slice(0, Number(config.per_category_limit || 8)).flatMap((block, index) => {
    const title = first(block, [/<title[^>]*>([\s\S]*?)<\/title>/i]);
    const linkValue = first(block, [/<link[^>]+href=["']([^"']+)/i, /<link[^>]*>([\s\S]*?)<\/link>/i]);
    const url = absolute(linkValue, category.rss);
    const published = first(block, [/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i, /<published[^>]*>([\s\S]*?)<\/published>/i, /<updated[^>]*>([\s\S]*?)<\/updated>/i, /<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i]);
    const publishedMs = dateMs(published) || Date.now();
    const content = first(block, [/<content[^>]*>([\s\S]*?)<\/content>/i, /<description[^>]*>([\s\S]*?)<\/description>/i, /<summary[^>]*>([\s\S]*?)<\/summary>/i]);
    if (!title || !url) return [];
    return [{ title, summary: text(content), content: text(content), image_url: absolute(first(block, [/<media:(?:content|thumbnail)[^>]+url=["']([^"']+)/i, /<enclosure[^>]+url=["']([^"']+)/i, /<img[^>]+src=["']([^"']+)/i]), category.rss), image_alt: title, location: null, category: category.id, source: category.label, source_id: config.source_id, url, published_at_ms: publishedMs, author: first(block, [/<author[^>]*>([\s\S]*?)<\/author>/i, /<dc:creator[^>]*>([\s\S]*?)<\/dc:creator>/i]) || null, _index: index }];
  });
}

function collectImages(raw, base) {
  const values = [
    ...[...String(raw).matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/gi)].map((match) => match[1]),
    ...[...String(raw).matchAll(/<(?:img|source)[^>]+(?:src|srcset)=["']([^"']+)/gi)].map((match) => match[1].split(',')[0].trim().split(/\s+/)[0]),
    ...[...String(raw).matchAll(/(?:primary_image|secondary_image|image_url|imageUrl)\s*[:=]\s*["']([^"']+)/gi)].map((match) => match[1]),
  ];
  return values.map((value) => absolute(value, base)).filter((value, index, all) => value && all.indexOf(value) === index).slice(0, 4);
}

function parseDetail(raw, item, category) {
  const title = first(raw, [
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
    /<title\b[^>]*>([\s\S]*?)<\/title>/i,
  ]) || item.title;
  const paragraphs = [...String(raw).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => text(match[1]))
    .filter((value) => value.length > 30 && !/^(sources?|highlights?|perspectives?|timeline|historical background)$/i.test(value));
  const content = paragraphs.slice(0, 40).join('\n\n').trim();
  const published = first(raw, [
    /<time\b[^>]+datetime=["']([^"']+)/i,
    /(?:published_at|publishedAt|datePublished)\s*[:=]\s*["']([^"']+)/i,
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i,
  ]);
  const images = collectImages(raw, category.url);
  const sourceLinks = [...String(raw).matchAll(/<a\b[^>]+href=["'](https?:\/\/[^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((url) => !/news\.kagi\.com/i.test(url))
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, 20);
  return {
    ...item,
    title: title || item.title,
    summary: content ? content.slice(0, 320) : item.summary,
    content: content || item.content,
    published_at_ms: dateMs(published) || item.published_at_ms,
    image_url: images[0] || item.image_url,
    image_alt: title || item.image_alt,
    source_links: sourceLinks,
  };
}

async function enrichDetail(item, category) {
  if (!item.url || !/^https:\/\/news\.kagi\.com\//i.test(item.url)) return item;
  try {
    const response = await fetchWithRetry(item.url, { headers: { accept: 'text/html,application/xhtml+xml;q=0.9', 'user-agent': userAgent } }, retry);
    const raw = Buffer.from(await response.arrayBuffer()).toString('utf8');
    return parseDetail(raw, item, category);
  } catch {
    return item;
  }
}

function normalize(items, category) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url || item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map((item, index) => ({
    id: `${category.id}-${item.published_at_ms}-${index}`,
    title: item.title, summary: item.summary || item.content.slice(0, 320), content: item.content || item.summary,
    image_url: item.image_url || null, image_alt: item.image_alt || null, location: item.location || null,
    source_links: Array.isArray(item.source_links) ? item.source_links : [],
    category: category.id, source: item.source || category.label, source_id: config.source_id,
    url: item.url || null, published_at: new Date(item.published_at_ms).toISOString(), published_at_ms: item.published_at_ms,
    author: item.author || null,
  }));
}

async function fetchCategory(category) {
  const errors = [];
  try {
    const response = await fetchWithRetry(category.rss, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9', 'user-agent': userAgent } }, retry);
    const raw = Buffer.from(await response.arrayBuffer()).toString('utf8');
    const items = normalize(parseRss(raw, category), category);
    if (items.length) return { category, items, errors, mode: 'rss' };
    errors.push('RSS 未解析出有效新闻');
  } catch (error) { errors.push(`RSS：${error instanceof Error ? error.message : String(error)}`); }
  try {
    const response = await fetchWithRetry(category.url, { headers: { accept: 'text/html,application/xhtml+xml;q=0.9', 'user-agent': userAgent } }, retry);
    const raw = Buffer.from(await response.arrayBuffer()).toString('utf8');
    const items = normalize(parseHtml(raw, category), category);
    if (items.length) {
      const enriched = await Promise.all(items.map((item) => enrichDetail(item, category)));
      return { category, items: normalize(enriched, category), errors, mode: 'rss+detail' };
    }
    errors.push('HTML 未解析出有效新闻');
  } catch (error) { errors.push(`HTML：${error instanceof Error ? error.message : String(error)}`); }
  return { category, items: [], errors, mode: null };
}

async function readPrevious() {
  try { return JSON.parse(await fs.readFile(output, 'utf8')); } catch { return null; }
}

const previous = await readPrevious();
const results = await Promise.all(config.categories.map(fetchCategory));
const sections = {}; const sourceRecords = [];
for (const result of results) {
  const previousItems = previous?.sections?.[result.category.id] || [];
  const usedFallback = !result.items.length && previousItems.length > 0;
  sections[result.category.id] = result.items.length ? result.items : previousItems;
  sourceRecords.push({ id: result.category.id, name: result.category.label, url: result.category.url, item_count: sections[result.category.id].length, errors: result.errors, captured_at: result.items.length ? capturedAt : null, fetch_mode: result.mode || 'fallback', used_fallback: usedFallback });
}

const successful = results.filter((result) => result.items.length > 0);
if (!successful.length) {
  const detail = sourceRecords.map((record) => `${record.name}：${record.errors.join('；') || '无新数据'}`).join(' | ');
  throw new Error(`Kagi 五个板块均未抓取成功，未覆盖已有快照。${detail}`);
}

const all = Object.values(sections).flat();
const rawHash = crypto.createHash('sha256').update(JSON.stringify(results)).digest('hex');
const snapshot = {
  schema_version: '2.0',
  source: { source_id: config.source_id, name: config.name, captured_at: capturedAt, coverage_start: all.length ? new Date(Math.min(...all.map((item) => item.published_at_ms))).toISOString() : capturedAt, coverage_end: all.length ? new Date(Math.max(...all.map((item) => item.published_at_ms))).toISOString() : capturedAt, timezone: config.timezone, window_hours: 0, schedule: config.schedule, fetch_mode: 'kagi-rss-with-html-fallback', raw_sha256: rawHash, source_count: config.categories.length, categories: config.categories.map((category) => category.id) },
  sources: sourceRecords,
  sections,
  quality: { source_count: config.categories.length, successful_source_count: successful.length, item_count: all.length, image_count: all.filter((item) => item.image_url).length, full_content_count: all.filter((item) => item.content && item.content.length > 80).length, warnings: sourceRecords.filter((record) => record.errors.length || record.used_fallback).map((record) => `${record.name}：${record.used_fallback ? '沿用上一份成功快照；' : ''}${record.errors.join('；')}`) },
  fetch_diagnostics: { retry: retrySummary(retry), fallback_policy: '分类级保留上一次成功数据；五类全失败时不写入文件', generated_by: userAgent },
};
await fs.mkdir(path.dirname(output), { recursive: true });
await writeFileAtomic(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`[tide-global-news] 已写入 ${output}；成功板块 ${successful.length}/${config.categories.length}；新闻 ${all.length} 条；图片 ${snapshot.quality.image_count} 张`);
