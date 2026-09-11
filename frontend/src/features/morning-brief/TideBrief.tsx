import { useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { TideNewsItem, TideNewsSnapshot } from '@/core/store/types';
import { HistoryTimeline } from './HistoryTimeline';
import './TideBrief.css';

gsap.registerPlugin(useGSAP);

const sectionMeta = [
  { id: 'onthisday', label: '历史上的今天', short: '今日封面', tone: 'gold' },
  { id: 'world', label: '世界', short: '世界局势', tone: 'blue' },
  { id: 'business', label: '商业', short: '商业脉搏', tone: 'green' },
  { id: 'science', label: '科学', short: '科学前沿', tone: 'violet' },
  { id: 'sports', label: '运动', short: '运动现场', tone: 'orange' },
] as const;

type SectionId = (typeof sectionMeta)[number]['id'];
const sectionById = Object.fromEntries(sectionMeta.map((section) => [section.id, section])) as Record<SectionId, typeof sectionMeta[number]>;

function formatTime(value?: string) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ').slice(0, 16);
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(date);
}
function categoryLabel(category: string) { return sectionById[category as SectionId]?.label || category; }
function displayTitle(item: TideNewsItem) {
  const title = item.title_zh || item.title;
  if (item.category !== 'onthisday') return title;
  const match = title.match(/^\d{1,4}\s*\/\s*\d{1,2}\s*:\s*(.*)$/);
  return match ? match[1] : item.title;
}
function sourceDateMark(item: TideNewsItem) {
  const mark = item.title.match(/^(\d{1,4}\s*\/\s*\d{1,2})/i)?.[1];
  if (!mark) return '未提供可验证日期';
  const month = Number(mark.split('/')[1]);
  return month > 12 ? `${mark}（源站原始格式，未按公历日期解释）` : mark;
}
function displaySummary(item: TideNewsItem) { return item.summary_zh || item.summary || item.content_zh || item.content; }
function displayContent(item: TideNewsItem) { return item.content_zh || item.content || item.summary_zh || item.summary; }
function imageUrl(value: string | null) { return value && !/^https?:\/\//i.test(value) ? `${import.meta.env.BASE_URL}data/${value}` : value; }
function hasEditorialImage(item: TideNewsItem) {
  return Boolean(imageUrl(item.image_url) && !/kite-banner|placeholder|default/i.test(`${item.image_url || ''} ${item.image_source_url || ''}`));
}
function isInvalidHistoryPlaceholder(item: TideNewsItem) {
  return item.category === 'onthisday' && /(?:Notable Person|历史事件|历史上的今天)/i.test(item.title) && !item.url?.includes('/onthisday/');
}
async function readSnapshot<T>(url: string): Promise<T | null> {
  try { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) return null; return await response.json() as T; } catch { return null; }
}

