import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './shared/components/layout';
import { CostCalculator } from './features/cost-calculator';
import { MorningBrief } from './features/morning-brief';
import { Shipping } from './features/shipping';
import { Marketing } from './features/marketing';
import { UnifiedAnalysis } from './features/analysis';
import './App.css';

function App() {
  return (
    <HashRouter>
      <AppLayout>
        <Routes>
          <Route path="/" element={<MorningBrief />} />
          <Route path="/analysis" element={<UnifiedAnalysis />} />
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
