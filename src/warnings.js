// Offizielle Unwetterwarnungen: IPMA (Portugal) und DWD (Deutschland, über die freie Bright-Sky-API). Die Orte ergeben sich aus Wohnort und Wetter-Orten.
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


export function activeWarnings(list, areas, now = Date.now()) {
  return (list || []).filter((w) => LEVEL[w.awarenessLevelID] && areas.includes(w.idAreaAviso) && new Date(w.endTime).getTime() > now)
    .map((w) => ({
      key: `${w.idAreaAviso}|${w.awarenessTypeName}|${w.awarenessLevelID}|${w.startTime}`,
      area: AREAS[w.idAreaAviso] || w.idAreaAviso, level: LEVEL[w.awarenessLevelID], levelId: w.awarenessLevelID,
      type: TYPE[w.awarenessTypeName] || w.awarenessTypeName, type_pt: w.awarenessTypeName, start: w.startTime, end: w.endTime, text: (w.text || '').trim(),
    }));
}

const LV = { en: { Gelb: 'Yellow', Orange: 'Orange', Rot: 'Red', 'Violett (extrem)': 'Purple (extreme)' }, pt: { Gelb: 'Amarelo', Orange: 'Laranja', Rot: 'Vermelho', 'Violett (extrem)': 'Púrpura (extremo)' } };
const TY_EN = { Regen: 'Rain', Wind: 'Wind', Seegang: 'Rough sea', Gewitter: 'Thunderstorm', Nebel: 'Fog', Hitze: 'Heat', Kälte: 'Cold', Schnee: 'Snow' };
/** Stufe, Art und Text einer Warnung in der eingestellten Sprache. */
export function localWarning(w, lang = 'de') {
  if (lang === 'de' || !LV[lang]) return { level: w.level, type: w.type, text: w.text };
  const type = lang === 'pt' ? (w.type_pt || w.type_en || TY_EN[w.type] || w.type) : (w.type_en || TY_EN[w.type] || w.type);
  return { level: LV[lang][w.level] || w.level, type, text: (lang === 'en' ? w.text_en : null) ?? w.text };
}
export const describeWarning = (w, tz, lang = 'de') => {
  const x = localWarning(w, lang);
  const loc = { de: 'de-DE', en: 'en-GB', pt: 'pt-PT' }[lang] || 'de-DE';
  const f = (iso) => new Date(iso).toLocaleString(loc, { timeZone: tz, weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  const W = { de: ['bis', 'ab'], en: ['to', 'from'], pt: ['até', 'a partir de'] }[lang] || ['bis', 'ab'];
  return `${x.level}: ${x.type}, ${w.area} (${w.end ? `${f(w.start)} ${W[0]} ${f(w.end)}` : `${W[1]} ${f(w.start)}`})${x.text ? ` – ${x.text}` : ''}${w.source ? ` [${w.source}]` : ''}`;
};

// ---------- Deutschland: Deutscher Wetterdienst (DWD) über api.brightsky.dev ----------
/** Liegt der Ort in Deutschland? */
export function inGermany(place) {
  if (!place || typeof place.lat !== 'number') return false;
  const cc = place.country_code || (/(deutschland|germany)$/i.test(String(place.name || '')) ? 'DE' : /portugal$/i.test(String(place.name || '')) ? 'PT' : null);
  if (cc) return cc === 'DE';
  return place.lat > 47.2 && place.lat < 55.1 && place.lon > 5.8 && place.lon < 15.1;
}
export const dwdPlacesFor = (profile) => [profile?.location, ...(profile?.weather_places || [])].filter(inGermany);

const DWD_LEVEL = { minor: ['yellow', 'Gelb'], moderate: ['orange', 'Orange'], severe: ['red', 'Rot'], extreme: ['purple', 'Violett (extrem)'] };
const cap = (s) => String(s || '').toLowerCase().replace(/(^|[\s-])\p{L}/gu, (m) => m.toUpperCase());

export async function fetchDwd(place) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch(`https://api.brightsky.dev/alerts?lat=${place.lat}&lon=${place.lon}`, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`DWD/Bright Sky HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

/** Bright-Sky-Antwort in das gemeinsame Warnformat umwandeln. */
export function dwdWarnings(json, place, now = Date.now()) {
  const where = json?.location?.name_short || json?.location?.name || String(place?.name || '').split(',')[0];
  return (json?.alerts || [])
    .filter((a) => a.status !== 'test' && a.response_type !== 'allclear' && DWD_LEVEL[a.severity] && (!a.expires || new Date(a.expires).getTime() > now))
    .map((a) => ({
      key: `DWD|${a.alert_id || a.id}`, source: 'DWD', area: where,
      level: DWD_LEVEL[a.severity][1], levelId: DWD_LEVEL[a.severity][0],
      type: cap(a.event_de || a.event_en || 'Wetterwarnung'), type_en: a.event_en ? cap(a.event_en) : null, start: a.onset || a.effective, end: a.expires || null,
      text: String(a.headline_de || a.headline_en || '').trim(), text_en: a.headline_en ? String(a.headline_en).trim() : null,
    }));
}

/** Alle aktuellen Warnungen für Wohnort und Wetter-Orte (IPMA + DWD). */
export async function getWarnings(profile, now = Date.now()) {
  const out = []; const errors = [];
  const areas = areasFor(profile);
  if (areas.length) {
    try { out.push(...activeWarnings(await fetchWarnings(), areas, now).map((w) => ({ ...w, source: 'IPMA' }))); }
    catch (e) { errors.push(`IPMA: ${e.message}`); }
  }
  for (const p of dwdPlacesFor(profile)) {
    try { out.push(...dwdWarnings(await fetchDwd(p), p, now)); }
    catch (e) { errors.push(`DWD: ${e.message}`); }
  }
  const seen = new Set();
  return { warnings: out.filter((w) => !seen.has(w.key) && seen.add(w.key)), errors };
}

/** Beschreibung der überwachten Gebiete für die Einstellungen. */
export function warningRegions(profile) {
  const pt = areasFor(profile).map((a) => AREAS[a] || a);
  const de = dwdPlacesFor(profile).map((p) => String(p.name || '').split(',')[0]);
  return [...pt.map((x) => `${x} (IPMA)`), ...[...new Set(de)].map((x) => `${x} (DWD)`)];
}

export async function fetchWarnings() {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch('https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json', { signal: ctrl.signal });
    if (!r.ok) throw new Error(`IPMA HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
