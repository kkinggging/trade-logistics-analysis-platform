import {
  ForexSnapshot,
  InternalBusinessSnapshot,
  MarketQuote,
  ShippingIndexSnapshot,
  TaricQuotaSnapshot,
  TradeRemedySnapshot,
} from '@/core/store/types';

export type SteelCostProduct =
  | 'hot-rolled'
  | 'medium-plate'
  | 'cold-coated'
  | 'tinplate'
  | 'silicon-steel'
  | 'automotive-plate';

export type CostTradeTerm = 'FOB' | 'CFR' | 'CIF';
export type VesselMode = 'container' | 'bulk';
export type DestinationRegion = 'EU' | 'UK' | 'OTHER';
export type CbamEmissionMode = 'default' | 'measured';

export interface ProductDefinition {
  key: SteelCostProduct;
  label: string;
  cnPrefixes: string[];
  cnDisplay: string;
  cbamGroup: 'hot_flat' | 'coated_flat' | 'electrical_steel';
  requiresBase?: boolean;
}

export interface CbamGroupParameter {
  label: string;
  faa_tco2_per_t: number;
  default_emission_factor_tco2_per_t: number;
  default_penalty_factor: number;
}

export interface CbamRegionParameter {
  region: 'EU' | 'UK';
  label: string;
  effective_date: string;
  certificate_currency: 'EUR' | 'GBP';
  certificate_price_fallback: number | null;
  certificate_price_unit: string;
  third_country_credit_default_usd_per_t: number;
  groups: Record<'hot_flat' | 'coated_flat' | 'electrical_steel', CbamGroupParameter>;
  note: string;
}

export interface CbamParameterSnapshot {
  schema_version: string;
  source: {
    source_id: string;
    name: string;
    captured_at: string;
    parameter_status: 'internal_parameter' | 'official_import';
    note: string;
  };
  regions: { EU: CbamRegionParameter; UK: CbamRegionParameter };
}

export interface ShippingIndexMapping {
  code: string;
  label: string;
  vessel_mode: VesselMode;
  factor_min_usd_per_index_point: number;
  factor_max_usd_per_index_point: number;
  note: string;
}

export interface CostEstimatorParameters {
  port_handling_usd_per_t: { min: number; max: number; note: string };
  insurance_rate: { min: number; max: number; note: string };
  shipping_mappings: Record<string, ShippingIndexMapping>;
}

export interface CostInput {
  product: SteelCostProduct;
  automotiveBase: 'hot-rolled' | 'cold-rolled' | 'coated';
  tradeTerm: CostTradeTerm;
  destinationRegion: DestinationRegion;
  vesselMode: VesselMode;
  shippingIndexCode: string;
  eurUnitPrice: number;
  cnyUnitPrice: number;
  eurBaselineRate: number;
  cnyBaselineRate: number;
  cargoValueUsdPerT: number;
  cbamEmissionMode: CbamEmissionMode;
  measuredEmissionTco2PerT: number;
  thirdCountryPaidCarbonUsdPerT: number;
}

export interface CostDataContext {
  forex: ForexSnapshot | null;
  shipping: ShippingIndexSnapshot | null;
  marketQuotes: MarketQuote[];
  cbam: CbamParameterSnapshot | null;
  parameters: CostEstimatorParameters;
}

export interface RangeValue {
  min: number;
  max: number;
}

export interface FxSettlementResult {
  scenario: 'EURUSD' | 'CNYUSD';
  label: string;
  currentRate: number | null;
  baselineRate: number;
  currentUsdPerT: number;
  baselineUsdPerT: number;
  deltaUsdPerT: number;
  sourceLabel: string;
}

export interface ShippingEstimate {
  available: boolean;
  indexCode: string;
  indexLabel: string;
  indexValue: number | null;
  range: RangeValue;
  vesselMode: VesselMode;
  method: string;
  note: string;
}

export interface CbamEstimate {
  applicable: boolean;
  regionLabel: string;
  mode: CbamEmissionMode;
  groupLabel: string;
  emissionUsed: number | null;
  faa: number | null;
  certificatePriceUsd: number | null;
  thirdCountryCredit: number;
  costUsdPerT: number;
  formula: string;
  status: string;
  note: string;
}

export interface CostEstimate {
  product: ProductDefinition;
  resolvedCnDisplay: string;
  tradeTerm: CostTradeTerm;
  destinationRegion: DestinationRegion;
  portHandling: RangeValue;
  insurance: RangeValue;
  shipping: ShippingEstimate;
  cbam: CbamEstimate;
  fx: FxSettlementResult[];
  summary: RangeValue;
  summaryItems: string[];
  labels: string[];
  calculatedAt: string;
}

export interface CostDataBundle {
  forex: ForexSnapshot | null;
  shipping: ShippingIndexSnapshot | null;
  marketQuotes: MarketQuote[];
  quota: TaricQuotaSnapshot | null;
  remedies: TradeRemedySnapshot | null;
  internalBusiness: InternalBusinessSnapshot | null;
  cbam: CbamParameterSnapshot | null;
  parameters: CostEstimatorParameters;
}
