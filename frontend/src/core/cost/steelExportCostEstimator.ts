import { ForexSnapshot } from '@/core/store/types';
import {
  CbamEstimate,
  CostDataContext,
  CostEstimate,
  CostInput,
  CostTradeTerm,
  DestinationRegion,
  FxSettlementResult,
  ProductDefinition,
  RangeValue,
  SteelCostProduct,
} from './types';

export const PRODUCT_DEFINITIONS: Record<SteelCostProduct, ProductDefinition> = {
  'hot-rolled': { key: 'hot-rolled', label: '热轧', cnPrefixes: ['7208'], cnDisplay: 'CN 7208', cbamGroup: 'hot_flat' },
  'medium-plate': { key: 'medium-plate', label: '中厚板', cnPrefixes: ['7208', '7219'], cnDisplay: 'CN 7208 / 7219', cbamGroup: 'hot_flat' },
  'cold-coated': { key: 'cold-coated', label: '冷镀', cnPrefixes: ['7210'], cnDisplay: 'CN 7210', cbamGroup: 'coated_flat' },
  tinplate: { key: 'tinplate', label: '镀锡板', cnPrefixes: ['7210-1', '7212-1'], cnDisplay: 'CN 7210-1 / 7212-1', cbamGroup: 'coated_flat' },
  'silicon-steel': { key: 'silicon-steel', label: '硅钢', cnPrefixes: ['7225'], cnDisplay: 'CN 7225', cbamGroup: 'electrical_steel' },
  'automotive-plate': { key: 'automotive-plate', label: '汽车板', cnPrefixes: ['7208', '7209', '7210'], cnDisplay: '跟随基材 CN 7208 / 7209 / 7210', cbamGroup: 'coated_flat', requiresBase: true },
};

export const DEFAULT_COST_PARAMETERS = {
  port_handling_usd_per_t: { min: 4, max: 9, note: '行业经验笼统估算区间' },
  insurance_rate: { min: 0.0005, max: 0.0015, note: '按货值的行业经验百分比' },
  shipping_mappings: {
    CCFI: { code: 'CCFI', label: 'CCFI 中国出口集装箱运价指数', vessel_mode: 'container' as const, factor_min_usd_per_index_point: 0.018, factor_max_usd_per_index_point: 0.028, note: '指数点到美元/吨的映射推演' },
    SCFI: { code: 'SCFI', label: 'SCFI 上海出口集装箱运价指数', vessel_mode: 'container' as const, factor_min_usd_per_index_point: 0.012, factor_max_usd_per_index_point: 0.022, note: '指数点到美元/吨的映射推演' },
    BSI: { code: 'BSI', label: 'BSI 波罗的海超灵便型散货指数', vessel_mode: 'bulk' as const, factor_min_usd_per_index_point: 0.018, factor_max_usd_per_index_point: 0.030, note: '指数点到美元/吨的映射推演' },
    BDI: { code: 'BDI', label: 'BDI 波罗的海干散货指数', vessel_mode: 'bulk' as const, factor_min_usd_per_index_point: 0.010, factor_max_usd_per_index_point: 0.020, note: '指数点到美元/吨的映射推演' },
  },
};

function latestRate(forex: ForexSnapshot | null, symbol: 'EURUSD' | 'USDCNY'): number | null {
  const independent = forex?.latest_independent?.[symbol];
  if (independent?.close && Number.isFinite(independent.close)) return independent.close;
  const points = forex?.symbols?.[symbol] || [];
  const last = points[points.length - 1];
  return last?.close && Number.isFinite(last.close) ? last.close : null;
}

function previousRate(forex: ForexSnapshot | null, symbol: 'EURUSD' | 'USDCNY'): number | null {
  const independent = forex?.latest_independent?.[symbol];
  if (independent?.previous_close && Number.isFinite(independent.previous_close)) return independent.previous_close;
  return latestRate(forex, symbol);
}

