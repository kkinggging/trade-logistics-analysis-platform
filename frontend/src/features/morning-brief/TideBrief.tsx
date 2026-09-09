import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { TideNewsItem, TideNewsSnapshot } from '@/core/store/types';
import './TideBrief.css';

gsap.registerPlugin(useGSAP);

const tideSources = [
  { label: '路透社', url: 'https://www.reuters.com/' },
  { label: '美联社', url: 'https://apnews.com/' },
  { label: '新华社', url: 'http://www.xinhuanet.com/' },
  { label: '半岛电视台', url: 'https://www.aljazeera.com/' },
  { label: '金融时报', url: 'https://www.ft.com/' },
  { label: '联合早报', url: 'https://www.zaobao.com.sg/' },
  { label: 'ShipXY · 霍尔木兹专题', url: 'https://www.shipxy.com/special/hormuz' },
];

interface HormuzSnapshot {
  schema_version: string;
  source: { name: string; dashboard_url: string; captured_at: string; coverage_end?: string; fetch_mode?: string };
  situation?: { title?: string; summary?: string; updated_at?: string };
  live?: { title?: string; summary?: string; image_url?: string; image_alt?: string };
  distribution?: { title?: string; summary?: string; image_url?: string; image_alt?: string };
  items?: Array<{ title: string; summary?: string; category?: string; updated_at?: string; source_url?: string }>;
}

function formatTime(value?: string) { return value ? value.replace('T', ' ').slice(0, 16) : '—'; }
function formatNewsTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatTime(value);
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Shanghai' }).format(date);
}
async function readSnapshot<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.json() as T;
  } catch {
    return null;
  }
}

