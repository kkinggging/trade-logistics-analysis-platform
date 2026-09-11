import { useMemo, useState } from 'react';
import type { TideHistoryData, TideHistoryEvent, TideHistoryPerson, TideNewsItem } from '@/core/store/types';
import './HistoryTimeline.css';

function imageUrl(value: string | null) {
  return value && !/^https?:\/\//i.test(value) ? `${import.meta.env.BASE_URL}data/${value}` : value;
}

function hasEditorialImage(item: { image_url: string | null; image_source_url?: string | null }) {
  return Boolean(item.image_url && !/kite-banner|placeholder|default|favicon/i.test(`${item.image_url} ${item.image_source_url || ''}`));
}

function toReaderItem(record: TideHistoryEvent | TideHistoryPerson): TideNewsItem {
  const isPerson = 'name' in record;
  const title = isPerson ? record.name : record.title;
  const titleZh = isPerson ? record.name_zh : record.title_zh;
  const detailZh = record.detail_zh;
  return {
    id: `history-${record.id}`, title, title_zh: titleZh || null,
    summary: record.detail, summary_zh: detailZh || null,
    content: record.detail, content_zh: detailZh || null,
    translation_status: detailZh ? 'translated' : 'unavailable',
    image_url: record.image_url, image_source_url: record.image_source_url || null,
    image_alt: record.image_alt, location: null, category: 'onthisday',
    source: '历史上的今天', source_id: 'tide-global-news', url: record.url,
    source_links: [], published_at: new Date().toISOString(), published_at_ms: Date.now(), author: null,
  };
}

function eventTitle(event: TideHistoryEvent) { return event.title_zh || event.title; }
function eventDetail(event: TideHistoryEvent) { return event.detail_zh || event.detail; }
function personName(person: TideHistoryPerson) { return person.name_zh || person.name; }
function personDetail(person: TideHistoryPerson) { return person.detail_zh || person.detail; }

function FallbackHistory({ items, onOpen }: { items: TideNewsItem[]; onOpen: (item: TideNewsItem) => void }) {
  return <div className="tide-history-fallback">{items.map((item) => <button key={item.id} type="button" onClick={() => onOpen(item)}><span>{item.title.match(/^(\d{1,4})\s*\//)?.[1] || '—'}</span><strong>{item.title.replace(/^\d{1,4}\s*\/\s*\d{1,2}\s*:\s*/, '')}</strong><em>当前快照只有源站摘要，等待历史页数据</em></button>)}</div>;
}

export function HistoryTimeline({ data, fallbackItems, onOpen }: { data?: TideHistoryData; fallbackItems: TideNewsItem[]; onOpen: (item: TideNewsItem) => void }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [personOffset, setPersonOffset] = useState(0);
  const events = data?.events || [];
  const people = data?.people || [];
  const visiblePeople = useMemo(() => people.length <= 3 ? people : people.slice(personOffset, personOffset + 3), [people, personOffset]);

  if (!events.length && !people.length) {
    if (!fallbackItems.length) return null;
    return <section className="tide-history" aria-labelledby="tide-history-title"><HistoryHeading eventCount={0} personCount={0} imageCount={0} /><FallbackHistory items={fallbackItems} onOpen={onOpen} /></section>;
  }

  const imageCount = [...events, ...people].filter(hasEditorialImage).length;
  return <section className="tide-history" aria-labelledby="tide-history-title">
    <HistoryHeading eventCount={events.length} personCount={people.length} imageCount={imageCount} />
    <div className="tide-history-section"><h4>大事记</h4><div className="tide-history-events">
      {events.map((event) => { const hovered = hoveredId === `event-${event.id}`; return <article key={event.id} className={`tide-history-event ${hovered ? 'is-hovered' : ''}`} onMouseEnter={() => setHoveredId(`event-${event.id}`)} onMouseLeave={() => setHoveredId(null)}>
        <time>{event.year || '—'}</time><div className="tide-history-event-copy"><button type="button" className="tide-history-event-link" onFocus={() => setHoveredId(`event-${event.id}`)} onClick={() => onOpen(toReaderItem(event))} aria-expanded={hovered}>{eventTitle(event)}</button><p>{eventDetail(event)}</p>{event.links?.length ? <div className="tide-history-inline-links">{event.links.slice(0, 3).map((link) => <button key={link.id} type="button" onClick={() => setHoveredId(`link-${link.id}`)}>{link.label}</button>)}</div> : null}</div>
        <HistoryPopover visible={hovered} title={eventTitle(event)} detail={eventDetail(event)} image={event} onOpen={() => onOpen(toReaderItem(event))} />
      </article>; })}
    </div></div>
    <div className="tide-history-section tide-history-people-section"><div className="tide-history-subheading"><h4>人物</h4>{people.length > 3 && <div className="tide-history-pager"><button type="button" onClick={() => setPersonOffset(Math.max(0, personOffset - 1))} disabled={personOffset === 0} aria-label="上一组人物">‹</button><span>{Math.min(personOffset + 3, people.length)} / {people.length}</span><button type="button" onClick={() => setPersonOffset(Math.min(people.length - 3, personOffset + 1))} disabled={personOffset >= people.length - 3} aria-label="下一组人物">›</button></div>}</div>
      <div className="tide-history-people">{visiblePeople.map((person) => { const hovered = hoveredId === `person-${person.id}`; return <article key={person.id} className={`tide-history-person ${hovered ? 'is-hovered' : ''}`} onMouseEnter={() => setHoveredId(`person-${person.id}`)} onMouseLeave={() => setHoveredId(null)}><button type="button" className="tide-history-person-trigger" onFocus={() => setHoveredId(`person-${person.id}`)} onClick={() => onOpen(toReaderItem(person))} aria-expanded={hovered}><time>{person.year || '—'}</time><strong>{personName(person)}</strong><span>{personDetail(person)}</span></button><HistoryPopover visible={hovered} title={personName(person)} detail={personDetail(person)} image={person} onOpen={() => onOpen(toReaderItem(person))} /></article>; })}</div>
    </div>
  </section>;
}

function HistoryHeading({ eventCount, personCount, imageCount }: { eventCount: number; personCount: number; imageCount: number }) {
  return <div className="tide-history-heading"><div><span>史鉴</span><h3 id="tide-history-title">今天，历史留下的回声</h3></div><small>{eventCount} 条大事记 · {personCount} 位人物 · {imageCount} 张可验证图片 · 悬停或点击查看详情</small></div>;
}

function HistoryPopover({ visible, title, detail, image, onOpen }: { visible: boolean; title: string; detail: string; image: { image_url: string | null; image_source_url?: string | null; image_alt: string | null }; onOpen: () => void }) {
  return <div className={`tide-history-popover ${visible ? 'is-visible' : ''}`} aria-hidden={!visible}><strong>{title}</strong>{hasEditorialImage(image) ? <img src={imageUrl(image.image_url) || undefined} alt={image.image_alt || title} loading="lazy" /> : <div className="tide-history-no-image"><span aria-hidden="true">—</span><small>源站未提供可验证图片</small></div>}<p>{detail}</p><button type="button" tabIndex={visible ? 0 : -1} onClick={onOpen}>全屏阅读 ↗</button></div>;
}
