import { useEffect, useMemo, useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import Globe, { type GlobeInstance } from 'globe.gl';
import { CanvasTexture, MeshPhongMaterial } from 'three';
import { dataProvider } from '@/core/data/provider';
import type { InternalBusinessCustomerSnapshot, InternalBusinessSnapshot, SteelExportSnapshot } from '@/core/store/types';
import './GlobeLab.css';

gsap.registerPlugin(useGSAP);

type Coordinate = { lat: number; lng: number };
type GeoFeature = { type?: string; geometry: { type: string; coordinates: unknown }; properties?: { name?: string } };
type GlobeGeometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] };
type LabPolygon = GeoFeature & { country: string; key: string; center: Coordinate; partner?: LabPartner };
type LabPartner = { key: string; name: string; world: string; coordinate: Coordinate; internalVolume: number; internalShare: number; customsVolume: number; customsAmount: number; customerCount: number; color: string };

const COLORS = ['#4b91ff', '#3fc7ce', '#f5c15e', '#ff995e'];

const aliases: Record<string, string> = {
  vietnam: 'Vietnam', 'viet nam': 'Vietnam', '越南': 'Vietnam',
  korea: 'Korea', 'south korea': 'Korea', '韩国': 'Korea',
  'united states of america': 'United States', 'united states': 'United States', '美国': 'United States',
  'united kingdom': 'United Kingdom', '英国': 'United Kingdom', turkiye: 'Turkey', 'türkiye': 'Turkey', '土耳其': 'Turkey',
  uae: 'United Arab Emirates', 'united arab emirates': 'United Arab Emirates', '阿联酋': 'United Arab Emirates',
  russia: 'Russia', '俄罗斯': 'Russia', '中国': 'China', china: 'China',
  'czech republic': 'Czech Rep.', 'czech rep.': 'Czech Rep.', 'democratic republic of the congo': 'Dem. Rep. Congo',
  '沙特阿拉伯': 'Saudi Arabia', '墨西哥': 'Mexico', '西班牙': 'Spain', '德国': 'Germany', '印度': 'India', '摩洛哥': 'Morocco', '哥伦比亚': 'Colombia', '葡萄牙': 'Portugal', '泰国': 'Thailand', '日本': 'Japan', '秘鲁': 'Peru', '巴基斯坦': 'Pakistan', '科特迪瓦共和国': "Côte d'Ivoire", '意大利': 'Italy', '菲律宾': 'Philippines', '印度尼西亚': 'Indonesia', '马来西亚': 'Malaysia', '新加坡': 'Singapore', '巴西': 'Brazil', '智利': 'Chile', '埃及': 'Egypt', '南非': 'South Africa', '澳大利亚': 'Australia', '加拿大': 'Canada', '法国': 'France', '比利时': 'Belgium', '荷兰': 'Netherlands', '波兰': 'Poland', '瑞典': 'Sweden', '丹麦': 'Denmark', '挪威': 'Norway', '芬兰': 'Finland', '爱尔兰': 'Ireland', '奥地利': 'Austria', '瑞士': 'Switzerland', '希腊': 'Greece', '罗马尼亚': 'Romania', '乌克兰': 'Ukraine', '以色列': 'Israel', '伊拉克': 'Iraq', '伊朗': 'Iran', '卡塔尔': 'Qatar', '科威特': 'Kuwait', '阿曼': 'Oman', '约旦': 'Jordan', '孟加拉国': 'Bangladesh', '斯里兰卡': 'Sri Lanka', '缅甸': 'Myanmar', '柬埔寨': 'Cambodia', '尼日利亚': 'Nigeria', '肯尼亚': 'Kenya', '加纳': 'Ghana', '坦桑尼亚': 'Tanzania', '安哥拉': 'Angola', '莫桑比克': 'Mozambique', '阿尔及利亚': 'Algeria', '突尼斯': 'Tunisia', '利比亚': 'Libya', '塞尔维亚共和国': 'Serbia', '克罗地亚': 'Croatia', '斯洛文尼亚': 'Slovenia', '斯洛伐克': 'Slovakia', '捷克': 'Czech Rep.', '匈牙利': 'Hungary', '保加利亚': 'Bulgaria', '立陶宛': 'Lithuania', '爱沙尼亚': 'Estonia', '拉脱维亚': 'Latvia', '冰岛': 'Iceland', '新西兰': 'New Zealand',
  '科特迪瓦': "Côte d'Ivoire", '多米尼加共和国': 'Dominican Rep.', '多米尼加': 'Dominican Rep.', '阿尔巴尼亚': 'Albania', '巴拉圭': 'Paraguay', '孟加拉': 'Bangladesh', '危地马拉共和国': 'Guatemala', '危地马拉': 'Guatemala', '厄瓜多尔': 'Ecuador', '喀麦隆': 'Cameroon', '洪都拉斯': 'Honduras', '塞内加尔': 'Senegal', '吉布提': 'Djibouti', '哥斯达黎加': 'Costa Rica', '赞比亚': 'Zambia', '埃塞俄比亚': 'Ethiopia', '中国台湾': 'Taiwan', '布基纳法索': 'Burkina Faso', '玻利维亚': 'Bolivia', '乌拉圭': 'Uruguay', '黎巴嫩': 'Lebanon', '萨尔瓦多': 'El Salvador', '巴拿马': 'Panama', '乌兹别克': 'Uzbekistan', '贝宁': 'Benin', '委内瑞拉': 'Venezuela', '北马其顿': 'Macedonia',
};

