const CODES = {
  0: 'klar', 1: 'überwiegend klar', 2: 'teils bewölkt', 3: 'bedeckt', 45: 'Nebel', 48: 'Reifnebel',
  51: 'leichter Nieselregen', 53: 'Nieselregen', 55: 'starker Nieselregen', 61: 'leichter Regen', 63: 'Regen',
  65: 'starker Regen', 66: 'gefrierender Regen', 67: 'starker gefrierender Regen', 71: 'leichter Schnee',
  73: 'Schnee', 75: 'starker Schnee', 80: 'leichte Schauer', 81: 'Schauer', 82: 'heftige Schauer',
  95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'schweres Gewitter mit Hagel',
};

export async function geocode(name) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=de`);
  if (!r.ok) throw new Error(`Geocoding HTTP ${r.status}`);
  const j = await r.json();
  const g = j.results?.[0];
  if (!g) throw new Error(`Ort „${name}“ nicht gefunden`);
  return { name: `${g.name}${g.country ? `, ${g.country}` : ''}`, lat: g.latitude, lon: g.longitude, tz: g.timezone, elevation: g.elevation ?? null, country_code: g.country_code || null };
}

/** Wetter für heute und morgen. Gibt { today, tomorrow, text } zurück. */
export async function getWeather(loc, tz) {
  if (!loc) return null;
  const q = new URLSearchParams({
    latitude: loc.lat, longitude: loc.lon, timezone: tz || 'auto', forecast_days: '2',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,uv_index_max',
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
  if (!r.ok) throw new Error(`Wetter HTTP ${r.status}`);
  const d = (await r.json()).daily;
  const day = (i) => ({
    date: d.time[i], summary: CODES[d.weather_code[i]] ?? `Code ${d.weather_code[i]}`,
    tmax: Math.round(d.temperature_2m_max[i]), tmin: Math.round(d.temperature_2m_min[i]),
    rain_mm: d.precipitation_sum[i], rain_prob: d.precipitation_probability_max[i],
    wind_kmh: Math.round(d.wind_speed_10m_max[i]), gusts_kmh: Math.round(d.wind_gusts_10m_max[i]),
    uv: Math.round(d.uv_index_max[i]),
  });
  const today = day(0), tomorrow = day(1);
  const line = (l, w) => `${l}: ${humanWeather(w)}`;
  return { place: loc.name, today, tomorrow, todayText: humanWeather(today), text: `${line('Heute', today)}\n${line('Morgen', tomorrow)}` };
}

/** Kurz und alltagstauglich: „leichte Schauer, 19–20 °C, Regen eher unwahrscheinlich, leichter Wind“ */
export function humanWeather(w) {
  const p = w.rain_prob ?? 0, mm = w.rain_mm ?? 0;
  const rain = (p < 15 && mm < 0.5) ? 'trocken'
    : p < 35 ? 'Regen eher unwahrscheinlich'
    : p < 65 ? 'zeitweise Regen möglich'
    : mm >= 10 ? 'viel Regen' : 'Regen wahrscheinlich';
  const k = w.wind_kmh ?? 0;
  const wind = k < 12 ? 'kaum Wind' : k < 20 ? 'leichter Wind' : k < 30 ? 'mäßiger Wind' : k < 40 ? 'frischer Wind' : k < 55 ? 'starker Wind' : 'stürmisch';
  const gust = (w.gusts_kmh ?? 0) >= 55 ? `, Böen bis ${w.gusts_kmh} km/h` : '';
  return `${w.summary}, ${w.tmin}–${w.tmax} °C, ${rain}, ${wind}${gust}`;
}