export function TideBrief() {
  const root = useRef<HTMLDivElement>(null);
  const [news, setNews] = useState<TideNewsSnapshot | null>(null);
  const [hormuz, setHormuz] = useState<HormuzSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const focus = news?.sections.onthisday?.[0] || news?.sections.world?.[0] || null;
  const tradeNews = useMemo(() => news?.sections.business || [], [news]);
  const geopoliticsNews = useMemo(() => news?.sections.world || [], [news]);
  const keywords = useMemo(() => {
    const labels: Record<TideNewsItem['category'], string> = { onthisday: '历史上的今天', world: '世界局势', business: '商业与贸易', science: '科学技术', sports: '体育动态' };
    return Object.keys(news?.sections || {}).map((key) => labels[key as TideNewsItem['category']]).filter(Boolean);
  }, [news]);

  useEffect(() => {
    let active = true;
    Promise.all([
      readSnapshot<TideNewsSnapshot>(`${import.meta.env.BASE_URL}data/external_tide_news.json`),
      readSnapshot<HormuzSnapshot>(`${import.meta.env.BASE_URL}data/external_hormuz.json`),
    ]).then(([nextNews, nextHormuz]) => { if (active) { setNews(nextNews); setHormuz(nextHormuz); if (!nextNews && !nextHormuz) setError('潮汐早报数据暂不可用，将保留页面结构并等待下一次同步。'); } })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  useGSAP(() => {
    if (!root.current) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.fromTo('.tide-hero, .tide-section', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: .45, stagger: .06, ease: 'power3.out', clearProps: 'transform' });
    }, root);
    return () => media.revert();
  }, { scope: root, dependencies: [loading, news, hormuz], revertOnUpdate: true });

  return <main className="tide-brief" ref={root}>
    <section className="tide-hero tide-reveal">
      <div><span className="tide-kicker">TIDE BRIEF · GLOBAL COMMODITY TRADE</span><h1>潮汐早报</h1><p>把全球新闻、市场脉搏与航线态势收束成今天可读的一页。</p></div>
      <div className="tide-hero-meta"><strong>{new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full', timeZone: 'Asia/Shanghai' }).format(new Date())}</strong><span>每日 09:00 更新 · {news?.source?.captured_at ? `数据 ${formatTime(news.source.captured_at)}` : '等待同步'}</span></div>
    </section>
    {error && <p className="tide-state tide-error" role="alert">{error}</p>}
    <section className="tide-section tide-news tide-reveal" id="tide-news">
      <div className="tide-heading"><div><span>今日焦点</span><h2>全球影响力最大的消息</h2></div><small>{focus ? '来自历史上的今天 / 世界新闻快照' : '等待今日快照'}</small></div>
      {loading ? <div className="tide-state">正在读取新闻快照…</div> : focus ? <article className="tide-focus">{focus.image_url && <img src={focus.image_url} alt={focus.image_alt || focus.title} />}<div className="tide-news-meta"><span>{focus.source}</span><time>{formatNewsTime(focus.published_at)}</time></div><h3>{focus.title}</h3><p>{focus.summary || focus.content}</p><div className="tide-story-meta"><span>来源：{focus.source}</span>{focus.url && <a href={focus.url} target="_blank" rel="noreferrer">阅读原文 ↗</a>}</div></article> : <div className="tide-state">本期尚无可验证的焦点新闻，下一次同步后自动更新。</div>}
    </section>
    <section className="tide-section tide-market tide-reveal"><div className="tide-heading"><div><span>贸易与供应链脉动</span><h2>影响交易的变化</h2></div><small>{tradeNews.length} 条 · 商业新闻</small></div>{tradeNews.length ? <div className="tide-story-grid">{tradeNews.map((item) => <article className="tide-story" key={item.id}>{item.image_url && <img src={item.image_url} alt={item.image_alt || item.title} />}<div className="tide-news-meta"><span>{item.source}</span><time>{formatNewsTime(item.published_at)}</time></div><h3>{item.title}</h3><p>{item.summary || item.content}</p><strong className="tide-impact">信息分类：商业与贸易</strong><div className="tide-story-meta"><span>来源：{item.source}</span>{item.url && <a href={item.url} target="_blank" rel="noreferrer">原文 ↗</a>}</div></article>)}</div> : <div className="tide-state">暂无符合时间窗口的商业新闻。</div>}</section>
    <section className="tide-section tide-geopolitics tide-reveal"><div className="tide-heading"><div><span>地缘冲突全景</span><h2>世界局势与通道风险</h2></div><small>{geopoliticsNews.length} 条 · 世界新闻</small></div>{geopoliticsNews.length ? <div className="tide-story-grid">{geopoliticsNews.map((item) => <article className="tide-story" key={item.id}>{item.image_url && <img src={item.image_url} alt={item.image_alt || item.title} />}<div className="tide-news-meta"><span>{item.source}</span><time>{formatNewsTime(item.published_at)}</time></div><h3>{item.title}</h3><p>{item.summary || item.content}</p><strong className="tide-risk">关注方向：世界局势与供应链通道</strong><div className="tide-story-meta"><span>来源：{item.source}</span>{item.url && <a href={item.url} target="_blank" rel="noreferrer">原文 ↗</a>}</div></article>)}</div> : <div className="tide-state">暂无符合时间窗口的世界新闻。</div>}</section>
    <section className="tide-section tide-market tide-reveal"><div className="tide-heading"><div><span>今日关键词</span><h2>潮汐索引</h2></div><small>{news?.quality?.successful_source_count || 0}/{news?.quality?.source_count || 5} 个来源已成功更新</small></div><div className="tide-keywords">{(keywords.length ? keywords : ['世界局势', '商业与贸易', '科学技术']).map((keyword) => <span key={keyword}>{keyword}</span>)}</div></section>
    <section className="tide-section tide-hormuz tide-reveal" id="tide-hormuz"><div className="tide-heading"><div><span>霍尔木兹专题</span><h2>海峡态势与分布画像</h2></div><small>{hormuz?.source?.captured_at ? `抓取 ${formatTime(hormuz.source.captured_at)}` : '按潮汐早报任务更新'}</small></div>{hormuz ? <div className="hormuz-grid"><article><span>最新态势</span><h3>{hormuz.situation?.title || '态势摘要'}</h3><p>{hormuz.situation?.summary || '专题数据已接入，等待态势文本更新。'}</p></article><article>{hormuz.live?.image_url ? <img src={hormuz.live.image_url} alt={hormuz.live.image_alt || '霍尔木兹实时态势'} /> : <div className="hormuz-placeholder">实时态势图</div>}<strong>{hormuz.live?.title || '实时态势'}</strong><p>{hormuz.live?.summary || '保留专题页面实时态势信息入口。'}</p></article><article>{hormuz.distribution?.image_url ? <img src={hormuz.distribution.image_url} alt={hormuz.distribution.image_alt || '霍尔木兹分布画像'} /> : <div className="hormuz-placeholder">分布画像</div>}<strong>{hormuz.distribution?.title || '分布画像'}</strong><p>{hormuz.distribution?.summary || '保留专题页面分布画像信息入口。'}</p></article>{(hormuz.items || []).map((item) => <article className="hormuz-item" key={`${item.title}-${item.updated_at}`}><span>{item.category || '专题信息'}</span><strong>{item.title}</strong><p>{item.summary}</p>{item.source_url && <a href={item.source_url} target="_blank" rel="noreferrer">查看来源 ↗</a>}</article>)}</div> : <div className="tide-state">霍尔木兹专题快照尚未生成；数据源接入后此处展示态势、实时图与分布画像。</div>}</section>
    <footer className="tide-sources tide-reveal"><span>信息来源</span>{tideSources.map((source) => <a key={source.label} href={source.url} target="_blank" rel="noreferrer">{source.label} ↗</a>)}</footer>
  </main>;
}
