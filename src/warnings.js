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

// ---------- weitere Länder ----------
const LV2 = { yellow: 'Gelb', orange: 'Orange', red: 'Rot', purple: 'Violett (extrem)' };
const lv = (id) => ({ levelId: id, level: LV2[id] });
const town = (p) => String(p?.name || '').split(',')[0].trim();
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const xmlTag = (block, name) => {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '';
};
const blocks = (xml, name) => xml.match(new RegExp(`<${name}[\\s>][\\s\\S]*?</${name}>`, 'gi')) || [];
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 MeinTag/1.0';
async function getText(url, headers = {}) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': BROWSER_UA, ...headers } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

// USA: National Weather Service (Punktabfrage, kein Schlüssel; User-Agent ist Pflicht)
const NWS_LEVEL = { Minor: 'yellow', Moderate: 'orange', Severe: 'red', Extreme: 'purple' };
export async function fetchNws(place) {
  return JSON.parse(await getText(`https://api.weather.gov/alerts/active?point=${place.lat.toFixed(4)},${place.lon.toFixed(4)}`, { 'User-Agent': 'MeinTag/1.0 (selbst gehostete persönliche Assistenz-App)', Accept: 'application/geo+json' }));
}
export function nwsWarnings(json, place, now = Date.now()) {
  return (json?.features || []).map((f) => f.properties).filter((p) => p && p.status === 'Actual' && p.messageType !== 'Cancel' && NWS_LEVEL[p.severity]
    && (!(p.ends || p.expires) || Date.parse(p.ends || p.expires) > now))
    .map((p) => ({ key: `NWS|${p.id}`, source: 'NWS', area: town(place), ...lv(NWS_LEVEL[p.severity]), type: p.event, type_en: p.event,
      start: p.onset || p.effective, end: p.ends || p.expires || null, text: String(p.headline || '').trim(), text_en: String(p.headline || '').trim() }));
}

// Vereinigtes Königreich: Met Office, RSS je Region (nächstgelegene Region)
export const UK_REGIONS = { os: [59.6, -2.2], he: [57.5, -5.0], gr: [57.2, -2.7], st: [55.8, -4.8], ta: [56.4, -3.4], dg: [55.4, -3.3], ni: [54.6, -6.7], wl: [52.3, -3.7],
  nw: [54.0, -2.7], ne: [54.9, -1.7], yh: [53.9, -1.2], wm: [52.5, -2.0], em: [52.9, -0.9], ee: [52.3, 0.7], sw: [50.8, -3.8], se: [51.3, -0.4] };
export function ukRegionFor(place) {
  let best = null, d = Infinity;
  for (const [k, [a, b]] of Object.entries(UK_REGIONS)) { const x = (a - place.lat) ** 2 + ((b - place.lon) * Math.cos(place.lat * Math.PI / 180)) ** 2; if (x < d) { d = x; best = k; } }
  return best;
}
const UK_TYPE = { rain: 'Regen', wind: 'Wind', snow: 'Schnee', ice: 'Glätte', fog: 'Nebel', thunderstorm: 'Gewitter', thunderstorms: 'Gewitter', lightning: 'Blitz', 'extreme heat': 'Extreme Hitze' };
export function metOfficeWarnings(xml, region, places) {
  return blocks(xml, 'item').map((b) => {
    const title = xmlTag(b, 'title');
    const m = title.match(/^(yellow|amber|red)\s+warning\s+of\s+(.+?)\s+affecting\s+(.+)$/i);
    if (!m) return null;
    const kinds = m[2].toLowerCase().split(/\s*(?:,|and)\s*/).filter(Boolean);
    return { key: `MO|${xmlTag(b, 'guid') || title}`, source: 'Met Office', area: places.map(town).join(', '),
      ...lv({ yellow: 'yellow', amber: 'orange', red: 'red' }[m[1].toLowerCase()]),
      type: kinds.map((k) => UK_TYPE[k] || cap(k)).join(', '), type_en: cap(m[2]), start: new Date(xmlTag(b, 'pubDate') || Date.now()).toISOString(), end: null,
      text: xmlTag(b, 'description').slice(0, 220), text_en: xmlTag(b, 'description').slice(0, 220) };
  }).filter(Boolean);
}

// Europa: MeteoAlarm (Länder-Feed, Abgleich über den Namen der Region)
export const METEOALARM = { AT: 'austria', CH: 'switzerland', LU: 'luxembourg', BE: 'belgium', IE: 'ireland', NL: 'netherlands', FR: 'france', ES: 'spain', IT: 'italy',
  DK: 'denmark', NO: 'norway', SE: 'sweden', FI: 'finland', PL: 'poland', HR: 'croatia', SI: 'slovenia', SK: 'slovakia', GR: 'greece', MT: 'malta', CY: 'cyprus',
  EE: 'estonia', LV: 'latvia', LT: 'lithuania', IS: 'iceland', HU: 'hungary', RO: 'romania', BG: 'bulgaria' };
const MA_LEVEL = { Moderate: 'yellow', Severe: 'orange', Extreme: 'red' };
export function meteoalarmWarnings(xml, places, now = Date.now()) {
  const out = []; const seen = new Set();
  for (const e of blocks(xml, 'entry')) {
    const area = xmlTag(e, 'cap:areaDesc'); const sev = xmlTag(e, 'cap:severity');
    const exp = xmlTag(e, 'cap:expires');
    if (!MA_LEVEL[sev] || (exp && Date.parse(exp) <= now) || /^(test|exercise)$/i.test(xmlTag(e, 'cap:status'))) continue;
    const a = norm(area);
    const hit = places.find((p) => [p.name && town(p), p.admin1, p.admin2, p.admin3].filter(Boolean).map(norm).some((n) => n.length >= 3 && a.length >= 3 && (n === a || a.includes(n) || n.includes(a))));
    if (!hit) continue;
    const id = `${xmlTag(e, 'cap:identifier') || xmlTag(e, 'id')}|${a}`;
    if (seen.has(id)) continue; seen.add(id);
    const ev = xmlTag(e, 'cap:event') || xmlTag(e, 'title');
    out.push({ key: `MA|${id}`, source: 'MeteoAlarm', area, ...lv(MA_LEVEL[sev]), type: cap(ev), type_en: cap(ev),
      start: xmlTag(e, 'cap:onset') || xmlTag(e, 'cap:effective') || new Date().toISOString(), end: exp || null, text: '' });
  }
  return out;
}

