import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { SHIPPING_PORT_BY_EN } from '@/core/data/shippingPorts';
import './DynamicGlobe.css';

export type GlobePoint =
  | readonly [latitude: number, longitude: number]
  | { lat: number; lng?: number; lon?: number };
export type GlobeRouteStatus = 'recommended' | 'available' | 'limited' | 'warning' | string;
export interface DynamicGlobeRoute { id: string; origin: string; destination: string; originPoint?: GlobePoint; destinationPoint?: GlobePoint; status: GlobeRouteStatus; score: number; }
export interface DynamicGlobeProps { routes: DynamicGlobeRoute[]; className?: string; title?: string; centerLongitude?: number; }
interface Coordinates { lat: number; lng: number; }
interface PreparedRoute extends DynamicGlobeRoute { originCoordinates?: Coordinates; destinationCoordinates?: Coordinates; }

const ROUTE_COLORS = ['#4dd7d0', '#ffb45c', '#9d91ff'] as const;

function normaliseLongitude(longitude: number): number { return ((longitude + 540) % 360) - 180; }
function coordinatesFromPoint(point: GlobePoint | undefined): Coordinates | undefined {
  if (!point) return undefined;
  const tuple = point as readonly [number, number];
  const objectPoint = point as { lat: number; lng?: number; lon?: number };
  const lat = Array.isArray(point) ? tuple[0] : objectPoint.lat;
  const lng = Array.isArray(point) ? tuple[1] : objectPoint.lng ?? objectPoint.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90) return undefined;
  return { lat, lng: normaliseLongitude(lng as number) };
}
function coordinatesFromPort(port: string): Coordinates | undefined {
  const definition = SHIPPING_PORT_BY_EN[port.trim()];
  return definition ? { lat: definition.latitude, lng: definition.longitude } : undefined;
}
function resolveCoordinates(port: string, point: GlobePoint | undefined): Coordinates | undefined { return coordinatesFromPoint(point) ?? coordinatesFromPort(port); }
function portDescription(port: string): string {
  const definition = SHIPPING_PORT_BY_EN[port.trim()];
  return definition ? `${definition.name_cn} · ${definition.name_en} · ${definition.country_cn}` : port;
}
function statusLabel(status: GlobeRouteStatus): string {
  if (status === 'recommended') return '推荐';
  if (status === 'available') return '可用';
  if (status === 'limited') return '有限';
  if (status === 'warning') return '关注';
  return status || '待确认';
}
function statusClass(status: GlobeRouteStatus): string {
  if (status === 'recommended' || status === 'available') return 'is-positive';
  if (status === 'warning') return 'is-warning';
  if (status === 'limited') return 'is-limited';
  return 'is-neutral';
}
function formatScore(score: number): string { return Number.isFinite(score) ? score.toFixed(1) : '—'; }

