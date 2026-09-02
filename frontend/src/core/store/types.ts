// 核心数据类型定义

// ============ 产品线与区域 ============
export type ProductLine = 'hot-rolled' | 'cold-rolled' | 'silicon-steel';
export type Region = 'global' | 'europe' | 'asia' | 'americas';
export type TradeTerm = 'FOB' | 'CFR' | 'CIF' | 'DDP';

// ============ 市场行情 ============
export interface MarketQuote {
  quote_id: string;
  date: string;
  source: string;
  indicator_code: string;
  indicator_name: string;
  value: number;
  baseline?: number;
  unit: string;
  currency?: string;
  region?: string;
  product_line?: string;
  product_grade?: string;
  route?: string;
  frequency: 'daily' | 'weekly' | 'monthly' | 'dekadal';
  publish_time: string;
  quality_flag?: string[];
  citation?: string;
  fetch_mode?: 'api' | 'scrape' | 'manual';
}

export interface SteelExportRow {
  key: string;
  label: string;
  qty_t: number;
  amount_usd: number;
  avg_price_usd_t: number;
  name?: string;
  world?: string | null;
  region?: string;
  region6?: string;
  special?: { lng: number; lat: number } | null;
}

export interface SteelExportSnapshot {
  schema_version: string;
  source: {
    source_id: string;
    name: string;
    dashboard_url: string;
    assets_base_url: string;
    generated_at: string | null;
    captured_at: string;
    raw_sha256: string;
    years: number[];
    coverage_start: string;
    coverage_end: string;
    schedule: string;
    excel_role: string;
    source_note: string;
  };
  summary: {
    total_qty_t: number;
    total_amount_usd: number;
    average_price_usd_t: number;
    partner_count: number;
    fact_rows: number;
  };
  concentration: { cr5_pct: number; hhi: number; partner_count: number };
  default_view: {
    filter: { year: number; kind: string; months: number[] };
    summary: SteelExportSnapshot['summary'];
    concentration: SteelExportSnapshot['concentration'];
    monthly: SteelExportRow[];
    partner: SteelExportRow[];
    region: SteelExportRow[];
    region6: SteelExportRow[];
    kind: SteelExportRow[];
    big: SteelExportRow[];
    commodity: SteelExportRow[];
    registration: SteelExportRow[];
  };
  monthly: SteelExportRow[];
  partner: SteelExportRow[];
  region: SteelExportRow[];
  region6: SteelExportRow[];
  kind: SteelExportRow[];
  big: SteelExportRow[];
  commodity: SteelExportRow[];
  registration: SteelExportRow[];
}

export interface ForexPoint {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  ma20: number | null;
  ma60: number | null;
  return_20d: number | null;
  percentile: number;
  sim_usd: number;
}

export interface ForexBacktestPoint {
  date: string;
  settlement_date: string;
  return_pct: number;
}

export interface ForexLatestPoint {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  percentile: number;
  previous_date?: string | null;
  previous_close?: number | null;
  change?: number | null;
  change_pct?: number | null;
}

export interface ForexSnapshot {
  schema_version: string;
  source: { source_id: string; name: string; dashboard_url: string; data_url: string; generated_at: string | null; captured_at: string; raw_sha256: string; schedule: string; window: string; coverage_start: string; coverage_end: string; observation_count: number };
  symbols: { DINIW: ForexPoint[]; USDCNY: ForexPoint[]; EURUSD: ForexPoint[] };
  latest_independent?: { DINIW: ForexLatestPoint; USDCNY: ForexLatestPoint; EURUSD: ForexLatestPoint };
  relative_yield: Array<{ date: string; rel_yield_EUR: number; rel_yield_CNY: number }>;
  risk: Record<'EUR' | 'CNY' | 'USD', { volatility_pct: number; max_drawdown_pct: number; current_relative_yield_pct: number; score_conservative?: number; score_aggressive?: number }>;
  backtests: Record<'30' | '60' | '90', Record<'EUR' | 'CNY' | 'USD', ForexBacktestPoint[]> & { loss_probability_pct?: Record<'EUR' | 'CNY' | 'USD', number> }>;
  methodology: { base_value: number; percentile: string; volatility: string; max_drawdown: string; backtest: string };
}