export function TideBrief() {
  const root = useRef<HTMLDivElement>(null);
  const [news, setNews] = useState<TideNewsSnapshot | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('world');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readerItem, setReaderItem] = useState<TideNewsItem | null>(null);
  const readerCloseButton = useRef<HTMLButtonElement>(null);
  const readerReturnElement = useRef<HTMLElement | null>(null);
  const closeReaderRef = useRef<() => void>(() => undefined);
  const historyItems = (news?.sections.onthisday || []).filter((item) => !isInvalidHistoryPlaceholder(item));
  const focus = historyItems[0] || null;
  const hasStructuredHistory = Boolean(news?.history?.events?.length || news?.history?.people?.length);
  const historySource = news?.sources.find((source) => source.id === 'onthisday');
  const historyStatus = news?.quality.history_status || (hasStructuredHistory ? 'available' : historySource?.used_fallback ? 'fallback' : 'unavailable');
  const activeItems = useMemo(() => news?.sections[activeSection] || [], [news, activeSection]);
  const sectionCount = news ? Object.values(news.sections).reduce((total, items) => total + items.length, 0) : 0;

  useEffect(() => {
    let active = true;
    readSnapshot<TideNewsSnapshot>(`${import.meta.env.BASE_URL}data/external_tide_news.json`).then((snapshot) => {
      if (!active) return;
      setNews(snapshot);
      if (!snapshot) setError('今日 Kagi 新闻快照暂不可用，页面将保留上一次成功内容。');
    }).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!readerItem) return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') closeReaderRef.current(); };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKeyDown);
    window.setTimeout(() => readerCloseButton.current?.focus(), 0);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', handleKeyDown); };
  }, [readerItem]);

  useGSAP((_, contextSafe) => {
    if (!root.current) return;
    const media = gsap.matchMedia();
    const makeContextSafe = contextSafe || ((callback: () => void) => callback);
    closeReaderRef.current = makeContextSafe(() => {
      const overlay = root.current?.querySelector<HTMLElement>('.tide-reader');
      if (!overlay || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        setReaderItem(null);
        return;
      }
      gsap.to(overlay, { autoAlpha: 0, y: 18, duration: .2, ease: 'power2.in', onComplete: () => setReaderItem(null) });
    });
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      timeline.fromTo('.tide-hero', { autoAlpha: 0, y: 16, clipPath: 'inset(0 0 8% 0)' }, { autoAlpha: 1, y: 0, clipPath: 'inset(0 0 0% 0)', duration: .55 })
        .fromTo('.tide-hero-orbit, .tide-hero-copy > *, .tide-hero-meta > *', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .32, stagger: .05 }, '-=.3')
        .fromTo('.tide-section', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .4, stagger: .06 }, '-=.18')
        .fromTo('.tide-story-card', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: .3, stagger: .035 }, '-=.16');
      return () => timeline.kill();
    }, root);
    if (readerItem) {
      const readerTimeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      readerTimeline.fromTo('.tide-reader', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: .34 })
        .fromTo('.tide-reader-media img, .tide-reader-media .tide-reader-art', { scale: 1.045, autoAlpha: .72 }, { scale: 1, autoAlpha: 1, duration: .6 }, '-=.2')
        .fromTo('.tide-reader-content > *', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .28, stagger: .045 }, '-=.36');
      return () => { readerTimeline.kill(); media.revert(); closeReaderRef.current = () => undefined; };
    }
    return () => { media.revert(); closeReaderRef.current = () => undefined; };
  }, { scope: root, dependencies: [loading, news, activeSection, readerItem], revertOnUpdate: true });

  function openReader(item: TideNewsItem) {
    readerReturnElement.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setReaderItem(item);
  }

  function closeReader() {
    closeReaderRef.current();
    window.setTimeout(() => readerReturnElement.current?.focus(), 240);
  }

  return <main className="tide-brief" ref={root}>
    <section className="tide-hero tide-reveal">
      <div className="tide-hero-orbit" aria-hidden="true"><span className="orbit-core">T</span><i /><i /><i /></div>
      <div className="tide-hero-copy"><span className="tide-kicker">TIDE BRIEF · GLOBAL NEWS CURRENT</span><h1>潮汐早报</h1><p>从世界、商业、科学与运动新闻中，收束一页值得今天打开的全球脉搏。</p></div>
      <div className="tide-hero-meta"><strong>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full', timeZone: 'Asia/Shanghai' }).format(new Date())}</strong><span>{news?.source?.captured_at ? `快照 ${formatTime(news.source.captured_at)}` : '等待今日快照'} · 每日 09:00 更新</span><span className="tide-integrity"><b /> {news ? `${news.quality.successful_source_count}/${news.quality.source_count} 个新闻板块有数据` : '正在校验来源'}</span></div>
    </section>
    {error && <p className="tide-state tide-error" role="alert">{error}</p>}
    <section className="tide-section tide-cover tide-reveal" id="tide-cover"><div className="tide-section-heading"><div><span>今日封面</span><h2>历史上的今天</h2></div><small>来自 Kagi News · {focus ? formatTime(focus.published_at) : '等待历史页数据'}</small></div>{loading ? <div className="tide-state">正在读取今日快照…</div> : hasStructuredHistory ? <><div className="tide-history-cover-note">源站历史页已解析：下方按原站结构展示大事记、人物及悬停详情。</div><HistoryTimeline data={news?.history} fallbackItems={[]} onOpen={openReader} /></> : <HistoryUnavailable status={historyStatus} source={historySource?.url || 'https://news.kagi.com/onthisday/latest'} errors={historySource?.errors || news?.quality.warnings.filter((warning) => warning.startsWith('历史上的今天')) || []} />}</section>
    <section className="tide-section tide-stream tide-reveal" id="tide-stream"><div className="tide-section-heading tide-stream-heading"><div><span>全球新闻流</span><h2>{sectionById[activeSection].short}</h2></div><small>{activeItems.length} 条 · 共 {sectionCount} 条可读快讯</small></div><nav className="tide-tabs" aria-label="潮汐早报新闻板块">{sectionMeta.map((section) => <button key={section.id} type="button" className={`tide-tab tide-tab-${section.tone} ${activeSection === section.id ? 'is-active' : ''}`} onClick={() => setActiveSection(section.id)} aria-pressed={activeSection === section.id}><span>{section.label}</span><b>{news?.sections[section.id]?.length || 0}</b></button>)}</nav>{loading ? <div className="tide-state">正在整理新闻流…</div> : activeItems.length ? <div className="tide-story-grid">{activeItems.map((item) => <StoryCard key={item.id} item={item} onOpen={openReader} />)}</div> : <div className="tide-state">该板块当前没有可验证内容。</div>}</section>
    <section className="tide-section tide-index tide-reveal"><div className="tide-index-copy"><span>快照索引</span><h2>一份可追溯的今日新闻底稿</h2><p>每条新闻保留标题、摘要、正文、图片和原始入口；当某个板块暂时不可访问时，仅沿用该板块上一次成功快照，不覆盖其他板块。</p></div><div className="tide-index-facts"><div><strong>{sectionCount}</strong><span>新闻条目</span></div><div><strong>{news?.quality.image_count || 0}</strong><span>已提取图片</span></div><div><strong>{news?.quality.full_content_count || 0}</strong><span>含完整正文</span></div></div></section>
    <footer className="tide-sources tide-reveal"><span>来源</span>{sectionMeta.map((section) => <a key={section.id} href={`https://news.kagi.com/${section.id}/latest`} target="_blank" rel="noreferrer">Kagi · {section.label} ↗</a>)}</footer>
    {readerItem && <ReaderOverlay item={readerItem} onClose={closeReader} closeButtonRef={readerCloseButton} />}
  </main>;
}

