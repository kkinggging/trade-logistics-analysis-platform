import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './shared/components/layout';
import { CostCalculator } from './features/cost-calculator';
import { MorningBrief } from './features/morning-brief';
import { Shipping } from './features/shipping';
import { Marketing } from './features/marketing';
import { UnifiedAnalysis } from './features/analysis';
import { DataHealth } from './features/data-health';
import { TemplateLibrary } from './features/template-library';
const GlobeShowcase = lazy(() => import('./features/globe').then((module) => ({ default: module.GlobeShowcase })));
const GlobeLab = lazy(() => import('./features/globe-lab').then((module) => ({ default: module.GlobeLab })));
const TradeSandbox = lazy(() => import('./features/trade-sandbox').then((module) => ({ default: module.TradeSandbox })));
import './App.css';

function App() {
  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<MorningBrief />} />
          <Route path="/analysis" element={<UnifiedAnalysis />} />
          <Route path="/data-health" element={<DataHealth />} />
          <Route path="/template-library" element={<TemplateLibrary />} />
          <Route path="/globe" element={<Suspense fallback={<div className="route-loading" role="status">正在载入 3D 地球模块…</div>}><GlobeShowcase /></Suspense>} />
          <Route path="/globe-lab" element={<Suspense fallback={<div className="route-loading" role="status">正在载入地球实验沙箱…</div>}><GlobeLab /></Suspense>} />
          <Route path="/trade-sandbox" element={<Suspense fallback={<div className="route-loading" role="status">正在载入贸易沙盘模拟…</div>}><TradeSandbox /></Suspense>} />
          {/* Backward-compatible aliases for the former three workspaces. */}
          <Route path="/dashboard" element={<UnifiedAnalysis />} />
          <Route path="/cost-calculator" element={<CostCalculator />} />
          <Route path="/risk-center" element={<UnifiedAnalysis />} />
          <Route path="/overview" element={<UnifiedAnalysis />} />
          <Route path="/morning-brief" element={<MorningBrief />} />
          <Route path="/shipping" element={<Shipping />} />
          <Route path="/strategy" element={<Marketing />} />
        </Routes>
      </AppLayout>
    </HashRouter>
  );
}

export default App;
