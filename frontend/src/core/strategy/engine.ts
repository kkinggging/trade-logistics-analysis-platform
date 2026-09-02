import {
  ForexSnapshot,
  InternalAggregate,
  MarketQuote,
  PolicyEvent,
  RiskSignal,
  SteelExportSnapshot,
  TaricQuotaSnapshot,
  DataSyncStatus,
  ProductCost,
  FxScenario,
  ShippingOption,
  ShippingIndexSnapshot,
} from '@/core/store/types';

export interface StrategyDataInputs {
  quotes: MarketQuote[];
  risks: RiskSignal[];
  policies: PolicyEvent[];
  aggregates: InternalAggregate[];
  forex?: ForexSnapshot | null;
  taricQuota?: TaricQuotaSnapshot | null;
  steelExport?: SteelExportSnapshot | null;
  syncStatus?: DataSyncStatus | null;
  costs?: ProductCost[];
  fxScenarios?: FxScenario[];
  shippingOptions?: ShippingOption[];
  shippingIndices?: ShippingIndexSnapshot | null;
}

export interface AdviceEvidenceMeta {
  source: string;
  capturedAt: string | null;
  snapshotHash: string | null;
  state: 'fresh' | 'fallback' | 'unavailable' | 'unknown';
  coverageEnd: string | null;
}

export interface DataDrivenAdvice {
  id: string;
  category: '定价' | '市场' | '物流' | '汇率' | '配额' | '风险' | '经营';
  priority: '高' | '中' | '低';
  title: string;
  recommendation: string;
  evidence: string[];
  sourceLabels: string[];
  asOf: string[];
  ruleId: string;
  evidenceMeta: AdviceEvidenceMeta[];
}

export interface DataDrivenSalesPlan {
  title: string;
  summary: string;
  actions: string[];
  guardrails: string[];
  evidence: string[];
  advice: DataDrivenAdvice[];
  generatedAt: string;
  dataState: 'ready' | 'partial' | 'unavailable';
}

