// Offizielle Unwetterwarnungen des IPMA (Portugal). Die Gebiete ergeben sich aus Wohnort und Wetter-Orten.
export const AREAS = { MCN: 'Madeira Nordküste', MCS: 'Madeira Südküste', MRM: 'Madeira Bergregion', MPS: 'Porto Santo',
  AVR: 'Aveiro', BJA: 'Beja', BRG: 'Braga', BGC: 'Bragança', CBO: 'Castelo Branco', CBR: 'Coimbra', EVR: 'Évora', FAR: 'Faro', GDA: 'Guarda',
  LRA: 'Leiria', LSB: 'Lissabon', PTG: 'Portalegre', PTO: 'Porto', STM: 'Santarém', STB: 'Setúbal', VCT: 'Viana do Castelo', VRL: 'Vila Real', VIS: 'Viseu' };
// Hauptorte der Festland-Distrikte (für den nächstgelegenen Bezirk)
const MAINLAND = { AVR: [40.64, -8.65], BJA: [38.02, -7.86], BRG: [41.55, -8.42], BGC: [41.81, -6.76], CBO: [39.82, -7.49], CBR: [40.21, -8.43], EVR: [38.57, -7.91],
  FAR: [37.02, -7.93], GDA: [40.54, -7.27], LRA: [39.74, -8.81], LSB: [38.72, -9.14], PTG: [39.29, -7.43], PTO: [41.15, -8.61], STM: [39.24, -8.69], STB: [38.52, -8.89],
  VCT: [41.69, -8.83], VRL: [41.30, -7.74], VIS: [40.66, -7.91] };

/** Welches IPMA-Warngebiet gilt für einen Ort? null = außerhalb Portugals (Festland, Madeira, Porto Santo). */
export function areaFor(place) {
  if (!place || typeof place.lat !== 'number') return null;
  const { lat, lon } = place;
  if (lat > 32.95 && lat < 33.15 && lon > -16.45 && lon < -16.2) return 'MPS';
  if (lat > 32.55 && lat < 32.95 && lon > -17.35 && lon < -16.6) {
    if ((place.elevation ?? 0) >= 700) return 'MRM';
    return lat >= 32.76 ? 'MCN' : 'MCS';
  }
  if (lat > 36.9 && lat < 42.2 && lon > -9.6 && lon < -6.1) {
    let best = null, d = Infinity;
    for (const [k, [a, b]] of Object.entries(MAINLAND)) { const x = (a - lat) ** 2 + ((b - lon) * Math.cos(lat * Math.PI / 180)) ** 2; if (x < d) { d = x; best = k; } }
    return best;
  }
  return null;
}

/** Gebiete für Wohnort und alle Wetter-Orte (ohne Doppelte). */
export function areasFor(profile) {
  const places = [profile?.location, ...(profile?.weather_places || [])].filter(Boolean);
  return [...new Set(places.map(areaFor).filter(Boolean))];
}
const LEVEL = { yellow: 'Gelb', orange: 'Orange', red: 'Rot' };
const TYPE = { 'Precipitação': 'Regen', Vento: 'Wind', 'Agitação Marítima': 'Seegang', Trovoada: 'Gewitter', Nevoeiro: 'Nebel', 'Tempo Quente': 'Hitze', 'Tempo Frio': 'Kälte', Neve: 'Schnee' };

const fmt = (iso, tz) => new Date(iso).toLocaleString('de-DE', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

export function activeWarnings(list, areas, now = Date.now()) {
  return (list || []).filter((w) => LEVEL[w.awarenessLevelID] && areas.includes(w.idAreaAviso) && new Date(w.endTime).getTime() > now)
    .map((w) => ({
      key: `${w.idAreaAviso}|${w.awarenessTypeName}|${w.awarenessLevelID}|${w.startTime}`,
      area: AREAS[w.idAreaAviso] || w.idAreaAviso, level: LEVEL[w.awarenessLevelID], levelId: w.awarenessLevelID,
      type: TYPE[w.awarenessTypeName] || w.awarenessTypeName, start: w.startTime, end: w.endTime, text: (w.text || '').trim(),
    }));
}

export const describeWarning = (w, tz) => `${w.level}: ${w.type}, ${w.area} (${fmt(w.start, tz)} bis ${fmt(w.end, tz)})${w.text ? ` – ${w.text}` : ''}`;

export async function fetchWarnings() {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch('https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json', { signal: ctrl.signal });
    if (!r.ok) throw new Error(`IPMA HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