function HistoryUnavailable({ status, source, errors }: { status: 'available' | 'unavailable' | 'blocked' | 'fallback'; source: string; errors: string[] }) {
  const title = status === 'blocked' ? '历史页暂时无法访问' : status === 'fallback' ? '历史页沿用旧快照' : '历史页未返回可验证内容';
  const detail = status === 'blocked' ? '当前抓取环境没有拿到 Kagi 历史批次页；普通新闻板块的快照不代表历史人物和事件已成功。' : 'RSS 只返回批次入口或占位摘要，未解析出人物、事件和图片，因此不展示错误内容。';
  return <div className="tide-history-unavailable" role="status"><div className="tide-history-unavailable-mark" aria-hidden="true">史</div><div><span className="tide-history-status">{status === 'blocked' ? 'FETCH BLOCKED' : 'HISTORY DATA CHECK'}</span><h3>{title}</h3><p>{detail}</p>{errors.length > 0 && <small>抓取记录：{errors[0]}</small>}<a href={source} target="_blank" rel="noreferrer">打开 Kagi 历史原页核验 ↗</a></div></div>;
}
function StoryCard({ item, onOpen }: { item: TideNewsItem; onOpen: (item: TideNewsItem) => void }) { return <article className="tide-story-card"><div className={`tide-story-image tide-story-image-${item.category}`}>{hasEditorialImage(item) ? <img src={imageUrl(item.image_url) || undefined} alt={item.image_alt || item.title_zh || item.title} loading="lazy" /> : <span aria-hidden="true">{categoryLabel(item.category).slice(0, 1)}</span>}</div><div className="tide-story-body"><div className="tide-news-meta"><span>{item.source}</span><time>{formatTime(item.published_at)}</time></div><h3>{displayTitle(item)}</h3><p className="tide-story-summary">{displaySummary(item)}</p><button className="tide-story-trigger" type="button" onClick={() => onOpen(item)}>展开阅读全文与大图 <span aria-hidden="true">→</span></button></div></article>; }
function StoryLinks({ item }: { item: TideNewsItem }) { return <div className="tide-story-links">{item.url && <a href={item.url} target="_blank" rel="noreferrer">Kagi 原文 ↗</a>}{item.source_links?.slice(0, 2).map((link) => <a key={link} href={link} target="_blank" rel="noreferrer">来源链接 ↗</a>)}</div>; }

function ReaderOverlay({ item, onClose, closeButtonRef }: { item: TideNewsItem; onClose: () => void; closeButtonRef: RefObject<HTMLButtonElement> }) {
  const editorialImage = hasEditorialImage(item);
  return <div className="tide-reader" role="dialog" aria-modal="true" aria-labelledby="tide-reader-title" tabIndex={-1} onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}>
    <button ref={closeButtonRef} className="tide-reader-close" type="button" onClick={onClose} aria-label="关闭沉浸式阅读">×</button>
    <div className="tide-reader-scroll" tabIndex={0}>
      <div className="tide-reader-media">{editorialImage ? <img src={imageUrl(item.image_url) || undefined} alt={item.image_alt || item.title_zh || item.title} /> : item.category === 'onthisday' ? <div className="tide-reader-no-image"><span aria-hidden="true">—</span><strong>源站未提供可验证图片</strong><small>本条记录保留源站文字内容</small></div> : <div className={`tide-reader-art tide-reader-art-${item.category}`} aria-hidden="true"><span>{displayTitle(item).slice(0, 1)}</span><i /></div>}<div className="tide-reader-media-caption"><span>{categoryLabel(item.category)}</span><span>完整内容 · 向下滚动阅读</span></div><div className="tide-reader-scroll-cue" aria-hidden="true"><span>↓</span>向下滚动阅读全文</div></div>
      <article className="tide-reader-content"><div className="tide-news-meta"><span>{item.source}</span><time>{formatTime(item.published_at)}</time></div><h2 id="tide-reader-title">{displayTitle(item)}</h2>{item.translation_status === 'unavailable' && <p className="tide-translation-note">中文翻译暂不可用，以下保留源站原文</p>}{item.category === 'onthisday' && <p className="tide-source-mark">源站原始标记：{sourceDateMark(item)}</p>}{item.author && <p className="tide-reader-author">{item.author}</p>}<div className="tide-reader-body">{displayContent(item).split(/\n{2,}/).map((paragraph, index) => <p key={`${item.id}-${index}`}>{paragraph}</p>)}</div><StoryLinks item={item} /></article>
    </div>
  </div>;
}