// world.json 的英文简称与业务快照中的中文名都归一到同一套可比较主键。
// `Korea` 等地图简称不能直接按业务常用的 `South Korea` 作为另一国家处理。
const worldAliases: Record<string, string> = {
  korea: 'Korea', 'democratic peoples republic of korea': 'North Korea', 'dem rep korea': 'North Korea',
  'dominican rep': 'Dominican Rep.', 'cote divoire': "Côte d'Ivoire",
  macedonia: 'Macedonia', 'w sahara': 'Western Sahara', 'central african rep': 'Central African Republic',
  'bosnia and herz': 'Bosnia and Herzegovina', 'lao pdr': 'Laos', 's sudan': 'South Sudan',
  'st vin and gren': 'Saint Vincent and the Grenadines', 'timor leste': 'Timor-Leste',
};

const displayNames: Record<string, string> = {
  China: '中国', Korea: '韩国', 'United States': '美国', 'United Kingdom': '英国',
  Japan: '日本', India: '印度', Germany: '德国', France: '法国', Italy: '意大利',
  Spain: '西班牙', Portugal: '葡萄牙', Turkey: '土耳其', Russia: '俄罗斯',
  'Saudi Arabia': '沙特阿拉伯', Mexico: '墨西哥', Brazil: '巴西', Canada: '加拿大',
  Australia: '澳大利亚', Thailand: '泰国', Vietnam: '越南', Indonesia: '印度尼西亚',
  Malaysia: '马来西亚', Singapore: '新加坡', Philippines: '菲律宾', Pakistan: '巴基斯坦',
  Bangladesh: '孟加拉国', 'United Arab Emirates': '阿联酋', Egypt: '埃及',
  'South Africa': '南非', Morocco: '摩洛哥', Belgium: '比利时', Netherlands: '荷兰',
  Poland: '波兰', Greece: '希腊', Switzerland: '瑞士', Austria: '奥地利',
  Sweden: '瑞典', Norway: '挪威', Denmark: '丹麦', Finland: '芬兰', Ireland: '爱尔兰',
};

