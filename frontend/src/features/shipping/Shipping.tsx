import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dataProvider } from '@/core/data/provider';
import { DataSyncStatus, ProductLine, ShippingOption } from '@/core/store/types';
import { SHIPPING_PORT_BY_EN } from '@/core/data/shippingPorts';
import DynamicGlobe from '@/shared/components/visualization/DynamicGlobe';
import './Shipping.css';

type AvailabilityFilter = 'available' | 'available_limited';

interface OrderInput {
  productLine: ProductLine | '';
  quantity: number | null;
  origin: string;
  destination: string;
  deadline: string;
  availability: AvailabilityFilter;
}

interface RouteConstraints {
  capacityOk: boolean;
  deadlineOk: boolean;
  statusOk: boolean;
  marginDays: number | null;
  routeWarnings: string[];
}

interface RouteRecommendation extends ShippingOption {
  costScore: number;
  timeScore: number;
  capacityScore: number;
  reliabilityScore: number;
  riskScore: number;
  totalScore: number;
  constraints: RouteConstraints;
}

function portLabel(port: string): string {
  const definition = SHIPPING_PORT_BY_EN[port];
  return definition ? `${definition.name_cn} ${definition.name_en}` : port;
}

const CONSTRAINT_LABELS: Record<string, string> = {
  high_demand: '需求较高', limited_capacity: '舱位有限', premium_rate: '费率溢价', customs_complex: '清关复杂',
  cbam_required: '需关注 CBAM', large_volume: '大宗货量', winter_schedule: '冬季船期', section232_tariff: 'Section 232 关税',
  long_transit: '运输距离较长', uk_customs: '英国清关', safeguard_duty: '保障措施税', urgent: '紧急船期',
};

function parseBand(value: string | undefined): [number, number] | null {
  if (!value) return null;
  const numbers = value.split('-').map((item) => Number(item.trim()));
  if (numbers.length !== 2 || numbers.some((item) => !Number.isFinite(item)) || numbers[0] > numbers[1]) return null;
  return [numbers[0], numbers[1]];
}
function statusLabel(status: ShippingOption['status']): string { return status === 'available' ? '可用' : status === 'limited' ? '有限舱位' : '已满'; }
function constraintLabel(flag: string): string { return CONSTRAINT_LABELS[flag] || `约束标记：${flag}`; }
function formatDays(days: number | null): string {
  if (days == null) return '未设置交期';
  return days > 0 ? `+${days} 天` : days === 0 ? '当天' : `${days} 天`;
}

function calculateCostScore(freight: number, minFreight: number, maxFreight: number): number {
  if (!Number.isFinite(freight) || freight <= 0) return 0;
  if (maxFreight === minFreight) return 100;
  return Math.min(100, Math.max(0, ((maxFreight - freight) / (maxFreight - minFreight)) * 100));
}
function calculateTimeScore(marginDays: number | null): number { return marginDays == null ? 65 : marginDays < 0 ? 0 : Math.min(100, 35 + (Math.min(marginDays, 45) / 45) * 65); }
function calculateCapacityScore(quantity: number | null, band: [number, number]): number {
  if (quantity == null) return 70;
  const [minimum, maximum] = band;
  if (maximum === minimum) return 100;
  const position = (quantity - minimum) / (maximum - minimum);
  return Math.min(100, Math.max(0, 70 + (1 - Math.abs(position - 0.5) * 2) * 30));
}
function calculateReliabilityScore(status: ShippingOption['status']): number { return status === 'available' ? 100 : status === 'limited' ? 55 : 0; }
function calculateRiskScore(flags: string[]): number { return Math.max(0, 100 - flags.length * 20); }
function syncLabel(status: DataSyncStatus | null, hasData: boolean): string {
  if (!hasData) return '运输方案数据不可用';
  const source = Object.values(status?.sources || {}).find((item) => item.source_id.includes('shipping') && !item.source_id.includes('index'));
  if (source?.state === 'fallback') return '路线样本已加载 · 沿用上次成功快照';
  if (source?.state === 'unavailable') return '运输方案数据源暂不可用';
  return '路线样本已加载';
}