export interface TaricQuotaRow {
  source_id?: string;
  source_file?: string;
  source_url?: string;
  captured_at?: string;
  source_sha256?: string;
  source_row_number?: number;
  raw_record_ref?: string;
  fetch_date: string;
  fetch_datetime: string;
  start_date_param: string;
  code: string;
  order_number: string;
  validity_period: string;
  origin: string;
  initial_amount_t: number | null;
  amount_t: number | null;
  balance_t: number | null;
  exhaustion_date: string | null;
  critical: boolean;
  last_import_date: string | null;
  last_allocation_date: string | null;
  total_awaiting_allocation_t: number | null;
  blocking_period: string | null;
  suspension_period: string | null;
  allocated_percentage: number | null;
}

export interface TaricQuotaSummary {
  code_count: number;
  initial_amount_t: number;
  balance_t: number;
  used_t: number;
  remaining_pct: number | null;
  exhausted_count: number;
  critical_count: number;
  awaiting_allocation_t: number;
}

export interface TaricQuotaSnapshot {
  schema_version: string;
  source: { source_id: string; name: string; dashboard_url: string; csv_url: string; uk_csv_url?: string; schedule?: string; transport: string; captured_at: string; raw_sha256: string | { eu: string; uk: string }; eu_raw_sha256?: string; uk_raw_sha256?: string; coverage_start: string | null; coverage_end: string | null; record_count: number | { eu: number; uk: number }; record_counts?: { EU: number; UK: number; total: number }; raw_record_counts?: { EU: number; UK: number; total: number }; latest_code_count: number; latest_order_count?: number; latest_distinct_codes?: string[]; latest_distinct_orders?: string[] };
  latest: { as_of: string; summary: TaricQuotaSummary; rows: TaricQuotaRow[] };
  history: Array<{ date: string; } & TaricQuotaSummary>;
  eu?: { as_of: string; summary: TaricQuotaSummary; rows: TaricQuotaRow[]; history: Array<{ date: string; } & TaricQuotaSummary>; quality: TaricQuotaQuality; raw?: TaricQuotaRawLayer; normalized_rows?: TaricQuotaRow[]; origin_index?: TaricQuotaOriginIndexRow[]; origin_groups?: TaricQuotaOriginGroup[]; history_origin_index?: TaricQuotaOriginIndexRow[] };
  uk?: { as_of: string; summary: UkQuotaSummary; rows: UkQuotaRow[]; history: Array<{ date: string; } & UkQuotaSummary>; quality: TaricQuotaQuality; raw?: TaricQuotaRawLayer; normalized_rows?: UkQuotaRow[]; origin_index?: TaricQuotaOriginIndexRow[]; origin_groups?: TaricQuotaOriginGroup[]; history_origin_index?: TaricQuotaOriginIndexRow[] };
  quality?: { eu: TaricQuotaQuality; uk: TaricQuotaQuality };
  methodology: { unit: string; latest: string; remaining_pct: string; used_pct: string; critical: string; note: string };
}

export interface TradeRemedyCase {
  case_id: string; case_no: string | null; case_name: string; case_type: string; case_state: string; latest_stage: string;
  latest_stage_date: string | null; filing_date: string | null; stages_text: string; stages: Array<{ date: string | null; type: string; url: string | null; result: string; original_url: string | null }>;
  product_cn: string; variety: string; variety_tags: string[]; country: string; region: string; hs_codes: string[]; hs_text: string; description: string;
  final_rate: string; final_rate_pct: number | null; final_measure_type: string; final_measure: string; final_measure_detail: string; final_measure_table: unknown[]; measure_table_full: unknown; product_table: unknown;
  sg_table: string; commit_groups: unknown[]; rate_range: string; industry_type: string; source_url: string; original_article_url: string | null; raw_record: unknown;
  first_seen: string | null; last_updated: string | null; category: string; subtype: string; year: number | null;
}
export interface TradeRemedyAggregate { name: string; case_count: number; anti_dumping: number; countervailing: number; safeguard: number; investigating: number; measures_in_force: number; latest_date: string | null; products: string[]; hs_codes: string[]; }
export interface TradeRemedySnapshot {
  schema_version: string;
  source: { source_id: string; name: string; dashboard_url: string; captured_at: string; generated_at: string | null; coverage_start: string | null; coverage_end: string | null; raw_sha256: string; record_count: number; schedule: string; transport: string };
  summary: { total_cases: number; total_raw_steel: number; categories: string[]; case_types: string[]; country_count: number; region_count: number; hs_code_count: number; active_case_count: number };
  cases: TradeRemedyCase[]; aggregates: { country: TradeRemedyAggregate[]; region: TradeRemedyAggregate[] };
  quality: { raw_rows: number; accepted_rows: number; rejected_rows: number; duplicate_case_ids: number; required_fields: string[]; note: string };
  methodology: { map_case_count: string; active_case: string; rate: string; limitation: string };
}