export function DynamicGlobe({ routes, className = '', title = '港口地图', centerLongitude = 80 }: DynamicGlobeProps) {
  const rawId = useId();
  const chartRef = useRef<HTMLDivElement>(null);
  const [worldReady, setWorldReady] = useState(false);
  const [worldError, setWorldError] = useState(false);
  const preparedRoutes = useMemo<PreparedRoute[]>(() => routes.filter(Boolean).slice(0, 3).map((route) => ({ ...route, originCoordinates: resolveCoordinates(route.origin, route.originPoint), destinationCoordinates: resolveCoordinates(route.destination, route.destinationPoint) })), [routes]);
  const drawableRoutes = preparedRoutes.filter((route) => route.originCoordinates && route.destinationCoordinates);
  const unavailableCount = preparedRoutes.length - drawableRoutes.length;
  const chartId = rawId.replace(/:/g, '');

  useEffect(() => {
    let active = true;
    fetch(`${import.meta.env.BASE_URL}data/world.json`).then((response) => {
      if (!response.ok) throw new Error(`world.json: ${response.status}`);
      return response.json();
    }).then((worldData) => {
      if (!active) return;
      echarts.registerMap('shipping-world', worldData);
      setWorldReady(true);
    }).catch(() => { if (active) setWorldError(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !worldReady) return;
    const chart = echarts.getInstanceByDom(chartRef.current) || echarts.init(chartRef.current);
    const routeLines = drawableRoutes.map((route, index) => ({ name: `${route.origin} → ${route.destination}`, coords: [[route.originCoordinates!.lng, route.originCoordinates!.lat], [route.destinationCoordinates!.lng, route.destinationCoordinates!.lat]], route, itemStyle: { color: ROUTE_COLORS[index] } }));
    const portPoints = drawableRoutes.flatMap((route, index) => [
      { name: route.origin, value: [route.originCoordinates!.lng, route.originCoordinates!.lat], port: route.origin, routeId: route.id, endpoint: '起运港', color: ROUTE_COLORS[index] },
      { name: route.destination, value: [route.destinationCoordinates!.lng, route.destinationCoordinates!.lat], port: route.destination, routeId: route.id, endpoint: '目的港', color: ROUTE_COLORS[index] },
    ]);
    const css = getComputedStyle(document.documentElement);
    const textColor = css.getPropertyValue('--text-primary').trim() || '#f4f3f8';
    const gridColor = css.getPropertyValue('--globe-map-border').trim() || css.getPropertyValue('--border-subtle').trim() || 'rgba(255,255,255,.12)';
    const landColor = css.getPropertyValue('--globe-land').trim() || '#274866';
    chart.setOption({
      animationDuration: 750,
      animationDurationUpdate: 500,
      tooltip: { trigger: 'item', confine: true, backgroundColor: 'rgba(12, 24, 38, .94)', borderColor: gridColor, textStyle: { color: '#f7fbff', fontSize: 13 }, formatter: (params: { seriesType?: string; data?: { route?: DynamicGlobeRoute; port?: string; endpoint?: string; value?: number[] }; name?: string }) => {
        if (params.seriesType === 'lines' && params.data?.route) { const route = params.data.route; return `<strong>${portDescription(route.origin)} → ${portDescription(route.destination)}</strong><br/>状态：${statusLabel(route.status)}<br/>平台计算分：${formatScore(route.score)}<br/><span style="color:#aab8c7">港口间路线示意，不代表真实船舶航迹</span>`; }
        if (params.data?.port) { const coordinate = params.data.value || []; return `<strong>${portDescription(params.data.port)}</strong><br/>${params.data.endpoint}<br/>坐标：${Number(coordinate[1]).toFixed(2)}°N，${Number(coordinate[0]).toFixed(2)}°E`; }
        return params.name || '国家/地区';
      } },
      geo: { map: 'shipping-world', roam: true, zoom: 1.02, center: [centerLongitude, 20], silent: false, itemStyle: { areaColor: landColor, borderColor: gridColor, borderWidth: 0.7 }, emphasis: { itemStyle: { areaColor: '#426b89' }, label: { show: false } }, label: { show: false } },
      series: [
        { type: 'lines', coordinateSystem: 'geo', zlevel: 2, effect: { show: true, period: 4.8, trailLength: 0.22, symbol: 'circle', symbolSize: 6 }, lineStyle: { width: 1.8, opacity: 0.9, curveness: 0.18 }, data: routeLines },
        { type: 'effectScatter', coordinateSystem: 'geo', zlevel: 3, rippleEffect: { scale: 2.3, brushType: 'stroke' }, symbolSize: 8, label: { show: false }, itemStyle: { color: (params: { data?: { color?: string } }) => params.data?.color || ROUTE_COLORS[0], shadowBlur: 10, shadowColor: 'rgba(75,215,208,.45)' }, emphasis: { scale: 1.4, label: { show: false } }, data: portPoints },
      ],
      graphic: worldError ? [{ type: 'text', left: 'center', top: 'middle', style: { text: '世界底图加载失败', fill: textColor, fontSize: 14 } }] : [],
    }, true);
    chart.resize();
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);
    return () => { window.removeEventListener('resize', handleResize); chart.dispose(); };
  }, [centerLongitude, drawableRoutes, worldError, worldReady]);

  return <section className={`dynamic-globe ${className}`.trim()} aria-label={title}>
    <div className="dynamic-globe__header"><div><p className="dynamic-globe__eyebrow">WORLD ROUTES / 港口路线</p><h3 className="dynamic-globe__title">{title}</h3></div><span className="dynamic-globe__count" aria-label={`共 ${preparedRoutes.length} 条展示路线`}>{preparedRoutes.length}/3 路线</span></div>
    <div className="dynamic-globe__stage"><div ref={chartRef} id={chartId} className="dynamic-globe__chart" role="img" aria-label={`${title}，展示国家边界、港口坐标与路线连接`} /><div className="dynamic-globe__status" role="status">{drawableRoutes.length > 0 && unavailableCount === 0 && <span className="dynamic-globe__status-dot" />}<span>{!worldReady ? (worldError ? '世界底图不可用' : '正在加载世界底图…') : !preparedRoutes.length ? '暂无路线数据' : unavailableCount > 0 ? `${unavailableCount} 条路线缺少坐标，已跳过绘制` : '真实世界底图 · 港口间路线示意'}</span></div></div>
    <div className="dynamic-globe__legend" aria-label="路线明细">{preparedRoutes.map((route, index) => <div className="dynamic-globe__legend-item" key={route.id}><span className="dynamic-globe__legend-marker" style={{ backgroundColor: ROUTE_COLORS[index] }} /><span className="dynamic-globe__legend-route" title={`${route.origin} → ${route.destination}`}>{portDescription(route.origin)} → {portDescription(route.destination)}</span><span className={`dynamic-globe__legend-status ${statusClass(route.status)}`}>{statusLabel(route.status)}</span><span className="dynamic-globe__legend-score">{formatScore(route.score)}</span></div>)}</div>
    <ul className="dynamic-globe__sr-only">{preparedRoutes.map((route) => <li key={`accessible-${route.id}`}>{route.origin} 至 {route.destination}，状态 {statusLabel(route.status)}，评分 {formatScore(route.score)}。{!route.originCoordinates || !route.destinationCoordinates ? ' 因缺少统一港口坐标，未绘制。' : ' 使用统一港口坐标绘制港口间示意路线。'}</li>)}</ul>
  </section>;
}
export default DynamicGlobe;
