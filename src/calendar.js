import { addDays, localNow, localToUtc } from './util.js';

export const GOOGLE_SCOPES = 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks';

/** getState: liefert den App-Zustand; dort können Zugangsdaten unter state.google liegen (in der App eingetragen). */
export function createCalendar(env, getState = () => ({})) {
  const creds = () => {
    const g = getState()?.google || {};
    return { id: env.GOOGLE_CLIENT_ID || g.client_id, secret: env.GOOGLE_CLIENT_SECRET || g.client_secret, refresh: env.GOOGLE_REFRESH_TOKEN || g.refresh_token };
  };
  const isConfigured = () => { const c = creds(); return !!(c.id && c.secret && c.refresh); };
  const calId = encodeURIComponent(env.GOOGLE_CALENDAR_ID || 'primary');
  let token = null, exp = 0, tokenFor = null;

  async function accessToken() {
    const c = creds();
    if (!c.refresh) throw new Error('Google ist nicht verbunden');
    if (token && tokenFor === c.refresh && Date.now() < exp - 60_000) return token;
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: c.id, client_secret: c.secret,
        refresh_token: c.refresh, grant_type: 'refresh_token',
      }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`Google-Token: ${j.error_description || j.error || r.status}`);
    token = j.access_token; exp = Date.now() + j.expires_in * 1000; tokenFor = c.refresh;
    return token;
  }

  async function api(path, opts = {}) {
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}${path}`, {
      ...opts, headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Kalender: ${j.error?.message || r.status}`);
    return j;
  }

  /** Termine von fromDate (inkl.) bis toDate (exkl.), jeweils 'YYYY-MM-DD' in tz. */
  async function listEvents(fromDate, toDate, tz) {
    if (!isConfigured()) return { configured: false, events: [] };
    const q = new URLSearchParams({
      timeMin: localToUtc(fromDate, '00:00', tz).toISOString(), timeMax: localToUtc(toDate, '00:00', tz).toISOString(),
      singleEvents: 'true', orderBy: 'startTime', maxResults: '100',
    });
    const j = await api(`/events?${q}`);
    const events = (j.items || []).filter((e) => e.status !== 'cancelled').map((e) => {
      const allDay = !!e.start.date;
      const s = allDay ? null : localNow(tz, new Date(e.start.dateTime));
      const en = allDay ? null : localNow(tz, new Date(e.end.dateTime));
      return {
        id: e.id, title: e.summary || '(ohne Titel)', all_day: allDay,
        date: allDay ? e.start.date : s.date, start: s?.time ?? null, end: en?.time ?? null,
        location: e.location || null,
      };
    });
    return { configured: true, events };
  }

  async function createEvent({ title, date, start, end, all_day, description, location }, tz) {
    if (!isConfigured()) throw new Error('Google Kalender ist nicht verbunden');
    const body = { summary: title, description, location };
    if (all_day || !start) {
      body.start = { date }; body.end = { date: addDays(date, 1) };
    } else {
      const endT = end || `${String(Math.min(23, Number(start.slice(0, 2)) + 1)).padStart(2, '0')}:${start.slice(3)}`;
      body.start = { dateTime: `${date}T${start}:00`, timeZone: tz };
      body.end = { dateTime: `${date}T${endT}:00`, timeZone: tz };
    }
    const e = await api('/events', { method: 'POST', body: JSON.stringify(body) });
    return { id: e.id, link: e.htmlLink };
  }

  async function getRaw(id) { return api(`/events/${encodeURIComponent(id)}`); }

  async function updateEvent(id, ch, tz) {
    if (!isConfigured()) throw new Error('Google Kalender ist nicht verbunden');
    const e = await getRaw(id);
    const body = {};
    if (ch.title !== undefined) body.summary = ch.title;
    if (ch.location !== undefined) body.location = ch.location;
    if (ch.description !== undefined) body.description = ch.description;
    if (ch.date || ch.start || ch.end || ch.all_day !== undefined) {
      const wasAllDay = !!e.start.date;
      const oldS = wasAllDay ? null : localNow(tz, new Date(e.start.dateTime));
      const oldE = wasAllDay ? null : localNow(tz, new Date(e.end.dateTime));
      const date = ch.date || (wasAllDay ? e.start.date : oldS.date);
      const allDay = ch.all_day ?? (wasAllDay && !ch.start);
      if (allDay) { body.start = { date }; body.end = { date: addDays(date, 1) }; }
      else {
        const start = ch.start || oldS?.time || '09:00';
        let end = ch.end;
        if (!end) {
          const durMin = oldS && oldE ? (new Date(e.end.dateTime) - new Date(e.start.dateTime)) / 60000 : 60;
          const t = new Date(localToUtc(date, start, tz).getTime() + durMin * 60000);
          end = localNow(tz, t).time;
        }
        body.start = { dateTime: `${date}T${start}:00`, timeZone: tz };
        body.end = { dateTime: `${date}T${end}:00`, timeZone: tz };
      }
    }
    const r = await api(`/events/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
    return { id: r.id, title: r.summary };
  }

  async function deleteEvent(id) {
    if (!isConfigured()) throw new Error('Google Kalender ist nicht verbunden');
    const e = await getRaw(id);
    const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calId}/events/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${await accessToken()}` } });
    if (!r.ok && r.status !== 410) throw new Error(`Kalender: Löschen fehlgeschlagen (${r.status})`);
    return { id, title: e.summary };
  }

  async function email() {
    try { return (await api('')).id || null; } catch { return null; }
  }
  return {
    get configured() { return isConfigured(); },
    creds, listEvents, createEvent, updateEvent, deleteEvent, accessToken, email,
    reset() { token = null; exp = 0; tokenFor = null; },
  };
}

export const fmtEvent = (e) => `${e.date} ${e.all_day ? 'ganztägig' : `${e.start}–${e.end}`} ${e.title}${e.location ? ` (${e.location})` : ''}`;
