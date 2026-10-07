---
name: 首钢国际贸易物流一体化分析辅助平台
description: 面向钢材出口决策的浅色钢蓝业务工作台与深色三维贸易舞台
colors:
  steel-blue: "#1f4e79"
  ocean-blue: "#2e6da4"
  data-teal: "#267b9e"
  warning-amber: "#c66a20"
  risk-red: "#bd3f4d"
  canvas: "#f4f6f9"
  paper: "#ffffff"
  soft-surface: "#f7f9fc"
  raised-surface: "#e8eef5"
  ink: "#1f2a37"
  secondary-ink: "#526274"
  muted-ink: "#718096"
  quiet-border: "#e0e7ef"
  default-border: "#cbd6e2"
  globe-navy: "#061521"
  globe-teal: "#65d9cf"
  globe-amber: "#ffb35c"
  globe-violet: "#a99aff"
typography:
  display:
    fontFamily: "Georgia, 'Songti SC', 'Noto Serif SC', serif"
    fontSize: "clamp(2.25rem, 2rem + 1.5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Georgia, 'Songti SC', 'Noto Serif SC', serif"
    fontSize: "clamp(1.875rem, 1.6rem + 1.2vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  title:
    fontFamily: "Manrope, 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem)"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: "Manrope, 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(1rem, 0.95rem + 0.25vw, 1.125rem)"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace"
    fontSize: "clamp(0.75rem, 0.7rem + 0.2vw, 0.8rem)"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.08em"
rounded:
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  full: "999px"
spacing:
  1: "0.25rem"
  2: "0.5rem"
  3: "0.75rem"
  4: "1rem"
  5: "1.25rem"
  6: "1.5rem"
  8: "2rem"
  10: "2.5rem"
  12: "3rem"
  16: "4rem"
components:
  button-primary:
    backgroundColor: "{colors.steel-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    padding: "0.75rem 1.25rem"
  button-secondary:
    backgroundColor: "{colors.soft-surface}"
    textColor: "{colors.secondary-ink}"
    rounded: "{rounded.sm}"
    padding: "0.5rem 0.75rem"
  button-segment-active:
    backgroundColor: "{colors.steel-blue}"
    textColor: "{colors.paper}"
    rounded: "{rounded.full}"
    padding: "0.5rem 0.8rem"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
  input:
    backgroundColor: "{colors.soft-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.5rem 0.75rem"
---

# Design System: 首钢国际贸易物流一体化分析辅助平台

## Overview

**Creative North Star: "钢蓝业务台上的双层航图"**

这是一个面向钢材出口判断的 Operate 型工作台。日常业务内容以浅色钢蓝界面承载：用户需要快速扫描晨报、市场、客户、运输、成本和风险，再沿着国家、订单与政策证据逐层下钻。整体视觉克制、清晰、偏编辑式；数据标签使用等宽字体，业务标题使用带衬线的稳重标题字形，形成“业务记录 + 决策简报”的气质。

三维地球、地球实验和贸易沙盘是同一产品中的独立深色舞台。深海蓝背景、青绿色流向、琥珀强调和紫色事件层将复杂的空间数据从明色工作台中隔离出来；深色只承担空间可视化与推演氛围，不改变全局工作台的明色主题。晨报/潮汐早报则保留更强的杂志式封面、分栏阅读和沉浸式展开层。

**Key Characteristics:**

- 明色钢蓝工作台，局部深色三维数据舞台
- 编辑式标题与等宽数据标签并置
- 事实、来源、更新时间和不确定性优先于装饰
- 卡片、分段控件和细边框构成可扫描的业务层级
- 150–350ms 的克制状态动效，并尊重减少动效设置

## Colors

色彩以低饱和钢蓝和冷白为主，暖橙/琥珀只标记需要关注的成本、政策或风险；三维区域使用深海蓝底和高亮青绿建立独立舞台。

### Primary

- **钢蓝主色** (`#1f4e79`): 全局主操作、导航激活、标题强调和关键业务链接。
- **海洋蓝辅色** (`#2e6da4`): 次级信息、数据状态和辅助交互。

### Secondary

- **数据青蓝** (`#267b9e`): 汇率、市场和数据类指标的语义色。
- **航迹青绿** (`#65d9cf`): 三维地球中的正向流向、活跃状态和可用数据提示。

