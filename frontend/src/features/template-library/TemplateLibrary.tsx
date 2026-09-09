import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { designPatterns, type DesignPattern, type PatternCategory } from './designPatterns';
import './TemplateLibrary.css';

gsap.registerPlugin(useGSAP);

type TemplateCategory = '总览' | '贸易' | '合规' | '汇率' | '航运' | '经营' | '运维';
type VisualType = 'line' | 'bars' | 'stacked' | 'flow' | 'gauge' | 'timeline';
type LibraryView = 'business' | 'motion';

interface TemplateCase {
  id: string;
  category: TemplateCategory;
  categoryTone: string;
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  modules: string[];
  dependencies: string[];
  useCase: string;
  visualType: VisualType;
  accent: string;
  metric: { label: string; value: string; note: string };
  facts: Array<{ label: string; value: string }>;
  dataPoints: number[];
  insight: string;
}

const categories: Array<'全部' | TemplateCategory> = ['全部', '总览', '贸易', '合规', '汇率', '航运', '经营', '运维'];
const patternCategories: Array<'全部' | PatternCategory> = ['全部', '进入', '图表', '联动', '空间', '状态', '规范'];

const templateCases: TemplateCase[] = [
  {
    id: 'command-deck', category: '总览', categoryTone: 'blue', title: '经营指挥台', subtitle: 'Command deck · 经营总览',
    description: '将核心指标、市场变化和需要人工确认的事项压缩到一个首屏，适合管理层快速判断当天先看什么。',
    tags: ['首屏', 'KPI', '风险优先'], modules: ['综合分析', '晨报'], dependencies: ['内部业务数据', '钢材市场看板', '风险信号'], useCase: '当日经营会 / 管理层周会', visualType: 'line', accent: '#2878a8',
    metric: { label: '本月出口完成率', value: '86.4%', note: '较目标 +4.8 个百分点' }, facts: [{ label: '待确认事项', value: '03' }, { label: '高风险地区', value: '05' }, { label: '数据新鲜度', value: '92%' }], dataPoints: [42, 48, 46, 59, 56, 68, 74, 86], insight: '适合作为综合分析首屏骨架：先给结论，再通过 details 展开证据。'
  },
  {
    id: 'export-map', category: '贸易', categoryTone: 'teal', title: '贸易伙伴地图', subtitle: 'Partner map · 出口分布',
    description: '用全球分布、Top 10 排名和伙伴集中度讲清“货去了哪里”，支持在贸易伙伴、救济案件和出口条件之间切换。',
    tags: ['世界地图', 'Top 10', '切换视图'], modules: ['综合分析', '销售方案'], dependencies: ['中国海关出口看板', '内部业务快照'], useCase: '市场开拓与区域组合复盘', visualType: 'flow', accent: '#2d8b8c',
    metric: { label: 'Top 5 伙伴占比', value: '31.1%', note: '示例：越南、韩国、印度等' }, facts: [{ label: '目的国覆盖', value: '77' }, { label: '地图模式', value: '03' }, { label: '可回溯明细', value: '有' }], dataPoints: [24, 40, 31, 55, 46, 64, 52, 72], insight: '地图不是装饰：颜色表达分布，悬停表达依据，右侧排名负责可读性。'
  },
  {
    id: 'market-comparison', category: '贸易', categoryTone: 'blue', title: '内外部出口对比', subtitle: 'Benchmark · 目的国结构对照',
    description: '并排对比内部业务与海关口径的目的国结构，用占比而非总量消除规模差异，再给出分布偏离提示。',
    tags: ['双列对比', '结构占比', '偏离度'], modules: ['综合分析'], dependencies: ['内部业务 2025', '中国海关出口看板'], useCase: '判断内部市场结构是否偏离行业', visualType: 'bars', accent: '#4268a5',
    metric: { label: '结构偏离度', value: '12.8%', note: '示例：按 Top 10 结构计算' }, facts: [{ label: '内部样本', value: '12,799 条' }, { label: '外部口径', value: '2026 快照' }, { label: '对比方法', value: '占比' }], dataPoints: [76, 63, 58, 51, 45, 38, 34], insight: '适合放在内部 Top 10 右侧，让“我们卖到哪里”和“行业卖到哪里”同屏回答。'
  },
  {
    id: 'trade-remedy', category: '合规', categoryTone: 'orange', title: '贸易救济风险矩阵', subtitle: 'Trade remedies · 案件约束',
    description: '按国家、案件阶段、产品和 HS 级别组织反倾销、反补贴与保障措施，避免把“无匹配”误读为“无风险”。',
    tags: ['案件阶段', 'HS 匹配', '风险封顶'], modules: ['综合分析', '销售方案'], dependencies: ['出口贸易救济看板', '海关出口明细', '产品 / HS 映射'], useCase: '报价前合规闸门', visualType: 'gauge', accent: '#c8752c',
    metric: { label: '需人工核验地区', value: '14', note: '示例：案件或 HS 映射不完整' }, facts: [{ label: '执行中措施', value: '08' }, { label: '调查中', value: '11' }, { label: '匹配产品', value: '06 类' }], dataPoints: [88, 64, 48, 32, 22], insight: '这类模板重点不是给一个漂亮分数，而是清楚指出限制项、缺失项和证据链。'
  },
  {
    id: 'fx-risk-return', category: '汇率', categoryTone: 'purple', title: '签约币种收益—风险', subtitle: 'FX risk / return · 币种选择',
    description: '把 EUR、CNY 与 USD 基准放在同一坐标，展示相对收益、波动率、回撤和账期回测，支持销售方案引用。',
    tags: ['分位数', '账期回测', '收益风险'], modules: ['综合分析', '销售方案', '晨报'], dependencies: ['外汇汇率历史看板', '合同币种输入'], useCase: '合同报价币种讨论', visualType: 'line', accent: '#7659a9',
    metric: { label: 'CNY 相对美元收益', value: '+6.25%', note: '示例：近 12 个月历史统计' }, facts: [{ label: '时间窗口', value: '262 日' }, { label: '保守 λ', value: '2.0' }, { label: '回测账期', value: '60 天' }], dataPoints: [38, 45, 40, 57, 52, 69, 62, 78], insight: '建议把收益曲线放在中部，风险条形图和账期箱线图放在下方，避免信息互相抢层级。'
  },
  {
    id: 'freight-lens', category: '航运', categoryTone: 'navy', title: '航运成本透镜', subtitle: 'Freight lens · 运价与能源',
    description: '把集装箱、干散货和能源成本拆成三条可读趋势，突出对运输方案与利润空间真正有影响的变化。',
    tags: ['CCFI', 'BDI', '能源'], modules: ['综合分析', '运输方案'], dependencies: ['航运指数看板', '能源价格快照', '成本计算器'], useCase: '选船型与运价谈判前', visualType: 'stacked', accent: '#345f86',
    metric: { label: '运费成本压力', value: '中位', note: '示例：多指数综合状态' }, facts: [{ label: '航运指数', value: '06' }, { label: '更新频率', value: '每日' }, { label: '运输方式', value: '03' }], dataPoints: [34, 43, 39, 50, 58, 55, 66, 72], insight: '运输方案先看成本环境，再看路线可行性；不要把所有航线同时铺在页面上。'
  },
  {
    id: 'route-compare', category: '航运', categoryTone: 'teal', title: '路线方案卡', subtitle: 'Route compare · 多式联运',
    description: '将集装箱、散货船和整箱 / 称重逻辑统一为少量可比较方案，以时效、成本、风险和数据依据做横向对照。',
    tags: ['集装箱', '散货船', '方案排序'], modules: ['运输方案', '成本计算器'], dependencies: ['航运指数', '港口与国家坐标', '成本参数'], useCase: '起运地与目的区域初筛', visualType: 'flow', accent: '#398486',
    metric: { label: '推荐展示方案', value: '03 条', note: '示例：按约束排序后截取' }, facts: [{ label: '运输方式', value: '03' }, { label: '评价维度', value: '04' }, { label: '地图路线', value: '可视化' }], dataPoints: [72, 56, 63, 45, 38, 52, 68], insight: '动态地球只服务于路线解释：展示起点、终点和路径差异，不展示未经筛选的全部航线。'
  },
  {
    id: 'sales-playbook', category: '经营', categoryTone: 'orange', title: '销售动作剧本', subtitle: 'Sales playbook · 数据到动作',
    description: '把图表旁的对应建议汇总成可执行的报价、客户沟通、配额核验与替代路线动作，并保留数据依据。',
    tags: ['建议生成', '证据链', '人工确认'], modules: ['销售方案', '晨报'], dependencies: ['汇率指标', '配额与救济', '内部业务聚合'], useCase: '从分析结论进入订单动作', visualType: 'timeline', accent: '#bc6531',
    metric: { label: '今日可执行动作', value: '04 项', note: '示例：每项绑定一个或多个依据' }, facts: [{ label: '高优先动作', value: '02' }, { label: '需人工确认', value: '03' }, { label: '来源类型', value: '05' }], dataPoints: [26, 44, 64, 82], insight: '建议必须来自数据而不是模板话术：每条动作下方显示来源、覆盖日期和缺失条件。'
  },
  {
    id: 'morning-brief', category: '总览', categoryTone: 'purple', title: '一页晨报', subtitle: 'Morning brief · 结论优先',
    description: '用结论、核心图、行业快讯和今日动作组成一页可读简报，避免复制综合分析的全部图表。',
    tags: ['结论优先', '行业快讯', '一页阅读'], modules: ['晨报'], dependencies: ['数据同步状态', '我的钢铁网快讯', '销售方案引擎'], useCase: '每日晨会与转发阅读', visualType: 'timeline', accent: '#786b91',
    metric: { label: '阅读路径', value: '结论 → 依据', note: '示例：控制在 3 分钟内' }, facts: [{ label: '重点快讯', value: '06 条' }, { label: '核心图', value: '02 张' }, { label: '动作建议', value: '04 项' }], dataPoints: [42, 52, 58, 71, 78], insight: '晨报是决策摘要，不是第二个综合分析；只保留影响当天判断的信息。'
  },
  {
    id: 'data-health', category: '运维', categoryTone: 'teal', title: '数据健康中心', subtitle: 'Data health · 数据可信度',
    description: '统一展示来源最后成功时间、覆盖到哪一天、fresh / fallback 状态、失败原因和下次计划更新。',
    tags: ['fresh', 'fallback', '覆盖范围'], modules: ['数据健康', '所有图表'], dependencies: ['各同步脚本', '快照元数据', '图表依赖登记'], useCase: '部署后稳定运行与排障', visualType: 'gauge', accent: '#2c8b82',
    metric: { label: '当前数据健康度', value: '92 / 100', note: '示例：按来源新鲜度与完整度' }, facts: [{ label: '最新快照', value: '07' }, { label: '沿用上次', value: '01' }, { label: '暂无可用', value: '00' }], dataPoints: [92, 78, 86, 96], insight: '这是平台可信度的解释层：任何 fallback 都要被看见，图表不能默默使用旧数据。'
  },
];

