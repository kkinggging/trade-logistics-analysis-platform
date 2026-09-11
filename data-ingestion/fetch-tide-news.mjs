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
const publicDataDir = path.join(here, '..', 'frontend', 'public', 'data');
const imageDir = path.join(publicDataDir, 'tide-news-images');
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

function isPlaceholderImage(value) {
  return /(?:kite-banner|kagi(?:-news)?[-_]?logo|favicon|placeholder|default[-_]?image)/i.test(value || '');
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

function metaContent(raw, key) {
  const patterns = [
    new RegExp(`<meta\\b[^>]*(?:name|property)=["']${key}["'][^>]*content="([^"]*)"`, 'i'),
    new RegExp(`<meta\\b[^>]*(?:name|property)=["']${key}["'][^>]*content='([^']*)'`, 'i'),
    new RegExp(`<meta\\b[^>]*content="([^"]*)"[^>]*(?:name|property)=["']${key}["']`, 'i'),
    new RegExp(`<meta\\b[^>]*content='([^']*)'[^>]*(?:name|property)=["']${key}["']`, 'i'),
  ];
  return first(raw, patterns);
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

function isKagiStoryUrl(value) {
  return /^https:\/\/(?:news|kite)\.kagi\.com\//i.test(value || '');
}
function isKagiNavigationUrl(value) {
  return /(?:^https?:\/\/)?(?:www\.)?(?:kagi\.com|kite\.kagi\.com|news\.kagi\.com|kagiproxy\.com|translate\.kagi\.com)(?:\/|$)/i.test(value || '') || /github\.com\/kagisearch\/kite-public/i.test(value || '');
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
    if (category.id === 'onthisday' && isPlaceholderImage(image.url)) image.url = null;
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

/** 历史页有时把多个年份/人物作为时间线节点输出，而不是 RSS item。只从源站已有语义节点取值。 */
function parseHistoryTimeline(raw, category) {
  if (category.id !== 'onthisday') return [];
  const blocks = [
    ...String(raw).matchAll(/<(?:article|li|section|div)\b[^>]*(?:history|timeline|event|onthisday)[^>]*>[\s\S]*?<\/(?:article|li|section|div)>/gi),
  ].map((match) => match[0]);
  const items = [];
  const seen = new Set();
  for (const block of blocks) {
    const title = first(block, [/<h[1-5]\b[^>]*>([\s\S]*?)<\/h[1-5]>/i, /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/i]);
    const detail = first(block, [/<p\b[^>]*>([\s\S]*?)<\/p>/i, /<span\b[^>]*>([\s\S]*?)<\/span>/i]);
    const year = first(block, [/(?<!\d)(\d{3,4})\s*(?:年|\/)/i]);
    const image = extractImage(block, category.url);
    if (isPlaceholderImage(image.url)) image.url = null;
    const key = (title || detail || year).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (!key || seen.has(key) || (!title && !detail)) continue;
    seen.add(key);
    const content = text(detail || title);
    items.push({ title: year ? `${year} · ${title || '历史事件'}` : title || content, summary: content, content, image_url: image.url, image_alt: image.alt || title || content, location: null, category: category.id, source: category.label, source_id: config.source_id, url: sourceLink(block, category.url), published_at_ms: Date.now(), author: null });
    if (items.length >= Number(config.per_category_limit || 8)) break;
  }
  return items;
}

function asObject(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
function pickValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === 'string' && value.trim()) return text(value);
    if (typeof value === 'number') return String(value);
  }
  return '';
}
function pickImage(record, base) {
  const candidates = [record?.image_url, record?.imageUrl, record?.image, record?.photo, record?.portrait, record?.primary_image, record?.primaryImage];
  for (const candidate of candidates) {
    const value = typeof candidate === 'string' ? candidate : candidate?.url || candidate?.src;
    const url = absolute(value, base);
    if (url && !isPlaceholderImage(url)) return { url, alt: typeof candidate === 'object' ? pickValue(candidate, ['alt', 'caption', 'title']) : '' };
  }
  return { url: null, alt: '' };
}
function jsonScriptValues(raw) {
  const values = [];
  for (const match of String(raw).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = match[1].trim();
    if (!body || (!body.startsWith('{') && !body.startsWith('['))) continue;
    try { values.push(JSON.parse(body)); } catch { /* 页面脚本不一定是 JSON，继续检查其他脚本 */ }
  }
  return values;
}
function structuredArrayValues(raw, keys) {
  const values = [];
  for (const key of keys) {
    const value = structuredValue(raw, key);
    if (!value?.startsWith('[')) continue;
    try { values.push({ key, value: JSON.parse(value) }); } catch {
      const loose = parseLooseValue(value);
      if (Array.isArray(loose)) values.push({ key, value: loose });
    }
  }
  return values;
}

/**
 * Kagi 的 SvelteKit SSR payload 是 JavaScript 对象字面量，不是 JSON：
 * 键未必有引号，字符串可能使用单引号，数组里还可能引用页面内变量。
 * 这里只实现数据字面量子集，不执行远程脚本，避免为了解析新闻而 eval 不可信页面。
 */
function parseLooseValue(raw) {
  const source = String(raw);
  let cursor = 0;
  const skip = () => {
    while (cursor < source.length) {
      if (/\s/.test(source[cursor])) { cursor += 1; continue; }
      if (source.startsWith('//', cursor)) { cursor = source.indexOf('\n', cursor + 2); if (cursor < 0) cursor = source.length; continue; }
      if (source.startsWith('/*', cursor)) { const end = source.indexOf('*/', cursor + 2); cursor = end < 0 ? source.length : end + 2; continue; }
      break;
    }
  };
  const readString = () => {
    const quote = source[cursor++]; let value = '';
    while (cursor < source.length) {
      const character = source[cursor++];
      if (character === quote) return value;
      if (character !== '\\') { value += character; continue; }
      const escaped = source[cursor++];
      const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };
      if (escapes[escaped]) { value += escapes[escaped]; continue; }
      if (escaped === 'u') { const hex = source.slice(cursor, cursor + 4); if (/^[\da-f]{4}$/i.test(hex)) { value += String.fromCharCode(parseInt(hex, 16)); cursor += 4; } else value += escaped; continue; }
      value += escaped || '';
    }
    return value;
  };
  const readIdentifier = () => { const start = cursor; while (/[\w$-]/.test(source[cursor] || '')) cursor += 1; return source.slice(start, cursor); };
  const skipUnknownExpression = () => {
    let square = 0; let curly = 0; let paren = 0; let quote = null; let escaped = false;
    while (cursor < source.length) {
      const character = source[cursor];
      if (quote) {
        cursor += 1;
        if (escaped) escaped = false;
        else if (character === '\\') escaped = true;
        else if (character === quote) quote = null;
        continue;
      }
      if (character === '"' || character === "'") { quote = character; cursor += 1; continue; }
      if (character === '[') square += 1;
      else if (character === ']') { if (!square && !curly && !paren) break; square -= 1; }
      else if (character === '{') curly += 1;
      else if (character === '}') { if (!square && !curly && !paren) break; curly -= 1; }
      else if (character === '(') paren += 1;
      else if (character === ')') { if (!square && !curly && !paren) break; paren -= 1; }
      else if (character === ',' && !square && !curly && !paren) break;
      cursor += 1;
    }
  };
  const readValue = () => {
    skip();
    const character = source[cursor];
    if (character === '{') {
      cursor += 1; const result = {};
      while (cursor < source.length) {
        skip(); if (source[cursor] === '}') { cursor += 1; break; }
        const key = source[cursor] === '"' || source[cursor] === "'" ? readString() : readIdentifier();
        skip(); if (source[cursor] !== ':') throw new Error('loose object key without colon');
        cursor += 1; result[key] = readValue(); skip();
        if (source[cursor] === ',') { cursor += 1; continue; }
        if (source[cursor] === '}') { cursor += 1; break; }
        throw new Error('loose object item without comma');
      }
      return result;
    }
    if (character === '[') {
      cursor += 1; const result = [];
      while (cursor < source.length) {
        skip(); if (source[cursor] === ']') { cursor += 1; break; }
        result.push(readValue()); skip();
        if (source[cursor] === ',') { cursor += 1; continue; }
        if (source[cursor] === ']') { cursor += 1; break; }
        throw new Error('loose array item without comma');
      }
      return result;
    }
    if (character === '"' || character === "'") return readString();
    const tokenStart = cursor;
    const token = readIdentifier();
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null' || token === 'undefined' || !token) return null;
    if (/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(token)) return Number(token);
    // 页面 payload 中偶尔有变量引用（例如已缓存的 favicon 对象）或
    // 简单表达式。该字段无法独立还原时置空，但不能让它破坏同对象
    // 后续真实文字和图片字段的解析。
    cursor = tokenStart;
    skipUnknownExpression();
    return null;
  };
  try { return readValue(); } catch { return null; }
}