function range(min: number, max: number): RangeValue {
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function resolvedProduct(input: CostInput): ProductDefinition {
  const product = PRODUCT_DEFINITIONS[input.product];
  if (input.product !== 'automotive-plate') return product;
  if (input.automotiveBase === 'hot-rolled') return { ...product, cnPrefixes: ['7208'], cnDisplay: '汽车板基材 → CN 7208', cbamGroup: 'hot_flat' };
  if (input.automotiveBase === 'cold-rolled') return { ...product, cnPrefixes: ['7209'], cnDisplay: '汽车板基材 → CN 7209', cbamGroup: 'coated_flat' };
  return { ...product, cnPrefixes: ['7210'], cnDisplay: '汽车板基材 → CN 7210', cbamGroup: 'coated_flat' };
}

function getFxResults(input: CostInput, forex: ForexSnapshot | null): FxSettlementResult[] {
  const eurCurrent = latestRate(forex, 'EURUSD');
  const cnyCurrent = latestRate(forex, 'USDCNY');
  const eurFallback = previousRate(forex, 'EURUSD') || 1;
  const cnyFallback = previousRate(forex, 'USDCNY') || 1;
  const eurBase = input.eurBaselineRate > 0 ? input.eurBaselineRate : eurFallback;
  const cnyBase = input.cnyBaselineRate > 0 ? input.cnyBaselineRate : cnyFallback;
  const eurNow = eurCurrent || eurBase;
  const cnyNow = cnyCurrent || cnyBase;
  const eurCurrentUsd = input.eurUnitPrice * eurNow;
  const eurBaselineUsd = input.eurUnitPrice * eurBase;
  const cnyCurrentUsd = input.cnyUnitPrice / cnyNow;
  const cnyBaselineUsd = input.cnyUnitPrice / cnyBase;
  return [
    { scenario: 'EURUSD', label: '场景 A · 欧元签约 → 美元收款', currentRate: eurCurrent, baselineRate: eurBase, currentUsdPerT: eurCurrentUsd, baselineUsdPerT: eurBaselineUsd, deltaUsdPerT: eurCurrentUsd - eurBaselineUsd, sourceLabel: '公开中间价 · EURUSD' },
    { scenario: 'CNYUSD', label: '场景 B · 人民币签约 → 美元收款', currentRate: cnyCurrent, baselineRate: cnyBase, currentUsdPerT: cnyCurrentUsd, baselineUsdPerT: cnyBaselineUsd, deltaUsdPerT: cnyCurrentUsd - cnyBaselineUsd, sourceLabel: '公开中间价 · USDCNY' },
  ];
}

function getCbamEstimate(input: CostInput, context: CostDataContext, product: ProductDefinition): CbamEstimate {
  const regionLabel: Record<DestinationRegion, string> = { EU: '欧盟', UK: '英国', OTHER: '其他地区' };
  if (input.destinationRegion === 'OTHER') {
    return { applicable: false, regionLabel: regionLabel.OTHER, mode: input.cbamEmissionMode, groupLabel: '不适用', emissionUsed: null, faa: null, certificatePriceUsd: null, thirdCountryCredit: 0, costUsdPerT: 0, formula: '非欧盟/英国目的地 → CBAM 不适用', status: '不适用', note: '仅欧盟、英国出口区域触发 CBAM 测算；配额和贸易救济不进入公式。' };
  }
  const params = context.cbam?.regions[input.destinationRegion];
  if (!params) {
    return { applicable: true, regionLabel: regionLabel[input.destinationRegion], mode: input.cbamEmissionMode, groupLabel: '参数缺失', emissionUsed: null, faa: null, certificatePriceUsd: null, thirdCountryCredit: input.thirdCountryPaidCarbonUsdPerT || 0, costUsdPerT: 0, formula: 'CBAM 参数未加载', status: '待参数', note: '参数快照不可用，未将 CBAM 计入汇总。' };
  }
  if (input.destinationRegion === 'UK' && new Date().toISOString().slice(0, 10) < params.effective_date) {
    return { applicable: true, regionLabel: regionLabel.UK, mode: input.cbamEmissionMode, groupLabel: params.groups[product.cbamGroup].label, emissionUsed: null, faa: params.groups[product.cbamGroup].faa_tco2_per_t, certificatePriceUsd: null, thirdCountryCredit: input.thirdCountryPaidCarbonUsdPerT || params.third_country_credit_default_usd_per_t, costUsdPerT: 0, formula: 'UK-CBAM 2027 生效预留 → 当前不计入', status: '2027 生效预留', note: params.note };
  }
  const group = params.groups[product.cbamGroup];
  const emission = input.cbamEmissionMode === 'measured' && input.measuredEmissionTco2PerT > 0
    ? input.measuredEmissionTco2PerT
    : group.default_emission_factor_tco2_per_t * group.default_penalty_factor;
  const eurUsd = latestRate(context.forex, 'EURUSD') || 1;
  const marketQuote = [...context.marketQuotes]
    .filter((quote) => quote.indicator_code === 'CARBON_EUA' && Number.isFinite(quote.value))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const certificatePriceUsd = marketQuote ? marketQuote.value * eurUsd : (params.certificate_price_fallback || 0) * eurUsd;
  const credit = input.thirdCountryPaidCarbonUsdPerT || params.third_country_credit_default_usd_per_t;
  const cost = Math.max(0, (emission - group.faa_tco2_per_t) * certificatePriceUsd - credit);
  return { applicable: true, regionLabel: regionLabel[input.destinationRegion], mode: input.cbamEmissionMode, groupLabel: group.label, emissionUsed: emission, faa: group.faa_tco2_per_t, certificatePriceUsd, thirdCountryCredit: credit, costUsdPerT: cost, formula: '(每吨隐含 CO₂ − FAA) × 当前证书价格 − 第三国已缴碳价', status: '已测算', note: input.cbamEmissionMode === 'measured' ? '采用企业实测排放；仍属于理论测算值。' : '未提供实测排放，采用中国国别默认排放因子及惩罚上浮系数。' };
}

export function estimateSteelExportCost(input: CostInput, context: CostDataContext): CostEstimate {
  const product = resolvedProduct(input);
  const shippingConfig = context.parameters.shipping_mappings[input.shippingIndexCode];
  const series = context.shipping?.series?.[input.shippingIndexCode];
  const indexValue = series?.latest?.value ?? null;
  const mappingMatchesMode = shippingConfig?.vessel_mode === input.vesselMode;
  const shippingAvailable = Boolean(shippingConfig && series && mappingMatchesMode && Number.isFinite(indexValue));
  const shippingRange = shippingAvailable
    ? range(indexValue! * shippingConfig.factor_min_usd_per_index_point, indexValue! * shippingConfig.factor_max_usd_per_index_point)
    : range(0, 0);
  const portHandling = range(context.parameters.port_handling_usd_per_t.min, context.parameters.port_handling_usd_per_t.max);
  const insurance = range(input.cargoValueUsdPerT * context.parameters.insurance_rate.min, input.cargoValueUsdPerT * context.parameters.insurance_rate.max);
  const cbam = getCbamEstimate(input, context, product);
  const freightInTotal = input.tradeTerm === 'FOB' ? range(0, 0) : shippingRange;
  const insuranceInTotal = input.tradeTerm === 'CIF' ? insurance : range(0, 0);
  const summary = range(portHandling.min + freightInTotal.min + insuranceInTotal.min + cbam.costUsdPerT, portHandling.max + freightInTotal.max + insuranceInTotal.max + cbam.costUsdPerT);
  const fx = getFxResults(input, context.forex);
  const terms: Record<CostTradeTerm, string> = { FOB: 'FOB：港杂费纳入；海运与保险仅展示，不计入汇总', CFR: 'CFR：FOB附加成本 + 海运估算区间', CIF: 'CIF：CFR附加成本 + 保险估算区间' };
  return {
    product, resolvedCnDisplay: product.cnDisplay, tradeTerm: input.tradeTerm, destinationRegion: input.destinationRegion,
    portHandling, insurance,
    shipping: { available: shippingAvailable, indexCode: input.shippingIndexCode, indexLabel: shippingConfig?.label || input.shippingIndexCode, indexValue, range: shippingRange, vesselMode: input.vesselMode, method: shippingConfig?.note || '缺少指数映射', note: shippingAvailable ? '该区间由公开航运指数映射推演，不等于实际订舱或提单运费。' : '当前指数未加载或与船型不匹配，暂不计入汇总。' },
    cbam, fx, summary, summaryItems: [terms[input.tradeTerm], '不含钢材购销货价、产品价差、关税配额和贸易救济税率', '汇率损益单列，不并入附加成本汇总'], labels: ['【理论测算值】', '单位：美元/吨'], calculatedAt: new Date().toISOString(),
  };
}