function normalizeSearch(value: string) {
  return value.trim().toLowerCase();
}

function PreviewChart({ template }: { template: TemplateCase }) {
  const max = Math.max(...template.dataPoints, 1);
  const points = template.dataPoints.map((value, index) => `${16 + index * (208 / Math.max(template.dataPoints.length - 1, 1))},${112 - value / max * 82}`).join(' ');
  const barWidth = 208 / template.dataPoints.length - 6;

  if (template.visualType === 'bars') {
    return <svg className="template-svg" viewBox="0 0 240 132" role="img" aria-label="示例柱状图">
      {[28, 56, 84, 112].map((y) => <line key={y} x1="16" x2="228" y1={y} y2={y} className="chart-grid-line" />)}
      {template.dataPoints.map((value, index) => <rect key={index} x={16 + index * (barWidth + 6)} y={112 - value / max * 82} width={barWidth} height={value / max * 82} rx="3" className="chart-bar" style={{ opacity: .55 + index / template.dataPoints.length * .4 }} />)}
    </svg>;
  }

  if (template.visualType === 'stacked') {
    return <svg className="template-svg" viewBox="0 0 240 132" role="img" aria-label="示例堆叠趋势图">
      {[28, 56, 84, 112].map((y) => <line key={y} x1="16" x2="228" y1={y} y2={y} className="chart-grid-line" />)}
      <polyline points={points} className="chart-line chart-line-muted" />
      <polyline points={template.dataPoints.map((value, index) => `${16 + index * (208 / Math.max(template.dataPoints.length - 1, 1))},${122 - value / max * 70}`).join(' ')} className="chart-line chart-line-second" />
      <polyline points={points} className="chart-line" />
    </svg>;
  }

  if (template.visualType === 'flow') {
    return <svg className="template-svg flow-svg" viewBox="0 0 240 132" role="img" aria-label="示例路线流向图">
      <path d="M24 98 C68 30 90 30 126 70 S178 110 216 38" className="flow-path flow-path-muted" />
      <path d="M24 98 C62 68 94 86 126 58 S178 27 216 38" className="flow-path" />
      {[['24', '98'], ['126', '58'], ['216', '38']].map(([cx, cy], index) => <circle key={index} cx={cx} cy={cy} r="6" className="flow-node" />)}
      <text x="16" y="120">起运</text><text x="112" y="48">中转</text><text x="202" y="26">目的</text>
    </svg>;
  }

  if (template.visualType === 'gauge') {
    return <div className="template-gauge" role="img" aria-label="示例数据健康仪表">
      <div className="gauge-ring"><span>{template.metric.value.split(' ')[0]}</span></div>
      <div className="gauge-scale"><span>低风险</span><span>需核验</span><span>高风险</span></div>
    </div>;
  }

  if (template.visualType === 'timeline') {
    return <div className="template-timeline" role="img" aria-label="示例动作时间线">
      {template.dataPoints.map((value, index) => <div className="template-timeline-step" key={index}><span className="timeline-dot" /><div><strong>{String(index + 1).padStart(2, '0')}</strong><span>{['结论', '核验', '沟通', '动作', '回顾'][index] || '跟进'}</span></div><i style={{ width: `${value}%` }} /></div>)}
    </div>;
  }

  return <svg className="template-svg" viewBox="0 0 240 132" role="img" aria-label="示例趋势折线图">
    {[28, 56, 84, 112].map((y) => <line key={y} x1="16" x2="228" y1={y} y2={y} className="chart-grid-line" />)}
    <polyline points={points} className="chart-line" />
    {template.dataPoints.map((value, index) => <circle key={index} cx={16 + index * (208 / Math.max(template.dataPoints.length - 1, 1))} cy={112 - value / max * 82} r="3.2" className="chart-point" />)}
  </svg>;
}

