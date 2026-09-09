export type PatternCategory = '进入' | '图表' | '联动' | '空间' | '状态' | '规范';
export type PatternVisualType =
  | 'orchestra'
  | 'split'
  | 'chart-draw'
  | 'orbit'
  | 'rail'
  | 'reveal'
  | 'map-route'
  | 'pulse'
  | 'stack'
  | 'fold'
  | 'heat'
  | 'dock';

export interface DesignPattern {
  id: string;
  category: PatternCategory;
  title: string;
  subtitle: string;
  description: string;
  modules: string[];
  tags: string[];
  visualType: PatternVisualType;
  accent: string;
  duration: string;
  useCase: string;
  motion: string;
  gsapNote: string;
  guardrail: string;
  acceptance: string;
}

/**
 * 设计模式清单：编号是跨页面沟通用的稳定索引，不代表业务数据或生产指标。
 * 所有案例都以“可解释、可中断、可降级”为前提，方便后续映射到真实模块。
 */
export const designPatterns: DesignPattern[] = [
  {
    id: 'M01', category: '进入', title: '结论点名式首屏', subtitle: 'Editorial arrival · 先读结论再读证据',
    description: '首屏只让结论、关键数字和一条依据先出现，其他信息保持稳定待命，建立清晰的阅读起点。',
    modules: ['综合分析', '晨报'], tags: ['首屏', '结论优先', '层级'], visualType: 'orchestra', accent: '#2878a8', duration: '420ms',
    useCase: '用户打开平台的第一眼', motion: '结论条从下方进入，指标与证据线错峰出现。',
    gsapNote: 'timeline + label；仅使用 y / opacity / scale，stagger 总时长不超过 520ms。',
    guardrail: '不得让正文依赖动画后才可见；不对整页所有卡片逐个入场。', acceptance: '首屏 1 秒内可读结论；键盘焦点顺序与视觉顺序一致。',
  },
  {
    id: 'M02', category: '进入', title: '指标轨道入场', subtitle: 'Metric rail · 沿同一基线组织 KPI',
    description: '将完成率、风险数、数据新鲜度放在同一条水平轨道，数字先定点，标签随后贴合，避免卡片各自抢注意力。',
    modules: ['综合分析', '数据健康'], tags: ['KPI', '基线', '紧凑'], visualType: 'rail', accent: '#2d8b8c', duration: '300ms',
    useCase: '同层展示 3—5 个同级指标', motion: '轨道先出现，KPI节点按优先级由左向右落位。',
    gsapNote: '用 stagger each: 0.05；动画 transform，不改变 grid 尺寸。',
    guardrail: '指标超过 5 个时改用横向滚动或分组，不继续压缩字号。', acceptance: '数字字号不低于现有基准；动态前后页面高度不变化。',
  },
  {
    id: 'M03', category: '进入', title: '双层分栏揭示', subtitle: 'Split reveal · 事实与判断分区',
    description: '左侧保留客观事实，右侧呈现由事实推导的关注点，用分栏关系表达“依据—判断”，不额外堆标题。',
    modules: ['综合分析', '晨报'], tags: ['分栏', '事实', '判断'], visualType: 'split', accent: '#4268a5', duration: '360ms',
    useCase: '需要同时看数据与结论时', motion: '左右面板以轻微相向位移进入，中线最后定格。',
    gsapNote: 'timeline 中两个 pane 同步、divider 延后；使用 xPercent，避免 width 动画。',
    guardrail: '窄屏下改为上下顺序，不保留强行 50/50 的窄列。', acceptance: '桌面两栏等高；移动端内容顺序仍是事实在前、判断在后。',
  },
  {
    id: 'M04', category: '图表', title: '图表描边生长', subtitle: 'Chart draw · 让趋势被看见',
    description: '折线、路线或时间线以连续描边进入，用户能感知数据关系，而不是看到一组同时闪烁的装饰元素。',
    modules: ['汇率', '航运', '政策时间线'], tags: ['折线', '趋势', '描边'], visualType: 'chart-draw', accent: '#7659a9', duration: '520ms',
    useCase: '第一次加载一张核心趋势图', motion: '先画主趋势，再显现当前点和数值标注。',
    gsapNote: 'SVG path 使用 strokeDashoffset；动画结束清理 inline style，避免后续重绘残留。',
    guardrail: '不循环播放；数据刷新时只在数据真正变化后播放一次。', acceptance: '动画不修改坐标轴和容器高度；减少动效时直接显示完整曲线。',
  },
  {
    id: 'M05', category: '图表', title: '优先级点亮', subtitle: 'Priority points · 重点先于装饰',
    description: '图表先呈现全量轮廓，再只强调一个当前点、一个异常点和一个基准点，帮助用户抓住真正需要解释的变化。',
    modules: ['综合分析', '风险中心'], tags: ['异常点', '基准', '重点'], visualType: 'pulse', accent: '#bd3f4d', duration: '260ms',
    useCase: '风险信号与关键节点标注', motion: '重点点位短促放大一次，其他点保持静态。',
    gsapNote: '用 quickSetter / scale，禁止持续呼吸动画；点位通过 data-priority 定位。',
    guardrail: '同一张图最多 3 个强调点；风险颜色只表达语义，不做视觉噪声。', acceptance: '不看动画也能识别重点；颜色和图例语义一致。',
  },
  {
    id: 'M06', category: '图表', title: '热区渐进聚焦', subtitle: 'Heat focus · 地图只强调可行动区域',
    description: '地图先保持全球轮廓，再将当前业务相关国家或区域轻量聚焦，避免所有国家同时高亮造成认知拥堵。',
    modules: ['综合分析', '贸易伙伴地图'], tags: ['地图', '热区', '聚焦'], visualType: 'heat', accent: '#c8752c', duration: '420ms',
    useCase: '贸易伙伴、救济案件、出口条件切换', motion: '热区由低透明度过渡到目标强度，焦点标签延后显示。',
    gsapNote: '只动画 opacity / scale；将地图图层隔离，避免对整张 SVG 重排。',
    guardrail: '未匹配数据不能被染成“低风险”；必须显示无数据或待核验状态。', acceptance: '国家悬停仍可读；桌面与窄屏不发生标签互相覆盖。',
  },
  {
    id: 'M07', category: '联动', title: '筛选结果连续性', subtitle: 'FLIP continuity · 筛选后不迷路',
    description: '筛选和搜索后，结果卡片保留空间连续性，让用户知道哪些内容被保留、哪些被移除，而不是整页突兀闪换。',
    modules: ['模板库', '综合分析明细'], tags: ['筛选', 'FLIP', '连续性'], visualType: 'stack', accent: '#398486', duration: '280ms',
    useCase: '搜索国家、产品、来源或指标', motion: '保留项平移到新位置，新增项轻量显现，空结果保留上下文。',
    gsapNote: '优先使用 Flip.from；无法引入 Flip 时退化为 opacity + y，不动画 height。',
    guardrail: '筛选输入必须即时可用；不让用户等待动画结束才能继续输入。', acceptance: '重复筛选无残留位移；空结果有清晰提示并可恢复。',
  },
  {
    id: 'M08', category: '联动', title: '右侧联动面板', subtitle: 'Context dock · 地图与明细同屏',
    description: '左侧地图承担空间理解，右侧面板承担排行、KPI或依据；切换地图模式时只更新右侧内容，保持空间锚点。',
    modules: ['综合分析'], tags: ['地图', '右侧面板', '联动'], visualType: 'dock', accent: '#2878a8', duration: '300ms',
    useCase: '贸易伙伴、出口规模、配额救济切换', motion: '右侧内容水平替换，左侧地图不跳动；当前模式按钮同步点亮。',
    gsapNote: '面板内部使用 x / opacity；模式切换用 revertOnUpdate 清理旧节点动画。',
    guardrail: '不复制整张地图；面板内容必须与当前地图模式一一对应。', acceptance: '切换后标题、数据、图例三者一致；键盘可操作模式按钮。',
  },
  {
    id: 'M09', category: '联动', title: '详情折叠揭示', subtitle: 'Evidence reveal · 证据按需展开',
    description: '默认只显示结论和一行来源，用户展开后再看到完整字段、计算过程和覆盖日期，控制首屏密度。',
    modules: ['综合分析', '数据健康', '晨报'], tags: ['details', '证据链', '首屏'], visualType: 'reveal', accent: '#345f86', duration: '240ms',
    useCase: '客观明细、政策事件、数据健康记录', motion: '内容从局部遮罩中顺滑揭示，触发点和展开状态保持可见。',
    gsapNote: '使用 grid / clip-path 的轻量过渡；复杂内容仍由原生 details 保证可用。',
    guardrail: '不能把关键结论藏在折叠里；展开后不应把页面滚动位置推离触发点。', acceptance: '展开/收起可重复；屏幕阅读器能读到 expanded 状态。',
  },
  {
    id: 'M10', category: '联动', title: '地图悬停探针', subtitle: 'Map probe · 悬停给证据',
    description: '鼠标或键盘聚焦国家时只出现一枚紧凑信息探针，显示出口量、案件或配额状态，不用大气泡覆盖地图。',
    modules: ['贸易伙伴地图', '出口条件评估'], tags: ['悬停', '探针', 'Tooltip'], visualType: 'map-route', accent: '#2d8b8c', duration: '150ms',
    useCase: '国家坐标密集、名称易重叠的全球地图', motion: '探针随焦点快速定位，内容淡入；退出后快速收起。',
    gsapNote: '用 autoAlpha + x/y；探针位置由边界检测决定，避免脱离视口。',
    guardrail: '不要同时显示台湾、香港、澳门等重叠文字标签；用悬停信息替代。', acceptance: '探针完整显示文字；键盘 focus 与鼠标 hover 信息一致。',
  },
  {
    id: 'M11', category: '联动', title: '路线轨迹引导', subtitle: 'Route trace · 动效服务路线理解',
    description: '运输方案只展示已筛选的少量可用路线，轨迹从起点经过中转到目的地，避免把地图变成无依据的线路墙。',
    modules: ['运输方案'], tags: ['路线', '动态地球', '少量方案'], visualType: 'map-route', accent: '#398486', duration: '600ms',
    useCase: '集装箱、散货船与多式联运比较', motion: '主路线描边移动，起点/中转/目的节点依次亮起。',
    gsapNote: 'SVG path 描边 + 节点 stagger；切换方案时 kill 旧 timeline 后再播放。',
    guardrail: '没有准确港口坐标时必须显示待核验，不能用近似点冒充准确路线。', acceptance: '路线与方案卡名称一致；至少支持静态降级和减少动效。',
  },
  {
    id: 'M12', category: '联动', title: '时间线事件脉冲', subtitle: 'Event pulse · 让节点可展开',
    description: '政策时间线按月份或季度聚合，节点仅做一次脉冲提示；点击后展开该时间点的严重事件列表。',
    modules: ['政策事件时间线', '晨报'], tags: ['时间线', '节点', '展开'], visualType: 'rail', accent: '#c8752c', duration: '220ms',
    useCase: '贸易救济、政策和市场事件回溯', motion: '当前时间节点轻量放大，展开内容从节点下方出现。',
    gsapNote: '不做循环 pulse；用 selected 状态控制 scale，并将面板动画限制在局部。',
    guardrail: '事件排序、严重程度和来源必须是数据决定，动画不得表达额外结论。', acceptance: '每个统计节点可展开；展开列表不遮挡相邻节点。',
  },
  {
    id: 'M13', category: '状态', title: '风险温度带', subtitle: 'Risk temperature · 颜色只说状态',
    description: '使用细窄的状态温度带表达正常、关注和高风险，主体仍由文字与证据承载，避免把大色块当成结论。',
    modules: ['综合分析', '销售方案'], tags: ['风险', '状态色', '克制'], visualType: 'pulse', accent: '#bd3f4d', duration: '180ms',
    useCase: '风险级别、救济案件或数据健康状态', motion: '状态色快速过渡，风险点只做一次边界强调。',
    gsapNote: '用 backgroundColor / scaleX 的局部变化；风险变化需可追溯到数据更新时间。',
    guardrail: '红色不能单独承担语义；必须同时有中文风险级别和依据。', acceptance: '色盲场景仍能区分状态；暗色/明色主题对比度达标。',
  },
  {
    id: 'M14', category: '状态', title: 'Fallback 安静标记', subtitle: 'Data fallback · 旧数据也要诚实',
    description: '抓取失败沿用上次数据时，不弹出打断式警报，而是在来源、卡片和数据健康中给出一致的 fallback 标识。',
    modules: ['数据健康', '所有图表'], tags: ['fallback', '可信度', '来源'], visualType: 'dock', accent: '#c8752c', duration: '180ms',
    useCase: '数据源暂时不可访问或导出失败', motion: '状态标记淡入，主体数据不抖动；恢复成功时标记平滑替换。',
    gsapNote: '状态标签使用 autoAlpha；不对图表整体做警告闪烁。',
    guardrail: '必须显示上次成功时间、覆盖日期和失败原因；不能伪装实时。', acceptance: 'fresh / fallback / unavailable 三态可辨；不改变图表数值。',
  },
  {
    id: 'M15', category: '状态', title: '骨架线加载', subtitle: 'Skeleton lines · 预留真实结构',
    description: '图表加载时用与最终图表同尺寸的骨架线和数字占位，减少页面跳动，让数据接入后仍保持稳定布局。',
    modules: ['综合分析', '晨报', '数据健康'], tags: ['加载', '骨架', '稳定'], visualType: 'stack', accent: '#718096', duration: '260ms',
    useCase: '数据脚本或接口正在返回', motion: '骨架线横向扫过一次后停止，数据到达时交叉替换。',
    gsapNote: '扫光只在局部并可停用；使用 transform，不动画 width / height。',
    guardrail: '加载超过阈值应转为说明状态，不无限播放 skeleton。', acceptance: '加载前后容器尺寸相同；弱网时不出现空白大块。',
  },
  {
    id: 'M16', category: '状态', title: '空状态下一步', subtitle: 'Empty state · 没数据也能行动',
    description: '当筛选没有结果或来源暂无数据时，用一句原因、一个可执行动作和一个返回入口组成紧凑空状态。',
    modules: ['综合分析', '模板库', '运输方案'], tags: ['空状态', '恢复', '指引'], visualType: 'fold', accent: '#4268a5', duration: '240ms',
    useCase: '无匹配、未配置、接口暂无可用记录', motion: '说明先出现，动作入口随后获得焦点，不做空洞插画。',
    gsapNote: '只做 opacity / y 的短促过渡；失败脚本时内容默认可见。',
    guardrail: '不能把无数据解释成零值；需要区分暂无数据、无匹配和不可用。', acceptance: '用户能在 1 次操作内清除筛选或返回可靠视图。',
  },
  {
    id: 'M17', category: '空间', title: '主题切换桥', subtitle: 'Theme bridge · 明暗切换有连续性',
    description: '明色钢蓝与深色主题切换时保留布局、选择状态和数据位置，仅平滑过渡表面与强调色，减少视觉断裂。',
    modules: ['全平台'], tags: ['主题', '明暗', '连续性'], visualType: 'split', accent: '#1f4e79', duration: '240ms',
    useCase: '右上角切换平台色调', motion: '表面颜色短过渡，选中导航和关键图表颜色同步完成。',
    gsapNote: '主题 token 用 CSS transition；GSAP 只处理局部选择态，不读取布局。',
    guardrail: '不可在切换主题时重载页面或重置筛选/滚动位置。', acceptance: '所有内容保持原位；高对比和 reduced motion 下仍可用。',
  },
  {
    id: 'M18', category: '空间', title: '首屏锚定与下滚', subtitle: 'Viewport anchor · 首屏之后再深入',
    description: '首屏固定一个高信息密度但不拥挤的锚点，向下滚动时内容按业务优先级进入，不用大量空白制造“高级感”。',
    modules: ['综合分析', '晨报'], tags: ['首屏', '滚动', '密度'], visualType: 'orchestra', accent: '#2878a8', duration: '320ms',
    useCase: '世界地图 + 联动面板 + 后续图表', motion: '滚动只触发一次局部提示，主体不持续视差。',
    gsapNote: '优先 CSS sticky / scroll-snap；若使用 ScrollTrigger 必须清理并限制触发范围。',
    guardrail: '不把重要数据放在用户必须滚动才能发现的位置；不使用无限视差。', acceptance: '1440px 与 390px 首屏都能看到主任务入口；滚动不掉帧。',
  },
  {
    id: 'M19', category: '空间', title: '密度呼吸点', subtitle: 'Density rhythm · 用节奏代替空白',
    description: '通过紧凑的指标组、适中的图表间距和一处明确分隔建立节奏，使页面看起来有呼吸但不浪费展示面积。',
    modules: ['综合分析', '模板库'], tags: ['密度', '节奏', '间距'], visualType: 'stack', accent: '#2d8b8c', duration: '200ms',
    useCase: '图表较多且需要连续阅读的页面', motion: '内容组之间只保留必要的层级过渡，不给每个小块单独动画。',
    gsapNote: '使用容器级 stagger；不用 margin / height 动画改变版面节奏。',
    guardrail: '文字正文保持可读字号；不得用缩小字体换取更多卡片。', acceptance: '页面在截图缩小后仍能辨认主次；无连续等间距堆叠。',
  },
  {
    id: 'M20', category: '空间', title: '聚合卡片收束', subtitle: 'Cluster fold · 多信息归并一处',
    description: '将同一决策链上的多个小组件折叠成一张可扫描的聚合卡，默认只保留最高优先级内容。',
    modules: ['销售方案', '晨报'], tags: ['聚合', '收束', '方案'], visualType: 'fold', accent: '#bc6531', duration: '280ms',
    useCase: '汇总报价、币种、运费与合规建议', motion: '主建议卡固定，辅助证据从卡片边缘进入 details。',
    gsapNote: '用 timeline label 组织主结论与证据；证据区使用可中断的 reveal。',
    guardrail: '聚合卡必须保留每条建议的数据来源与更新时间。', acceptance: '默认首屏只占一张卡；展开后信息完整且可回收。',
  },
  {
    id: 'M21', category: '图表', title: '对比双曲线', subtitle: 'Dual compare · 同轴回答差异',
    description: '内外部出口、EUR/CNY收益或两条运输方案使用同一坐标框架，曲线进入顺序与图例顺序一致。',
    modules: ['综合分析', '成本计算器', '销售方案'], tags: ['对比', '双曲线', '同轴'], visualType: 'chart-draw', accent: '#7659a9', duration: '460ms',
    useCase: '需要横向比较而非单看绝对量', motion: '基准线先画，业务曲线随后画，差异区域最后标注。',
    gsapNote: '多 path 采用 timeline position 参数；只在真实数据更新时重播。',
    guardrail: '必须标明单位、时间窗和基准；不同口径不能强行同轴。', acceptance: '图例顺序与描边顺序一致；0 轴或基准线清晰可见。',
  },
  {
    id: 'M22', category: '联动', title: '选择即预览', subtitle: 'Selection preview · 先看轻量反馈',
    description: '点击模板、国家或运输方案后，先给一个局部选中反馈，再更新右侧详情，保持用户对当前对象的确认感。',
    modules: ['模板库', '综合分析', '运输方案'], tags: ['选择', '预览', '反馈'], visualType: 'dock', accent: '#4268a5', duration: '150ms',
    useCase: '列表项与详情面板联动', motion: '选中边界先变为强调色，右侧内容随后替换。',
    gsapNote: 'CSS 负责 focus/selected，GSAP 只做右侧内容的短促进入。',
    guardrail: '不能只靠颜色表达选中；要有 aria-pressed 或 selected 语义。', acceptance: '键盘选择、点击选择和触摸选择结果一致。',
  },
  {
    id: 'M23', category: '状态', title: '错误可恢复', subtitle: 'Recoverable error · 错误不是终点',
    description: '抓取失败、解析失败或映射缺失时，保留上次可信数据并把恢复动作放在数据健康中心，减少业务页面被打断。',
    modules: ['数据健康', '综合分析', '运输方案'], tags: ['错误', '恢复', '旧快照'], visualType: 'fold', accent: '#bd3f4d', duration: '220ms',
    useCase: '数据源波动、导出结构变化或字段缺失', motion: '错误原因展开，回退数据保持静态，恢复后状态标签替换。',
    gsapNote: '只动画状态区域；数据图表不能因错误重新入场或闪烁。',
    guardrail: '回退时必须保留原始覆盖日期，不得更新成当前时间。', acceptance: '错误状态不阻塞其他模块；恢复动作有结果反馈。',
  },
  {
    id: 'M24', category: '规范', title: 'Reduce Motion 直达', subtitle: 'Accessible motion · 动效可退出',
    description: '所有动效都有静态完成态，减少动效设置下不等待、不位移、不隐藏内容，仍保留选中、成功和错误的语义反馈。',
    modules: ['全平台'], tags: ['无障碍', '静态降级', '稳定'], visualType: 'pulse', accent: '#718096', duration: '0ms',
    useCase: '用户系统开启减少动态效果', motion: '跳过位移与循环动画，直接显示完整内容和状态。',
    gsapNote: '使用 matchMedia 或 window.matchMedia 分支；useGSAP 仍负责清理。',
    guardrail: '不能以隐藏内容代替减少动效；不能用循环闪烁表达风险。', acceptance: 'prefers-reduced-motion 下无位移/循环；信息完整、焦点可见。',
  },
  {
    id: 'M25', category: '规范', title: '键盘焦点与中断', subtitle: 'Focus interrupt · 新操作优先',
    description: '焦点环、键盘操作和连续点击都拥有确定反馈；用户发起新操作时立即接管动画，不留下错误的旧状态。',
    modules: ['模板库', '综合分析', '运输方案'], tags: ['键盘', '焦点', '中断'], visualType: 'dock', accent: '#4268a5', duration: '150ms',
    useCase: '筛选、案例切换、地图探针和详情展开', motion: '选中边界立即反馈，面板过渡允许被下一次操作打断。',
    gsapNote: '交互回调使用 contextSafe；新 tween 使用 overwrite: "auto"，组件卸载时由 useGSAP 清理。',
    guardrail: '动画不得抢夺焦点；不能在节点卸载后继续写入状态。', acceptance: 'Tab / Enter / Space 可完成操作；快速重复操作不叠加错乱，控制台无动画警告。',
  },
  {
    id: 'M26', category: '规范', title: '图表口径护栏', subtitle: 'Chart guardrail · 视觉不越过数据',
    description: '在图表旁固定显示单位、时间窗、数据状态和基准，使动画只表达变化过程，不将合成预览或旧快照误读成实时结论。',
    modules: ['所有图表', '数据健康', '晨报'], tags: ['口径', '单位', '数据状态'], visualType: 'reveal', accent: '#718096', duration: '180ms',
    useCase: '多来源数据并列、fallback、合成示例预览', motion: '口径标签固定，状态变化只做局部淡入，不重绘整张图。',
    gsapNote: '以 CSS 状态过渡为主；数据更新只更新绑定节点，避免将数值文字作为装饰动画。',
    guardrail: '没有单位、覆盖日期或来源时不得显示“实时”字样；合成数据必须显式标记。', acceptance: '任何图表都能定位来源和时间窗；fallback、合成、真实三态可辨识。',
  },
];
