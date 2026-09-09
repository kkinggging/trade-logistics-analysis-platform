import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { TideNewsItem, TideNewsSnapshot } from '@/core/store/types';
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
async function readSnapshot<T>(url: string): Promise<T | null> {
  try { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) return null; return await response.json() as T; } catch { return null; }
}

export function TideBrief() {
  const root = useRef<HTMLDivElement>(null);
  const [news, setNews] = useState<TideNewsSnapshot | null>(null);
  const [activeSection, setActiveSection] = useState<SectionId>('world');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const focus = news?.sections.onthisday?.[0] || news?.sections.world?.[0] || null;
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

  useGSAP(() => {
    if (!root.current) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const timeline = gsap.timeline({ defaults: { ease: 'power3.out' } });
      timeline.fromTo('.tide-hero', { autoAlpha: 0, y: 16, clipPath: 'inset(0 0 8% 0)' }, { autoAlpha: 1, y: 0, clipPath: 'inset(0 0 0% 0)', duration: .55 })
        .fromTo('.tide-hero-orbit, .tide-hero-copy > *, .tide-hero-meta > *', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .32, stagger: .05 }, '-=.3')
        .fromTo('.tide-section', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: .4, stagger: .06 }, '-=.18')
        .fromTo('.tide-story-card', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: .3, stagger: .035 }, '-=.16');
      return () => timeline.kill();
    }, root);
    return () => media.revert();
  }, { scope: root, dependencies: [loading, news, activeSection], revertOnUpdate: true });

  return <main className="tide-brief" ref={root}>
    <section className="tide-hero tide-reveal">
      <div className="tide-hero-orbit" aria-hidden="true"><span className="orbit-core">T</span><i /><i /><i /></div>
      <div className="tide-hero-copy"><span className="tide-kicker">TIDE BRIEF · GLOBAL NEWS CURRENT</span><h1>潮汐早报</h1><p>从世界、商业、科学与运动新闻中，收束一页值得今天打开的全球脉搏。</p></div>
      <div className="tide-hero-meta"><strong>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full', timeZone: 'Asia/Shanghai' }).format(new Date())}</strong><span>{news?.source?.captured_at ? `快照 ${formatTime(news.source.captured_at)}` : '等待今日快照'} · 每日 09:00 更新</span><span className="tide-integrity"><b /> {news ? `${news.quality.successful_source_count}/${news.quality.source_count} 板块已更新` : '正在校验来源'}</span></div>
    </section>
    {error && <p className="tide-state tide-error" role="alert">{error}</p>}
    <section className="tide-section tide-cover tide-reveal" id="tide-cover"><div className="tide-section-heading"><div><span>今日封面</span><h2>历史上的今天</h2></div><small>来自 Kagi News · {focus ? formatTime(focus.published_at) : '等待快照'}</small></div>{loading ? <div className="tide-state">正在读取今日快照…</div> : focus ? <FeatureStory item={focus} /> : <div className="tide-state">当前没有可验证的封面新闻。</div>}</section>
    <section className="tide-section tide-stream tide-reveal" id="tide-stream"><div className="tide-section-heading tide-stream-heading"><div><span>全球新闻流</span><h2>{sectionById[activeSection].short}</h2></div><small>{activeItems.length} 条 · 共 {sectionCount} 条可读快讯</small></div><nav className="tide-tabs" aria-label="潮汐早报新闻板块">{sectionMeta.map((section) => <button key={section.id} type="button" className={`tide-tab tide-tab-${section.tone} ${activeSection === section.id ? 'is-active' : ''}`} onClick={() => setActiveSection(section.id)} aria-pressed={activeSection === section.id}><span>{section.label}</span><b>{news?.sections[section.id]?.length || 0}</b></button>)}</nav>{loading ? <div className="tide-state">正在整理新闻流…</div> : activeItems.length ? <div className="tide-story-grid">{activeItems.map((item) => <StoryCard key={item.id} item={item} />)}</div> : <div className="tide-state">该板块当前没有可验证内容。</div>}</section>
    <section className="tide-section tide-index tide-reveal"><div className="tide-index-copy"><span>快照索引</span><h2>一份可追溯的今日新闻底稿</h2><p>每条新闻保留标题、摘要、正文、图片和原始入口；当某个板块暂时不可访问时，仅沿用该板块上一次成功快照，不覆盖其他板块。</p></div><div className="tide-index-facts"><div><strong>{sectionCount}</strong><span>新闻条目</span></div><div><strong>{news?.quality.image_count || 0}</strong><span>已提取图片</span></div><div><strong>{news?.quality.full_content_count || 0}</strong><span>含完整正文</span></div></div></section>
    <footer className="tide-sources tide-reveal"><span>来源</span>{sectionMeta.map((section) => <a key={section.id} href={`https://news.kagi.com/${section.id}/latest`} target="_blank" rel="noreferrer">Kagi · {section.label} ↗</a>)}</footer>
  </main>;
}

function FeatureStory({ item }: { item: TideNewsItem }) { return <article className="tide-feature-story">{item.image_url ? <img src={item.image_url} alt={item.image_alt || item.title} /> : <div className="tide-feature-art" aria-hidden="true"><span>{item.title.slice(0, 1)}</span><i /></div>}<div className="tide-feature-content"><div className="tide-news-meta"><span>{item.source}</span><time>{formatTime(item.published_at)}</time></div><h3>{item.title}</h3><p>{item.summary || item.content}</p><StoryLinks item={item} /></div></article>; }
function StoryCard({ item }: { item: TideNewsItem }) { return <article className="tide-story-card"><div className={`tide-story-image tide-story-image-${item.category}`}>{item.image_url ? <img src={item.image_url} alt={item.image_alt || item.title} loading="lazy" /> : <span aria-hidden="true">{categoryLabel(item.category).slice(0, 1)}</span>}</div><div className="tide-news-meta"><span>{item.source}</span><time>{formatTime(item.published_at)}</time></div><h3>{item.title}</h3><details><summary>展开摘要与来源</summary><p>{item.content || item.summary}</p><StoryLinks item={item} /></details></article>; }
function StoryLinks({ item }: { item: TideNewsItem }) { return <div className="tide-story-links">{item.url && <a href={item.url} target="_blank" rel="noreferrer">Kagi 原文 ↗</a>}{item.source_links?.slice(0, 2).map((link) => <a key={link} href={link} target="_blank" rel="noreferrer">来源链接 ↗</a>)}</div>; }