function PatternVisual({ pattern }: { pattern: DesignPattern }) {
  const accentStyle = { '--pattern-accent': pattern.accent } as CSSProperties;

  if (pattern.visualType === 'orchestra') {
    return <div className="pattern-orchestra pattern-motion-target" style={accentStyle} role="img" aria-label="结论优先的首屏编排示例">
      <div className="orchestra-lead"><span>今日判断</span><strong>市场窗口仍在打开</strong><i /></div>
      <div className="orchestra-columns"><span /><span /><span /></div>
      <div className="orchestra-foot"><span /><span /><span /><span /></div>
    </div>;
  }

  if (pattern.visualType === 'split') {
    return <div className="pattern-split pattern-motion-target" style={accentStyle} role="img" aria-label="左右分栏版式示例">
      <div><small>客观事实</small><strong>出口量 +8.4%</strong><span>近 12 个月趋势</span></div>
      <i />
      <div><small>业务关注</small><strong>优先核验配额</strong><span>依据：出口条件变化</span></div>
    </div>;
  }

  if (pattern.visualType === 'chart-draw') {
    return <svg className="pattern-svg pattern-motion-target" viewBox="0 0 320 142" role="img" aria-label="图表描边生长示例" style={accentStyle}>
      {[24, 58, 92, 126].map((y) => <line key={y} x1="18" x2="302" y1={y} y2={y} className="pattern-grid" />)}
      <path className="pattern-draw-line pattern-draw-secondary" d="M18 112 C54 96 64 103 92 84 S138 78 166 91 S218 64 246 69 S280 42 302 48" />
      <path className="pattern-draw-line" d="M18 118 C54 111 65 94 94 101 S135 72 166 81 S211 72 246 55 S278 64 302 30" />
      <circle className="pattern-focus-dot" cx="302" cy="30" r="5" />
    </svg>;
  }

  if (pattern.visualType === 'rail') {
    return <div className="pattern-rail pattern-motion-target" style={accentStyle} role="img" aria-label="指标轨道示例">
      <div className="rail-line" />
      {['出口完成率', '风险信号', '数据新鲜度'].map((label, index) => <div className="rail-item" key={label} style={{ '--rail-order': index } as CSSProperties}><span /><small>{label}</small><strong>{['86%', '03', '92%'][index]}</strong></div>)}
    </div>;
  }

  if (pattern.visualType === 'reveal') {
    return <div className="pattern-reveal pattern-motion-target" style={accentStyle} role="img" aria-label="证据折叠展开示例">
      <div className="reveal-head"><span>风险信号</span><strong>展开证据</strong><b>＋</b></div>
      <div className="reveal-line"><i /><span>来源：贸易救济看板</span><em>覆盖至 09-04</em></div>
      <div className="reveal-line reveal-line-muted"><i /><span>处理：HS 匹配完成</span><em>待人工确认</em></div>
    </div>;
  }

  if (pattern.visualType === 'map-route') {
    return <svg className="pattern-svg pattern-map pattern-motion-target" viewBox="0 0 320 142" role="img" aria-label="地图路线与悬停探针示例" style={accentStyle}>
      <path className="map-contour" d="M24 47 50 30 78 34 96 22 118 30 136 18 163 27 187 19 206 33 230 28 252 43 282 40 301 64 278 79 250 75 232 94 204 91 183 111 150 102 124 118 95 107 73 116 50 94 28 96 39 72Z" />
      <path className="route-trace" d="M48 83 C102 35 140 108 180 72 S235 40 278 57" />
      <circle className="route-node" cx="48" cy="83" r="6" /><circle className="route-node route-node-destination" cx="278" cy="57" r="6" />
      <g className="map-probe"><rect x="194" y="14" width="94" height="40" rx="6" /><text x="204" y="30">越南 · 出口 18%</text><text x="204" y="45">数据：海关快照</text></g>
    </svg>;
  }

  if (pattern.visualType === 'pulse') {
    return <div className="pattern-pulse pattern-motion-target" style={accentStyle} role="img" aria-label="状态点亮示例">
      <div className="pulse-ring"><span /></div><div><small>状态变化</small><strong>高度关注</strong><em>依据已绑定</em></div><i className="pulse-edge" />
    </div>;
  }

  if (pattern.visualType === 'stack') {
    return <div className="pattern-stack pattern-motion-target" style={accentStyle} role="img" aria-label="密度稳定与筛选连续性示例">
      {[78, 62, 86, 45, 70].map((width, index) => <div key={index} className="stack-row"><span>{['市场', '汇率', '运价', '配额', '风险'][index]}</span><i style={{ width: `${width}%` }} /><b>{width}%</b></div>)}
    </div>;
  }

  if (pattern.visualType === 'fold') {
    return <div className="pattern-fold pattern-motion-target" style={accentStyle} role="img" aria-label="聚合卡片与空状态示例">
      <div className="fold-primary"><small>下一步</small><strong>先核验目的国措施</strong><span>查看 3 条依据 <b>→</b></span></div>
      <div className="fold-secondary"><span>来源</span><span>更新时间</span><span>置信状态</span></div>
    </div>;
  }

  if (pattern.visualType === 'heat') {
    return <div className="pattern-heat pattern-motion-target" style={accentStyle} role="img" aria-label="地图热区聚焦示例">
      {Array.from({ length: 18 }, (_, index) => <span key={index} className={index === 5 || index === 10 || index === 14 ? 'is-hot' : ''} />)}
      <div className="heat-legend"><span>低</span><i /><span>高</span></div>
    </div>;
  }

  return <div className="pattern-dock pattern-motion-target" style={accentStyle} role="img" aria-label="地图与联动面板示例">
    <div className="dock-map"><span /><span /><span /><i /></div>
    <div className="dock-panel"><small>当前模式</small><strong>出口规模趋势</strong><div><i /><i /><i /></div></div>
  </div>;
}

