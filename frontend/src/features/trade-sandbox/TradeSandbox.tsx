import { useMemo, useRef, useState, useEffect } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import Globe, { type GlobeInstance } from 'globe.gl';
import { Mesh, MeshPhongMaterial, SphereGeometry } from 'three';
import { dataProvider } from '@/core/data/provider';
import {
  buildCountries,
  buildMarkers,
  canonical,
  cleanGeometry,
  clean,
  centroid,
  defaultConfig,
  displayNames,
  evaluateScenario,
  formatPct,
  formatTons,
  impactLabel,
  simulateFlows,
  variableLabel,
  type Coordinate,
  type SandboxFeature,
} from './sandboxRules';
import type {
  SandboxConfig,
  SandboxCountry,
  SandboxDataBundle,
  SandboxDirection,
  SandboxFlow,
  SandboxLayer,
  SandboxScenarioRecord,
  SandboxVariable,
} from './sandboxTypes';
import { SANDBOX_PORTS, type SandboxPortOverlay } from './sandboxPorts';
import './TradeSandbox.css';

gsap.registerPlugin(useGSAP);

type Polygon = SandboxFeature & { country: SandboxCountry };
type Arc = SandboxFlow & { startLat: number; startLng: number; endLat: number; endLng: number; lane: number };
type Point = SandboxCountry & { markerKind: 'country' | 'risk'; color: string; size: number };

const SOURCE: Coordinate = { lat: 39.9, lng: 116.4 };
const COUNTRY_COLORS = ['#58d6cb', '#6bb5ff', '#f2c66d', '#ff996f', '#db78ba'];
const variableOptions: Array<{ id: SandboxVariable; name: string; hint: string }> = [
  { id: 'remedy', name: '贸易救济', hint: '活动案件对应市场的流量弹性' },
  { id: 'quota', name: '配额松紧', hint: 'EU / UK 配额区域的分配弹性' },
  { id: 'policy', name: '区域政策', hint: '已记录政策事件地区的开放度' },
  { id: 'fed', name: '金融局势', hint: '全球宏观利率变化的统一影响' },
  { id: 'chokepoint', name: '航运要道', hint: '航运通道管控对流量的扰动' },
  { id: 'freight', name: '航运价格', hint: '国际航运成本变动的情景映射' },
];

function colorForCountry(country: SandboxCountry, maximum: number): string {
  if (country.activeRemedyCount) return '#e97867';
  const ratio = Math.sqrt(country.internalVolumeT / Math.max(maximum, 1));
  return COUNTRY_COLORS[Math.min(COUNTRY_COLORS.length - 1, Math.floor(ratio * COUNTRY_COLORS.length))];
}

function fillForCountry(country: SandboxCountry, maximum: number): string {
  if (country.activeRemedyCount) return '#b94f58';
  if (country.internalVolumeT > 0) return `${colorForCountry(country, maximum)}bb`;
  if (country.policyCount || country.hasQuotaRegion) return '#3f8791';
  return '#315c72';
}

function impactColor(level: SandboxFlow['impactLevel'], polarity: SandboxFlow['polarity']): string {
  if (polarity === '+') return level >= 4 ? '#8ee9cc' : '#63d8c2';
  if (polarity === '0') return '#8daeb6';
  return level >= 4 ? '#ff8b78' : '#df8a72';
}

function formatDate(value?: string | null): string {
  return value ? value.replace('T', ' ').slice(0, 16) : '—';
}

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function readStoredRecords(): SandboxScenarioRecord[] {
  try {
    const value = JSON.parse(localStorage.getItem('trade-sandbox-scenarios') || '[]');
    return Array.isArray(value) ? value.slice(0, 8) as SandboxScenarioRecord[] : [];
  } catch { return []; }
}