export type SyncSourceState = 'fresh' | 'fallback' | 'unavailable';
export interface DataSyncSourceStatus {
  source_id: string;
  state: SyncSourceState;
  attempted_at: string;
  success_at: string | null;
  snapshot_captured_at: string | null;
  coverage_end: string | null;
  error?: string;
}
export interface DataSyncStatus {
  schema_version: string;
  generated_at: string;
  schedule: string;
  sources: Record<string, DataSyncSourceStatus>;
}

export interface TaricQuotaQuality { raw_rows: number; accepted_rows: number; rejected_rows: number; deduped_rows: number; duplicate_rows_removed?: number; repaired_rows?: Array<{ row: number; reason: string }>; quality_warnings: Array<{ row: number; reason: string }> }
export interface TaricQuotaRawLayer { headers: string[]; rows: Array<{ row: number; raw: string; values: string[]; normalized_values: string[]; structural_repair: boolean; parse_status: 'accepted' | 'rejected'; rejection?: { row: number; reason: string; field_count?: number; expected_field_count?: number }; source_id?: string; source_file?: string; source_url?: string; captured_at?: string; source_sha256?: string; raw_record_ref?: string }> }
export interface TaricQuotaOriginIndexRow { origin_group_id: string; origin_group_name_zh: string; origin_group_name_en: string; origin_group_type: string; origin_text: string; region: string; source_row?: number | null; fetch_date: string; fetch_datetime: string; code: string; order_number?: string | null; validity_period?: string | null; balance_t: number | null; initial_amount_t: number | null; amount_t: number | null; status?: string | null; critical?: boolean | null }
export interface TaricQuotaOriginGroup { id: string; name_zh: string; name_en: string; type: string; record_count: number; code_count: number; codes: string[]; regions: string[]; latest_fetch_date: string | null; shared_pool_note: string }
export interface UkQuotaRow { fetch_date: string; fetch_datetime: string; order_number: string; as_of_date: string; balance_t: number; opening_balance_t: number; pending_balance_t: number | null; status: string; period: string; last_allocation_date: string | null; blocking_period: string | null; country_group: string | null; country_group_id: string | null; commodity_codes: string }
export interface UkQuotaSummary { record_count: number; opening_balance_t: number; balance_t: number; used_t: number; remaining_pct: number | null; pending_balance_t: number; open_count: number }

// ============ 内部聚合数据 ============
export interface InternalAggregate {
  aggregate_id: string;
  period: 'daily' | 'weekly' | 'monthly';
  start_date: string;
  end_date: string;
  product_line: ProductLine;
  product_grade?: string;
  region: string;
  customer_segment?: string;
  order_type?: string;
  volume_t: number;
  target_volume_t?: number;
  completion_pct?: number;
  noise_level?: string;
  as_of: string;
  desensitization_version: string;
}

// ============ 产品成本 ============
export interface ProductCost {
  cost_id: string;
  product_code: string;
  spec?: string;
  trade_term: TradeTerm;
  origin: string;
  destination: string;
  component_code: string;
  component_name: string;
  value_per_ton: number;
  currency: string;
  effective_date: string;
  source: string;
  is_estimate: boolean;
}

// ============ 汇率情景 ============
export interface FxScenario {
  scenario_id: string;
  base_currency: string;
  quote_currency: string;
  scenario_name: string;
  base_rate: number;
  scenario_pct: number;
  scenario_rate: number;
  as_of: string;
}