function structuredObjectValues(raw, keys) {
  const values = [];
  for (const key of keys) {
    const value = structuredValue(raw, key);
    if (!value?.startsWith('{')) continue;
    const parsed = parseLooseValue(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) values.push({ key, value: parsed });
  }
  return values;
}
function walkArrays(value, callback, path = []) {
  if (Array.isArray(value)) { callback(value, path); value.forEach((child, index) => walkArrays(child, callback, [...path, index])); return; }
  if (value && typeof value === 'object') Object.entries(value).forEach(([key, child]) => walkArrays(child, callback, [...path, key]));
}
function historyRecordFromObject(record, category, type, index) {
  const yearValue = pickValue(record, ['year', 'year_display', 'date_display', 'date_iso', 'date', 'yearText', 'born', 'birth_date']);
  const year = yearValue.match(/(?:^|[^\d])(-?\d{3,4})(?:[^\d]|$)/)?.[1] || yearValue;
  const detail = pickValue(record, ['detail', 'description', 'short_summary', 'summary', 'did_you_know', 'bio', 'text', 'content']);
  const title = pickValue(record, type === 'person' ? ['name', 'person', 'title', 'label'] : ['title', 'event', 'headline', 'label', 'name']) || detail.slice(0, 96);
  if (!year || (!title && !detail)) return null;
  const image = pickImage(record, category.url);
  const titleZh = pickValue(record, type === 'person' ? ['name_zh', 'nameZh', 'title_zh'] : ['title_zh', 'titleZh', 'event_zh']);
  const detailZh = pickValue(record, ['detail_zh', 'detailZh', 'description_zh', 'descriptionZh', 'summary_zh', 'summaryZh', 'content_zh']);
  const url = absolute(pickValue(record, ['url', 'href', 'link', 'source_url']), category.url);
  const base = { id: `${type}-${year}-${index}`, year, detail, detail_zh: detailZh || null, image_url: image.url, image_alt: image.alt || title || detail, image_source_url: image.url, url };
  if (type === 'person') return { ...base, name: title, name_zh: titleZh || null };
  const sourceRecords = [...(Array.isArray(record.links) ? record.links : []), ...(Array.isArray(record.sources) ? record.sources : []), ...(Array.isArray(record.articles) ? record.articles : []), ...(Array.isArray(record.references) ? record.references : [])];
  const links = sourceRecords.map((link, linkIndex) => {
    const linkObject = asObject(link) || {};
    const linkImage = pickImage(linkObject, category.url);
    return { id: `${base.id}-link-${linkIndex}`, label: pickValue(linkObject, ['label', 'title', 'name', 'text']) || String(link), detail: pickValue(linkObject, ['detail', 'description', 'summary', 'text']), detail_zh: pickValue(linkObject, ['detail_zh', 'description_zh']), image_url: linkImage.url, image_source_url: linkImage.url, image_alt: linkImage.alt || null, url: absolute(pickValue(linkObject, ['url', 'href', 'link']), category.url) };
  });
  return { ...base, title, title_zh: titleZh || null, links };
}
function parseHistoryData(raw, category) {
  if (category.id !== 'onthisday') return { events: [], people: [] };
  const eventRecords = []; const personRecords = [];
  const addArray = (array, path) => {
    const pathText = path.join('.').toLowerCase();
    const defaultType = /people|persons|person|notable|born|birth/.test(pathText) ? 'person' : /event|history|timeline|today|onthisday/.test(pathText) ? 'event' : null;
    if (!defaultType) return;
    array.forEach((entry, index) => {
      const record = asObject(entry); if (!record) return;
      const recordType = /person|people|born|birth|died|death/i.test(String(record.type || record.kind || record.record_type || '')) ? 'person' : defaultType;
      const parsed = historyRecordFromObject(record, category, recordType, index);
      if (parsed) (recordType === 'person' ? personRecords : eventRecords).push(parsed);
    });
  };
  jsonScriptValues(raw).forEach((value) => walkArrays(value, addArray));
  structuredArrayValues(raw, ['events', 'historical_events', 'history_events', 'timeline', 'milestones', 'people', 'persons', 'notable_people', 'notablePersons']).forEach(({ key, value }) => addArray(value, [key]));
  // Kagi/SvelteKit 把整页聚合结果放在 allCategoryStories 中。普通世界页
  // 也会带 hasOnThisDay=true，但那只是标志位；不能把 world/business
  // 新闻自身的 timeline 当成“历史上的今天”。只有明确位于 onthisday
  // 分支的数据才进入历史解析。
  structuredObjectValues(raw, ['allCategoryStories', 'initialData']).forEach(({ key, value }) => {
    const candidates = key === 'allCategoryStories' ? value : value.allCategoryStories;
    if (!candidates || typeof candidates !== 'object') return;
    Object.entries(candidates).forEach(([categoryKey, records]) => {
      if (!/^(?:onthisday|today.?in.?history)$/i.test(categoryKey)) return;
      if (Array.isArray(records)) walkArrays(records, addArray, [categoryKey]);
      else if (records && typeof records === 'object') walkArrays(records, addArray, [categoryKey]);
    });
  });
  const htmlBlocks = [...String(raw).matchAll(/<(?:article|li|div|section)\b[^>]*(?:data-year|history|timeline|event|person|onthisday)[^>]*>[\s\S]*?<\/(?:article|li|div|section)>/gi)].map((match) => match[0]);
  htmlBlocks.forEach((block, index) => {
    const year = first(block, [/(?:data-year|data-date)=['"]([^'"]+)/i, /(?<!\d)(\d{3,4})(?:\s*年|\s*\/)/i]);
    const links = [...block.matchAll(/<a\b[^>]*href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)].map((match, linkIndex) => ({ id: `html-${index}-${linkIndex}`, label: text(match[2]), detail: '', detail_zh: null, image_url: null, image_source_url: null, image_alt: null, url: absolute(match[1], category.url) }));
    const title = first(block, [/<h[1-5]\b[^>]*>([\s\S]*?)<\/h[1-5]>/i, /<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/i, /<a\b[^>]*>([\s\S]*?)<\/a>/i]);
    const detail = first(block, [/<p\b[^>]*>([\s\S]*?)<\/p>/i, /<(?:span|div)\b[^>]*class=['"][^'"]*(?:description|summary|detail)[^'"]*['"][^>]*>([\s\S]*?)<\//i]);
    if (!year || (!title && !detail)) return;
    const image = extractImage(block, category.url);
    const clean = { year, title: title || detail, detail: detail || title, detail_zh: null, image_url: isPlaceholderImage(image.url) ? null : image.url, image_source_url: image.url, image_alt: image.alt || title || detail, url: sourceLink(block, category.url), links };
    const isPerson = /person|people|notable/.test(block.slice(0, 500).toLowerCase());
    if (isPerson) personRecords.push({ id: `html-person-${index}`, year, name: clean.title, name_zh: null, detail: clean.detail, detail_zh: null, image_url: clean.image_url, image_source_url: clean.image_source_url, image_alt: clean.image_alt, url: clean.url });
    else eventRecords.push({ id: `html-event-${index}`, ...clean });
  });
  const unique = (records) => records.filter((record, index, all) => all.findIndex((candidate) => `${candidate.year}|${candidate.title || candidate.name}|${candidate.detail}` === `${record.year}|${record.title || record.name}|${record.detail}`) === index);
  return { source_url: category.url, captured_at: capturedAt, events: unique(eventRecords).slice(0, 24), people: unique(personRecords).slice(0, 24) };
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
  const parsedTitle = first(raw, [
    /<h1\b[^>]*>([\s\S]*?)<\/h1>/i,
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
    /<title\b[^>]*>([\s\S]*?)<\/title>/i,
  ]);
  const title = parsedTitle && !/^(kagi news|kagi)$/i.test(parsedTitle.trim()) ? parsedTitle : item.title;
  const metaDescription = metaContent(raw, 'description') || metaContent(raw, 'og:description') || metaContent(raw, 'twitter:description');
  const paragraphs = [...String(raw).matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((match) => text(match[1]))
    .filter((value) => value.length > 30 && !/^(sources?|highlights?|perspectives?|timeline|historical background)$/i.test(value))
    .filter((value) => !/this link points to news from .* you can return to today's news/i.test(value));
  const usableMeta = metaDescription && !/^Kagi News distills thousands of world-wide news sources/i.test(metaDescription) ? metaDescription : '';
  const content = [usableMeta, ...paragraphs].filter(Boolean).join('\n\n').trim() || item.content;
  const published = first(raw, [
    /<time\b[^>]+datetime=["']([^"']+)/i,
    /(?:published_at|publishedAt|datePublished)\s*[:=]\s*["']([^"']+)/i,
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)/i,
  ]);
  const images = collectImages(raw, category.url);
  const sourceLinks = [...String(raw).matchAll(/<a\b[^>]+href=["'](https?:\/\/[^"']+)["']/gi)]
    .map((match) => match[1])
    .filter((url) => !isKagiNavigationUrl(url))
    .filter((url, index, all) => all.indexOf(url) === index)
    .slice(0, 20);
  return {
    ...item,
    title: title || item.title,
    summary: content ? content.slice(0, 320) : item.summary,
    content: content || item.content,
    published_at_ms: dateMs(published) || item.published_at_ms,
    image_url: isPlaceholderImage(images[0]) ? null : (images[0] || (category.id === 'onthisday' ? null : item.image_url)),
    image_source_url: isPlaceholderImage(images[0]) ? null : item.image_source_url,
    image_alt: title || item.image_alt,
    source_links: sourceLinks,
  };
}

async function enrichDetail(item, category) {
  if (!item.url || !isKagiStoryUrl(item.url)) return item;
  try {
    const response = await fetchWithRetry(item.url, { headers: { accept: 'text/html,application/xhtml+xml;q=0.9', 'user-agent': userAgent } }, retry);
    const raw = Buffer.from(await response.arrayBuffer()).toString('utf8');
    return parseDetail(raw, item, category);
  } catch {
    return item;
  }
}

async function writeBufferAtomic(file, buffer) {
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(temporary, buffer);
    await fs.rename(temporary, file);
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

async function materializeImage(item) {
  if (isPlaceholderImage(item.image_url) || isPlaceholderImage(item.image_source_url)) return { ...item, image_url: null, image_source_url: null };
  if (!item.image_url || !/^https?:\/\//i.test(item.image_url)) return item;
  const imageSourceUrl = item.image_url;
  const imageKey = crypto.createHash('sha256').update(imageSourceUrl).digest('hex').slice(0, 20);
  const extension = /\.png(?:\?|$)/i.test(imageSourceUrl) ? 'png' : /\.webp(?:\?|$)/i.test(imageSourceUrl) ? 'webp' : 'jpg';
  const filename = `${imageKey}.${extension}`;
  const file = path.join(imageDir, filename);
  try {
    if (!(await fs.stat(file).catch(() => null))) {
      const response = await fetchWithRetry(imageSourceUrl, { headers: { accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8', 'user-agent': userAgent } }, retry);
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) throw new Error(`图片响应类型异常：${contentType || '未知'}`);
      await fs.mkdir(imageDir, { recursive: true });
      await writeBufferAtomic(file, Buffer.from(await response.arrayBuffer()));
    }
    return { ...item, image_url: `tide-news-images/${filename}`, image_source_url: imageSourceUrl };
  } catch (error) {
    return { ...item, image_source_url: imageSourceUrl, image_error: error instanceof Error ? error.message : String(error) };
  }
}

function normalize(items, category) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.url || item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map((item, index) => {
    const placeholderImage = isPlaceholderImage(item.image_url) || isPlaceholderImage(item.image_source_url);
    return {
    id: `${category.id}-${item.published_at_ms}-${index}`,
    title: item.title, title_zh: item.title_zh || null, summary: item.summary || item.content.slice(0, 320), summary_zh: item.summary_zh || null, content: item.content || item.summary, content_zh: item.content_zh || null, translation_status: item.translation_status || 'unavailable',
    image_url: placeholderImage ? null : (item.image_url || null), image_source_url: placeholderImage ? null : (item.image_source_url || null), image_alt: item.image_alt || null, location: item.location || null,
    source_links: Array.isArray(item.source_links) ? item.source_links : [],
    category: category.id, source: item.source || category.label, source_id: config.source_id,
    url: item.url || null, published_at: new Date(item.published_at_ms).toISOString(), published_at_ms: item.published_at_ms,
    author: item.author || null,
    };
  });
}

async function translateText(value, field, item) {
  if (!value || item?.[`${field}_zh`]) return item?.[`${field}_zh`] || null;
  const translation = config.translation || {};
  if (translation.enabled === false) return null;
  const endpoint = process.env[translation.endpoint_env || 'TIDE_TRANSLATE_ENDPOINT'];
  if (!endpoint) return null;
  const apiKey = process.env[translation.api_key_env || 'TIDE_TRANSLATE_API_KEY'];
  try {
    const response = await fetchWithRetry(endpoint, {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
      body: JSON.stringify({ text: value, target_language: 'zh-CN', source_language: 'auto', field }),
    }, retry);
    const payload = await response.json();
    return text(payload.translation || payload.translated_text || payload.text || payload.data?.translation || '');
  } catch { return null; }
}

async function translateItem(item) {
  const titleZh = item.title_zh || await translateText(item.title, 'title', item);
  const summaryZh = item.summary_zh || await translateText(item.summary, 'summary', item);
  const contentZh = item.content_zh || await translateText(item.content, 'content', item);
  return { ...item, title_zh: titleZh || null, summary_zh: summaryZh || null, content_zh: contentZh || null, translation_status: titleZh || summaryZh || contentZh ? 'translated' : 'unavailable' };
}

async function translateHistoryRecord(record, kind) {
  const title = kind === 'person' ? record.name : record.title;
  const titleZh = kind === 'person' ? record.name_zh || await translateText(title, 'history_name', record) : record.title_zh || await translateText(title, 'history_title', record);
  const detailZh = record.detail_zh || await translateText(record.detail, 'history_detail', record);
  const translated = kind === 'person' ? { ...record, name_zh: titleZh || null, detail_zh: detailZh || null } : { ...record, title_zh: titleZh || null, detail_zh: detailZh || null };
  if (Array.isArray(record.links)) translated.links = await Promise.all(record.links.map(async (link) => ({ ...link, detail_zh: link.detail_zh || await translateText(link.detail, 'history_link_detail', link) || null })));
  return translated;
}
async function materializeHistoryRecord(record) {
  const withImage = await materializeImage(record);
  if (Array.isArray(withImage.links)) withImage.links = await Promise.all(withImage.links.map(materializeImage));
  return withImage;
}
async function prepareHistory(history) {
  if (!history) return null;
  const events = await Promise.all((history.events || []).map(async (event) => translateHistoryRecord(await materializeHistoryRecord(event), 'event')));
  const people = await Promise.all((history.people || []).map(async (person) => translateHistoryRecord(await materializeHistoryRecord(person), 'person')));
  return { ...history, events, people };
}

async function fetchCategory(category) {
  const errors = [];
  try {
    const response = await fetchWithRetry(category.rss, { headers: { accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9', 'user-agent': userAgent } }, retry);
    const raw = Buffer.from(await response.arrayBuffer()).toString('utf8');
    let parsedItems = parseRss(raw, category);
    let history = null;
    if (category.id === 'onthisday') {
      try {
        // RSS 的 onthisday 条目会给出本批次的 kite 页面。latest 页面
        // 只有摘要入口，历史事件/人物和图片在这个批次页的 SSR payload 中。
        const historyUrl = parsedItems.find((item) => item.url && /(?:kite|news)\.kagi\.com\//i.test(item.url))?.url || category.url;
        const historyResponse = await fetchWithRetry(historyUrl, { headers: { accept: 'text/html,application/xhtml+xml;q=0.9', 'user-agent': userAgent } }, retry);
        const historyRaw = Buffer.from(await historyResponse.arrayBuffer()).toString('utf8');
        history = await prepareHistory(parseHistoryData(historyRaw, category));
        parsedItems = [...parsedItems, ...parseHistoryTimeline(historyRaw, category)];
      } catch (error) {
        errors.push(`历史批次页：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // RSS 里的历史页条目只是批次入口/占位摘要，不代表人物与事件已经取到。
    // 没有结构化 history 时不得把它计为“历史板块成功”，否则会在前端显示
    // 类似“214/15: Notable Person”的错误占位内容并掩盖真实抓取失败。
    if (category.id === 'onthisday' && !(history?.events?.length || history?.people?.length)) {
      errors.push('历史人物/事件结构化数据为空；RSS 仅返回批次占位入口');
      parsedItems = [];
    }
    const items = normalize(parsedItems, category);
    if (items.length) {
      const enriched = await Promise.all(items.map(async (item) => materializeImage(await enrichDetail(item, category))));
      return { category, items: normalize(await Promise.all(enriched.map(translateItem)), category), history, errors, mode: 'rss+detail+local-images' };
    }
    errors.push('RSS 未解析出有效新闻');
  } catch (error) { errors.push(`RSS：${error instanceof Error ? error.message : String(error)}`); }
  try {
    const response = await fetchWithRetry(category.url, { headers: { accept: 'text/html,application/xhtml+xml;q=0.9', 'user-agent': userAgent } }, retry);
    const raw = Buffer.from(await response.arrayBuffer()).toString('utf8');
    const parsed = category.id === 'onthisday' ? parseHistoryTimeline(raw, category) : parseHtml(raw, category);
    const history = category.id === 'onthisday' ? await prepareHistory(parseHistoryData(raw, category)) : null;
    const validHistory = category.id !== 'onthisday' || Boolean(history?.events?.length || history?.people?.length);
    const usableParsed = category.id === 'onthisday' && !validHistory ? [] : parsed;
    const items = normalize(usableParsed, category);
    if (items.length) {
      const enriched = await Promise.all(items.map(async (item) => materializeImage(await enrichDetail(item, category))));
      return { category, items: normalize(await Promise.all(enriched.map(translateItem)), category), history, errors, mode: 'rss+detail+local-images' };
    }
    if (category.id === 'onthisday' && !validHistory) errors.push('HTML 未解析出历史人物/事件结构化数据');
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
let history = null;
for (const result of results) {
  const previousHistoryIsValid = Boolean(previous?.history?.events?.length || previous?.history?.people?.length);
  const previousItems = result.category.id === 'onthisday' && !previousHistoryIsValid
    ? []
    : (previous?.sections?.[result.category.id] || []);
  const usedFallback = !result.items.length && previousItems.length > 0;
  sections[result.category.id] = result.items.length ? result.items : previousItems;
  if (result.category.id === 'onthisday' && result.history && (result.history.events.length || result.history.people.length)) history = result.history;
  const resultHistory = result.history || null;
  sourceRecords.push({
    id: result.category.id,
    name: result.category.label,
    url: result.category.url,
    item_count: sections[result.category.id].length,
    errors: result.errors,
    captured_at: result.items.length ? capturedAt : null,
    fetch_mode: result.mode || 'fallback',
    used_fallback: usedFallback,
    ...(result.category.id === 'onthisday' ? {
      history_event_count: resultHistory?.events?.length || 0,
      history_person_count: resultHistory?.people?.length || 0,
      history_image_count: [...(resultHistory?.events || []), ...(resultHistory?.people || [])].filter((item) => item.image_url).length,
    } : {}),
  });
}

const successful = results.filter((result) => result.items.length > 0);
if (!successful.length) {
  const detail = sourceRecords.map((record) => `${record.name}：${record.errors.join('；') || '无新数据'}`).join(' | ');
  throw new Error(`Kagi 五个板块均未抓取成功，未覆盖已有快照。${detail}`);
}

const all = Object.values(sections).flat();
const historySnapshot = history || previous?.history || { source_url: config.categories.find((category) => category.id === 'onthisday')?.url || '', captured_at: null, events: [], people: [] };
const historyEventCount = historySnapshot.events?.length || 0;
const historyPersonCount = historySnapshot.people?.length || 0;
const historyImageCount = [...(historySnapshot.events || []), ...(historySnapshot.people || [])].filter((item) => item.image_url).length;
const historySource = sourceRecords.find((source) => source.id === 'onthisday');
const historyStatus = historyEventCount || historyPersonCount
  ? 'available'
  : historySource?.used_fallback
    ? 'fallback'
    : historySource?.errors?.some((error) => /fetch failed|重试|网络|超时/i.test(error))
      ? 'blocked'
      : 'unavailable';
const rawHash = crypto.createHash('sha256').update(JSON.stringify(results)).digest('hex');
const snapshot = {
  schema_version: '2.0',
  source: { source_id: config.source_id, name: config.name, captured_at: capturedAt, coverage_start: all.length ? new Date(Math.min(...all.map((item) => item.published_at_ms))).toISOString() : capturedAt, coverage_end: all.length ? new Date(Math.max(...all.map((item) => item.published_at_ms))).toISOString() : capturedAt, timezone: config.timezone, window_hours: config.window_hours, schedule: config.schedule, fetch_mode: 'kagi-rss-with-html-fallback-local-images', raw_sha256: rawHash, source_count: config.categories.length, categories: config.categories.map((category) => category.id) },
  sources: sourceRecords,
  sections,
  history: historySnapshot,
  quality: {
    source_count: config.categories.length,
    successful_source_count: successful.length,
    item_count: all.length,
    image_count: all.filter((item) => item.image_url && !/^https?:\/\//i.test(item.image_url)).length,
    full_content_count: all.filter((item) => item.content && item.content.length > 80).length,
    translated_count: all.filter((item) => item.translation_status === 'translated').length,
    history_event_count: historyEventCount,
    history_person_count: historyPersonCount,
    history_image_count: historyImageCount,
    history_status: historyStatus,
    warnings: [
      ...sourceRecords.filter((record) => record.errors.length || record.used_fallback).map((record) => `${record.name}：${record.used_fallback ? '沿用上一份成功快照；' : ''}${record.errors.join('；')}`),
      ...(!historyEventCount && !historyPersonCount ? ['历史上的今天：未取得可验证的人物/事件结构化数据，未虚构内容；请检查 Kagi 历史批次页访问与解析状态'] : []),
    ],
  },
  fetch_diagnostics: { retry: retrySummary(retry), fallback_policy: '分类级保留上一次成功数据；五类全失败时不写入文件', generated_by: userAgent },
};
await fs.mkdir(path.dirname(output), { recursive: true });
await writeFileAtomic(output, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`[tide-global-news] 已写入 ${output}；成功板块 ${successful.length}/${config.categories.length}；新闻 ${all.length} 条；图片 ${snapshot.quality.image_count} 张`);