const dateOf = (value?: string | null) => value ? value.slice(0, 10) : '未知日期';
const latest = (rows: MarketQuote[], predicate: (row: MarketQuote) => boolean) => {
  const sorted = [...rows].filter(predicate).sort((a, b) => `${a.date}${a.publish_time}`.localeCompare(`${b.date}${b.publish_time}`));
  return sorted[sorted.length - 1];
};
const pct = (value: number | null | undefined) => value == null ? '—' : `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
const tons = (value: number | null | undefined) => value == null ? '—' : `${value.toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 吨`;
const hashText = (value: string | { eu: string; uk: string } | undefined) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 12);
  return `EU:${value.eu.slice(0, 8)} / UK:${value.uk.slice(0, 8)}`;
};

function evidenceMeta(input: StrategyDataInputs, sourceId: string, source: string, capturedAt: string | null, snapshotHash: string | null, coverageEnd: string | null): AdviceEvidenceMeta {
  const status = input.syncStatus?.sources[sourceId];
  return { source, capturedAt: status?.snapshot_captured_at || capturedAt, snapshotHash, state: status?.state || 'unknown', coverageEnd: status?.coverage_end || coverageEnd };
}

function metaForLocal(input: StrategyDataInputs, source: string, asOf: string[]): AdviceEvidenceMeta {
  // 本地演示/内部快照没有经过统一外部同步，不把“数据日期”误报成“最新抓取”。
  // 若来源本身有同步记录，则沿用真实的 fresh/fallback/unavailable 状态。
  const status = input.syncStatus?.sources[source] || Object.values(input.syncStatus?.sources || {}).find((item) => item.source_id === source);
  return {
    source,
    capturedAt: status?.snapshot_captured_at || null,
    snapshotHash: null,
    state: status?.state || 'unknown',
    coverageEnd: status?.coverage_end || asOf[asOf.length - 1] || null,
  };
}

function hasDegradedSource(input: StrategyDataInputs) {
  return Object.values(input.syncStatus?.sources || {}).some((source) => source.state === 'fallback' || source.state === 'unavailable');
}

function buildAdvice(input: StrategyDataInputs): DataDrivenAdvice[] {
  const advice: DataDrivenAdvice[] = [];
  const steel = latest(input.quotes, (row) => row.indicator_code.startsWith('STEEL_'));
  const freight = latest(input.quotes, (row) => row.indicator_code.includes('FREIGHT'));
  const shippingIndex = input.shippingIndices?.series?.BDI || input.shippingIndices?.series?.BSI;
  const activeRisks = input.risks.filter((row) => row.review_status !== 'dismissed' && row.level !== 'normal');
  const recentPolicies = input.policies.filter((row) => row.publish_date >= new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const eu = input.taricQuota?.eu || (input.taricQuota ? { ...input.taricQuota.latest, history: input.taricQuota.history } : null);
  const uk = input.taricQuota?.uk;

  if (input.forex) {
    const eur = input.forex.risk.EUR;
    const cny = input.forex.risk.CNY;
    const selected = eur.score_conservative != null && cny.score_conservative != null && eur.score_conservative >= cny.score_conservative ? 'EUR' : 'CNY';
    advice.push({ id: 'fx-terms', ruleId: 'FX-TERM-001', category: '汇率', priority: '高', title: '签约币种建议', recommendation: `保守评分下优先把 ${selected} 作为重点报价币种候选；最终签约前按账期回测和客户接受度复核，不自动替代人工决策。`, evidence: [`EUR 相对收益 ${pct(eur.current_relative_yield_pct)}，保守评分 ${eur.score_conservative?.toFixed(2) ?? '—'}`, `CNY 相对收益 ${pct(cny.current_relative_yield_pct)}，保守评分 ${cny.score_conservative?.toFixed(2) ?? '—'}`, `${input.forex.source.coverage_start} 至 ${input.forex.source.coverage_end} 的历史统计`], sourceLabels: ['外汇汇率看板'], asOf: [input.forex.source.coverage_end], evidenceMeta: [evidenceMeta(input, 'forex-dashboard-public', '外汇汇率看板', input.forex.source.captured_at, hashText(input.forex.source.raw_sha256), input.forex.source.coverage_end)] });
  }

  if (eu) {
    const summary = eu.summary;
    if (summary.remaining_pct != null && (summary.remaining_pct <= 30 || summary.exhausted_count > 0)) {
      const tightest = [...eu.rows].sort((a, b) => ((a.balance_t || 0) / (a.initial_amount_t || 1)) - ((b.balance_t || 0) / (b.initial_amount_t || 1)))[0];
      advice.push({ id: 'eu-quota', ruleId: 'QUOTA-EU-001', category: '配额', priority: '高', title: 'EU 配额紧张，报价先核配额', recommendation: 'EU 订单报价前先校验对应 Code 的可用余额和临界状态；对余额不足或已耗尽 Code 暂缓承诺免税配额，转人工核验替代路径。', evidence: [`EU 总剩余比例 ${summary.remaining_pct.toFixed(1)}%，已耗尽 ${summary.exhausted_count} 个 Code`, tightest ? `最低余额 Code ${tightest.code}：${tightest.code} 余额 ${tons(tightest.balance_t)}，剩余比例 ${((tightest.balance_t || 0) / (tightest.initial_amount_t || 1) * 100).toFixed(1)}%` : '未找到可比较 Code', `快照日期 ${eu.as_of}`], sourceLabels: ['EU TARIC 关税配额 CSV'], asOf: [eu.as_of], evidenceMeta: [evidenceMeta(input, 'taric-quota-dashboard-public', 'EU TARIC 关税配额 CSV', input.taricQuota?.source.captured_at || null, hashText(input.taricQuota?.source.raw_sha256), eu.as_of)] });
    } else {
      advice.push({ id: 'eu-quota-monitor', ruleId: 'QUOTA-EU-002', category: '配额', priority: '低', title: 'EU 配额保持跟踪', recommendation: '当前总余额尚未触发紧张阈值，报价仍需按具体 Code 和原产地逐单核验。', evidence: [`EU 总剩余比例 ${summary.remaining_pct?.toFixed(1) ?? '—'}%`, `快照日期 ${eu.as_of}`], sourceLabels: ['EU TARIC 关税配额 CSV'], asOf: [eu.as_of], evidenceMeta: [evidenceMeta(input, 'taric-quota-dashboard-public', 'EU TARIC 关税配额 CSV', input.taricQuota?.source.captured_at || null, hashText(input.taricQuota?.source.raw_sha256), eu.as_of)] });
    }
  }

  if (uk) {
    const summary = uk.summary;
    advice.push({ id: 'uk-quota', ruleId: 'QUOTA-UK-001', category: '配额', priority: summary.remaining_pct != null && summary.remaining_pct < 30 ? '高' : '中', title: 'UK 配额独立核验', recommendation: `UK 当前状态为 ${uk.rows[0]?.status || '未知'}，报价前单独校验订单号、适用 HS 编码和剩余余额；不得用 EU 配额余额替代 UK 口径。`, evidence: [`订单 ${uk.rows[0]?.order_number || '—'}，余额 ${tons(summary.balance_t)}`, `剩余比例 ${summary.remaining_pct?.toFixed(1) ?? '—'}%，适用期 ${uk.rows[0]?.period || '—'}`, `快照日期 ${uk.as_of}`], sourceLabels: ['UK 关税配额 CSV'], asOf: [uk.as_of], evidenceMeta: [evidenceMeta(input, 'taric-quota-dashboard-public', 'UK 关税配额 CSV', input.taricQuota?.source.captured_at || null, hashText(input.taricQuota?.source.raw_sha256), uk.as_of)] });
  }

  if (input.steelExport) {
    const view = input.steelExport.default_view;
    const top = view.partner[0];
    const concentration = input.steelExport.concentration;
    advice.push({ id: 'export-market', ruleId: 'EXPORT-MARKET-001', category: '市场', priority: '中', title: '贸易伙伴市场配置', recommendation: top ? `优先把 ${top.name || top.label} 作为现有需求验证市场，同时结合伙伴集中度 ${concentration.cr5_pct.toFixed(1)}% 控制单一市场依赖；新增市场需先做客户和合规核验。` : '当前贸易伙伴数据不足，暂不输出市场扩张方向。', evidence: [`覆盖 ${input.steelExport.source.coverage_start} 至 ${input.steelExport.source.coverage_end}`, `贸易伙伴 ${concentration.partner_count} 个，CR5 ${concentration.cr5_pct.toFixed(1)}%`, top ? `累计出口量最高伙伴：${top.name || top.label}，${tons(top.qty_t)}` : '无 Top 伙伴数据'], sourceLabels: ['中国海关钢材出口看板'], asOf: [input.steelExport.source.coverage_end], evidenceMeta: [evidenceMeta(input, 'steel-export-dashboard-public', '中国海关钢材出口看板', input.steelExport.source.captured_at, hashText(input.steelExport.source.raw_sha256), input.steelExport.source.coverage_end)] });
  }

  if (freight?.baseline != null && freight.value > freight.baseline) {
    const change = (freight.value / freight.baseline - 1) * 100;
    advice.push({ id: 'freight', ruleId: 'FREIGHT-001', category: '物流', priority: change >= 30 ? '高' : '中', title: '运费变化下的发运节奏', recommendation: change >= 30 ? '优先锁定交期刚性的高价值订单，非紧急订单先复核客户交期与替代航线，不直接承诺延迟。' : '运费高于基线，报价中应复核运费有效期并同步运输方案。', evidence: [`${freight.indicator_name} ${freight.value.toFixed(2)} ${freight.unit}`, `较基线 ${pct(change)}`, `数据日期 ${dateOf(freight.date)}`], sourceLabels: [freight.source], asOf: [dateOf(freight.date)], evidenceMeta: [metaForLocal(input, freight.source, [dateOf(freight.date)])] });
  }

  if (shippingIndex?.latest) {
    const change = shippingIndex.latest.changeRatePct;
    advice.push({ id: 'shipping-index', ruleId: 'SHIPPING-INDEX-001', category: '物流', priority: change != null && Math.abs(change) >= 2 ? '高' : '中', title: '航运指数纳入发运节奏', recommendation: change != null && change >= 2 ? '干散货/船运市场近期走强，报价和交期应缩短运费有效期，并优先核对已筛选路线的舱位与 ETA。' : change != null && change <= -2 ? '航运指数近期回落，可在满足交期的前提下比较替代船期，但仍需以实际舱位和运输方案为准。' : '航运指数变化未形成明显方向，运输方案按实际运费、舱位、ETA 和路线约束核定。', evidence: [`${shippingIndex.label} ${shippingIndex.latest.value.toFixed(2)} ${shippingIndex.unit}`, `最新变化 ${change == null ? '—' : `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`} · ${shippingIndex.latest.date}`, '指数只反映市场环境，不替代具体船期或舱位'], sourceLabels: ['航运指数数据看板'], asOf: [shippingIndex.latest.date], evidenceMeta: [evidenceMeta(input, 'shipping-index-dashboard-public', '航运指数数据看板', input.shippingIndices?.source.captured_at || null, Object.values(input.shippingIndices?.source.raw_sha256 || {})[0] || null, input.shippingIndices?.source.coverage_end || null)] });
  }

  if (steel?.baseline != null) {
    const change = (steel.value / steel.baseline - 1) * 100;
    advice.push({ id: 'steel-price', ruleId: 'STEEL-PRICE-001', category: '定价', priority: Math.abs(change) >= 8 ? '高' : '中', title: '钢价报价复核', recommendation: change >= 8 ? '对新询盘优先采用短有效期报价，并在成交前复核成本和汇率；不直接套用固定加价比例。' : change <= -8 ? '下跌环境下保留报价弹性，先核实成本底线和客户需求，再决定让价幅度。' : '钢价变化未触发明显阈值，报价按成本、汇率和客户条件综合核定。', evidence: [`${steel.indicator_name} ${steel.value.toFixed(2)} ${steel.unit}`, `较基线 ${pct(change)}`, `数据日期 ${dateOf(steel.date)}`], sourceLabels: [steel.source], asOf: [dateOf(steel.date)], evidenceMeta: [metaForLocal(input, steel.source, [dateOf(steel.date)])] });
  }

  const latestCosts = input.costs ? [...input.costs].sort((a, b) => a.effective_date.localeCompare(b.effective_date)) : [];
  if (latestCosts.length) {
    const latestDate = latestCosts[latestCosts.length - 1].effective_date;
    const sameScenario = latestCosts.filter((item) => item.effective_date === latestDate);
    const average = sameScenario.reduce((sum, item) => sum + item.value_per_ton, 0) / sameScenario.length;
    advice.push({ id: 'cost-floor', ruleId: 'COST-FLOOR-001', category: '定价', priority: '中', title: '报价先锁定成本底线', recommendation: `当前最新成本场景均值为 ${average.toFixed(2)} ${sameScenario[0].currency}/吨；报价需以最新成本分项、贸易术语和目的地复核毛利底线，不直接沿用历史报价。`, evidence: [`最新成本日期 ${latestDate}`, `纳入 ${sameScenario.length} 个成本分项，均值 ${average.toFixed(2)} ${sameScenario[0].currency}/吨`, `场景 ${sameScenario[0].origin} → ${sameScenario[0].destination} · ${sameScenario[0].trade_term}`], sourceLabels: [...new Set(sameScenario.map((item) => item.source))], asOf: [latestDate], evidenceMeta: [metaForLocal(input, '产品成本快照', [latestDate])] });
  }

  const shipping = input.shippingOptions || [];
  const limitedShipping = shipping.filter((option) => option.status !== 'available');
  if (shipping.length) {
    const route = shipping[0];
    advice.push({ id: 'shipping-capacity', ruleId: 'SHIPPING-CAPACITY-001', category: '物流', priority: limitedShipping.length === shipping.length ? '高' : limitedShipping.length ? '中' : '低', title: '船期与舱位纳入成交条件', recommendation: limitedShipping.length ? `当前 ${limitedShipping.length}/${shipping.length} 个船期选项处于受限或满舱状态；先按可用船期核对交期，再向客户确认交付窗口。` : `当前船期选项均可用；成交前仍需核对 ${route.route} 的 ETA、舱位与运费有效期。`, evidence: [`船期选项 ${shipping.length} 个，可用 ${shipping.length - limitedShipping.length} 个`, route ? `示例路线 ${route.route} · ETA ${route.eta} · ${route.freight_per_ton} ${route.freight_currency}/吨` : '未提供路线明细'], sourceLabels: ['运输方案快照'], asOf: shipping.map((item) => item.eta).filter(Boolean).slice(-1), evidenceMeta: [metaForLocal(input, '运输方案快照', shipping.map((item) => item.eta).filter(Boolean))] });
  }

  if (activeRisks.length) {
    const riskDates = [...new Set(activeRisks.map((row) => row.as_of.slice(0, 10)))];
    advice.push({ id: 'risk-gate', ruleId: 'RISK-GATE-001', category: '风险', priority: activeRisks.some((row) => row.level === 'critical') ? '高' : '中', title: '风险信号作为成交前置条件', recommendation: '在风险信号完成人工审核前，不将相关区域或订单直接纳入积极销售动作；先完成证据核验、客户沟通和替代方案评估。', evidence: activeRisks.slice(0, 4).map((row) => `${row.factor} · ${row.metric} · ${row.level} · ${row.as_of.slice(0, 10)}`), sourceLabels: ['平台风险信号'], asOf: riskDates, evidenceMeta: [metaForLocal(input, '平台风险信号', riskDates)] });
  }

  if (recentPolicies.length) {
    const policyDates = recentPolicies.map((row) => row.publish_date);
    advice.push({ id: 'policy-gate', ruleId: 'POLICY-GATE-001', category: '风险', priority: recentPolicies.some((row) => row.severity >= 4) ? '中' : '低', title: '政策事件纳入报价审查', recommendation: '近 30 天政策事件需要逐项确认适用产品、原产地和生效日期，再决定报价与交付承诺。', evidence: recentPolicies.slice(0, 3).map((row) => `${row.title} · ${row.country_region} · ${row.publish_date}`), sourceLabels: [...new Set(recentPolicies.map((row) => row.issuer))], asOf: policyDates, evidenceMeta: [metaForLocal(input, '政策事件', policyDates)] });
  }

  if (input.aggregates.length) {
    const volume = input.aggregates.reduce((sum, row) => sum + row.volume_t, 0); const target = input.aggregates.reduce((sum, row) => sum + (row.target_volume_t || 0), 0); const completion = target ? volume / target * 100 : null;
    const aggregateDates = [...new Set(input.aggregates.map((row) => dateOf(row.end_date)))].slice(-3);
    advice.push({ id: 'target', ruleId: 'TARGET-001', category: '经营', priority: completion != null && completion < 80 ? '中' : '低', title: '经营目标与销售节奏', recommendation: completion != null && completion < 80 ? '当前经营目标完成率偏低，销售方案应优先补齐目标缺口，并拆分到产品线、区域和客户，而不是只扩大报价量。' : '经营目标完成情况未形成明显缺口，销售动作按客户和利润条件筛选。', evidence: [`统计销量 ${tons(volume)}，目标 ${tons(target)}`, `目标完成率 ${completion?.toFixed(1) ?? '—'}%`], sourceLabels: ['内部经营聚合'], asOf: aggregateDates, evidenceMeta: [metaForLocal(input, '内部经营聚合', aggregateDates)] });
  }

  return advice.sort((a, b) => ({ 高: 0, 中: 1, 低: 2 }[a.priority] - ({ 高: 0, 中: 1, 低: 2 }[b.priority])));
}

export function buildDataDrivenAdvice(input: StrategyDataInputs) {
  return buildAdvice(input);
}

export function buildDataDrivenSalesPlan(input: StrategyDataInputs): DataDrivenSalesPlan {
  if (!input.quotes.length && !input.risks.length && !input.policies.length && !input.aggregates.length && !input.forex && !input.taricQuota && !input.steelExport && !input.costs?.length && !input.shippingOptions?.length) {
    return { title: '数据驱动销售方案', summary: '当前没有可用数据依据，暂不生成销售方案。', actions: [], guardrails: ['请先恢复至少一个数据源或加载最近成功快照。'], evidence: [], advice: [], generatedAt: new Date().toISOString(), dataState: 'unavailable' };
  }
  const advice = buildAdvice(input);
  const high = advice.filter((item) => item.priority === '高');
  const actions = advice.slice(0, 6).map((item) => `${item.title}：${item.recommendation}`);
  const guardrails = [...new Set(advice.flatMap((item) => item.category === '风险' || item.category === '配额' ? item.evidence.slice(0, 1) : []))];
  const evidence = [...new Set(advice.flatMap((item) => item.evidence))].slice(0, 14);
  const hasFallback = advice.some((item) => item.evidenceMeta.some((meta) => meta.state === 'fallback')) || hasDegradedSource(input);
  const missingAdvanced = [
    !input.forex && '外汇历史统计',
    !input.steelExport && '海关出口伙伴数据',
    !input.taricQuota && 'EU/UK 配额数据',
    !input.shippingIndices && '航运指数数据',
  ].filter(Boolean) as string[];
  if (missingAdvanced.length) guardrails.unshift(`进阶数据未齐全：缺少 ${missingAdvanced.join('、')}；不得将当前结果视为完整销售方案。`);
  const isPartial = hasFallback || missingAdvanced.length > 0;
  const dataState = !advice.length ? 'unavailable' : isPartial ? 'partial' : 'ready';
  const stateNote = hasFallback ? '部分外部数据沿用上次成功快照，执行前需复核更新时间。' : '';
  const completenessNote = missingAdvanced.length ? `进阶数据尚未齐全（${missingAdvanced.join('、')}），当前仅输出已有数据的待复核建议。` : '';
  return { title: '数据驱动销售方案', summary: high.length ? `当前有 ${high.length} 项高优先级数据依据，方案先执行风险与合规闸门，再推进报价、市场和发运动作。${stateNote}${completenessNote}` : `当前没有高优先级数据依据，方案以持续跟踪和人工核定报价条件为主。${stateNote}${completenessNote}`, actions, guardrails, evidence, advice, generatedAt: new Date().toISOString(), dataState };
}