export default function TradeSandbox() {
  const shellRef = useRef<HTMLDivElement>(null);
  const globeRef = useRef<HTMLDivElement>(null);
  const globeInstanceRef = useRef<GlobeInstance | null>(null);
  const [bundle, setBundle] = useState<SandboxDataBundle>({ internal: null, customers: null, customs: null, risks: [], policies: [], remedies: null, quota: null });
  const [features, setFeatures] = useState<SandboxFeature[]>([]);
  const [config, setConfig] = useState<SandboxConfig>(defaultConfig);
  const [variable, setVariable] = useState<SandboxVariable>('remedy');
  const [direction, setDirection] = useState<SandboxDirection>('down');
  const [activeLayers, setActiveLayers] = useState<Record<SandboxLayer, boolean>>({ risk: true, events: true, flows: false, residual: true });
  const [portsVisible, setPortsVisible] = useState(true);
  const [activeCountryKey, setActiveCountryKey] = useState<string | null>(null);
  const [hoveredCountryKey, setHoveredCountryKey] = useState<string | null>(null);
  const focusKeyRef = useRef<string | null>(null);
  const [query, setQuery] = useState('');
  const [showConfig, setShowConfig] = useState(true);
  const [showScenarios, setShowScenarios] = useState(false);
  const [scenarios, setScenarios] = useState<SandboxScenarioRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useGSAP(() => {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo('.sandbox__heading', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: .5 })
      .fromTo('.sandbox__stage', { autoAlpha: 0, scale: .985 }, { autoAlpha: 1, scale: 1, duration: .75 }, '<.12')
      .fromTo('.sandbox__rail', { autoAlpha: 0, x: 16 }, { autoAlpha: 1, x: 0, duration: .55 }, '<.18');
  }, { scope: shellRef });

  useEffect(() => {
    let active = true;
    Promise.all([
      dataProvider.getInternalBusinessSnapshot(),
      dataProvider.getInternalBusinessCustomerSnapshot(),
      dataProvider.getSteelExportSnapshot(),
      dataProvider.getRiskSignals(),
      dataProvider.getPolicyEvents(),
      dataProvider.getTradeRemedySnapshot(),
      dataProvider.getTaricQuotaSnapshot(),
      fetch(`${import.meta.env.BASE_URL}data/world.json`).then((response) => response.ok ? response.json() as Promise<{ features?: SandboxFeature[] }> : Promise.reject(new Error('世界边界快照不可用'))),
    ]).then(([internal, customers, customs, risks, policies, remedies, quota, world]) => {
      if (!active) return;
      setBundle({ internal, customers, customs, risks, policies, remedies, quota });
      setFeatures(world.features || []);
      setScenarios(readStoredRecords());
    }).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : '贸易沙盘数据加载失败')).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const countries = useMemo(() => buildCountries(features, bundle), [features, bundle]);
  const baselineTotal = bundle.internal?.summary.positive_volume_t || countries.reduce((sum, item) => sum + item.internalVolumeT, 0) || 1;
  const allBusiness = useMemo(() => countries.filter((country) => country.internalVolumeT > 0).sort((a, b) => b.internalVolumeT - a.internalVolumeT), [countries]);
  const markers = useMemo(() => buildMarkers(countries, bundle), [countries, bundle]);
  const flows = useMemo(() => simulateFlows(countries, baselineTotal, config, variable, direction), [countries, baselineTotal, config, variable, direction]);
  const result = useMemo(() => evaluateScenario(flows, variable, direction, baselineTotal), [flows, variable, direction, baselineTotal]);
  const activeCountry = countries.find((country) => country.key === activeCountryKey) || allBusiness[0] || countries[0] || null;
  const maximumVolume = Math.max(...countries.map((country) => country.internalVolumeT), 1);
  const filteredCountries = useMemo(() => [...countries].sort((a, b) => (b.internalVolumeT - a.internalVolumeT) || a.name.localeCompare(b.name)).filter((country) => !query || country.name.includes(query) || country.worldName.toLowerCase().includes(query.toLowerCase())), [countries, query]);
  // 残余层只控制残余线路的表达，不改变推演结果本身；关闭后仍保留其他流向。
  const visibleFlows = useMemo(() => {
    if (!activeLayers.flows) return [];
    const candidates = config.targetKeys.length ? flows.filter((flow) => flow.isTarget) : flows.slice().sort((a, b) => b.simulatedVolumeT - a.simulatedVolumeT).slice(0, 16);
    return candidates.filter((flow) => activeLayers.residual || !flow.isResidual);
  }, [activeLayers.flows, activeLayers.residual, config.targetKeys, flows]);
  const visibleMarkers = useMemo(() => markers.filter((marker) => marker.kind === 'remedy' ? activeLayers.risk : marker.kind === 'quota' ? activeLayers.risk : activeLayers.events), [activeLayers.events, activeLayers.risk, markers]);
  const selectedTargetCount = config.targetKeys.length;
  const visibleCountryList = query.trim() ? filteredCountries : filteredCountries.slice(0, 10);
  const portPoints = SANDBOX_PORTS;

  const selectCountry = (country: SandboxCountry) => {
    setActiveCountryKey(country.key);
    focusKeyRef.current = country.key;
    setConfig((current) => current.targetKeys.includes(country.key) ? current : { ...current, targetKeys: [...current.targetKeys, country.key] });
    setActiveLayers((current) => ({ ...current, flows: true }));
    const globe = globeInstanceRef.current;
    if (globe) globe.pointOfView({ lat: country.center.lat, lng: country.center.lng, altitude: 1.75 }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 850);
  };

  const toggleTarget = (country: SandboxCountry) => {
    setActiveCountryKey(country.key);
    const targetKeys = config.targetKeys.includes(country.key) ? config.targetKeys.filter((key) => key !== country.key) : [...config.targetKeys, country.key];
    setConfig((current) => ({ ...current, targetKeys }));
    setActiveLayers((current) => ({ ...current, flows: targetKeys.length > 0 }));
  };

  const resetSandbox = () => {
    setConfig({ ...defaultConfig, productWeights: { ...defaultConfig.productWeights } });
    setVariable('remedy'); setDirection('down'); setActiveCountryKey(null);
    setHoveredCountryKey(null); focusKeyRef.current = null;
    setActiveLayers({ risk: true, events: true, flows: false, residual: true });
  };

  const saveScenario = () => {
    const record: SandboxScenarioRecord = { id: `scenario-${Date.now()}`, createdAt: new Date().toISOString(), config: { ...config, productWeights: { ...config.productWeights }, targetKeys: [...config.targetKeys] }, result };
    const next = [record, ...scenarios].slice(0, 8);
    setScenarios(next);
    try { localStorage.setItem('trade-sandbox-scenarios', JSON.stringify(next)); } catch { /* 本地存储受限时仍保留当前运行态 */ }
    setShowScenarios(true);
  };

  useGSAP(() => {
    const cards = shellRef.current?.querySelectorAll('.sandbox__metric, .sandbox__flow-row, .sandbox__marker-row');
    if (!cards?.length) return;
    const ctx = gsap.context(() => gsap.fromTo(cards, { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0, duration: .28, stagger: .025, ease: 'power2.out' }), shellRef);
    return () => ctx.revert();
  }, { scope: shellRef, dependencies: [result.label, activeCountryKey, activeLayers] });

  useEffect(() => {
    if (!globeRef.current || loading || error || !features.length) return;
    let globe: GlobeInstance;
    try { globe = new Globe(globeRef.current, { waitForGlobeReady: true, animateIn: true, rendererConfig: { antialias: true, alpha: true, powerPreference: 'high-performance' } }); } catch { setError('当前浏览器不支持 WebGL，贸易沙盘地图无法加载'); return; }
    globeInstanceRef.current = globe;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const polygons: Polygon[] = features.map(cleanGeometry).filter((feature): feature is SandboxFeature => Boolean(feature && clean(feature.properties?.name))).map((feature) => { const raw = clean(feature.properties?.name); return { ...feature, country: countries.find((country) => country.key === canonical(raw)) || { key: canonical(raw), name: displayNames[canonical(raw)] || raw, worldName: raw, center: centroid(feature), internalVolumeT: 0, internalSharePct: 0, customerCount: 0, activeRemedyCount: 0, policyCount: 0, highRiskCount: 0, hasQuotaRegion: false, quotaRegion: null, actualStatus: 'unmatched' } }; });
    const arcData: Arc[] = visibleFlows.map((flow, index) => ({ ...flow, startLat: SOURCE.lat + ((index % 7) - 3) * .18, startLng: SOURCE.lng + ((index % 5) - 2) * .18, endLat: flow.center.lat, endLng: flow.center.lng, lane: index }));
    const countryPoints: Point[] = countries.filter((country) => country.internalVolumeT > 0).map((country) => ({ ...country, markerKind: 'country', color: colorForCountry(country, maximumVolume), size: .17 + Math.min(country.internalVolumeT / maximumVolume, 1) * .28 }));
    const riskPoints: Point[] = visibleMarkers.map((marker) => { const country = countries.find((item) => item.key === marker.countryKey); return country ? { ...country, center: { lat: marker.lat, lng: marker.lng }, markerKind: 'risk', color: marker.kind === 'remedy' ? '#ff806d' : marker.kind === 'quota' ? '#ffbd61' : '#c28bff', size: .22 + marker.impactLevel * .07 } : null; }).filter((point): point is Point => Boolean(point));
    const lineGeometry = (item: object) => { const feature = item as Polygon; return { type: feature.geometry.type, coordinates: feature.geometry.coordinates }; };
    globe.backgroundColor('rgba(0,0,0,0)').showAtmosphere(true).atmosphereColor('#56d6ca').atmosphereAltitude(.12).showGraticules(true).globeMaterial(new MeshPhongMaterial({ color: '#092338', emissive: '#06121f', emissiveIntensity: .44, shininess: 24 }))
      .polygonsData(polygons).polygonGeoJsonGeometry(lineGeometry as never).polygonsTransitionDuration(reducedMotion ? 0 : 420)
      .polygonCapColor((item: object) => { const country = (item as Polygon).country; if (country.key === focusKeyRef.current) return '#ffe29b'; return fillForCountry(country, maximumVolume); })
      .polygonSideColor(() => 'rgba(56, 159, 166, .22)').polygonStrokeColor((item: object) => (item as Polygon).country.key === focusKeyRef.current ? '#fff3c5' : 'rgba(173, 235, 229, .64)').polygonAltitude((item: object) => { const country = (item as Polygon).country; return country.key === focusKeyRef.current ? .12 : country.internalVolumeT > 0 ? .014 + Math.min(country.internalVolumeT / maximumVolume, 1) * .035 : .009; })
      .polygonLabel((item: object) => { const country = (item as Polygon).country; return `<div class="sandbox-tooltip"><strong>${country.name}</strong><span>${country.actualStatus === 'business' ? `内部出口 ${formatTons(country.internalVolumeT)} · ${formatPct(country.internalSharePct)}` : '暂无内部业务匹配 · 可作为推演目标'}</span></div>`; })
      .onPolygonHover((item: object | null) => setHoveredCountryKey(item ? (item as Polygon).country.key : null)).onPolygonClick((item: object | null) => { if (item) selectCountry((item as Polygon).country); })
      .pointsData(activeLayers.flows ? countryPoints : []).pointLat((item: object) => (item as Point).center.lat).pointLng((item: object) => (item as Point).center.lng).pointColor((item: object) => (item as Point).color).pointAltitude((item: object) => (item as Point).markerKind === 'risk' ? .1 : .06).pointRadius((item: object) => (item as Point).size).pointsMerge(false).pointsTransitionDuration(550)
      .customLayerData(activeLayers.risk || activeLayers.events ? riskPoints : []).customThreeObject((item: object) => { const point = item as Point; const material = new MeshPhongMaterial({ color: point.color, emissive: point.color, emissiveIntensity: .7 }); return new Mesh(new SphereGeometry(point.size, 12, 8), material); }).customThreeObjectUpdate((object: object, item: object) => { const point = item as Point; const mesh = object as Mesh; const coords = globe.getCoords(point.center.lat, point.center.lng, .1); mesh.position.set(coords.x, coords.y, coords.z); });
    if (activeLayers.flows) globe.arcsData(arcData).arcStartLat((item: object) => (item as Arc).startLat).arcStartLng((item: object) => (item as Arc).startLng).arcEndLat((item: object) => (item as Arc).endLat).arcEndLng((item: object) => (item as Arc).endLng).arcColor((item: object) => impactColor((item as Arc).impactLevel, (item as Arc).polarity)).arcStroke((item: object) => 1.2 + Math.min((item as Arc).internalVolumeT / maximumVolume, 1) * 1.55).arcDashLength(1).arcDashGap(0).arcsTransitionDuration(reducedMotion ? 0 : 500).pathsData(arcData).pathPoints((item: object) => [[(item as Arc).startLat, (item as Arc).startLng], [(item as Arc).endLat, (item as Arc).endLng]]).pathPointAlt(.035).pathColor((item: object) => `${impactColor((item as Arc).impactLevel, (item as Arc).polarity)}b8`).pathStroke((item: object) => (item as Arc).isResidual ? 1 : .55).pathDashLength(.16).pathDashGap(.84).pathDashInitialGap((item: object) => (item as Arc).lane * .06).pathDashAnimateTime(reducedMotion ? 0 : 1050);
    globe.ringsData(activeCountryKey ? [{ lat: activeCountry?.center.lat || 0, lng: activeCountry?.center.lng || 0, color: '#ffe09b', impactLevel: activeCountry ? (activeCountry.activeRemedyCount ? 5 : activeCountry.hasQuotaRegion ? 4 : 2) : 1 }] : []).ringLat((item: object) => (item as { lat: number }).lat).ringLng((item: object) => (item as { lng: number }).lng).ringColor((item: object) => (item as { color: string }).color).ringAltitude(.13).ringMaxRadius((item: object) => .35 + ((item as { impactLevel?: number }).impactLevel || 1) * .16).ringPropagationSpeed((item: object) => 1.1 + ((item as { impactLevel?: number }).impactLevel || 1) * .16).ringRepeatPeriod((item: object) => 1450 - ((item as { impactLevel?: number }).impactLevel || 1) * 80);
    globe.htmlElementsData(portPoints).htmlLat((item: object) => (item as SandboxPortOverlay).lat).htmlLng((item: object) => (item as SandboxPortOverlay).lng).htmlAltitude(.105).htmlElement((item: object) => {
      const port = item as SandboxPortOverlay;
      const element = document.createElement('div');
      element.className = `sandbox-port-marker ${port.tier === 'primary' ? 'is-primary' : 'is-hub'}`;
      element.setAttribute('aria-label', `${port.name}，${port.region}`);
      element.title = `${port.name} · ${port.englishName} · ${port.region}`;
      element.innerHTML = '<span class="sandbox-port-marker__pulse"></span><span class="sandbox-port-marker__core"></span><span class="sandbox-port-marker__label"></span>';
      const label = element.querySelector('.sandbox-port-marker__label');
      if (label) label.textContent = port.name;
      return element;
    }).htmlElementVisibilityModifier((element: HTMLElement, isVisible: boolean) => { element.style.opacity = isVisible ? '1' : '0'; });
    globe.htmlTransitionDuration(reducedMotion ? 0 : 260);
    globe.pointOfView(activeCountry ? { lat: activeCountry.center.lat, lng: activeCountry.center.lng, altitude: activeCountryKey ? 1.85 : 2.18 } : { lat: 22, lng: 105, altitude: 2.25 });
    const controls = globe.controls(); controls.enableDamping = true; controls.dampingFactor = .08; controls.autoRotate = false;
    const resizeObserver = new ResizeObserver(() => globe.width(globeRef.current?.clientWidth || 1200).height(globeRef.current?.clientHeight || 780)); resizeObserver.observe(globeRef.current);
    return () => { resizeObserver.disconnect(); globe._destructor(); globeInstanceRef.current = null; };
  }, [countries, error, features, loading, maximumVolume]);

  // 操作面板只更新现有 Globe 实例的数据层；不触发 new Globe() 或 _destructor()。
  useEffect(() => {
    const globe = globeInstanceRef.current;
    if (!globe || loading || error) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const arcData: Arc[] = visibleFlows.map((flow, index) => ({ ...flow, startLat: SOURCE.lat + ((index % 7) - 3) * .18, startLng: SOURCE.lng + ((index % 5) - 2) * .18, endLat: flow.center.lat, endLng: flow.center.lng, lane: index }));
    const countryPoints: Point[] = countries.filter((country) => country.internalVolumeT > 0).map((country) => ({ ...country, markerKind: 'country', color: colorForCountry(country, maximumVolume), size: .17 + Math.min(country.internalVolumeT / maximumVolume, 1) * .28 }));
    const uniqueVisibleMarkers = Array.from(new Map(visibleMarkers.map((marker) => [`${marker.countryKey}:${marker.kind}`, marker])).values());
    const riskPoints: Point[] = uniqueVisibleMarkers.map((marker) => { const country = countries.find((item) => item.key === marker.countryKey); return country ? { ...country, center: { lat: marker.lat, lng: marker.lng }, markerKind: 'risk', color: marker.kind === 'remedy' ? '#ff806d' : marker.kind === 'quota' ? '#ffbd61' : '#c28bff', size: .22 + marker.impactLevel * .07 } : null; }).filter((point): point is Point => Boolean(point));
    globe.pointsData(activeLayers.flows ? countryPoints : []).pointsTransitionDuration(reducedMotion ? 0 : 420);
    globe.customLayerData(activeLayers.risk || activeLayers.events ? riskPoints : []);
    globe.htmlElementsData(portsVisible ? portPoints : []);
    globe.ringsData(activeLayers.risk || activeLayers.events ? uniqueVisibleMarkers.map((marker) => ({ lat: marker.lat, lng: marker.lng, color: marker.kind === 'remedy' ? '#ff806d' : marker.kind === 'quota' ? '#ffbd61' : '#c28bff', impactLevel: marker.impactLevel })) : []);
    if (activeLayers.flows) {
      globe.arcsData(arcData).arcColor((item: object) => impactColor((item as Arc).impactLevel, (item as Arc).polarity)).arcStroke((item: object) => 1.2 + Math.min((item as Arc).internalVolumeT / maximumVolume, 1) * 1.55).arcsTransitionDuration(reducedMotion ? 0 : 500).pathsData(arcData).pathColor((item: object) => `${impactColor((item as Arc).impactLevel, (item as Arc).polarity)}b8`).pathStroke((item: object) => (item as Arc).isResidual ? 1 : .55).pathDashAnimateTime(reducedMotion ? 0 : 1050);
    } else {
      globe.arcsData([]).pathsData([]);
    }
  }, [activeLayers.events, activeLayers.flows, activeLayers.risk, activeLayers.residual, countries, error, loading, maximumVolume, portPoints, portsVisible, visibleFlows, visibleMarkers]);

  useEffect(() => {
    focusKeyRef.current = activeCountryKey || hoveredCountryKey;
    const globe = globeInstanceRef.current;
    if (!globe) return;
    globe.polygonCapColor((item: object) => { const country = (item as Polygon).country; if (country.key === focusKeyRef.current) return '#ffe29b'; return fillForCountry(country, maximumVolume); });
    globe.polygonStrokeColor((item: object) => (item as Polygon).country.key === focusKeyRef.current ? '#fff3c5' : 'rgba(122, 221, 217, .42)');
    globe.polygonAltitude((item: object) => { const country = (item as Polygon).country; return country.key === focusKeyRef.current ? .12 : country.internalVolumeT > 0 ? .014 + Math.min(country.internalVolumeT / maximumVolume, 1) * .035 : .009; });
  }, [hoveredCountryKey, maximumVolume]);

  // 仅在“选中目标改变”时聚焦一次；悬停、图层和数据更新不得重置用户手动调整的视角。
  useEffect(() => {
    const globe = globeInstanceRef.current;
    if (!globe || !activeCountryKey) return;
    const country = countries.find((item) => item.key === activeCountryKey);
    if (!country) return;
    globe.pointOfView({ lat: country.center.lat, lng: country.center.lng, altitude: 1.85 }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 700);
    globe.ringsData([{ lat: country.center.lat, lng: country.center.lng, color: '#ffe09b', impactLevel: country.activeRemedyCount ? 5 : country.hasQuotaRegion ? 4 : 2 }]);
  }, [activeCountryKey, countries]);

  const dataDate = bundle.internal?.source.coverage_end || bundle.remedies?.source.coverage_end || '—';
  return <div className="sandbox" ref={shellRef}>
    <header className="sandbox__heading">
      <div><span className="sandbox__eyebrow">TRADE SCENARIO / CONTROLLED SIMULATION</span><h1>贸易沙盘模拟</h1><p>以真实业务快照为基线，把风险、配置、流向和双向情景放进同一个可复盘的实验空间。</p></div>
      <div className="sandbox__status"><span className="sandbox__live-dot" /><div><strong>基线快照已挂载</strong><small>内部业务 {formatDate(bundle.internal?.source.captured_at)} · 覆盖至 {dataDate}</small></div></div>
    </header>
    <section className="sandbox__workspace">
      <div className="sandbox__stage">
        <div className="sandbox__canvas" ref={globeRef} aria-label="贸易风险与出口流向3D地球" role="img" />
        <div className="sandbox__vignette" />
        <div className="sandbox__stage-top"><div><span>LIVE BASELINE + SCENARIO OVERLAY</span><strong>{variableLabel(variable, direction)}</strong></div><button type="button" onClick={() => globeInstanceRef.current?.pointOfView({ lat: 22, lng: 105, altitude: 2.25 }, 650)}>重置视角</button></div>
        {(loading || error) && <div className={`sandbox__state ${error ? 'is-error' : ''}`}>{error || '正在加载风险、事件与业务快照…'}</div>}
        <div className="sandbox__legend"><span><i className="is-flow" />选定市场流向</span><span><i className="is-remedy" />救济 / 配额风险</span><span><i className="is-event" />政策事件</span><span><i className="is-port" />常用港口</span><span><i className="is-residual" />残余矛盾</span></div>
        <div className="sandbox__layer-switcher" aria-label="地图图层开关">{([['flows', '选定线路'], ['risk', '风险层'], ['events', '事件层'], ['residual', '残余矛盾']] as Array<[SandboxLayer, string]>).map(([key, label]) => <button key={key} type="button" className={activeLayers[key] ? 'is-on' : ''} onClick={() => setActiveLayers((current) => ({ ...current, [key]: !current[key] }))}><span />{label}</button>)}<button type="button" className={portsVisible ? 'is-on is-port-layer' : 'is-port-layer'} onClick={() => setPortsVisible((current) => !current)}><span />常用港口</button></div>
        <div className="sandbox__map-summary"><strong>{countries.length}</strong><span>可识别国家</span><b>{allBusiness.length}</b><span>有内部出口</span><b>{markers.length}</b><span>已定位标注</span></div>
      </div>
      <aside className="sandbox__rail">
        <section className="sandbox__panel sandbox__panel--scenario">
          <div className="sandbox__panel-title"><div><span>SCENARIO ENGINE</span><h2>推演控制台</h2></div><button type="button" onClick={resetSandbox}>重置</button></div>
          <div className="sandbox__scenario-pills">{variableOptions.map((option) => <button key={option.id} type="button" className={variable === option.id ? 'is-active' : ''} onClick={() => setVariable(option.id)}><strong>{option.name}</strong><small>{option.hint}</small></button>)}</div>
          <div className="sandbox__direction"><button type="button" className={direction === 'up' ? 'is-active' : ''} onClick={() => setDirection('up')}>缓解 / 放宽 / 下降</button><button type="button" className={direction === 'down' ? 'is-active is-danger' : ''} onClick={() => setDirection('down')}>收紧 / 升级 / 上升</button></div>
          <div className="sandbox__metric-grid"><div className="sandbox__metric"><small>推演后流量</small><strong>{formatTons(result.totalVolumeT)}</strong><span className={result.deltaVolumeT >= 0 ? 'is-positive' : 'is-negative'}>{result.deltaVolumeT >= 0 ? '+' : ''}{formatTons(result.deltaVolumeT)} vs 基线</span></div><div className="sandbox__metric"><small>最高影响等级</small><strong>第 {result.highestImpactLevel} 级</strong><span>当前判定：{impactLabel(result.highestImpactLevel)}</span></div><div className="sandbox__metric"><small>正 / 负向目的国</small><strong>{result.positiveImpactCount} / {result.negativeImpactCount}</strong><span>只表示方向，不等于吨数精度</span></div><div className="sandbox__metric"><small>残余矛盾</small><strong>{result.residualCountryKeys.length} 个</strong><span>高亮线路 / 风险层</span></div></div>
          <button type="button" className="sandbox__save" onClick={saveScenario}>保存当前推演方案 <span>→</span></button>
        </section>
        <section className="sandbox__panel sandbox__panel--config">
          <div className="sandbox__panel-title"><div><span>EDITABLE INPUTS</span><h2>贸易操作配置</h2></div><button type="button" onClick={() => setShowConfig((current) => !current)} aria-expanded={showConfig}>{showConfig ? '收起' : '展开'}</button></div>
          {showConfig && <div className="sandbox__config-body"><label className="sandbox__range-label"><span>出口订单规模</span><strong>{formatTons(config.orderVolumeT)}</strong><input type="range" min="100000" max={Math.max(3000000, Math.ceil(baselineTotal * 1.6))} step="1000" value={config.orderVolumeT} onChange={(event) => setConfig((current) => ({ ...current, orderVolumeT: Number(event.target.value) }))} /></label><label className="sandbox__select-label"><span>策略取向</span><select value={config.strategy} onChange={(event) => setConfig((current) => ({ ...current, strategy: event.target.value as SandboxConfig['strategy'] }))}><option value="balanced">均衡分配</option><option value="core-first">核心市场优先</option><option value="risk-hedge">风险对冲优先</option></select></label><div className="sandbox__weight-head"><span>品类权重（总计 100%）</span><strong>{Object.values(config.productWeights).reduce((sum, value) => sum + value, 0)}%</strong></div><div className="sandbox__weights">{([['hotRolled', '热轧'], ['mediumPlate', '中厚板'], ['coldCoated', '冷镀'], ['tinplate', '镀锡板'], ['siliconSteel', '硅钢'], ['automotive', '汽车板']] as Array<[keyof SandboxConfig['productWeights'], string]>).map(([key, label]) => <label key={key}><span>{label}</span><input type="number" min="0" max="100" value={config.productWeights[key]} onChange={(event) => setConfig((current) => ({ ...current, productWeights: { ...current.productWeights, [key]: finite(Number(event.target.value), 0) } }))} /></label>)}</div></div>}
          <div className="sandbox__config-note">编辑仅作用于沙盘覆盖层，不回写原始业务数据库；可重置到真实快照。未来 AI 指令接入点：<code>SandboxCommandAdapter</code></div>
        </section>
        <section className="sandbox__panel sandbox__panel--targets"><div className="sandbox__panel-title"><div><span>MARKET ALLOCATION</span><h2>目标市场 <em>{selectedTargetCount ? `已选 ${selectedTargetCount}` : '全量'}</em></h2></div><span className="sandbox__tiny-note">点击国家加入 / 移除 · 线路按需显示</span></div><label className="sandbox__search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索全部 ${countries.length} 个国家`} /></label><div className="sandbox__country-list">{visibleCountryList.map((country, index) => <button key={country.key} type="button" className={`sandbox__country-row ${activeCountryKey === country.key ? 'is-active' : ''} ${config.targetKeys.includes(country.key) ? 'is-target' : ''}`} onMouseEnter={() => setHoveredCountryKey(country.key)} onFocus={() => setHoveredCountryKey(country.key)} onClick={() => toggleTarget(country)}><b>{String(index + 1).padStart(3, '0')}</b><span><strong>{country.name}</strong><small>{country.internalVolumeT > 0 ? `${formatTons(country.internalVolumeT)} · ${formatPct(country.internalSharePct)} · 客户 ${country.customerCount}` : '暂无内部快照 · 可作为推演目标'}</small></span><span className="sandbox__country-bar"><i style={{ transform: `scaleX(${Math.max(.05, Math.min(1, country.internalSharePct / Math.max(allBusiness[0]?.internalSharePct || 1, 1)))})` }} /></span><em>{config.targetKeys.includes(country.key) ? '已选' : '加入'}</em></button>)}</div><small className="sandbox__list-foot">默认显示业务量前 10 个；输入国家名可检索全部边界，选中后地图聚焦并仅显示对应线路。</small></section>
        <section className="sandbox__panel sandbox__panel--review"><button type="button" className="sandbox__review-toggle" onClick={() => setShowScenarios((current) => !current)}><span><small>REPLAY & COMPARE</small><strong>推演记录与复盘</strong></span><b>{scenarios.length} 套 <span>{showScenarios ? '⌃' : '⌄'}</span></b></button>{showScenarios && <div className="sandbox__scenario-list">{scenarios.length ? scenarios.map((item) => <div className="sandbox__scenario-row" key={item.id}><span><strong>{item.result.label}</strong><small>{formatDate(item.createdAt)} · {item.result.residualCountryKeys.length} 个残余矛盾</small></span><b>{item.result.deltaVolumeT >= 0 ? '+' : ''}{formatTons(item.result.deltaVolumeT)}</b></div>) : <p>保存方案后，这里会保留最近 8 套可比对记录。</p>}</div>}</section>
      </aside>
    </section>
    <section className="sandbox__lower-grid">
      <article className="sandbox__lower-panel"><div className="sandbox__lower-heading"><div><span>ACTIVE OVERLAY</span><h2>残余矛盾与风险定位</h2></div><small>{visibleMarkers.length} 个地图标注 · {activeLayers.residual ? '残余层已显示' : '残余层已隐藏'}</small></div><div className="sandbox__marker-list">{visibleMarkers.slice(0, 8).map((marker) => <button type="button" className="sandbox__marker-row" key={marker.id} onClick={() => selectCountry(countries.find((country) => country.key === marker.countryKey) || countries[0])}><i className={`is-${marker.kind}`} /><span><strong>{marker.title}</strong><small>{marker.detail} · {marker.polarity} · 第{marker.impactLevel}级 {impactLabel(marker.impactLevel)}</small></span><em>{marker.kind === 'remedy' ? '救济' : marker.kind === 'quota' ? '配额' : '政策'}</em></button>)}{!visibleMarkers.length && <p className="sandbox__empty">当前图层已隐藏，或真实快照中暂无可定位标注。</p>}</div></article>
      <article className="sandbox__lower-panel sandbox__lower-panel--flow"><div className="sandbox__lower-heading"><div><span>FLOW RESPONSE</span><h2>模拟流向反馈</h2></div><small>按推演后流量排序 · 影响等级优先理解</small></div><div className="sandbox__flow-list">{flows.slice().sort((a, b) => b.simulatedVolumeT - a.simulatedVolumeT).slice(0, 7).map((flow) => <div className={`sandbox__flow-row ${flow.isResidual ? 'is-residual' : ''}`} key={flow.key}><span className="sandbox__flow-rank">{flow.polarity === '0' ? '·' : flow.polarity}{flow.impactLevel}</span><span><strong>{flow.name}</strong><small>{flow.isImproved ? '优化后增强' : flow.isResidual ? '仍受风险约束' : '基线同步'} · {impactLabel(flow.impactLevel)}</small></span><i><b style={{ transform: `scaleX(${Math.max(.03, Math.min(1, flow.simulatedVolumeT / Math.max(...flows.map((item) => item.simulatedVolumeT), 1)))})` }} /></i><strong className="sandbox__flow-value">{formatTons(flow.simulatedVolumeT)}</strong></div>)}</div></article>
    </section>
    <footer className="sandbox__footer"><span>贸易沙盘模拟 · 数据层只读复用现有快照，配置为本地模拟覆盖层</span><span>风险 {bundle.risks.length} 条 · 政策 {bundle.policies.length} 条 · 活动救济 {bundle.remedies?.summary.active_case_count || 0} 项 · 原始模块保持不变</span></footer>
  </div>;
}
