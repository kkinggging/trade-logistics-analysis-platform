export interface TraditionalCalendarText {
  term: string;
  hou: string;
  isTermDay: boolean;
  dateLabel: string;
}

interface SolarTermDefinition {
  name: string;
  month: number;
  days: [string, string, string];
}

const TERMS: SolarTermDefinition[] = [
  { name: '小寒', month: 1, days: ['雁北乡', '鹊始巢', '雉始雊'] },
  { name: '大寒', month: 1, days: ['鸡始乳', '征鸟厉疾', '水泽腹坚'] },
  { name: '立春', month: 2, days: ['东风解冻', '蛰虫始振', '鱼陟负冰'] },
  { name: '雨水', month: 2, days: ['獭祭鱼', '鸿雁来', '草木萌动'] },
  { name: '惊蛰', month: 3, days: ['桃始华', '仓庚鸣', '鹰化为鸠'] },
  { name: '春分', month: 3, days: ['玄鸟至', '雷乃发声', '始电'] },
  { name: '清明', month: 4, days: ['桐始华', '田鼠化为鴽', '虹始见'] },
  { name: '谷雨', month: 4, days: ['萍始生', '鸣鸠拂其羽', '戴胜降于桑'] },
  { name: '立夏', month: 5, days: ['蝼蝈鸣', '蚯蚓出', '王瓜生'] },
  { name: '小满', month: 5, days: ['苦菜秀', '靡草死', '麦秋至'] },
  { name: '芒种', month: 6, days: ['螳螂生', '鵙始鸣', '反舌无声'] },
  { name: '夏至', month: 6, days: ['鹿角解', '蜩始鸣', '半夏生'] },
  { name: '小暑', month: 7, days: ['温风至', '蟋蟀居宇', '鹰始鸷'] },
  { name: '大暑', month: 7, days: ['腐草为萤', '土润溽暑', '大雨时行'] },
  { name: '立秋', month: 8, days: ['凉风至', '白露降', '寒蝉鸣'] },
  { name: '处暑', month: 8, days: ['鹰乃祭鸟', '天地始肃', '禾乃登'] },
  { name: '白露', month: 9, days: ['鸿雁来', '玄鸟归', '群鸟养羞'] },
  { name: '秋分', month: 9, days: ['雷始收声', '蛰虫坯户', '水始涸'] },
  { name: '寒露', month: 10, days: ['鸿雁来宾', '雀入大水为蛤', '菊有黄华'] },
  { name: '霜降', month: 10, days: ['豺乃祭兽', '草木黄落', '蛰虫咸俯'] },
  { name: '立冬', month: 11, days: ['水始冰', '地始冻', '雉入大水为蜃'] },
  { name: '小雪', month: 11, days: ['虹藏不见', '天气上升地气下降', '闭塞而成冬'] },
  { name: '大雪', month: 12, days: ['鶡鴠不鸣', '虎始交', '荔挺出'] },
  { name: '冬至', month: 12, days: ['蚯蚓结', '麋角解', '水泉动'] },
];

// 日级历表覆盖平台当前业务周期；未覆盖年份使用传统历法的稳定月日近似。
// 本组件只做“哪一天/哪一候”的展示，不替代需要精确交节时刻的天文历算。
const TERM_DAYS: Record<number, number[]> = {
  2024: [6, 20, 4, 19, 5, 20, 4, 19, 5, 20, 5, 21, 6, 22, 7, 22, 7, 22, 8, 23, 7, 22, 6, 21],
  2025: [5, 20, 3, 18, 5, 20, 4, 20, 5, 21, 5, 21, 7, 22, 7, 23, 7, 23, 8, 23, 7, 22, 7, 21],
  2026: [5, 20, 4, 19, 5, 20, 5, 20, 5, 21, 5, 21, 7, 23, 7, 23, 7, 23, 8, 23, 7, 22, 7, 22],
  2027: [5, 20, 4, 19, 5, 21, 5, 20, 6, 21, 6, 21, 7, 23, 7, 23, 8, 23, 8, 23, 7, 22, 7, 22],
  2028: [6, 20, 4, 19, 5, 20, 4, 19, 5, 20, 5, 21, 6, 22, 7, 22, 7, 22, 7, 23, 7, 22, 6, 21],
  2029: [5, 20, 3, 18, 5, 20, 4, 20, 5, 21, 5, 21, 7, 22, 7, 23, 7, 23, 8, 23, 7, 22, 7, 21],
  2030: [5, 20, 4, 19, 5, 20, 5, 20, 6, 21, 6, 21, 7, 23, 7, 23, 8, 23, 8, 23, 7, 22, 7, 22],
};

const DEFAULT_DAYS = [5, 20, 4, 19, 5, 20, 5, 20, 5, 21, 5, 21, 7, 23, 7, 23, 7, 23, 8, 23, 7, 22, 7, 22];

function localDate(year: number, month: number, day: number) {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function termDate(year: number, index: number) {
  const days = TERM_DAYS[year] || DEFAULT_DAYS;
  return localDate(year, TERMS[index].month, days[index]);
}

function parseDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = localDate(Number(match[1]), Number(match[2]), Number(match[3]));
  return Number.isNaN(date.getTime()) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3]) ? null : date;
}

function getTermDate(year: number, index: number) {
  return termDate(year, index);
}

export function getTraditionalCalendarText(value: string): TraditionalCalendarText {
  const date = parseDate(value) || new Date();
  const year = date.getFullYear();
  const dates = TERMS.map((_, index) => getTermDate(year, index));
  let index = dates.findIndex((item) => date.getTime() < item.getTime());
  if (index === -1) index = TERMS.length;
  const currentIndex = index === 0 ? TERMS.length - 1 : index - 1;
  const currentDate = index === 0 ? termDate(year - 1, TERMS.length - 1) : dates[currentIndex];
  const exactIndex = dates.findIndex((item) => item.getTime() === date.getTime());
  const term = TERMS[exactIndex >= 0 ? exactIndex : currentIndex];
  const dayOffset = Math.max(0, Math.floor((date.getTime() - currentDate.getTime()) / 86400000));
  const houIndex = exactIndex >= 0 ? 0 : Math.min(2, Math.floor(dayOffset / 5));
  const dateLabel = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', timeZone: 'Asia/Shanghai' }).format(date);
  return { term: exactIndex >= 0 ? term.name : `${term.name}时段`, hou: exactIndex >= 0 ? '交节日' : term.days[houIndex], isTermDay: exactIndex >= 0, dateLabel };
}
