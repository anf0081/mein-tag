// Feiertage passend zum Wohnort: Portugal (Festland, Madeira, Azoren, einige Gemeinden) oder Deutschland (bundesweit).
import { addDays } from './util.js';

export function easter(y) { // Gauß/Anonymer gregorianischer Algorithmus
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export const MUNICIPAL = {
  'santa cruz': ['01-15', 'Dia do Concelho de Santa Cruz'], 'são vicente': ['01-22', 'Dia do Concelho de São Vicente'],
  machico: ['05-08', 'Dia do Concelho de Machico'], santana: ['05-25', 'Dia do Concelho de Santana'],
  calheta: ['06-24', 'Dia do Concelho da Calheta'], 'porto santo': ['06-24', 'Dia do Concelho do Porto Santo'],
  'ribeira brava': ['06-29', 'Dia do Concelho da Ribeira Brava'], 'porto moniz': ['07-22', 'Dia do Concelho do Porto Moniz'],
  funchal: ['08-21', 'Dia da Cidade do Funchal'], 'ponta do sol': ['09-08', 'Dia do Concelho da Ponta do Sol'],
};

// einige Stadtfeiertage auf dem Festland
export const MUNICIPAL_MAINLAND = { lisboa: ['06-13', 'Santo António (Lissabon)'], porto: ['06-24', 'São João (Porto)'], braga: ['06-24', 'São João (Braga)'], coimbra: ['07-04', 'Rainha Santa Isabel (Coimbra)'] };

/** Welche Feiertage gelten am Wohnort? { country: 'PT'|'DE'|null, region: 'madeira'|'azores'|'mainland'|null, municipality } */
export function holidayPlace(profile) {
  const loc = profile?.location;
  if (!loc) return { country: null, region: null, municipality: null }; // noch kein Ort: keine Feiertage
  const name = String(loc.name || '').toLowerCase();
  const town = name.split(',')[0].trim();
  const { lat, lon } = loc;
  const inBox = (a, b, c, d) => typeof lat === 'number' && lat > a && lat < b && lon > c && lon < d;
  const cc = loc.country_code || (/portugal$/.test(name) ? 'PT' : /deutschland$|germany$/.test(name) ? 'DE' : null);
  if (inBox(32.3, 33.2, -17.4, -16.1)) return { country: 'PT', region: 'madeira', municipality: MUNICIPAL[town] ? town : null };
  if (inBox(36.8, 39.9, -31.4, -24.8)) return { country: 'PT', region: 'azores', municipality: null };
  if (cc === 'PT' || inBox(36.9, 42.2, -9.6, -6.1)) return { country: 'PT', region: 'mainland', municipality: MUNICIPAL_MAINLAND[town] ? town : null };
  if (cc === 'DE') return { country: 'DE', region: null, municipality: null };
  return { country: null, region: null, municipality: null };
}

/** Kurzbeschreibung für die Einstellungen, z. B. „Portugal, Madeira und Machico“. */
export function holidayLabel(place) {
  if (!place.country) return null;
  if (place.country === 'DE') return 'Deutschland (bundesweite Feiertage)';
  const parts = ['Portugal', { madeira: 'Madeira', azores: 'Azoren' }[place.region]].filter(Boolean);
  const m = place.municipality ? (MUNICIPAL[place.municipality] || MUNICIPAL_MAINLAND[place.municipality]) && place.municipality.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) : null;
  return parts.join(', ') + (m ? ` und ${m}` : '');
}

/** Für ältere Aufrufe: Gemeinden des Wohnorts. */
export function municipalitiesFrom(profile) { const p = holidayPlace(profile); return p.municipality ? [p.municipality] : []; }

export function holidaysForYear(y, place = {}) {
  if (Array.isArray(place)) place = { country: 'PT', region: 'madeira', municipality: place[0] || null }; // alte Form
  const e = easter(y);
  let list = [];
  if (place.country === 'PT') {
    list = [
      [`${y}-01-01`, 'Neujahr (Ano Novo)'], [addDays(e, -2), 'Karfreitag (Sexta-feira Santa)'], [e, 'Ostern (Páscoa)'],
      [`${y}-04-25`, 'Tag der Freiheit (25 de Abril)'], [`${y}-05-01`, 'Tag der Arbeit'], [addDays(e, 60), 'Fronleichnam (Corpo de Deus)'],
      [`${y}-06-10`, 'Tag Portugals (Dia de Portugal)'], [`${y}-08-15`, 'Mariä Himmelfahrt'],
      [`${y}-10-05`, 'Tag der Republik'], [`${y}-11-01`, 'Allerheiligen'], [`${y}-12-01`, 'Tag der Unabhängigkeit'],
      [`${y}-12-08`, 'Mariä Empfängnis'], [`${y}-12-25`, 'Weihnachten'],
    ];
    if (place.region === 'madeira') list.push([`${y}-07-01`, 'Dia da Região (Madeira)'], [`${y}-12-26`, 'Primeira Oitava (Madeira)']);
    if (place.region === 'azores') list.push([addDays(e, 50), 'Dia dos Açores (Pfingstmontag)']);
    const m = MUNICIPAL[place.municipality] || MUNICIPAL_MAINLAND[place.municipality];
    if (m) list.push([`${y}-${m[0]}`, `${m[1]} (Gemeinde)`]);
  } else if (place.country === 'DE') {
    list = [
      [`${y}-01-01`, 'Neujahr'], [addDays(e, -2), 'Karfreitag'], [addDays(e, 1), 'Ostermontag'], [`${y}-05-01`, 'Tag der Arbeit'],
      [addDays(e, 39), 'Christi Himmelfahrt'], [addDays(e, 50), 'Pfingstmontag'], [`${y}-10-03`, 'Tag der Deutschen Einheit'],
      [`${y}-12-25`, '1. Weihnachtstag'], [`${y}-12-26`, '2. Weihnachtstag'],
    ];
  }
  return list.map(([date, name]) => ({ date, name })).sort((a, b) => a.date.localeCompare(b.date));
}

export function holidaysBetween(from, toIncl, place = {}) {
  const ys = new Set([Number(from.slice(0, 4)), Number(toIncl.slice(0, 4))]);
  return [...ys].flatMap((y) => holidaysForYear(y, place)).filter((h) => h.date >= from && h.date <= toIncl);
}