// ============ 政策事件 ============
export interface PolicyEvent {
  event_id: string;
  title: string;
  issuer: string;
  publish_date: string;
  effective_date?: string;
  expiry_date?: string;
  country_region: string;
  product_scope?: string[];
  event_type: 'tariff' | 'regulation' | 'subsidy' | 'ban' | 'quota' | 'anti_dumping';
  severity: number;
  summary: string;
  source_url?: string;
  original_text_hash?: string;
  verify_status: 'verified' | 'pending' | 'unverified';
}

// ============ 风险信号 ============
export interface RiskSignal {
  signal_id: string;
  as_of: string;
  factor: string;
  metric: string;
  value: number;
  baseline?: number;
  delta_pct?: number;
  rule_id?: string;
  level: 'normal' | 'attention' | 'high_attention' | 'critical';
  score: number;
  evidence_ref?: string[];
  freshness: string;
  review_status: 'pending' | 'confirmed' | 'dismissed';
}

// ============ 船期选项 ============
export interface ShippingOption {
  option_id: string;
  route: string;
  product_line: ProductLine;
  volume_band_t: string;
  port_origin: string;
  destination_port: string;
  vessel_window: string;
  eta: string;
  freight_per_ton: number;
  freight_currency: string;
  capacity_band_t: string;
  deadline?: string;
  constraint_flags?: string[];
  score?: number;
  status: 'available' | 'limited' | 'full';
}

export interface ShippingIndexPoint {
  date: string;
  value: number;
  previousValue: number | null;
  previousDate: string | null;
  changeRatePct: number | null;
  routeName: string | null;
  routeCode: string | null;
}

export interface ShippingIndexSeries {
  code: string;
  label: string;
  category: '集装箱' | '干散货' | '能源';
  frequency: '周频' | '日频';
  unit: string;
  points: ShippingIndexPoint[];
  latest: ShippingIndexPoint;
  observationCount: number;
}

export interface ShippingIndexSnapshot {
  schema_version: string;
  source: { source_id: string; name: string; dashboard_url: string; data_base_url: string; captured_at: string; raw_sha256: Record<string, string>; coverage_start: string; coverage_end: string; schedule: string; transport: string; excel_role: string; source_files: string[] };
  series: Record<string, ShippingIndexSeries>;
  methodology: { change_rate: string; core: string; limitation: string };
}

// ============ 我的钢铁网快讯 ============
// 快讯不压缩为 MarketQuote：它需要保留正文、产品标签和原文链接。
export interface FastNewsItem {
  news_id: string;
  published_at: string;
  published_at_ms: number;
  timezone: 'Asia/Shanghai';
  content_text: string;
  content_html?: string;
  raw_content?: string;
  category: { id: number | null; name: string };
  section: { id: number | null; name: string };
  products: Array<{ id: string | number; name: string; source: 'relationBreed' | 'breedTag' | 'source' }>;
  regions: Array<{ id: string | number; name: string }>;
  source_name: string | null;
  source_url: string | null;
  in_article_url: string | null;
  out_article_url: string | null;
  in_article_title: string | null;
  out_article_title: string | null;
  source_link_status: 'article_link' | 'no_link';
  platform_product_line: 'hot-rolled' | 'cold-rolled' | 'silicon-steel' | null;
  mapping_status: 'mapped' | 'unmapped' | 'ambiguous';
  quality_flags: string[];
  data_source?: number | null;
  publisher_id?: number | null;
  relation_id?: number | null;
  ai_flag?: number | null;
}

export interface FastNewsSnapshot {
  schema_version: string;
  source: {
    source_id: string;
    name: string;
    dashboard_url: string;
    api_url?: string;
    captured_at: string;
    coverage_start: string;
    coverage_end: string;
    latest_published_at: string;
    timezone: 'Asia/Shanghai';
    fetch_mode: string;
    request_params?: Record<string, unknown>;
    raw_sha256: string;
    page_count: number;
    reported_total: number | null;
    truncation_detected: boolean;
    watermark?: { publisher_time_ms: number; id: string };
  };
  items: FastNewsItem[];
  quality: {
    raw_count: number;
    accepted_count: number;
    rejected_count: number;
    deduped_count: number;
    missing_source_link_count: number;
    missing_product_count: number;
    malformed_content_count: number;
    duplicate_group_count: number;
    warnings: string[];
  };
  taxonomy?: unknown;
}

