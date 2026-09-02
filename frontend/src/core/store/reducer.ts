import { AppState, AppAction } from './types';

// 初始状态
export const initialState: AppState = {
  productLine: 'hot-rolled',
  region: 'global',
  dateRange: [
    new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    new Date().toISOString().split('T')[0],
  ],
  marketData: [],
  internalAggregates: [],
  policyEvents: [],
  riskSignals: [],
  shippingOptions: [],
  modelStatus: {
    loaded: false,
    loading: false,
    availableModels: [],
  },
  loading: false,
  error: null,
  objectives: {
    maintainMarket: false,
    protectKeyCustomers: false,
    fulfillQuota: false,
    ensureStability: false,
  },
};

// Reducer
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_PRODUCT_LINE':
      return { ...state, productLine: action.payload };

    case 'SET_REGION':
      return { ...state, region: action.payload };

    case 'SET_DATE_RANGE':
      return { ...state, dateRange: action.payload };

    case 'SET_MARKET_DATA':
      return { ...state, marketData: action.payload };

    case 'SET_INTERNAL_AGGREGATES':
      return { ...state, internalAggregates: action.payload };

    case 'SET_POLICY_EVENTS':
      return { ...state, policyEvents: action.payload };

    case 'SET_RISK_SIGNALS':
      return { ...state, riskSignals: action.payload };

    case 'SET_SHIPPING_OPTIONS':
      return { ...state, shippingOptions: action.payload };

    case 'SET_MODEL_STATUS':
      return {
        ...state,
        modelStatus: { ...state.modelStatus, ...action.payload },
      };

    case 'SET_LOADING':
      return { ...state, loading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_OBJECTIVES':
      return {
        ...state,
        objectives: { ...state.objectives, ...action.payload },
      };

    case 'RESET_STATE':
      return initialState;

    default:
      return state;
  }
}
