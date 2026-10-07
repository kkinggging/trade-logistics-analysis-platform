import { SHIPPING_PORTS } from '@/core/data/shippingPorts';

export interface SandboxPortOverlay {
  id: string;
  name: string;
  englishName: string;
  country: string;
  lat: number;
  lng: number;
  tier: 'primary' | 'hub';
  region: string;
}

const EXTRA_PORTS: SandboxPortOverlay[] = [
  { id: 'CNJTG', name: '京唐港', englishName: 'Jingtang', country: '中国', lat: 39.19, lng: 119.00, tier: 'primary', region: '环渤海钢材出口节点' },
  { id: 'CNCFD', name: '曹妃甸港', englishName: 'Caofeidian', country: '中国', lat: 39.05, lng: 118.49, tier: 'primary', region: '环渤海钢材出口节点' },
];

const REGISTERED_PORTS: SandboxPortOverlay[] = SHIPPING_PORTS
  .filter((port) => ['CNSHA', 'CNTXG', 'CNNGB', 'CNTAO', 'SGSIN', 'NLRTM', 'AEJEA', 'USLAX'].includes(port.port_id))
  .map((port) => ({
    id: port.port_id,
    name: port.name_cn,
    englishName: port.name_en,
    country: port.country_cn,
    lat: port.latitude,
    lng: port.longitude,
    tier: ['CNSHA', 'CNTXG', 'CNNGB', 'CNTAO'].includes(port.port_id) ? 'primary' : 'hub',
    region: port.country_cn === '中国' ? '中国沿海主干港口' : '国际转运与目的港节点',
  }));

export const SANDBOX_PORTS: SandboxPortOverlay[] = [...EXTRA_PORTS, ...REGISTERED_PORTS];
