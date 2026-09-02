export interface ShippingPort {
  port_id: string;
  name_cn: string;
  name_en: string;
  country_cn: string;
  country_code: string;
  latitude: number;
  longitude: number;
  coordinate_scope: 'port_area_anchor';
  coordinate_source: string;
}

/**
 * 运输地图唯一港口坐标注册表。
 *
 * 坐标是港区锚点，不是导航航迹；后续接入业务港口主数据时只需替换本表，
 * 路线筛选与图表逻辑无需改动。地图会把港口名称、国家和坐标来源放入提示框。
 */
export const SHIPPING_PORTS: ShippingPort[] = [
  { port_id: 'CNSHA', name_cn: '上海港', name_en: 'Shanghai', country_cn: '中国', country_code: 'CN', latitude: 31.23, longitude: 121.47, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'CNTXG', name_cn: '天津港', name_en: 'Tianjin', country_cn: '中国', country_code: 'CN', latitude: 38.99, longitude: 117.72, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'CNNGB', name_cn: '宁波港', name_en: 'Ningbo', country_cn: '中国', country_code: 'CN', latitude: 29.90, longitude: 121.95, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'CNTAO', name_cn: '青岛港', name_en: 'Qingdao', country_cn: '中国', country_code: 'CN', latitude: 36.07, longitude: 120.38, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'DEHAM', name_cn: '汉堡港', name_en: 'Hamburg', country_cn: '德国', country_code: 'DE', latitude: 53.55, longitude: 9.99, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'NLRTM', name_cn: '鹿特丹港', name_en: 'Rotterdam', country_cn: '荷兰', country_code: 'NL', latitude: 51.92, longitude: 4.48, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'THBKK', name_cn: '曼谷港', name_en: 'Bangkok', country_cn: '泰国', country_code: 'TH', latitude: 13.76, longitude: 100.50, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'VNSGN', name_cn: '胡志明港', name_en: 'Ho Chi Minh', country_cn: '越南', country_code: 'VN', latitude: 10.77, longitude: 106.70, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'INNSA', name_cn: '孟买港', name_en: 'Mumbai', country_cn: '印度', country_code: 'IN', latitude: 19.08, longitude: 72.88, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'BEANR', name_cn: '安特卫普港', name_en: 'Antwerp', country_cn: '比利时', country_code: 'BE', latitude: 51.22, longitude: 4.40, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'IDJKT', name_cn: '雅加达港', name_en: 'Jakarta', country_cn: '印度尼西亚', country_code: 'ID', latitude: -6.10, longitude: 106.88, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'AEJEA', name_cn: '杰贝阿里港', name_en: 'Jebel Ali', country_cn: '阿联酋', country_code: 'AE', latitude: 25.01, longitude: 55.06, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'SGSIN', name_cn: '新加坡港', name_en: 'Singapore', country_cn: '新加坡', country_code: 'SG', latitude: 1.29, longitude: 103.85, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'USLAX', name_cn: '洛杉矶港', name_en: 'Los Angeles', country_cn: '美国', country_code: 'US', latitude: 33.74, longitude: -118.27, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'GBFXT', name_cn: '费利克斯托港', name_en: 'Felixstowe', country_cn: '英国', country_code: 'GB', latitude: 51.96, longitude: 1.35, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
  { port_id: 'INCCU', name_cn: '加尔各答港', name_en: 'Kolkata', country_cn: '印度', country_code: 'IN', latitude: 22.03, longitude: 88.06, coordinate_scope: 'port_area_anchor', coordinate_source: '公开港区坐标锚点 · 待业务主数据复核' },
];

export const SHIPPING_PORT_BY_EN = Object.fromEntries(SHIPPING_PORTS.map((port) => [port.name_en, port])) as Record<string, ShippingPort>;

