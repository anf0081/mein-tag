export const rid = () => Math.random().toString(36).slice(2, 8);

const fmtCache = new Map();
function fmt(tz) {
  if (!fmtCache.has(tz)) {
    fmtCache.set(tz, new Intl.DateTimeFormat('sv-SE', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }));
  }
  return fmtCache.get(tz);
}

function parts(tz, date) {
  return Object.fromEntries(fmt(tz).formatToParts(date).map((x) => [x.type, x.value]));
}

/** Lokales Datum/Zeit in der Zeitzone: { date:'YYYY-MM-DD', time:'HH:MM', weekday:'Donnerstag' } */
export function localNow(tz, date = new Date()) {
  const p = parts(tz, date);
  const weekday = new Intl.DateTimeFormat('de-DE', { timeZone: tz, weekday: 'long' }).format(date);
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, weekday };
}

export function tzOffsetMs(ts, tz) {
  const p = parts(tz, new Date(ts));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - Math.floor(ts / 1000) * 1000;
}

/** Lokale Zeit in tz -> UTC-Date */
export function localToUtc(dateStr, timeStr, tz) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, mi] = timeStr.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  return new Date(guess - tzOffsetMs(guess, tz));
}

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a, b) {
  const t = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((t(b) - t(a)) / 864e5);
}

export function addInterval(dateStr, every, unit) {
  if (unit === 'days') return addDays(dateStr, every);
  if (unit === 'weeks') return addDays(dateStr, every * 7);
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + every * (unit === 'years' ? 12 : 1), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
export const isMonthDay = (s) => typeof s === 'string' && /^(\d{4}-)?\d{2}-\d{2}$/.test(s);

/** 2026-11-22 -> 22.11.2026 */
export const deDate = (iso) => (iso ? String(iso).replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3.$2.$1') : iso);
/** Ersetzt alle ISO-Daten in einem Text durch TT.MM.JJJJ. */
export const isoToDe = (text) => (typeof text === 'string' ? text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3.$2.$1') : text);