### Tertiary

- **预警琥珀** (`#c66a20`): 成本压力、关注项、天气/时序提示和需要人工复核的状态。
- **风险赤红** (`#bd3f4d`): 严重风险、不可用状态和错误反馈。
- **航迹琥珀** (`#ffb35c`): 三维地球中的第二流向层与高亮路线。
- **事件紫** (`#a99aff`): 三维地球/沙盘中的事件与政策层，避免与路线色混淆。

### Neutral

- **冷雾画布** (`#f4f6f9`): 明色工作台的全局背景。
- **纸面白** (`#ffffff`): 卡片、输入容器和主要阅读面。
- **柔和表面** (`#f7f9fc`): 输入、次级面板和轻微层级分隔。
- **抬升表面** (`#e8eef5`): 选中、禁用和局部控件的背景层。
- **主墨色** (`#1f2a37`): 正文、核心数字和高优先级标题。
- **次墨色** (`#526274`): 说明、次级指标和辅助正文。
- **静音墨色** (`#718096`): 时间、来源、状态补充和低优先级标签。
- **细边框** (`#e0e7ef`): 默认卡片边界、分割线和轻量结构线。
- **默认边框** (`#cbd6e2`): 输入、按钮和较强交互边界。
- **深海舞台** (`#061521`): 地球、实验和沙盘的空间底色。

**The Accent Scarcity Rule.** 主色和暖色承担语义，不把每个数据点都染成强调色；无状态的数据优先使用中性表面和文字层级表达。

## Typography

**Display Font:** Georgia, `Songti SC`, `Noto Serif SC`（标题与晨报封面）  
**Body Font:** Manrope, `Noto Sans SC`, system sans-serif（界面正文与控件）  
**Label/Mono Font:** `SF Mono`, Monaco, `Roboto Mono`（数据、时间、索引和来源）

**Character:** 标题字形偏报刊与行业简报，正文保持现代、紧凑、易扫描；等宽标签让更新时间、数量、来源和模块索引获得稳定的视觉锚点。

### Hierarchy

- **Display** (700, `clamp(2.25rem, 2rem + 1.5vw, 3rem)`, 1.2): 平台大标题、主要页面标题和晨报核心封面标题。
- **Headline** (700, `clamp(1.875rem, 1.6rem + 1.2vw, 2.25rem)`, 1.2): 页面级分析标题与大型模块标题。
- **Title** (700, `clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem)`, 1.2): 卡片、分区和决策面板标题。
- **Body** (400, `clamp(1rem, 0.95rem + 0.25vw, 1.125rem)`, 1.6): 业务说明、新闻正文和可读数据描述；长文阅读保持适中的行高。
- **Label** (500, `clamp(0.75rem, 0.7rem + 0.2vw, 0.8rem)`, 1.3, `0.08em`): 模块眉题、来源、更新时间、指标单位和操作台索引。

**The Two-Register Type Rule.** 重要业务标题用稳重的衬线标题字，数据与状态用等宽标签；不要用等宽字体承载长正文，也不要用装饰性标题替代数据标签。

## Layout

明色工作台使用全宽应用壳：顶端为横向导航与品牌区，其下是日期、节气、北京天气和状态信息，再进入可滚动内容区。页面内容通常以 `max-width: 1440px` 的编辑式容器居中，外侧留白随视口变化；移动端收缩为单列，导航允许换行或横向承载。

通用内容以卡片、面板和分区标题建立层级，常见间距遵循 4px 基准的 `0.25rem` 到 `4rem` 阶梯。复杂页面优先使用 CSS Grid：综合分析和业务页面采用多列指标/图表网格，晨报将封面、结论、指标、新闻与历史内容纵向编排；图表容器必须允许内部滚动而不制造横向页面滚动。

地球实验与贸易沙盘采用“主舞台 + 右侧信息轨”布局：宽屏为深色三维画布配固定宽度控制轨，窄屏改为地图卡片在上、控制/摘要面板在下。地图舞台本身保持深色和边界内聚，右侧操作面板承担检索、国家排名、图层、变量、线路和结果说明，不把全部数据标签叠加到球面上。