function portPoint(port: string): { lat: number; lng: number } | undefined {
  const definition = SHIPPING_PORT_BY_EN[port];
  return definition ? { lat: definition.latitude, lng: definition.longitude } : undefined;
}

export function Shipping() {
  const [snapshotOptions, setSnapshotOptions] = useState<ShippingOption[]>([]);
  const [syncStatus, setSyncStatus] = useState<DataSyncStatus | null>(null);
  const [snapshotLoading, setSnapshotLoading] = useState(true);
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [orderInput, setOrderInput] = useState<OrderInput>({ productLine: '', quantity: null, origin: '', destination: '', deadline: '', availability: 'available_limited' });
  const [routes, setRoutes] = useState<RouteRecommendation[]>([]);
  const [matchedCount, setMatchedCount] = useState(0);
  const [selectedRoutes, setSelectedRoutes] = useState<string[]>([]);
  const [generatedRouteIds, setGeneratedRouteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generatedPlanRef = useRef<HTMLElement | null>(null);

  /* 新航运快照接入位置：未来 provider 增加专用方法时，只替换此处读取，不改变下方筛选和地图映射。 */
  const refreshShippingSnapshot = useCallback(async (): Promise<ShippingOption[]> => {
    setSnapshotLoading(true); setSnapshotError(null);
    try {
      const options = await dataProvider.getShippingOptions();
      try { setSyncStatus(await dataProvider.getDataSyncStatus()); } catch { setSyncStatus(null); }
      setSnapshotOptions(options); return options;
    } catch (loadError) {
      setSnapshotOptions([]); setSnapshotError(loadError instanceof Error ? loadError.message : '运输方案快照加载失败'); return [];
    } finally { setSnapshotLoading(false); }
  }, []);
  useEffect(() => { void refreshShippingSnapshot(); }, [refreshShippingSnapshot]);
  useEffect(() => {
    if (!generatedRouteIds.length) return;
    const frame = window.requestAnimationFrame(() => {
      generatedPlanRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [generatedRouteIds]);

  const productOptions = useMemo(() => snapshotOptions.filter((option) => !orderInput.productLine || option.product_line === orderInput.productLine), [orderInput.productLine, snapshotOptions]);
  const originOptions = useMemo(() => Array.from(new Set(productOptions.map((option) => option.port_origin).filter(Boolean))).sort(), [productOptions]);
  const destinationOptions = useMemo(() => Array.from(new Set(productOptions.filter((option) => !orderInput.origin || option.port_origin === orderInput.origin).map((option) => option.destination_port).filter(Boolean))).sort(), [orderInput.origin, productOptions]);

  function resetRoutes() { setRoutes([]); setMatchedCount(0); setSelectedRoutes([]); setGeneratedRouteIds([]); setHasSearched(false); setError(null); }
  function changeOrigin(origin: string) { setOrderInput((previous) => ({ ...previous, origin, destination: '' })); resetRoutes(); }

  async function searchRoutes() {
    setLoading(true); setError(null); setHasSearched(true); setGeneratedRouteIds([]);
    try {
      const options = await refreshShippingSnapshot();
      if (orderInput.quantity != null && orderInput.quantity <= 0) throw new Error('数量必须大于 0 吨，或留空使用路线探索模式。');
      const deadlineDate = orderInput.deadline ? new Date(orderInput.deadline) : null;
      if (deadlineDate && !Number.isFinite(deadlineDate.getTime())) throw new Error('请填写有效的最晚到达日期，或留空使用路线探索模式。');
      if (deadlineDate && deadlineDate.getTime() < Date.now()) throw new Error('最晚到达日期不能早于今天。');
      const candidates = options.filter((option) => {
        const band = parseBand(option.capacity_band_t); const eta = new Date(option.eta);
        const capacityOk = orderInput.quantity == null || Boolean(band && orderInput.quantity >= band[0] && orderInput.quantity <= band[1]);
        const deadlineOk = !deadlineDate || (Number.isFinite(eta.getTime()) && eta <= deadlineDate);
        const statusOk = option.status === 'available' || (orderInput.availability === 'available_limited' && option.status === 'limited');
        return (!orderInput.productLine || option.product_line === orderInput.productLine)
          && (!orderInput.origin || option.port_origin === orderInput.origin)
          && (!orderInput.destination || option.destination_port === orderInput.destination)
          && capacityOk && deadlineOk && statusOk && option.status !== 'full';
      });
      setMatchedCount(candidates.length);
      if (!candidates.length) { setRoutes([]); throw new Error('当前条件没有可用路线样本。请放宽交期、调整货量、放宽港口条件或允许有限舱位。'); }
      const freights = candidates.map((option) => option.freight_per_ton).filter((value) => Number.isFinite(value) && value > 0);
      const minFreight = Math.min(...freights); const maxFreight = Math.max(...freights);
      const recommendations = candidates.map((option): RouteRecommendation | null => {
        const band = parseBand(option.capacity_band_t); const eta = new Date(option.eta); const flags = option.constraint_flags || [];
        if (!band || !Number.isFinite(eta.getTime()) || !Number.isFinite(option.freight_per_ton) || option.freight_per_ton <= 0) return null;
        const marginDays = deadlineDate ? Math.floor((deadlineDate.getTime() - eta.getTime()) / 86400000) : null;
        const costScore = calculateCostScore(option.freight_per_ton, minFreight, maxFreight); const timeScore = calculateTimeScore(marginDays);
        const capacityScore = calculateCapacityScore(orderInput.quantity, band); const reliabilityScore = calculateReliabilityScore(option.status); const riskScore = calculateRiskScore(flags);
        return { ...option, costScore, timeScore, capacityScore, reliabilityScore, riskScore, totalScore: costScore * 0.35 + timeScore * 0.3 + capacityScore * 0.15 + reliabilityScore * 0.1 + riskScore * 0.1, constraints: { capacityOk: true, deadlineOk: true, statusOk: true, marginDays, routeWarnings: flags.map(constraintLabel) } };
      }).filter((option): option is RouteRecommendation => option !== null);
      recommendations.sort((left, right) => right.totalScore - left.totalScore || left.eta.localeCompare(right.eta) || left.freight_per_ton - right.freight_per_ton);
      const diverseRecommendationsBuffer: RouteRecommendation[] = [];
      for (const candidate of recommendations) {
        const pair = `${candidate.port_origin}→${candidate.destination_port}`;
        if (diverseRecommendationsBuffer.some((item) => `${item.port_origin}→${item.destination_port}` === pair)) continue;
        diverseRecommendationsBuffer.push(candidate);
        if (diverseRecommendationsBuffer.length === 3) break;
      }
      const completedRecommendations = [...diverseRecommendationsBuffer, ...recommendations.filter((candidate) => !diverseRecommendationsBuffer.includes(candidate))];
      setRoutes(completedRecommendations.slice(0, 3)); setSelectedRoutes([]);
    } catch (searchError) { setError(searchError instanceof Error ? searchError.message : '搜索路线失败'); }
    finally { setLoading(false); }
  }
  function toggleRouteSelection(routeId: string) { setSelectedRoutes((previous) => previous.includes(routeId) ? previous.filter((id) => id !== routeId) : previous.length >= 3 ? previous : [...previous, routeId]); setGeneratedRouteIds([]); }
  function generatePlan() { const planRoutes = selectedRouteObjects.length ? selectedRouteObjects : routes.slice(0, 1); if (planRoutes.length) setGeneratedRouteIds(planRoutes.map((route) => route.option_id)); }

  const selectedRouteObjects = routes.filter((route) => selectedRoutes.includes(route.option_id));
  const generatedRouteObjects = routes.filter((route) => generatedRouteIds.includes(route.option_id));
  const displayPortCount = new Set([...originOptions, ...destinationOptions]).size;
  const dataLabel = syncLabel(syncStatus, snapshotOptions.length > 0);
  const globeRoutes = generatedRouteObjects.map((route, index) => ({ id: route.option_id, origin: route.port_origin, destination: route.destination_port, originPoint: portPoint(route.port_origin), destinationPoint: portPoint(route.destination_port), status: index === 0 ? 'recommended' : route.status, score: route.totalScore }));

  return <div className="shipping-assistance">
    <section className="shipping-intro"><div><p className="shipping-kicker">LOGISTICS ROUTE PLANNING / 运输决策</p><h1>运输方案</h1><p className="shipping-subtitle">从当前路线样本中按港口、货量、交期和舱位条件探索候选方案。</p></div><div className={`snapshot-status ${snapshotOptions.length ? 'is-ready' : 'is-muted'}`}><span className="status-dot" /><div><strong>{dataLabel}</strong><small>{snapshotLoading ? '正在读取最新样本…' : `${snapshotOptions.length} 条路线记录 · ${displayPortCount} 个港口`}</small></div></div></section>
    <section className="order-input-section"><div className="section-heading"><div><span className="section-index">01</span><div><h2>探索运输路线</h2><p>条件均可留空；系统会从当前全部路线样本中展开候选，再按可用性、时效、运费与风险排序。</p></div></div><span className="data-rule">航运指数仅作市场环境参考</span></div>
      <div className="input-grid"><div className="input-group"><label htmlFor="product-line">产品线 <span>可选</span></label><select id="product-line" value={orderInput.productLine} onChange={(event) => { setOrderInput((previous) => ({ ...previous, productLine: event.target.value as ProductLine | '', origin: '', destination: '' })); resetRoutes(); }} className="input-field"><option value="">不限产品线</option><option value="hot-rolled">热轧卷板</option><option value="cold-rolled">冷轧卷板</option><option value="silicon-steel">硅钢</option></select></div><div className="input-group"><label htmlFor="origin-port">起运港 <span>可选</span></label><select id="origin-port" value={orderInput.origin} onChange={(event) => changeOrigin(event.target.value)} className="input-field" disabled={snapshotLoading || !originOptions.length}><option value="">不限起运港</option>{originOptions.map((port) => <option key={port} value={port}>{portLabel(port)}</option>)}</select></div><div className="input-group"><label htmlFor="destination-port">目的港 <span>可选</span></label><select id="destination-port" value={orderInput.destination} onChange={(event) => { setOrderInput((previous) => ({ ...previous, destination: event.target.value })); resetRoutes(); }} className="input-field" disabled={snapshotLoading || !destinationOptions.length}><option value="">不限目的港</option>{destinationOptions.map((port) => <option key={port} value={port}>{portLabel(port)}</option>)}</select></div><div className="input-group"><label htmlFor="quantity">货量 <span>可选 · 吨</span></label><input id="quantity" type="number" value={orderInput.quantity ?? ''} placeholder="留空查看参考路线" onChange={(event) => { setOrderInput((previous) => ({ ...previous, quantity: event.target.value ? Number(event.target.value) : null })); resetRoutes(); }} className="input-field" min="1" step="100" /></div><div className="input-group"><label htmlFor="deadline">最晚到达日期 <span>可选</span></label><input id="deadline" type="date" value={orderInput.deadline} onChange={(event) => { setOrderInput((previous) => ({ ...previous, deadline: event.target.value })); resetRoutes(); }} className="input-field" /></div><div className="input-group"><label htmlFor="availability">舱位状态</label><select id="availability" value={orderInput.availability} onChange={(event) => { setOrderInput((previous) => ({ ...previous, availability: event.target.value as AvailabilityFilter })); resetRoutes(); }} className="input-field"><option value="available">仅可用舱位</option><option value="available_limited">可用 + 有限舱位</option></select></div></div>
      <div className="input-actions"><div className="filter-note"><span>生成逻辑</span><p>未选择的条件不参与过滤；货量/交期填写后才作为硬约束，路线结果最多展示 3 条差异化候选。</p></div><button onClick={searchRoutes} disabled={loading || snapshotLoading || !snapshotOptions.length} className="btn-primary-large">{loading ? '正在分析…' : '生成候选路线'}</button></div>
    </section>
    {(snapshotError || error) && <div className="error-banner"><span>!</span><p>{error || snapshotError}</p></div>}
    {hasSearched && !routes.length && !error && <div className="empty-state"><div className="empty-icon">—</div><h2>暂无可用路线样本</h2><p>当前条件没有对应的路线记录，系统不会用默认模板补齐结果。</p></div>}
    {routes.length > 0 && <section className="routes-section"><div className="routes-header"><div><p className="section-eyebrow">ROUTE SAMPLE / 路线样本</p><h2>已筛选路线 <span>{routes.length} / {matchedCount} 条命中</span></h2><p>结果从当前路线样本中按运费、ETA、舱位状态和约束标记排序，并优先保留不同港口组合。</p></div><div className="routes-header-actions"><span className="selection-count">已选 {selectedRoutes.length} / 3</span><button className="btn-secondary" onClick={generatePlan}>{selectedRoutes.length ? '生成已选方案' : '生成首选方案'}</button></div></div><div className="routes-list">{routes.map((route, index) => <article key={route.option_id} className={`route-card ${selectedRoutes.includes(route.option_id) ? 'route-card-selected' : ''}`} role="button" tabIndex={0} onClick={() => toggleRouteSelection(route.option_id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') toggleRouteSelection(route.option_id); }}><div className="route-card-header"><div className="route-name"><span className="route-rank">0{index + 1}</span><div><span className="route-code">{routeLabel(route.route)}</span><small>{portLabel(route.port_origin)} → {portLabel(route.destination_port)}</small></div></div><div className="route-score"><strong>{route.totalScore.toFixed(1)}</strong><span>平台计算分</span></div></div><div className="route-details"><div className="route-detail-item"><span className="detail-label">船期窗口</span><span className="detail-value">{route.vessel_window}</span></div><div className="route-detail-item"><span className="detail-label">预计到达 ETA</span><span className="detail-value">{route.eta}</span></div><div className="route-detail-item"><span className="detail-label">运费</span><span className="detail-value">{route.freight_per_ton.toFixed(1)} {route.freight_currency} / 吨</span></div><div className="route-detail-item"><span className="detail-label">舱位区间</span><span className="detail-value">{route.capacity_band_t} 吨</span></div><div className="route-detail-item"><span className="detail-label">货量参考</span><span className="detail-value">{route.volume_band_t} 吨</span></div></div><div className="route-badges"><span className={`route-status route-status-${route.status}`}>{statusLabel(route.status)}</span><span className="constraint-item constraint-ok">✓ 货量匹配</span><span className="constraint-item constraint-ok">✓ 交期 {formatDays(route.constraints.marginDays)}</span>{route.constraints.routeWarnings.map((warning) => <span key={warning} className="constraint-item constraint-warning">{warning}</span>)}</div><div className="route-scores"><ScoreBar label="运费" value={route.costScore} hint="35%" /><ScoreBar label="ETA" value={route.timeScore} hint="30%" /><ScoreBar label="舱位" value={route.capacityScore} hint="15%" /><ScoreBar label="状态" value={route.reliabilityScore} hint="10%" /><ScoreBar label="约束" value={route.riskScore} hint="10%" /></div><p className="route-basis">平台计算依据：运费 {route.freight_per_ton.toFixed(1)} {route.freight_currency}/吨 · ETA {route.eta} · 舱位 {route.capacity_band_t} 吨 · 状态 {statusLabel(route.status)} · 约束 {route.constraint_flags?.length ? `${route.constraint_flags.length} 项` : '无'}</p></article>)}</div></section>}
    {generatedRouteObjects.length > 0 && <section ref={generatedPlanRef} className="generated-plan" aria-live="polite"><div className="generated-plan-heading"><div><p className="section-eyebrow">PLAN OUTPUT / 方案输出</p><h2>运输方案已生成</h2><p>方案仅由本次筛选后的路线样本组成；地图展示港口间路线示意，不代表真实船舶航迹。</p></div><span className="plan-count">{generatedRouteObjects.length} 条路线</span></div><div className="generated-plan-grid"><div className="plan-summary">{generatedRouteObjects.map((route, index) => <div className="plan-route" key={route.option_id}><span className="plan-route-index">0{index + 1}</span><div><strong>{portLabel(route.port_origin)} → {portLabel(route.destination_port)}</strong><p>ETA {route.eta} · {route.freight_per_ton.toFixed(1)} {route.freight_currency}/吨 · 舱位 {route.capacity_band_t} 吨</p></div><b>{route.totalScore.toFixed(1)}</b></div>)}<div className="plan-guardrail"><span>执行前核对</span><p>以船公司最终确认的舱位、船期窗口和运费有效期为准。</p></div></div><DynamicGlobe routes={globeRoutes} title="已生成路线 · 动态航线" /></div></section>}
    {selectedRouteObjects.length > 1 && <section className="comparison-section"><div className="comparison-heading"><div><p className="section-eyebrow">COMPARE / 横向比较</p><h2>路线对比</h2></div><span>最多选择 3 条</span></div><div className="comparison-table-wrapper"><table className="comparison-table"><thead><tr><th>指标</th>{selectedRouteObjects.map((route) => <th key={route.option_id}>{portLabel(route.port_origin)} → {portLabel(route.destination_port)}</th>)}</tr></thead><tbody><CompareRow label="综合评分" routes={selectedRouteObjects} render={(route) => <strong>{route.totalScore.toFixed(1)}</strong>} /><CompareRow label="运费" routes={selectedRouteObjects} render={(route) => `${route.freight_per_ton.toFixed(1)} ${route.freight_currency}/吨`} /><CompareRow label="预计到达 ETA" routes={selectedRouteObjects} render={(route) => route.eta} /><CompareRow label="交期裕度" routes={selectedRouteObjects} render={(route) => formatDays(route.constraints.marginDays)} /><CompareRow label="舱位区间" routes={selectedRouteObjects} render={(route) => `${route.capacity_band_t} 吨`} /><CompareRow label="舱位状态" routes={selectedRouteObjects} render={(route) => statusLabel(route.status)} /><CompareRow label="约束标记" routes={selectedRouteObjects} render={(route) => route.constraint_flags?.length ? route.constraint_flags.map(constraintLabel).join('、') : '无'} /></tbody></table></div></section>}
  </div>;
}

function routeLabel(route: string): string { return route.replace('China-', '').replace('SEAsia', '东南亚').replace('Europe', '欧洲').replace('SouthAsia', '南亚').replace('MiddleEast', '中东').replace('Americas', '美洲'); }
function ScoreBar({ label, value, hint }: { label: string; value: number; hint: string }) { return <div className="score-bar"><span className="score-label">{label}</span><div className="score-bar-bg"><div className="score-bar-fill" style={{ width: `${value}%` }} /></div><span className="score-weight">{hint}</span><span className="score-value">{value.toFixed(0)}</span></div>; }
function CompareRow({ label, routes, render }: { label: string; routes: RouteRecommendation[]; render: (route: RouteRecommendation) => React.ReactNode }) { return <tr><td className="comparison-label">{label}</td>{routes.map((route) => <td key={route.option_id} className="comparison-value">{render(route)}</td>)}</tr>; }