function PatternCard({ pattern, selected, onSelect }: { pattern: DesignPattern; selected: boolean; onSelect: () => void }) {
  return <button type="button" className={`pattern-card ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected} style={{ '--pattern-accent': pattern.accent } as CSSProperties}>
    <div className="pattern-card-top"><span className="pattern-index">{pattern.id}</span><span className="pattern-category">{pattern.category}</span></div>
    <div className="pattern-card-title"><strong>{pattern.title}</strong><span className="pattern-card-arrow" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><path d="M3 13 13 3M6 3h7v7" /></svg></span></div>
    <p>{pattern.description}</p>
    <div className="pattern-card-foot"><div>{pattern.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div><small>{pattern.duration}</small></div>
  </button>;
}

function LibraryViewSwitch({ value, onChange }: { value: LibraryView; onChange: (value: LibraryView) => void }) {
  return <div className="library-view-switch" role="tablist" aria-label="模板库视图">
    <button type="button" role="tab" aria-selected={value === 'business'} className={value === 'business' ? 'is-active' : ''} onClick={() => onChange('business')}>数据展示模板 <span>01—10</span></button>
    <button type="button" role="tab" aria-selected={value === 'motion'} className={value === 'motion' ? 'is-active' : ''} onClick={() => onChange('motion')}>动效与版式模式 <span>M01—M26</span></button>
  </div>;
}

function TemplateCard({ template, selected, onSelect }: { template: TemplateCase; selected: boolean; onSelect: () => void }) {
  return <button type="button" className={`template-card ${selected ? 'is-selected' : ''}`} onClick={onSelect} aria-pressed={selected} style={{ '--template-accent': template.accent } as CSSProperties}>
    <div className="template-card-top"><span className={`template-category template-category-${template.categoryTone}`}>{template.category}</span><span className="template-index">{template.id === 'command-deck' ? '01' : template.id === 'export-map' ? '02' : template.id === 'market-comparison' ? '03' : template.id === 'trade-remedy' ? '04' : template.id === 'fx-risk-return' ? '05' : template.id === 'freight-lens' ? '06' : template.id === 'route-compare' ? '07' : template.id === 'sales-playbook' ? '08' : template.id === 'morning-brief' ? '09' : '10'}</span></div>
    <div className="template-card-title"><div><strong>{template.title}</strong><span>{template.subtitle}</span></div><span className="template-arrow" aria-hidden="true">↗</span></div>
    <p>{template.description}</p>
    <div className="template-card-foot"><div className="template-tags">{template.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div><span className="template-card-usage">{template.modules[0]}</span></div>
  </button>;
}

function PatternLibraryView() {
  const patternPageRef = useRef<HTMLDivElement>(null);
  const patternPreviewRef = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState<'全部' | PatternCategory>('全部');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(designPatterns[0].id);
  const [replayToken, setReplayToken] = useState(0);
  const visiblePatterns = useMemo(() => {
    const normalized = normalizeSearch(query);
    return designPatterns.filter((pattern) => {
      const categoryMatch = activeCategory === '全部' || pattern.category === activeCategory;
      const text = normalizeSearch([pattern.id, pattern.title, pattern.subtitle, pattern.description, pattern.modules.join(' '), pattern.tags.join(' '), pattern.gsapNote].join(' '));
      return categoryMatch && (!normalized || text.includes(normalized));
    });
  }, [activeCategory, query]);
  const selectedPattern = designPatterns.find((pattern) => pattern.id === selectedId) || designPatterns[0];

  useEffect(() => {
    if (visiblePatterns.length && !visiblePatterns.some((pattern) => pattern.id === selectedId)) {
      setSelectedId(visiblePatterns[0].id);
    }
  }, [selectedId, visiblePatterns]);

  useGSAP(() => {
    if (!patternPageRef.current) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      if (!patternPageRef.current) return;
      const cards = Array.from(patternPageRef.current.querySelectorAll<HTMLElement>('.pattern-card'));
      if (cards.length) gsap.from(cards, { y: 12, duration: .36, ease: 'power2.out', stagger: .025, clearProps: 'transform' });
    });
    return () => media.revert();
  }, { scope: patternPageRef, dependencies: [activeCategory, query] });

  useGSAP(() => {
    if (!patternPreviewRef.current) return;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      if (!patternPreviewRef.current) return;
      const visual = patternPreviewRef.current.querySelector<HTMLElement>('.pattern-preview-visual');
      const targets = Array.from(patternPreviewRef.current.querySelectorAll<HTMLElement>('.pattern-preview-detail, .pattern-preview-visual'));
      const timeline = gsap.timeline({ defaults: { duration: .3, ease: 'power3.out' } });
      if (targets.length) timeline.from(targets, { y: 8, stagger: .045, clearProps: 'transform' });
      if (!visual) return () => timeline.kill();

      const visualTargets = (selector: string) => Array.from(visual.querySelectorAll<HTMLElement>(selector));
      const drawLines = visualTargets('.pattern-draw-line, .route-trace');
      if (drawLines.length) {
        timeline.fromTo(drawLines, { strokeDasharray: 520, strokeDashoffset: 520 }, { strokeDashoffset: 0, duration: .54, ease: 'power2.out', clearProps: 'strokeDasharray,strokeDashoffset' }, '<.04');
      }
      const splitPanes = visualTargets('.pattern-split > div');
      if (splitPanes.length) timeline.from(splitPanes, { x: (index) => index === 0 ? -12 : 12, autoAlpha: 0, stagger: .04 }, '<.02');
      const railItems = visualTargets('.rail-item');
      if (railItems.length) timeline.from(railItems, { y: 10, autoAlpha: 0, stagger: .045 }, '<.02');
      const stackRows = visualTargets('.stack-row');
      if (stackRows.length) timeline.from(stackRows, { scaleX: 0, transformOrigin: 'left center', autoAlpha: 0, stagger: .035 }, '<.02');
      const hotspots = visualTargets('.pattern-heat span.is-hot, .route-node, .pulse-ring');
      if (hotspots.length) timeline.from(hotspots, { scale: .55, autoAlpha: 0, stagger: .06 }, '<.08');
      const probe = visualTargets('.map-probe, .dock-panel, .fold-secondary');
      if (probe.length) timeline.from(probe, { x: 10, y: 4, autoAlpha: 0 }, '<.04');
      return () => timeline.kill();
    });
    return () => media.revert();
  }, { scope: patternPreviewRef, dependencies: [selectedPattern.id, replayToken], revertOnUpdate: true });

  return <div className="pattern-library" ref={patternPageRef}>
    <section className="pattern-library-intro">
      <div><span className="template-library-kicker">MOTION + LAYOUT SYSTEM / 动效版式模式</span><h2>动效与版式模式</h2><p>这些案例不是装饰效果，而是可直接复用的交互结构。每个编号都对应一个明确的业务价值、GSAP实现要点和验收条件。</p></div>
      <div className="pattern-library-summary"><strong>{designPatterns.length}</strong><span>组可落地模式</span><small>合成动效预览，不代表业务数据</small></div>
    </section>
    <section className="pattern-principles" aria-label="动效设计原则">
      <div><strong>先解释关系</strong><span>动效只说明状态、顺序或联动</span></div><div><strong>不改变数据</strong><span>不以动画制造额外结论</span></div><div><strong>随时可退出</strong><span>可中断、可清理、可静态降级</span></div>
    </section>
    <section className="template-library-toolbar" aria-label="动效版式模式筛选">
      <label className="template-search"><span aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg></span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索编号、模式、模块或实现方式" /></label>
      <div className="template-category-tabs" role="tablist" aria-label="模式分类">{patternCategories.map((category) => <button key={category} type="button" role="tab" aria-selected={activeCategory === category} className={activeCategory === category ? 'is-active' : ''} onClick={() => setActiveCategory(category)}>{category}</button>)}</div>
    </section>
    <div className="pattern-library-workspace">
      <section className="pattern-catalog" aria-label="动效版式模式列表">
        <div className="template-section-heading"><div><span>MODE INDEX</span><h3>模式索引</h3></div><small>{visiblePatterns.length} / {designPatterns.length} 可见</small></div>
        <div className="pattern-card-grid">{visiblePatterns.map((pattern) => <PatternCard key={pattern.id} pattern={pattern} selected={selectedPattern.id === pattern.id} onSelect={() => setSelectedId(pattern.id)} />)}</div>
        {!visiblePatterns.length && <div className="template-empty">没有匹配的模式。可以搜索 M01、地图、图表、GSAP 或清空筛选。</div>}
      </section>
      <aside className="pattern-preview" ref={patternPreviewRef} aria-label="动效版式模式详情">
        <div className="preview-header"><div><span className="pattern-index pattern-preview-index">{selectedPattern.id}</span><h2>{selectedPattern.title}</h2><p>{selectedPattern.subtitle}</p></div><div className="pattern-preview-actions"><span className="preview-status">SYNTHETIC MOTION DEMO</span><button type="button" className="pattern-replay" onClick={() => setReplayToken((value) => value + 1)}>重播预览</button></div></div>
        <div className="pattern-preview-visual"><PatternVisual pattern={selectedPattern} /><div className="pattern-preview-meta"><span>推荐时长</span><strong>{selectedPattern.duration}</strong><span>模式分类</span><strong>{selectedPattern.category}</strong></div></div>
        <div className="pattern-preview-detail"><h3>适用模块</h3><div className="preview-dependencies">{selectedPattern.modules.map((module) => <span key={module}>{module}</span>)}</div></div>
        <div className="pattern-preview-detail"><h3>设计意图</h3><p>{selectedPattern.description}</p><div className="pattern-callout"><span>动效表达</span><strong>{selectedPattern.motion}</strong></div></div>
        <div className="pattern-preview-detail pattern-detail-grid"><div><h3>GSAP 实现要点</h3><p>{selectedPattern.gsapNote}</p></div><div><h3>禁用与边界</h3><p>{selectedPattern.guardrail}</p></div></div>
        <div className="pattern-acceptance"><span>验收标准</span><strong>{selectedPattern.acceptance}</strong></div>
        <div className="pattern-preview-tags">{selectedPattern.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
      </aside>
    </div>
    <section className="pattern-priority" aria-label="优先落地建议">
      <div className="template-section-heading"><div><span>IMPLEMENTATION ORDER</span><h3>建议落地顺序</h3></div><small>先做能解释业务关系的模式</small></div>
      <div className="pattern-priority-grid"><article><b>P0</b><div><strong>先建立阅读与联动</strong><p>M01 结论点名式首屏 · M03 双层分栏揭示 · M08 右侧联动面板 · M09 详情折叠揭示</p></div></article><article><b>P1</b><div><strong>再强化图表与地图</strong><p>M04 图表描边生长 · M06 热区渐进聚焦 · M10 地图悬停探针 · M11 路线轨迹引导 · M12 时间线事件脉冲</p></div></article><article><b>P2</b><div><strong>最后补齐可信度与适配</strong><p>M14 Fallback 安静标记 · M15 骨架线加载 · M17 主题切换桥 · M24 Reduce Motion 直达</p></div></article></div>
    </section>
  </div>;
}

export function TemplateLibrary() {
  const pageRef = useRef<HTMLDivElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const [activeCategory, setActiveCategory] = useState<'全部' | TemplateCategory>('全部');
  const [query, setQuery] = useState('');
  const [libraryView, setLibraryView] = useState<LibraryView>('business');
  const [selectedId, setSelectedId] = useState(templateCases[0].id);
  const selectedTemplate = templateCases.find((template) => template.id === selectedId) || templateCases[0];

  const visibleTemplates = useMemo(() => {
    const normalized = normalizeSearch(query);
    return templateCases.filter((template) => {
      const categoryMatch = activeCategory === '全部' || template.category === activeCategory;
      const text = normalizeSearch([template.title, template.subtitle, template.description, template.tags.join(' '), template.modules.join(' ')].join(' '));
      return categoryMatch && (!normalized || text.includes(normalized));
    });
  }, [activeCategory, query]);

  useEffect(() => {
    if (visibleTemplates.length && !visibleTemplates.some((template) => template.id === selectedId)) {
      setSelectedId(visibleTemplates[0].id);
    }
  }, [selectedId, visibleTemplates]);

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !pageRef.current) return;
    const cards = Array.from(pageRef.current.querySelectorAll<HTMLElement>('.template-card'));
    if (!cards.length) return;
    gsap.from(cards, { y: 14, duration: .42, ease: 'power2.out', stagger: .035, clearProps: 'transform' });
  }, { scope: pageRef, dependencies: [activeCategory, query], revertOnUpdate: true });

  useGSAP(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !previewRef.current) return;
    const visual = previewRef.current.querySelector<HTMLElement>('.template-preview-visual');
    const detailBlocks = Array.from(previewRef.current.querySelectorAll<HTMLElement>('.preview-detail-block'));
    if (visual) {
      gsap.from(visual, { y: 10, scale: .985, duration: .36, ease: 'power2.out', clearProps: 'transform' });
    }
    if (detailBlocks.length) {
      gsap.from(detailBlocks, { y: 8, duration: .32, ease: 'power2.out', stagger: .05, clearProps: 'transform' });
    }
  }, { scope: previewRef, dependencies: [selectedTemplate.id], revertOnUpdate: true });

  if (libraryView === 'motion') {
    return <div className="template-library"><LibraryViewSwitch value={libraryView} onChange={setLibraryView} /><PatternLibraryView /></div>;
  }

  return <div className="template-library" ref={pageRef}>
    <LibraryViewSwitch value={libraryView} onChange={setLibraryView} />
    <section className="template-library-intro">
      <div><span className="template-library-kicker">PATTERN LIBRARY / 模板研究库</span><h1>模板库</h1><p>把优秀的展示结构拆成可复用的案例，帮助平台在真实数据接入后快速组合出更清晰的业务页面。</p></div>
      <div className="template-library-summary"><strong>{templateCases.length}</strong><span>组可参考模板</span><small>示例数据仅用于展示结构与交互</small></div>
    </section>

    <section className="template-library-toolbar" aria-label="模板筛选">
      <label className="template-search"><span aria-hidden="true"><svg viewBox="0 0 20 20" focusable="false"><circle cx="8.5" cy="8.5" r="5.5" /><path d="m13 13 4 4" /></svg></span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索模板、模块、数据或使用场景" /></label>
      <div className="template-category-tabs" role="tablist" aria-label="模板分类">{categories.map((category) => <button key={category} type="button" role="tab" aria-selected={activeCategory === category} className={activeCategory === category ? 'is-active' : ''} onClick={() => setActiveCategory(category)}>{category}</button>)}</div>
    </section>

    <div className="template-library-workspace">
      <section className="template-catalog" aria-label="模板案例列表">
        <div className="template-section-heading"><div><span>CASE INDEX</span><h2>案例目录</h2></div><small>{visibleTemplates.length} / {templateCases.length} 可见</small></div>
        <div className="template-card-grid">{visibleTemplates.map((template) => <TemplateCard key={template.id} template={template} selected={selectedTemplate.id === template.id} onSelect={() => setSelectedId(template.id)} />)}</div>
        {!visibleTemplates.length && <div className="template-empty">没有匹配的模板。可以换一个模块名称或清空筛选。</div>}
      </section>

      <aside className="template-preview" ref={previewRef} aria-label="模板详情预览">
        <div className="preview-header"><div><span className={`template-category template-category-${selectedTemplate.categoryTone}`}>{selectedTemplate.category}</span><h2>{selectedTemplate.title}</h2><p>{selectedTemplate.subtitle}</p></div><span className="preview-status">SYNTHETIC DATA</span></div>
        <div className="template-preview-visual" style={{ '--template-accent': selectedTemplate.accent } as CSSProperties}><div className="preview-visual-top"><span>{selectedTemplate.metric.label}</span><strong>{selectedTemplate.metric.value}</strong></div><PreviewChart template={selectedTemplate} /><small>{selectedTemplate.metric.note}</small></div>
        <div className="preview-facts preview-detail-block">{selectedTemplate.facts.map((fact) => <div key={fact.label}><span>{fact.label}</span><strong>{fact.value}</strong></div>)}</div>
        <div className="preview-detail-block"><h3>为什么值得借鉴</h3><p>{selectedTemplate.insight}</p></div>
        <div className="preview-detail-grid preview-detail-block"><div><span>建议落位</span><strong>{selectedTemplate.modules.join(' / ')}</strong></div><div><span>使用场景</span><strong>{selectedTemplate.useCase}</strong></div></div>
        <div className="preview-detail-block"><h3>数据依赖</h3><div className="preview-dependencies">{selectedTemplate.dependencies.map((dependency) => <span key={dependency}>{dependency}</span>)}</div></div>
        <div className="preview-thinking preview-detail-block"><span>应用思考</span><p>{selectedTemplate.description}</p><div>{selectedTemplate.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></div>
      </aside>
    </div>

    <section className="template-combinations" aria-label="组合应用建议">
      <div className="template-section-heading"><div><span>COMBINATION IDEAS</span><h2>可以怎样组合到平台</h2></div><small>先组合展示逻辑，再映射真实数据</small></div>
      <div className="combination-grid"><article><span className="combination-number">A</span><div><h3>综合分析首屏</h3><p>经营指挥台 + 贸易伙伴地图 + 内外部出口对比 + 贸易救济风险矩阵，形成“总览—分布—约束”的阅读路径。</p><small>推荐依赖：内部业务、海关出口、贸易救济、配额</small></div></article><article><span className="combination-number">B</span><div><h3>销售方案链路</h3><p>签约币种收益—风险 + 航运成本透镜 + 销售动作剧本，让每条销售建议都有收益、成本与合规依据。</p><small>推荐依赖：外汇、航运、配额、风险信号</small></div></article><article><span className="combination-number">C</span><div><h3>每日晨报</h3><p>一页晨报只取经营指挥台的结论、两张关键图和行业快讯，不复制全部图表，保持阅读节奏。</p><small>推荐依赖：数据健康、快讯、销售建议</small></div></article></div>
    </section>
  </div>;
}