function clean(value: string | null | undefined) { return String(value || '').trim().replace(/[（）()]/g, '').replace(/\s+/g, ' '); }
function keyOf(value: string | null | undefined) {
  const original = clean(value);
  const label = original.toLowerCase().replace(/[.'’\-]/g, '').replace(/\s+/g, ' ');
  return aliases[label] || worldAliases[label] || aliases[original.toLowerCase()] || original;
}
function formatQuantity(value: number) { if (value >= 10000) return `${(value / 10000).toFixed(1)} 万吨`; return `${Math.round(value).toLocaleString('zh-CN')} 吨`; }
function formatPct(value: number) { return Number.isFinite(value) ? `${value.toFixed(2)}%` : '—'; }
function colorFor(value: number, maximum: number) { const ratio = Math.sqrt(Math.max(0, Math.min(1, value / Math.max(maximum, 1)))); return COLORS[Math.min(COLORS.length - 1, Math.floor(ratio * COLORS.length))]; }

function centroid(feature: GeoFeature): Coordinate {
  const points: number[][] = [];
  const collect = (value: unknown): void => { if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') points.push(value as number[]); else if (Array.isArray(value)) value.forEach(collect); };
  collect(feature.geometry.coordinates);
  if (!points.length) return { lat: 0, lng: 0 };
  return { lat: points.reduce((sum, point) => sum + point[1], 0) / points.length, lng: points.reduce((sum, point) => sum + point[0], 0) / points.length };
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(value[0])
    && Number.isFinite(value[1]);
}

function cleanRing(value: unknown): number[][] | null {
  if (!Array.isArray(value)) return null;
  const points = value.filter(isCoordinate).map(([lng, lat]) => [lng, lat]);
  if (points.length < 3) return null;
  const deduped = points.filter((point, index) => index === 0 || point[0] !== points[index - 1][0] || point[1] !== points[index - 1][1]);
  if (deduped.length < 3) return null;
  const first = deduped[0];
  const last = deduped[deduped.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) deduped.push([...first]);
  return deduped.length >= 4 ? deduped : null;
}

function cleanGeometry(feature: GeoFeature): GeoFeature | null {
  if (feature.geometry.type === 'Polygon') {
    const rings = Array.isArray(feature.geometry.coordinates)
      ? (feature.geometry.coordinates as unknown[]).map(cleanRing).filter((ring): ring is number[][] => Boolean(ring))
      : [];
    return rings.length ? { ...feature, geometry: { ...feature.geometry, coordinates: rings } } : null;
  }
  if (feature.geometry.type === 'MultiPolygon') {
    const polygons = Array.isArray(feature.geometry.coordinates)
      ? (feature.geometry.coordinates as unknown[]).map((polygon) => Array.isArray(polygon)
        ? polygon.map(cleanRing).filter((ring): ring is number[][] => Boolean(ring))
        : []).filter((polygon): polygon is number[][][] => polygon.length > 0)
      : [];
    return polygons.length ? { ...feature, geometry: { ...feature.geometry, coordinates: polygons } } : null;
  }
  return null;
}

function baseTexture(features: GeoFeature[]) {
  const canvas = document.createElement('canvas'); canvas.width = 2048; canvas.height = 1024;
  const context = canvas.getContext('2d'); if (!context) return null;
  context.fillStyle = '#061725'; context.fillRect(0, 0, canvas.width, canvas.height);
  const ring = (value: unknown) => { if (!Array.isArray(value)) return; const points = value.filter((point): point is number[] => Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number'); points.forEach(([lng, lat], index) => { const x = (lng + 180) / 360 * canvas.width; const y = (90 - lat) / 180 * canvas.height; if (index === 0) context.moveTo(x, y); else context.lineTo(x, y); }); context.closePath(); };
  features.forEach((feature) => { context.beginPath(); const coordinates = feature.geometry.coordinates; if (feature.geometry.type === 'Polygon' && Array.isArray(coordinates)) coordinates.forEach(ring); if (feature.geometry.type === 'MultiPolygon' && Array.isArray(coordinates)) coordinates.forEach((polygon) => Array.isArray(polygon) && polygon.forEach(ring)); context.fillStyle = '#0d3042'; context.fill(); context.strokeStyle = 'rgba(125, 215, 222, .18)'; context.lineWidth = .65; context.stroke(); });
  return new CanvasTexture(canvas);
}

function preparePartners(snapshot: SteelExportSnapshot | null, internal: InternalBusinessSnapshot | null, customers: InternalBusinessCustomerSnapshot | null): LabPartner[] {
  const totalInternal = internal?.summary.positive_volume_t || 1;
  const maxInternal = Math.max(...(internal?.by_destination || []).map((item) => item.volume_t), 1);
  const customerIndex = new Map<string, number>(); Object.entries(customers?.by_destination || {}).forEach(([label, item]) => customerIndex.set(keyOf(label), item.customer_count));
  const grouped = new Map<string, { world: string; quantity: number; amount: number }>();
  (snapshot?.partner || snapshot?.default_view?.partner || []).forEach((row) => {
    // 海关快照同时保留中文 label 和英文 world；两者都建索引，避免单一字段格式变化导致对照值显示为 0。
    const keys = [...new Set([keyOf(row.label), keyOf(row.world), clean(row.label), clean(row.world)].filter(Boolean))];
    const primary = keyOf(row.world || row.label);
    const previous = grouped.get(primary) || { world: row.world || row.label || primary, quantity: 0, amount: 0 };
    previous.quantity += row.qty_t;
    previous.amount += row.amount_usd;
    keys.forEach((key) => grouped.set(key, previous));
  });
  return (internal?.by_destination || []).map((row) => {
    const key = keyOf(row.label); const customs = grouped.get(key); return { key, name: row.label, world: customs?.world || key, coordinate: { lat: 0, lng: 0 }, internalVolume: row.volume_t, internalShare: row.share_pct || row.volume_t / totalInternal * 100, customsVolume: customs?.quantity || 0, customsAmount: customs?.amount || 0, customerCount: customerIndex.get(key) || 0, color: colorFor(row.volume_t, maxInternal) };
  });
}

function uniqueCustomerTotal(customers: InternalBusinessCustomerSnapshot | null, keys: Set<string>) {
  const names = new Set<string>(); let volume = 0;
  Object.entries(customers?.by_destination || {}).forEach(([label, row]) => { if (!keys.has(keyOf(label))) return; row.customers.forEach((customer) => { if (!names.has(customer.name)) { names.add(customer.name); volume += customer.volume_t; } }); });
  return { count: names.size, volume };
}

export function GlobeLab() {
  const shellRef = useRef<HTMLDivElement>(null); const globeRef = useRef<HTMLDivElement>(null); const globeInstanceRef = useRef<GlobeInstance | null>(null); const selectedRef = useRef<Set<string>>(new Set());
  const [snapshot, setSnapshot] = useState<SteelExportSnapshot | null>(null); const [internal, setInternal] = useState<InternalBusinessSnapshot | null>(null); const [customers, setCustomers] = useState<InternalBusinessCustomerSnapshot | null>(null); const [world, setWorld] = useState<GeoFeature[]>([]); const [selectedKeys, setSelectedKeys] = useState<string[]>([]); const [hoveredKey, setHoveredKey] = useState<string | null>(null); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(true); const [error, setError] = useState<string | null>(null);
  useGSAP(() => { gsap.fromTo('.globe-lab__hero', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: .55, ease: 'power3.out' }); gsap.fromTo('.globe-lab__workspace', { autoAlpha: 0, scale: .985 }, { autoAlpha: 1, scale: 1, duration: .8, delay: .1, ease: 'power3.out' }); }, { scope: shellRef });
  useEffect(() => { let active = true; Promise.all([dataProvider.getSteelExportSnapshot(), dataProvider.getInternalBusinessSnapshot(), dataProvider.getInternalBusinessCustomerSnapshot(), fetch(`${import.meta.env.BASE_URL}data/world.json`).then((response) => response.ok ? response.json() as Promise<{ features?: GeoFeature[] }> : Promise.reject(new Error('世界边界数据加载失败')))]).then(([nextSnapshot, nextInternal, nextCustomers, nextWorld]) => { if (!active) return; setSnapshot(nextSnapshot); setInternal(nextInternal); setCustomers(nextCustomers); setWorld(nextWorld.features || []); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : '实验地球数据加载失败'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const partners = useMemo(() => preparePartners(snapshot, internal, customers), [snapshot, internal, customers]); const totalInternal = internal?.summary.positive_volume_t || 1; const totalCustoms = snapshot?.summary.total_qty_t || 1; const byKey = useMemo(() => new Map(partners.map((partner) => [partner.key, partner])), [partners]);
  const polygons = useMemo<LabPolygon[]>(() => world
    .map(cleanGeometry)
    .filter((feature): feature is GeoFeature => Boolean(feature && clean(feature.properties?.name)))
    .map((feature) => { const country = clean(feature.properties?.name); const key = keyOf(country); return { ...feature, country, key, center: centroid(feature), partner: byKey.get(key) }; }), [world, byKey]);
  const ranked = useMemo(() => [...partners].sort((a, b) => b.internalVolume - a.internalVolume), [partners]);
  const selected = useMemo(() => polygons.filter((polygon) => selectedKeys.includes(polygon.key)), [polygons, selectedKeys]);
  const selectedPartners = useMemo(() => selected.map((polygon) => polygon.partner).filter((partner): partner is LabPartner => Boolean(partner)), [selected]);
  const selectedInternal = selectedPartners.reduce((sum, item) => sum + item.internalVolume, 0); const selectedCustoms = selectedPartners.reduce((sum, item) => sum + item.customsVolume, 0); const selectedCustomers = useMemo(() => uniqueCustomerTotal(customers, new Set(selectedKeys)), [customers, selectedKeys]);
  const countryOptions = useMemo(() => polygons.filter((polygon) => polygon.country !== '未知国家' && polygon.key).sort((a, b) => {
    const volumeDelta = (b.partner?.internalVolume || 0) - (a.partner?.internalVolume || 0);
    return volumeDelta || (displayNames[a.key] || a.country).localeCompare(displayNames[b.key] || b.country);
  }), [polygons]);
  const visibleRanks = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized ? countryOptions.filter((polygon) => `${polygon.country} ${polygon.key} ${displayNames[polygon.key] || ''} ${polygon.partner?.name || ''} ${polygon.partner?.world || ''}`.toLowerCase().includes(normalized)) : countryOptions;
    return normalized ? filtered : filtered.slice(0, 40);
  }, [query, countryOptions]);
  useEffect(() => { if (!globeRef.current || loading || error || !polygons.length) return; let globe: GlobeInstance; try { globe = new Globe(globeRef.current, { waitForGlobeReady: true, animateIn: true, rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' } }); } catch { setError('当前浏览器不支持 WebGL，实验地球暂不可用。'); return; } globeInstanceRef.current = globe; const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; const texture = baseTexture(polygons); const geometryAccessor = ((item: object) => { const geometry = (item as LabPolygon).geometry; return { type: geometry.type as GlobeGeometry['type'], coordinates: geometry.coordinates as GlobeGeometry['coordinates'] }; }) as unknown as (item: object) => { type: string; coordinates: number[] }; globe.backgroundColor('rgba(0,0,0,0)').showAtmosphere(true).atmosphereColor('#5eead4').atmosphereAltitude(.12).showGraticules(true).globeMaterial(new MeshPhongMaterial({ map: texture || undefined, color: '#fff', emissive: '#06121f', emissiveIntensity: .35, shininess: 28 })).polygonsData(polygons).polygonGeoJsonGeometry(geometryAccessor).polygonsTransitionDuration(reducedMotion ? 0 : 520).polygonCapColor((item: object) => { const polygon = item as LabPolygon; if (polygon.key === hoveredKey) return '#fff0a8'; if (selectedRef.current.has(polygon.key)) return '#ffb168'; return polygon.partner?.color ? `${polygon.partner.color}aa` : '#123a4b'; }).polygonSideColor(() => 'rgba(48, 155, 165, .18)').polygonStrokeColor((item: object) => (item as LabPolygon).key === hoveredKey || selectedRef.current.has((item as LabPolygon).key) ? '#fff5c7' : 'rgba(118, 221, 224, .42)').polygonAltitude((item: object) => (item as LabPolygon).key === hoveredKey ? .16 : selectedRef.current.has((item as LabPolygon).key) ? .10 : .012).polygonLabel((item: object) => { const polygon = item as LabPolygon; const partner = polygon.partner; return `<div class="globe-lab-tooltip"><strong>${displayNames[polygon.key] || polygon.country}</strong><span>${partner ? `内部出口 ${formatQuantity(partner.internalVolume)} · ${formatPct(partner.internalShare)}` : '当前暂无内部业务匹配 · 可继续选择'}</span></div>`; }).onPolygonHover((item: object | null) => setHoveredKey(item ? (item as LabPolygon).key : null)).onPolygonClick((item: object | null) => { if (item) togglePolygon(item as LabPolygon); }).arcsData([]).pathsData([]).ringsData([]).ringLat('lat').ringLng('lng').ringColor(() => ['rgba(255, 240, 168, .9)', 'rgba(255, 164, 93, .08)']).ringAltitude(.035).ringMaxRadius(3.2).ringPropagationSpeed(1.15).ringRepeatPeriod(1500).pointOfView({ lat: 18, lng: 105, altitude: 2.18 }); const controls = globe.controls(); controls.enableDamping = true; controls.dampingFactor = .08; controls.autoRotate = false; let idleTimer: number | null = null; const schedule = () => { if (reducedMotion) return; if (idleTimer) window.clearTimeout(idleTimer); idleTimer = window.setTimeout(() => { controls.autoRotate = true; }, 45000); }; const pause = () => { controls.autoRotate = false; schedule(); }; controls.addEventListener('start', pause); schedule(); const resizeObserver = new ResizeObserver(() => globe.width(globeRef.current?.clientWidth || 1200).height(globeRef.current?.clientHeight || 720)); resizeObserver.observe(globeRef.current); return () => { controls.removeEventListener('start', pause); resizeObserver.disconnect(); if (idleTimer) window.clearTimeout(idleTimer); texture?.dispose(); globe._destructor(); globeInstanceRef.current = null; }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, error, polygons]);
  useEffect(() => { const globe = globeInstanceRef.current; if (!globe) return; globe.polygonCapColor((item: object) => { const polygon = item as LabPolygon; if (polygon.key === hoveredKey) return '#fff0a8'; if (selectedRef.current.has(polygon.key)) return '#ffb168'; return polygon.partner?.color ? `${polygon.partner.color}aa` : '#123a4b'; }).polygonStrokeColor((item: object) => (item as LabPolygon).key === hoveredKey || selectedRef.current.has((item as LabPolygon).key) ? '#fff5c7' : 'rgba(118, 221, 224, .42)').polygonAltitude((item: object) => (item as LabPolygon).key === hoveredKey ? .16 : selectedRef.current.has((item as LabPolygon).key) ? .10 : .012).ringsData(polygons.filter((polygon) => polygon.key === hoveredKey || selectedRef.current.has(polygon.key)).map((polygon) => ({ lat: polygon.center.lat, lng: polygon.center.lng }))); }, [hoveredKey, selectedKeys, polygons]);
  function focus(polygon: LabPolygon) { globeInstanceRef.current?.pointOfView({ lat: polygon.center.lat, lng: polygon.center.lng, altitude: 1.62 }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 950); }
  function toggleKey(key: string, polygon?: LabPolygon) { const next = new Set(selectedRef.current); if (next.has(key)) next.delete(key); else next.add(key); selectedRef.current = next; setSelectedKeys([...next]); if (polygon) focus(polygon); else { const target = polygons.find((item) => item.key === key); if (target) focus(target); } }
  function togglePolygon(polygon: LabPolygon) { toggleKey(polygon.key, polygon); }
  function selectCountry(polygon: LabPolygon) { toggleKey(polygon.key, polygon); }
  function resetSelection() { selectedRef.current = new Set(); setSelectedKeys([]); globeInstanceRef.current?.pointOfView({ lat: 18, lng: 105, altitude: 2.18 }, 700); }
  const emphasized = hoveredKey ? byKey.get(hoveredKey) : null; const selectedCount = selectedKeys.length;
  return <div className="globe-lab" ref={shellRef}><header className="globe-lab__hero"><div><span className="globe-lab__eyebrow">ISOLATED SANDBOX / GLOBE LAB</span><h1>全球出口地球 · 实验沙箱</h1><p>这里是独立于现有 3D 地球的复制实验实例：全球边界可识别，国家可检索、多选，镜头会自动聚焦，统计只读现有业务快照。</p></div><div className="globe-lab__snapshot"><b>实验节点 LAB-01</b><span>{polygons.length || '—'} 个可识别边界 · {partners.length || '—'} 个业务目的国</span><small>全球国家均可检索 · 原 `/globe` 模块保持不变</small></div></header><section className="globe-lab__workspace"><div className="globe-lab__stage"><div ref={globeRef} className="globe-lab__canvas" aria-label="可交互国家边界实验地球" role="img" />{loading && <div className="globe-lab__state">正在复制地球实验实例…</div>}{error && <div className="globe-lab__state is-error">{error}</div>}<div className="globe-lab__stage-title"><span>01</span><strong>全球国家边界交互层</strong><small>{polygons.length} 个可交互边界 · 悬停上浮 · 点击多选 · 镜头聚焦</small></div><div className="globe-lab__legend"><span><i className="lab-legend__country" />业务国家</span><span><i className="lab-legend__empty" />无业务快照仍可选</span><span><i className="lab-legend__hover" />悬停 / 选中脉冲</span></div></div><aside className="globe-lab__rail"><div className="globe-lab__rail-head"><div><span>02 / GLOBAL COUNTRY INDEX</span><h2>国家选择器</h2></div><button type="button" onClick={resetSelection} disabled={!selectedKeys.length}>清空</button></div><label className="globe-lab__search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索全球 ${countryOptions.length || '—'} 个国家`} /></label><div className="globe-lab__hint">全量国家均可搜索、悬停识别与点击聚焦；有业务国家显示统计，无业务国家保留交互。</div><div className="globe-lab__rank-list">{visibleRanks.map((polygon, index) => { const partner = polygon.partner; const displayName = displayNames[polygon.key] || partner?.name || polygon.country; return <button type="button" className={`globe-lab__rank ${selectedKeys.includes(polygon.key) ? 'is-selected' : ''} ${partner ? '' : 'is-empty'}`} key={`${polygon.key}-${index}`} onClick={() => selectCountry(polygon)} onMouseEnter={() => setHoveredKey(polygon.key)} onMouseLeave={() => setHoveredKey(null)} onFocus={() => setHoveredKey(polygon.key)} onBlur={() => setHoveredKey(null)}><b>{String(index + 1).padStart(3, '0')}</b><span><strong>{displayName}</strong><small>{partner ? `内部 ${formatPct(partner.internalShare)} · ${formatQuantity(partner.internalVolume)}` : '暂无内部业务匹配 · 可选中聚焦'}</small></span><i style={{ width: partner ? `${Math.max(6, partner.internalShare / Math.max(ranked[0]?.internalShare || 1, 1) * 100)}%` : '6%' }} /></button>; })}</div><div className="globe-lab__rail-foot">可检索 {countryOptions.length} 个国家 · 当前显示 {visibleRanks.length} 个 · 已选 {selectedCount} 个</div></aside></section><section className="globe-lab__summary" aria-live="polite"><div className="globe-lab__summary-title"><span>03 / SELECTION AGGREGATE</span><h2>{selectedCount ? `已选 ${selectedCount} 个国家` : '选择国家开始统计'}</h2><p>{emphasized ? `当前悬停：${displayNames[hoveredKey || ''] || emphasized.name}` : '统计分母始终明确：全球总量与选中集合分别展示。'}</p></div><div className="globe-lab__metrics"><div><small>内部出口合计</small><strong>{formatQuantity(selectedInternal)}</strong><span>占全球 {formatPct(selectedInternal / totalInternal * 100)}</span></div><div><small>海关出口合计</small><strong>{formatQuantity(selectedCustoms)}</strong><span>占全球 {formatPct(selectedCustoms / totalCustoms * 100)}</span></div><div><small>去重客户数</small><strong>{selectedCustomers.count} 家</strong><span>客户货量 {formatQuantity(selectedCustomers.volume)}</span></div><div><small>选择集合内部占比</small><strong>{selectedInternal ? formatPct(selectedInternal / Math.max(selectedInternal, 1) * 100) : '—'}</strong><span>有业务选中项内：100%</span></div></div></section><footer className="globe-lab__acceptance"><span>实验验收状态：全球检索与上浮动效验收中</span><span>原始地球：只读复用数据，不共享 WebGL 实例</span></footer></div>;
}

export default GlobeLab;
