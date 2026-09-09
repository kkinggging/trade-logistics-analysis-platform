export interface BeijingWeather {
  location: string;
  temperature: number;
  high: number;
  low: number;
  weatherCode: number;
  windSpeed: number;
  updatedAt: string;
}

const weatherLocation = { name: '北京', latitude: 39.9042, longitude: 116.4074 };
const weatherCacheKey = 'trade-platform-beijing-weather-v1';
let activeRequest: Promise<BeijingWeather> | null = null;

function parseWeather(payload: { current?: { time?: string; temperature_2m?: number; weather_code?: number; wind_speed_10m?: number }; daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[] } }) {
  if (!payload.current || payload.current.temperature_2m == null || payload.current.weather_code == null) throw new Error('weather-payload-invalid');
  return {
    location: weatherLocation.name,
    temperature: payload.current.temperature_2m,
    high: payload.daily?.temperature_2m_max?.[0] ?? payload.current.temperature_2m,
    low: payload.daily?.temperature_2m_min?.[0] ?? payload.current.temperature_2m,
    weatherCode: payload.current.weather_code,
    windSpeed: payload.current.wind_speed_10m ?? 0,
    updatedAt: payload.current.time || '',
  } satisfies BeijingWeather;
}

async function fetchOnce() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 7000);
  const params = new URLSearchParams({
    latitude: String(weatherLocation.latitude),
    longitude: String(weatherLocation.longitude),
    current: 'temperature_2m,weather_code,wind_speed_10m',
    daily: 'temperature_2m_max,temperature_2m_min',
    forecast_days: '1',
    timezone: 'Asia/Shanghai',
  });
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`weather-http-${response.status}`);
    return parseWeather(await response.json());
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchWithRetry() {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetchOnce();
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 450 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('weather-unavailable');
}

export function readCachedBeijingWeather() {
  try {
    const raw = window.localStorage.getItem(weatherCacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BeijingWeather;
    return parsed.location && Number.isFinite(parsed.temperature) && Number.isFinite(parsed.weatherCode) ? parsed : null;
  } catch {
    return null;
  }
}

export function requestBeijingWeather() {
  if (!activeRequest) {
    activeRequest = fetchWithRetry().then((weather) => {
      try { window.localStorage.setItem(weatherCacheKey, JSON.stringify(weather)); } catch { /* 缓存不可用时不影响实时请求。 */ }
      return weather;
    }).finally(() => { activeRequest = null; });
  }
  return activeRequest;
}