潮汐早报使用更宽的内容面和编辑式分区；新闻卡片可展开为固定视口内的沉浸式阅读层，阅读层内部拥有独立纵向滚动，不依赖光标移到页面边缘。响应式状态下，双栏故事退为单列，历史时间线和人物卡片保持单开、可点击的替代交互。

**The Single Scroll Owner Rule.** 一个视图中只有当前内容容器拥有主要纵向滚动责任；弹窗、新闻阅读层和右侧操作轨需要明确自己的滚动区域，避免滚轮落点不确定。

## Elevation & Depth

明色系统采用“轻阴影 + 色调分层”的混合方式。纸面卡片默认使用极轻的钢蓝阴影，选中、悬停和重点结果才提升阴影；边框负责结构，阴影不负责替代边界。三维舞台使用深色背景、内发光、渐变晕影和玻璃感信息轨表达空间深度，不把深色舞台扩散到全局。

### Shadow Vocabulary

- **细微卡片阴影** (`0 1px 3px rgba(31, 78, 121, 0.08), 0 6px 18px rgba(31, 78, 121, 0.045)`): 普通卡片、列表和图表容器。
- **交互提升阴影** (`0 12px 30px rgba(31, 78, 121, 0.12)`): 悬停、激活和需要从列表中浮起的面板。
- **大型面板阴影** (`0 18px 48px rgba(31, 78, 121, 0.15)`): 详情面板、主要分析区和复杂工作区。
- **三维舞台阴影**: 使用深色背景与内部渐变控制视觉重量，不套用明色卡片阴影。

**The Flat-by-Default Rule.** 静止状态优先靠表面和边框建立结构；阴影只在悬停、激活、弹出和阅读沉浸态中增加层次。

## Shapes

明色工作台使用柔和但不夸张的圆角：小型控件为 8px，中型输入和分段控件为 12px，大型卡片为 16px，突出容器为 20px；胶囊形只用于状态、筛选、分段按钮和紧凑导航状态。边框通常为 1px，重要区域可用 2px 顶部/侧边语义线。

3D 地球和沙盘的主舞台使用约 18–20px 圆角并裁切溢出；其信息轨使用 12–14px 圆角，地图上的点、环和状态标记使用圆形。晨报的阅读内容更接近纸张和杂志版式，使用细线、直角或轻微圆角与大图形成对比。

## Components

### Buttons

- **Shape:** 普通按钮为轻柔 8px 圆角；导航、筛选和状态按钮可使用胶囊形。
- **Primary:** 钢蓝背景、白色文字；用于提交、进入工作区、主要筛选或确认动作。
- **Secondary / Ghost:** 柔和表面或透明背景，配默认边框和次墨色；用于次级查看、重置、来源和折叠。
- **Hover / Focus:** 150–250ms 内改变背景/边框和轻微位移；键盘焦点使用 2px 主色轮廓并保留 3px 外距。
- **Motion:** 不用持续跳动来提示可点击；操作反馈应来自颜色、边框、状态文字或局部动效。

### Chips and Segmented Controls

- **Style:** 胶囊或小圆角，默认使用柔和表面与次墨色；激活态使用钢蓝或对应语义色。
- **State:** 激活态同时改变文字、背景和边界，不只依赖颜色；国家、风险、来源和贸易术语优先使用短标签。

### Cards / Containers

- **Corner Style:** 12–16px 为业务卡片基线；大型工作区使用 20px。
- **Background:** 默认纸面白；辅助面板使用柔和表面；深色地球/沙盘卡片使用深海舞台与半透明面板。
- **Border:** 默认细边框；高优先级风险或分析结果可使用顶部语义色线。
- **Internal Padding:** 常规 16–20px；密集指标 8–12px；晨报封面和沉浸式阅读根据视口流体调整。
- **Interaction:** 列表卡片通过悬停、选中背景和位移表达当前项；内容展开使用独立详情区或阅读层。

### Inputs / Fields

- **Style:** 柔和表面、1px 默认边框、12px 圆角、8×12px 内边距。
- **Focus:** 边框切换为钢蓝并出现 3px 低透明度焦点环；不可只靠阴影表示焦点。
- **Search:** 国家、客户和新闻检索保持可见输入提示；清空、无匹配和降级数据需要显式反馈。
- **Error / Disabled:** 错误使用赤红语义色；禁用使用低对比度文字与表面，但保留可理解的标签。

