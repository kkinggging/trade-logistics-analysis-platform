import type {
  InternalBusinessCustomerSnapshot,
  InternalBusinessSnapshot,
  PolicyEvent,
  RiskSignal,
  SteelExportSnapshot,
  TaricQuotaSnapshot,
  TradeRemedySnapshot,
} from '@/core/store/types';

export type SandboxLayer = 'risk' | 'events' | 'flows' | 'residual';
export type SandboxDirection = 'up' | 'down';
export type SandboxPolarity = '+' | '-' | '0';
export type SandboxImpactLevel = 1 | 2 | 3 | 4 | 5;

export type SandboxVariable =
  | 'remedy'
  | 'quota'
  | 'policy'
  | 'fed'
  | 'chokepoint'
  | 'freight';

export interface SandboxProductWeights {
  hotRolled: number;
  mediumPlate: number;
  coldCoated: number;
  tinplate: number;
  siliconSteel: number;
  automotive: number;
}

export interface SandboxConfig {
  orderVolumeT: number;
  targetKeys: string[];
  productWeights: SandboxProductWeights;
  strategy: 'balanced' | 'core-first' | 'risk-hedge';
}

export interface SandboxCountry {
  key: string;
  name: string;
  worldName: string;
  center: { lat: number; lng: number };
  internalVolumeT: number;
  internalSharePct: number;
  customerCount: number;
  activeRemedyCount: number;
  policyCount: number;
  highRiskCount: number;
  hasQuotaRegion: boolean;
  quotaRegion: 'EU' | 'UK' | null;
  actualStatus: 'business' | 'unmatched';
}

export interface SandboxFlow extends SandboxCountry {
  simulatedVolumeT: number;
  flowFactor: number;
  isTarget: boolean;
  isResidual: boolean;
  isImproved: boolean;
  impactLevel: SandboxImpactLevel;
  polarity: SandboxPolarity;
}

export interface SandboxMarker {
  id: string;
  lat: number;
  lng: number;
  countryKey: string;
  title: string;
  detail: string;
  kind: 'remedy' | 'policy' | 'quota';
  severity: number;
  impactLevel: SandboxImpactLevel;
  polarity: SandboxPolarity;
}

export interface SandboxScenarioResult {
  variable: SandboxVariable;
  direction: SandboxDirection;
  label: string;
  impactedCountryKeys: string[];
  residualCountryKeys: string[];
  totalVolumeT: number;
  deltaVolumeT: number;
  affectedFlowCount: number;
  highestImpactLevel: SandboxImpactLevel;
  positiveImpactCount: number;
  negativeImpactCount: number;
}

export interface SandboxScenarioRecord {
  id: string;
  createdAt: string;
  config: SandboxConfig;
  result: SandboxScenarioResult;
}

export interface SandboxDataBundle {
  internal: InternalBusinessSnapshot | null;
  customers: InternalBusinessCustomerSnapshot | null;
  customs: SteelExportSnapshot | null;
  risks: RiskSignal[];
  policies: PolicyEvent[];
  remedies: TradeRemedySnapshot | null;
  quota: TaricQuotaSnapshot | null;
}

export interface SandboxCommandAdapter {
  applyCommand: (command: string, config: SandboxConfig) => SandboxConfig;
}