// Brasilien: INMET (RSS, Abgleich über den Bundesstaat)
export function inmetWarnings(xml, places, now = Date.now()) {
  const out = [];
  for (const b of blocks(xml, 'item')) {
    const title = xmlTag(b, 'title'); const desc = xmlTag(b, 'description');
    const all = norm(`${title} ${desc}`);
    const hit = places.find((p) => [p.admin1, town(p)].filter(Boolean).some((n) => all.includes(norm(n))));
    if (!hit) continue;
    const id = /grande perigo/i.test(all) ? 'red' : /perigo potencial/i.test(all) ? 'yellow' : /perigo/i.test(all) ? 'orange' : null;
    if (!id) continue;
    const fim = desc.match(/fim[^0-9]{0,10}(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/i);
    const end = fim ? `${fim[3]}-${fim[2]}-${fim[1]}T${fim[4]}:${fim[5]}:00-03:00` : null;
    if (end && Date.parse(end) <= now) continue;
    const type = (title.match(/aviso de\s+([^.]+)/i)?.[1] || title).trim();
    out.push({ key: `INMET|${xmlTag(b, 'guid') || xmlTag(b, 'link') || title}`, source: 'INMET', area: hit.admin1 || town(hit), ...lv(id),
      type: cap(type), type_pt: cap(type), start: new Date(xmlTag(b, 'pubDate') || Date.now()).toISOString(), end, text: '' });
  }
  return out;
}

/** Welcher Dienst ist für einen Ort zuständig? */
export function providerFor(place) {
  const cc = place?.country_code || (inGermany(place) ? 'DE' : areaFor(place) ? 'PT' : null);
  if (!cc) return null;
  if (cc === 'DE') return 'DWD';
  if (cc === 'PT') return areaFor(place) ? 'IPMA' : null;
  if (cc === 'US') return 'NWS';
  if (cc === 'GB') return 'Met Office';
  if (cc === 'BR') return 'INMET';
  if (METEOALARM[cc]) return 'MeteoAlarm';
  return null;
}
const placesOf = (profile) => [profile?.location, ...(profile?.weather_places || [])].filter((p) => p && typeof p.lat === 'number');

/** Alle aktuellen Warnungen für Wohnort und Wetter-Orte, je Land vom zuständigen Wetterdienst. */
export async function getWarnings(profile, now = Date.now()) {
  const out = []; const errors = [];
  const places = placesOf(profile);
  const by = (prov) => places.filter((p) => providerFor(p) === prov);
  const tryIt = async (label, fn) => { try { out.push(...await fn()); } catch (e) { errors.push(`${label}: ${e.message}`); } };
  const jobs = [];
  const areas = areasFor(profile);
  if (areas.length) jobs.push(tryIt('IPMA', async () => activeWarnings(await fetchWarnings(), areas, now).map((w) => ({ ...w, source: 'IPMA' }))));
  for (const p of by('DWD')) jobs.push(tryIt('DWD', async () => dwdWarnings(await fetchDwd(p), p, now)));
  for (const p of by('NWS')) jobs.push(tryIt('NWS', async () => nwsWarnings(await fetchNws(p), p, now)));
  const uk = {}; for (const p of by('Met Office')) (uk[ukRegionFor(p)] ||= []).push(p);
  for (const [r, ps] of Object.entries(uk)) jobs.push(tryIt('Met Office', async () => metOfficeWarnings(await getText(`https://www.metoffice.gov.uk/public/data/PWSCache/WarningsRSS/Region/${r}`), r, ps)));
  const ma = {}; for (const p of by('MeteoAlarm')) (ma[p.country_code] ||= []).push(p);
  for (const [cc, ps] of Object.entries(ma)) jobs.push(tryIt('MeteoAlarm', async () => meteoalarmWarnings(await getText(`https://feeds.meteoalarm.org/feeds/meteoalarm-legacy-atom-${METEOALARM[cc]}`), ps, now)));
  const br = by('INMET'); if (br.length) jobs.push(tryIt('INMET', async () => inmetWarnings(await getText('https://apiprevmet3.inmet.gov.br/avisos/rss'), br, now)));
  await Promise.all(jobs);
  const seen = new Set();
  return { warnings: out.filter((w) => !seen.has(w.key) && seen.add(w.key)), errors };
}

/** Beschreibung der überwachten Orte für die Einstellungen. */
export function warningRegions(profile) {
  const out = [];
  const pt = areasFor(profile).map((a) => `${AREAS[a] || a} (IPMA)`);
  out.push(...pt);
  for (const p of placesOf(profile)) {
    const prov = providerFor(p);
    if (prov && prov !== 'IPMA') out.push(`${town(p)} (${prov})`);
  }
  return [...new Set(out)];
}

export async function fetchWarnings() {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 10000);
  try {
    const r = await fetch('https://api.ipma.pt/open-data/forecast/warnings/warnings_www.json', { signal: ctrl.signal });
    if (!r.ok) throw new Error(`IPMA HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}