### Navigation

- **Style:** 顶部横向工作台导航，品牌区与业务入口在同一条轨道；活动项使用钢蓝文字、浅蓝底和轻内描边。
- **Default:** 次墨色/静音墨色文字，透明或低对比表面。
- **Hover:** 文字加深、出现轻表面，不改变布局尺寸。
- **Active:** 钢蓝文字 + `#e8f0f7` 类浅蓝背景 + 轻内描边；不依赖下划线单独表达。
- **Mobile:** 允许换行或横向承载，保持入口可点击，不用过小的图标代替文字导航。

### Data Status

- **Available:** 青蓝/青绿色小圆点、更新时间和来源说明。
- **Fallback / Partial:** 琥珀点与“沿用快照/部分待核验”等文字并列。
- **Unavailable / Error:** 赤红点、原因与可执行的重试或查看来源动作；不可把空数据伪装成 0。

### 3D Globe and Trade Sandbox

- **Stage:** 深海蓝背景、青绿色大气边缘、细经纬线和独立画布；球面边界、国家填色、选中浮起和风险水波分层。
- **Flows:** 路线颜色使用青绿、琥珀、紫色等有限语义色；粗细映射业务量或影响级别，底层路径与动态输送层分离。
- **Control Rail:** 国家检索、排名、图层切换、变量升降、策略配置和推演结果集中在右侧轨道；选中后可定位，但随后地图仍可自由旋转。
- **Feedback:** 国家点击/悬停通过填色、边界亮度、海拔与环形扩散共同反馈；多个国家统计在摘要指标中表达，避免把所有数字堆在球面上。
- **Reduced Motion:** 遵循 `prefers-reduced-motion`，关闭自动旋转、路径流动和过渡，只保留静态的选择和层级反馈。

### Editorial Brief and Tide Brief

- **Cover:** 使用深蓝/图片封面、品牌标识、日期/节气/北京天气和同步状态；标题、短结论和来源状态形成首屏信息层级。
- **News:** 新闻卡片以来源、时间、分类和标题为首层；完整正文与大图在展开的阅读层中呈现，阅读层内部可滚动。
- **History:** 历史内容采用深色时间线/人物卡片、年份锚点和可点击横线式标题；悬停适用于精确指针，触控端必须可点击固定展开。
- **Motion:** 封面与内容采用短促的 GSAP 入场；详情面板以 150–300ms 的淡入/位移展开，不能用动画掩盖加载失败或缺图。

## Do's and Don'ts

### Do:

- **Do** 先显示业务事实、口径、来源和更新时间，再使用颜色和动效强化优先级。
- **Do** 让明色工作台与深色三维舞台保持清晰边界，不把地图舞台的暗色扩散到普通业务页面。
- **Do** 用主色表达操作和导航，用暖色表达关注/成本，用赤红表达严重风险，用紫色表达事件层。
- **Do** 对选中、悬停、加载、部分数据、不可用和减少动效状态提供可读文字或结构反馈。
- **Do** 保持国家、客户、订单、路线和风险的检索/点击路径可用，不要求用户必须依赖悬停。
- **Do** 使用 ECharts 的图表容器和 GSAP 的短状态动效服务于业务判断，保留滚动与键盘焦点。
- **Do** 将理论测算、静态快照、抓取结果和真实业务数据的视觉状态区分开。

### Don't:

- **Don't** 用大面积高饱和色、持续闪烁或无语义的装饰线制造“数据很多”的错觉。
- **Don't** 把关税配额、贸易救济或抓取失败的状态伪装成成本公式中的确定数值。
- **Don't** 让路线、风险点、国家边界和标签全部同时争夺视觉中心；复杂图层必须可切换。
- **Don't** 让阅读弹层依赖页面边缘滚动，也不要在移动端保留横向滚动条。
- **Don't** 只用颜色区分正负、风险或选中状态；必须配合文字、形状、位置或边界变化。
- **Don't** 在减少动效设置下继续自动旋转、路径输送或强制平滑滚动。
- **Don't** 把未来设计方向、未验证的数据源或未经确认的视觉数值写成现有系统事实。