// ============ 策略卡片 ============
export type StrategyType =
  | 'protect_customers'
  | 'fulfill_target'
  | 'control_cost'
  | 'compliance_check'
  | 'market_maintenance'
  | 'risk_mitigation';

export interface StrategyCard {
  card_id: string;
  strategy_type: StrategyType;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  trigger_facts: string[];
  applicable_scope: {
    product_line: ProductLine[];
    region: string[];
    customer_segment?: string;
  };
  impact_note: {
    cost_risk: 'low' | 'medium' | 'high';
    timeline_risk: 'low' | 'medium' | 'high';
    opportunity_cost?: string;
  };
  review_required: boolean;
  review_prompt?: string;
  editable: boolean;
  user_modified: boolean;
  original_content?: string;
  model_attribution?: {
    model_id: string;
    confidence: number;
    feature_contributions?: Array<{ feature: string; weight: number }>;
  };
}

// ============ 模型清单 ============
export interface ModelManifest {
  manifest_version: string;
  build_timestamp: string;
  data_snapshot_hash: string;
  models: ModelInfo[];
}

export interface ModelInfo {
  model_id: string;
  algorithm: string;
  version: string;
  format: 'json' | 'onnx';
  file_path: string;
  features: string[];
  training_metrics?: {
    accuracy?: number;
    precision?: number;
    recall?: number;
    f1_score?: number;
    samples: number;
  };
  thresholds?: Record<string, number | boolean>;
  fallback_strategy: string;
}

// ============ 晨报 ============
export interface Brief {
  brief_id: string;
  as_of: string;
  snapshot_ids: string[];
  cost_snapshot_id?: string;
  signal_ids: string[];
  nonfinancial_tags: string[];
  draft_text: string;
  reviewer?: string;
  status: 'draft' | 'pending_review' | 'approved' | 'published';
  published_at?: string;
  disclaimer: string;
}

// ============ 审计日志 ============
export interface AuditLog {
  log_id: string;
  user_id: string;
  action: string;
  object_type: string;
  object_id: string;
  before_after?: Record<string, unknown>;
  timestamp: string;
}

// ============ 应用状态 ============
export interface AppState {
  // 全局配置
  productLine: ProductLine;
  region: Region;
  dateRange: [string, string];

  // 数据状态
  marketData: MarketQuote[];
  internalAggregates: InternalAggregate[];
  policyEvents: PolicyEvent[];
  riskSignals: RiskSignal[];
  shippingOptions: ShippingOption[];

  // 模型状态
  modelStatus: {
    loaded: boolean;
    loading: boolean;
    error?: string;
    availableModels: string[];
  };

  // UI状态
  loading: boolean;
  error: string | null;

  // 非财务目标
  objectives: {
    maintainMarket: boolean;
    protectKeyCustomers: boolean;
    fulfillQuota: boolean;
    ensureStability: boolean;
  };
}

// ============ Action类型 ============
export type AppAction =
  | { type: 'SET_PRODUCT_LINE'; payload: ProductLine }
  | { type: 'SET_REGION'; payload: Region }
  | { type: 'SET_DATE_RANGE'; payload: [string, string] }
  | { type: 'SET_MARKET_DATA'; payload: MarketQuote[] }
  | { type: 'SET_INTERNAL_AGGREGATES'; payload: InternalAggregate[] }
  | { type: 'SET_POLICY_EVENTS'; payload: PolicyEvent[] }
  | { type: 'SET_RISK_SIGNALS'; payload: RiskSignal[] }
  | { type: 'SET_SHIPPING_OPTIONS'; payload: ShippingOption[] }
  | { type: 'SET_MODEL_STATUS'; payload: Partial<AppState['modelStatus']> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_OBJECTIVES'; payload: Partial<AppState['objectives']> }
  | { type: 'RESET_STATE' };

// ============ 查询参数 ============
export interface QueryParams {
  productLine?: ProductLine;
  region?: string;
  dateRange?: [string, string];
  limit?: number;
  offset?: number;
}
