import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { executeTool, undoLast } from './tools.js';
import { sendPush } from './push.js';
import { birthdaySignals, holidaySignals, recurringOccursOn, recurringSignals, todoSignals, tripSignals, uncompleteRecurring } from './signals.js';
import { addDays, isoToDe, localNow, rid } from './util.js';
import { fmtEvent, GOOGLE_SCOPES } from './calendar.js';
import { personaOf } from './personas.js';
import { queueSettingNote } from './chat.js';
import { defaultState } from './store.js';
import { usageSummary } from './usage.js';
import { PROVIDERS, MODEL_OPTIONS, ROLES, provider as aiProvider, resolveModel, apiKey } from './claude.js';
import { ensureHolidays, holidayLabel, holidayPlace, holidaysBetween } from './holidays.js';
import { describeWarning, warningRegions } from './warnings.js';
import { L } from './i18n.js';
import { FEEDS, enabledFeedIds, enabledFeeds, feedTitle, fetchFeed, safeFeedUrl } from './news.js';

const PUB = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

export const RETENTION_OPTIONS = [7, 30, 365, 0]; // 0 = nie löschen

/** Entfernt sichtbare Chat-Nachrichten, die älter sind als eingestellt. Gibt die Anzahl zurück. */
export function pruneChatLog(state, now = Date.now()) {
  const days = state.profile?.chat_retention_days ?? 30;
  if (!days) return 0;
  const before = state.chat_log.length;
  state.chat_log = state.chat_log.filter((m) => now - m.ts < days * 864e5);
  return before - state.chat_log.length;
}

export function logMessage(state, save, role, text, kind = null, actions = null) {
  const m = { id: rid(), ts: Date.now(), role, text: role === 'assistant' ? isoToDe(text) : text, kind, ...(actions?.length ? { actions } : {}) };
  state.chat_log.push(m);
  save();
  return m;
}

async function pushAll(ctx, vapid, env, data) {
  data = { ...data, title: isoToDe(data.title), body: isoToDe(data.body) };
  const keep = []; let ok = 0;
  for (const s of ctx.state.push_subs) {
    try { if ((await sendPush(s, data, vapid, env.VAPID_SUBJECT || 'mailto:admin@localhost')) !== 'gone') { keep.push(s); ok++; } else console.log('Push: ein Gerät ist abgemeldet und wird entfernt'); }
    catch (e) { console.error('Push-Fehler:', e.message); keep.push(s); }
  }
  ctx.state.push_subs = keep;
  ctx.save();
  console.log(`Push „${data.title}“ an ${ok}/${keep.length} Gerät(e)`);
}

/** Transport für automatische Nachrichten (Morgenbrief): Chat-Log + Push. */
export function createWebTransport(ctx, vapid, env = process.env) {
  return {
    noWindow: true,
    async sendText(text, opts = {}) {
      logMessage(ctx.state, ctx.save, 'assistant', text, opts.kind);
      if (opts.push) await pushAll(ctx, vapid, env, { url: '/', ...opts.push });
      if (opts.kind === 'brief') { const t = L(ctx.state); await pushAll(ctx, vapid, env, { title: ctx.state.profile.assistant_name ? `${ctx.state.profile.assistant_name}: ${t('Guten Morgen')} ☀️` : `${t('Guten Morgen')} ☀️`, body: t('Dein Tagesplan ist da. Tippe zum Öffnen.'), url: '/' }); }
    },
    async sendButtons() {}, async sendTemplate() {},
  };
}

function capture(ctx) {
  const out = [];
  return { out, noWindow: true,
    async sendText(t, o) { out.push(logMessage(ctx.state, ctx.save, 'assistant', t, o?.kind, o?.actions)); },
    async sendButtons() {}, async sendTemplate() {} };
}

export function todayData(ctx) {
  const { state } = ctx;
  const n = localNow(ctx.tz());
  const people = state.people.map((p) => ({ ...p, reminded: null }));
  const holidays = state.holidays.map((h) => ({ ...h, reminded: null }));
  const trips = state.trips.map((t) => ({ ...t, reminded: null }));
  return {
    date: n.date, weekday: n.weekday,
    todos: todoSignals(state.todos, n.date).slice(0, 60).map((t) => ({ id: t.id, title: t.title, due: t.due, time: t.time || null, priority: t.priority, overdue: t.overdue, today: t.today, category: t.category })),
    recurring: recurringSignals(state.recurring, n.date).map((r) => { const x = state.recurring.find((y) => y.id === r.recurringId); return { id: r.recurringId, text: r.text, title: x?.title || r.text, next_due: x?.next_due, days: r.days }; }),
    all_recurring: [...state.recurring].sort((a, b) => a.next_due.localeCompare(b.next_due)).map((r) => ({ id: r.id, title: r.title, every: r.every, unit: r.unit, next_due: r.next_due })),
    reminders: [...birthdaySignals(people, n.date), ...holidaySignals(holidays, n.date), ...tripSignals(trips, n.date)].map((r) => r.text),
    holiday: state.profile.holidays_auto === false ? null : (holidaysBetween(n.date, n.date, holidayPlace(state.profile, state.holiday_cache))[0]?.name || null),
    warnings: state.profile.warnings_enabled === false ? [] : (state.current_warnings || []).map((w) => describeWarning(w, ctx.tz(), state.profile.language)),
    timed: (state.timed || []).filter((r) => !r.done && r.date === n.date).map((r) => ({ time: r.time, text: r.text })),
    done: state.todos.filter((t) => t.done && (t.done_at || '') < n.date).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 50).map((t) => ({ id: t.id, title: t.title, done_at: t.done_at })),
    can_undo: (state.undo_stack || []).length > 0,
  };
}

/** Alles, was an einem bestimmten Tag gilt – inkl. dem, was an dem Tag schon abgehakt wurde. */
export function dayData(ctx, D) {
  const { state } = ctx;
  const T = localNow(ctx.tz()).date;
  const items = [];
  for (const t of state.todos) {
    if (!t.done && t.due && (t.due === D || (D === T && t.due < T))) items.push({ kind: 'todo', id: t.id, title: t.title, done: false, overdue: t.due < T, due: t.due, time: t.time || null, priority: t.priority ?? 2 });
    else if (t.done && t.done_at === D) items.push({ kind: 'todo', id: t.id, title: t.title, done: true, time: t.time || null });
  }
  for (const r of state.recurring) {
    if ((r.done_log || []).some((x) => x.date === D)) { items.push({ kind: 'rec', id: r.id, title: r.title, done: true }); continue; }
    if (D >= T && recurringOccursOn(r, D, T)) items.push({ kind: 'rec', id: r.id, title: r.title, done: false, overdue: D === T && r.next_due < T, due: r.next_due, can_check: D === T || D === r.next_due });
  }
  const rank = (x) => (x.done ? 3 : x.overdue ? 0 : x.time ? 1 : 2);
  items.sort((a, b) => rank(a) - rank(b) || (a.time || '').localeCompare(b.time || '') || (a.priority ?? 2) - (b.priority ?? 2));
  const md = D.slice(5);
  const notes = [];
  for (const p of state.people) if (p.birthday && p.birthday.slice(-5) === md) notes.push(`Geburtstag: ${p.name}${p.relation ? ` (${p.relation})` : ''}`);
  for (const h of state.holidays) if (h.date && h.date.slice(-5) === md) notes.push(h.name);
  for (const t of state.trips) { if (t.start === D) notes.push(`Reise beginnt: ${t.title}`); if (t.end === D) notes.push(`Rückreise: ${t.title}`); }
  if (state.profile.holidays_auto !== false) for (const h of holidaysBetween(D, D, holidayPlace(state.profile, state.holiday_cache))) notes.push(`Feiertag: ${h.name}`);
  const timed = (state.timed || []).filter((r) => r.date === D).sort((a, b) => a.time.localeCompare(b.time)).map((r) => ({ time: r.time, text: r.text, done: !!r.done }));
  return { date: D, today: T, items, notes, timed };
}

export function widgetData(ctx) {
  const d = todayData(ctx);
  const items = d.todos.filter((t) => t.overdue || t.today || (!t.due && t.priority === 1)).slice(0, 8)
    .map((t) => ({ title: t.title, due: t.due, overdue: t.overdue }));
  for (const r of d.recurring.filter((x) => x.days <= 0)) items.push({ title: r.text, due: d.date, overdue: r.days < 0 });
  return { date: d.date, count: items.length, items: items.slice(0, 10) };
}

export function createWebServer({ ctx, bot, vapid, env = process.env }) {
  const { state } = ctx;
  const dataDir = path.dirname(env.DATA_FILE || './data/state.json');
  state.avatars ||= { user: null, assistant: null };
  const avatarFile = (who) => path.join(dataDir, `avatar-${who}`);
  const sniff = (b) => (b[0] === 0xff && b[1] === 0xd8 ? 'image/jpeg'
    : b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? 'image/png'
      : b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null);
  const avatarInfo = () => ({ user: state.avatars.user?.v || null, assistant: state.avatars.assistant?.v || null });
  if (!state.widget_token) { state.widget_token = crypto.randomBytes(16).toString('hex'); ctx.save(); }
  const secret = crypto.createHash('sha256').update(`session:${env.APP_PASSWORD}`).digest();
  const sign = (v) => crypto.createHmac('sha256', secret).update(v).digest('base64url');
  const makeToken = () => { const exp = Date.now() + 90 * 864e5; return `${exp}.${sign(String(exp))}`; };
  const validToken = (tok) => {
    if (!tok) return false;
    const [exp, sig] = tok.split('.');
    if (!sig || Number(exp) < Date.now()) return false;
    const a = Buffer.from(sign(exp)), b = Buffer.from(sig);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const pwHash = (s) => crypto.createHash('sha256').update(String(s)).digest();
  const attempts = new Map();

  const json = (res, status, obj, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(JSON.stringify(obj));
  };
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(';').map((c) => c.trim().split('=')).filter((x) => x[0]).map(([k, ...v]) => [k, v.join('=')]));
  const isHttps = (req) => env.COOKIE_SECURE === '1' || req.headers['x-forwarded-proto'] === 'https';
  const pendingOAuth = new Map();
  const publicOrigin = (req) => (env.PUBLIC_URL ? env.PUBLIC_URL.replace(/\/$/, '') : `${isHttps(req) ? 'https' : 'http'}://${req.headers.host}`);
  const redirectUri = (req) => `${publicOrigin(req)}/api/google/callback`;
  const redirect = (res, loc) => { res.writeHead(302, { Location: loc, 'Cache-Control': 'no-store' }); res.end(); };
  const clientIp = (req) => (env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() : '') || req.socket.remoteAddress;

  async function readJson(req, limit = 1e5) {
    const chunks = []; let size = 0;
    for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('zu groß'), { status: 413 }); chunks.push(c); }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('ungültiges JSON'), { status: 400 }); }
  }

  async function api(req, res, url) {
    const route = `${req.method} ${url.pathname}`;

    if (route === 'GET /api/widget') {
      const t = url.searchParams.get('t') || '';
      if (t.length !== state.widget_token.length || !crypto.timingSafeEqual(Buffer.from(t), Buffer.from(state.widget_token))) return json(res, 401, { error: 'unauthorized' });
      return json(res, 200, widgetData(ctx));
    }
    if (route === 'POST /api/login') {
      const ip = clientIp(req); const now = Date.now();
      const a = attempts.get(ip) || { n: 0, reset: now + 600_000 };
      if (now > a.reset) { a.n = 0; a.reset = now + 600_000; }
      if (a.n >= 8) return json(res, 429, { error: 'Zu viele Versuche, bitte in ein paar Minuten nochmal.' });
      const body = await readJson(req);
      if (!crypto.timingSafeEqual(pwHash(body.password ?? ''), pwHash(env.APP_PASSWORD))) { a.n++; attempts.set(ip, a); return json(res, 401, { error: 'Falsches Passwort' }); }
      attempts.delete(ip);
      const flags = `HttpOnly; SameSite=Strict; Path=/; Max-Age=${90 * 86400}${isHttps(req) ? '; Secure' : ''}`;
      return json(res, 200, { ok: true }, { 'Set-Cookie': `sid=${makeToken()}; ${flags}` });
    }
    if (route === 'GET /api/google/callback') {
      // Kommt von Google zurück (anderer Ursprung, daher ohne Sitzungs-Cookie): über den einmaligen state-Wert abgesichert
      const st = url.searchParams.get('state') || '';
      const exp = pendingOAuth.get(st); pendingOAuth.delete(st);
      if (!exp || exp < Date.now()) return redirect(res, '/?google=abgelaufen#profile');
      if (url.searchParams.get('error')) return redirect(res, '/?google=abgebrochen#profile');
      const c = ctx.calendar.creds();
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code: url.searchParams.get('code') || '', client_id: c.id, client_secret: c.secret, redirect_uri: redirectUri(req), grant_type: 'authorization_code' }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.refresh_token) { console.error('Google-Verbindung fehlgeschlagen:', j.error_description || j.error || r.status); return redirect(res, '/?google=fehler#profile'); }
      state.google = { ...state.google, refresh_token: j.refresh_token, connected_at: new Date().toISOString() };
      ctx.save(); ctx.calendar.reset(); ctx.tasks?.reset();
      state.google.email = await ctx.calendar.email(); ctx.save();
      ctx.tasks?.sync();
      console.log(`Google verbunden${state.google.email ? ` (${state.google.email})` : ''}`);
      return redirect(res, '/?google=ok#profile');
    }
    const authed = validToken(cookies(req).sid);
    if (route === 'GET /api/session') return json(res, 200, { authed });
    if (!authed) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'POST' && !(req.headers['content-type'] || '').includes('application/json')) return json(res, 415, { error: 'JSON erwartet' });

    switch (route) {
      case 'POST /api/logout':
        return json(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
      case 'GET /api/chat':
        return json(res, 200, { messages: state.chat_log.slice(-120), name: state.profile.name, assistant_name: state.profile.assistant_name, assistant_gender: state.profile.assistant_gender || 'f', language: state.profile.language || 'de', avatars: avatarInfo(), onboarding_done: state.onboarding.done, push_enabled: state.push_subs.length > 0 });
      case 'POST /api/chat': {
        const { text } = await readJson(req);
        if (typeof text !== 'string' || !text.trim()) return json(res, 400, { error: 'Text fehlt' });
        const cap = capture(ctx);
        const user = logMessage(state, ctx.save, 'user', text.trim());
        await bot.onMessage({ type: 'text', text: text.trim(), id: rid() }, cap);
        if (!cap.out.length) cap.out.push(logMessage(state, ctx.save, 'assistant', 'Hm, da ist gerade etwas schiefgelaufen. Versuch es gleich nochmal. 🙈'));
        return json(res, 200, { user, messages: cap.out });
      }
      case 'POST /api/feedback': {
        const { rating } = await readJson(req);
        const cap = capture(ctx);
        await bot.onMessage({ type: 'button', buttonId: rating === 'up' ? 'fb:up' : 'fb:down', id: rid() }, cap);
        return json(res, 200, { messages: cap.out });
      }
      case 'POST /api/brief': {
        const cap = capture(ctx);
        await bot.runBrief(cap);
        return json(res, 200, { messages: cap.out });
      }
      case 'GET /api/day': {
        const D = url.searchParams.get('date') || '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(D) || Number.isNaN(Date.parse(D))) return json(res, 400, { error: 'Datum ungültig' });
        const d = dayData(ctx, D);
        if (url.searchParams.get('events') === '1') {
          try {
            const { configured, events } = await ctx.calendar.listEvents(D, addDays(D, 1), ctx.tz());
            d.events = configured ? events.filter((e) => e.date === D).map((e) => ({ date: e.date, title: e.title, start: e.start, end: e.end, all_day: e.all_day })) : null;
          } catch (e) { d.events_error = e.message; }
        }
        return json(res, 200, d);
      }
      case 'POST /api/recurring/undone': {
        const { id, date } = await readJson(req);
        const r = state.recurring.find((x) => x.id === id); if (!r) return json(res, 400, { error: 'Routine nicht gefunden' });
        if (!uncompleteRecurring(r, date)) return json(res, 400, { error: 'An diesem Tag nicht abgehakt' });
        ctx.save(); ctx.tasks?.scheduleSync();
        return json(res, 200, todayData(ctx));
      }
      case 'GET /api/today': {
        const d = todayData(ctx);
        try {
          const { configured, events } = await ctx.calendar.listEvents(d.date, addDays(d.date, 8), ctx.tz());
          d.events = configured ? events.map((e) => ({ date: e.date, title: e.title, start: e.start, end: e.end, all_day: e.all_day, text: fmtEvent(e) })) : null;
        } catch (e) { d.events = []; d.events_error = e.message; }
        return json(res, 200, d);
      }
      case 'POST /api/todo/done': { const { id } = await readJson(req); await executeTool('complete_todo', { id }, ctx); return json(res, 200, todayData(ctx)); }
      case 'POST /api/todo/update': {
        const { id, title, due, time } = await readJson(req);
        if (typeof title === 'string' && !title.trim()) return json(res, 400, { error: 'Titel fehlt' });
        await executeTool('update_todo', { id, ...(typeof title === 'string' ? { title: title.trim().slice(0, 200) } : {}), ...(due !== undefined ? { due: due || '' } : {}), ...(time !== undefined ? { time: time || '' } : {}) }, ctx);
        return json(res, 200, todayData(ctx));
      }
      case 'POST /api/todo/clear-done': {
        const T0 = localNow(ctx.tz()).date; const removed = state.todos.filter((t) => t.done && (t.done_at || '') < T0);
        if (removed.length) {
          state.todos = state.todos.filter((t) => !removed.includes(t));
          (state.undo_stack ||= []).push({ type: 'cleared', todos: removed, ts: Date.now() });
          state.undo_stack = state.undo_stack.slice(-20);
          ctx.save();
        }
        return json(res, 200, { cleared: removed.length, ...todayData(ctx) });
      }
      case 'POST /api/todo/delete': { const { id } = await readJson(req); await executeTool('delete_todo', { id }, ctx); return json(res, 200, todayData(ctx)); }
      case 'POST /api/recurring/update': {
        const { id, title, every, unit, next_due } = await readJson(req);
        await executeTool('update_recurring', { id, ...(typeof title === 'string' ? { title: title.trim().slice(0, 200) } : {}), ...(every !== undefined ? { every: Number(every) } : {}), ...(unit ? { unit } : {}), ...(next_due ? { next_due } : {}) }, ctx);
        return json(res, 200, todayData(ctx));
      }
      case 'POST /api/recurring/delete': { const { id } = await readJson(req); await executeTool('remove_recurring', { id }, ctx); return json(res, 200, todayData(ctx)); }
      case 'POST /api/todo/reopen': { const { id } = await readJson(req); await executeTool('reopen_todo', { id }, ctx); return json(res, 200, todayData(ctx)); }
      case 'POST /api/undo': {
        const u = undoLast(state); ctx.save();
        if (u) ctx.tasks?.scheduleSync();
        return json(res, 200, { undone: u, today: todayData(ctx) });
      }
      case 'POST /api/recurring/done': { const { id } = await readJson(req); await executeTool('complete_recurring', { id }, ctx); return json(res, 200, todayData(ctx)); }
      case 'GET /api/profile': {
        const goals = state.entities.filter((e) => ['ziel', 'routine', 'hobby'].includes(e.kind)).map((e) => ({ id: e.id, name: e.name, kind: e.kind, details: e.details || '', last_done: e.last_done || null }));
        return json(res, 200, {
          name: state.profile.name, assistant_name: state.profile.assistant_name, persona: personaOf(state.profile).label, persona_short: 'Warm, mit Humor und achtsam, dabei sachlich und auf Augenhöhe.', assistant_gender: state.profile.assistant_gender || 'f', user_gender: state.profile.user_gender || null,
          avatars: avatarInfo(), brief_time: state.profile.brief_time,
          language: state.profile.language || 'de', chat_retention_days: state.profile.chat_retention_days ?? 30, chat_messages: state.chat_log.length, news_feeds: enabledFeeds(state.profile).map((f) => ({ id: f.id, name: f.name, label: f.label, custom: !!f.custom, url: f.custom ? f.url : undefined })), news_catalog: FEEDS.map(({ id, name, label, lang, country }) => ({ id, name, label, lang, country })), news_status: state.news_status || null,
          companion: { due_notify_enabled: state.profile.due_notify_enabled !== false, due_notify_time: state.profile.due_notify_time || '09:00', checkin_enabled: state.profile.checkin_enabled !== false, checkin_time: state.profile.checkin_time || '20:30', weekly_enabled: state.profile.weekly_enabled !== false, weekly_day: state.profile.weekly_day ?? 0, weekly_time: state.profile.weekly_time || '18:00' },
          safety: { warnings_enabled: state.profile.warnings_enabled !== false, warning_areas: warningRegions(state.profile), holidays_auto: state.profile.holidays_auto !== false, holiday_label: holidayLabel(holidayPlace(state.profile, state.holiday_cache)), holiday_cc: holidayPlace(state.profile, state.holiday_cache).generic ? holidayPlace(state.profile, state.holiday_cache).country : null },
          usage: usageSummary(state, ctx.today().slice(0, 7)),
          ai: {
            provider: aiProvider(env), providers: PROVIDERS, roles: ROLES, options: MODEL_OPTIONS,
            models: Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, Object.fromEntries(ROLES.map(([r]) => [r, resolveModel(env, r, p)]))])),
            has_key: Object.fromEntries(Object.keys(PROVIDERS).map((p) => [p, !!apiKey(env, p)])),
            key_in_env: { anthropic: !!env.ANTHROPIC_API_KEY, deepseek: !!env.DEEPSEEK_API_KEY },
          }, weather_places: (state.profile.weather_places || []).map((p) => ({ name: p.name, label: p.label })), location: state.profile.location?.name || null,
          memory: state.memory.slice(-60).reverse().map((m) => ({ id: m.id, text: m.text })), goals,
          calendar: ctx.calendar.configured, tasks: !!ctx.tasks?.configured, push_devices: state.push_subs.length,
          google: { has_client: !!(ctx.calendar.creds().id && ctx.calendar.creds().secret), via_env: !!env.GOOGLE_REFRESH_TOKEN, email: state.google?.email || null, redirect_uri: redirectUri(req) },
          onboarding_done: state.onboarding.done,
        });
      }
      case 'POST /api/profile': {
        const b = await readJson(req);
        const input = {};
        for (const k of ['brief_time', 'name', 'assistant_name']) if (typeof b[k] === 'string') input[k] = b[k].trim().slice(0, 40);
        if (['f', 'm', 'd'].includes(b.assistant_gender)) input.assistant_gender = b.assistant_gender;
        if (['f', 'm', 'd'].includes(b.user_gender)) input.user_gender = b.user_gender;
        if (['de', 'en', 'pt'].includes(b.language)) input.language = b.language;
        if (RETENTION_OPTIONS.includes(b.chat_retention_days)) { state.profile.chat_retention_days = b.chat_retention_days; const n = pruneChatLog(state); if (n) console.log(`${n} alte Chat-Nachrichten gelöscht`); ctx.save(); }
        for (const k of ['checkin_enabled', 'weekly_enabled', 'warnings_enabled', 'holidays_auto', 'due_notify_enabled']) if (typeof b[k] === 'boolean') input[k] = b[k];
        for (const k of ['checkin_time', 'weekly_time', 'due_notify_time']) if (typeof b[k] === 'string' && /^\d{2}:\d{2}$/.test(b[k])) input[k] = b[k];
        if (Number.isInteger(b.weekly_day) && b.weekly_day >= 0 && b.weekly_day <= 6) input.weekly_day = b.weekly_day;
        if (input.name === '') input.name = null;
        const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const onOff = (v) => (v ? 'an' : 'aus');
        const LABEL = {
          brief_time: (v) => `Morgenbrief um ${v}`, name: (v) => `ihr Name: ${v || '(keiner)'}`, assistant_name: (v) => `dein Name: ${v || '(keiner)'}`,
          assistant_gender: (v) => `du bist jetzt ${({ f: 'weiblich', m: 'männlich', d: 'divers' })[v]}`, user_gender: (v) => `die Person identifiziert sich als ${({ f: 'weiblich', m: 'männlich', d: 'divers' })[v]}`, language: (v) => `Sprache: ${({ de: 'Deutsch', en: 'Englisch', pt: 'Portugiesisch' })[v] || v}`,
          checkin_enabled: (v) => `Abend-Check-in ${onOff(v)}`, checkin_time: (v) => `Abend-Check-in um ${v}`, weekly_enabled: (v) => `Wochenplanung ${onOff(v)}`,
          weekly_time: (v) => `Wochenplanung um ${v}`, weekly_day: (v) => `Wochenplanung am ${WD[v]}`, warnings_enabled: (v) => `Unwetterwarnungen ${onOff(v)}`,
          holidays_auto: (v) => `Feiertage automatisch ${onOff(v)}`, due_notify_enabled: (v) => `Hinweise zu fälligen Aufgaben ${onOff(v)}`, due_notify_time: (v) => `Hinweise zu fälligen Aufgaben um ${v}`,
        };
        const before = Object.fromEntries(Object.keys(LABEL).map((k) => [k, state.profile[k]]));
        await executeTool('update_profile', input, ctx);
        for (const k of Object.keys(LABEL)) if (input[k] !== undefined && state.profile[k] !== before[k]) queueSettingNote(state, k, LABEL[k](state.profile[k]));
        if (RETENTION_OPTIONS.includes(b.chat_retention_days)) queueSettingNote(state, 'retention', `Chatverlauf in der Ansicht behalten: ${b.chat_retention_days === 0 || b.chat_retention_days === null ? 'nie löschen' : `${b.chat_retention_days} Tage`}`);
        ctx.save();
        return json(res, 200, { ok: true, profile_saved: true, brief_time: state.profile.brief_time, name: state.profile.name, assistant_name: state.profile.assistant_name, persona: state.profile.persona, assistant_gender: state.profile.assistant_gender, user_gender: state.profile.user_gender || null, language: state.profile.language, news: state.profile.news });
      }
      case 'POST /api/avatar/user': case 'POST /api/avatar/assistant': {
        const who = url.pathname.split('/').pop();
        const { image } = await readJson(req, 3e6);
        const m = typeof image === 'string' && image.match(/^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
        if (!m) return json(res, 400, { error: 'Bild fehlt oder Format nicht unterstützt' });
        const buf = Buffer.from(m[1], 'base64');
        const mime = sniff(buf);
        if (!mime || buf.length > 1.5e6) return json(res, 400, { error: 'Bitte ein JPG-, PNG- oder WebP-Bild unter 1,5 MB' });
        fs.mkdirSync(dataDir, { recursive: true });
        fs.writeFileSync(avatarFile(who), buf);
        state.avatars[who] = { mime, v: Date.now().toString(36) }; ctx.save();
        return json(res, 200, { ok: true, avatars: avatarInfo() });
      }
      case 'POST /api/avatar/user/delete': case 'POST /api/avatar/assistant/delete': {
        const who = url.pathname.split('/')[3];
        try { fs.unlinkSync(avatarFile(who)); } catch { /* war nicht da */ }
        state.avatars[who] = null; ctx.save();
        return json(res, 200, { ok: true, avatars: avatarInfo() });
      }
      case 'GET /api/avatar/user': case 'GET /api/avatar/assistant': {
        const who = url.pathname.split('/').pop();
        const a = state.avatars[who];
        if (!a || !fs.existsSync(avatarFile(who))) return json(res, 404, { error: 'kein Bild' });
        res.writeHead(200, { 'Content-Type': a.mime, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
        fs.createReadStream(avatarFile(who)).pipe(res);
        return;
      }
      case 'POST /api/news': {
        const { enable, disable } = await readJson(req);
        try { await executeTool('set_news', { enable: enable ? [enable] : [], disable: disable ? [disable] : [] }, ctx); }
        catch (e) { return json(res, 400, { error: e.message }); }
        queueSettingNote(state, 'news', `Nachrichtenquellen jetzt: ${enabledFeeds(state.profile).map((f) => `${f.name} (${f.label})`).join(', ') || 'keine'}`); ctx.save();
        return json(res, 200, { ok: true });
      }
      case 'POST /api/news/custom': {
        const { url: raw, name } = await readJson(req);
        let u; try { u = safeFeedUrl(raw); } catch (e) { return json(res, 400, { error: e.message }); }
        if ((state.profile.custom_feeds || []).some((f) => f.url === u)) return json(res, 400, { error: 'Diesen Feed gibt es schon' });
        let title = '';
        try {
          const items = await fetchFeed({ name: 'test', url: u, lang: null }, 10000);
          if (!items.length) throw new Error('keine Meldungen gefunden');
          title = items.feedTitle || '';
        } catch (e) { return json(res, 400, { error: `Feed nicht lesbar: ${e.message}` }); }
        const f = { id: `c_${rid()}`, name: String(name || '').trim().slice(0, 40) || title || new URL(u).hostname.replace(/^www\./, ''), url: u };
        (state.profile.custom_feeds ||= []).push(f);
        state.profile.news_feeds = [...enabledFeedIds(state.profile), f.id];
        queueSettingNote(state, 'news', `Nachrichtenquellen jetzt: ${enabledFeeds(state.profile).map((x) => `${x.name} (${x.label})`).join(', ')}`); ctx.save();
        return json(res, 200, { ok: true, name: f.name });
      }
      case 'POST /api/news/custom/delete': {
        const { id } = await readJson(req);
        state.profile.custom_feeds = (state.profile.custom_feeds || []).filter((f) => f.id !== id);
        state.profile.news_feeds = enabledFeedIds(state.profile).filter((x) => x !== id);
        queueSettingNote(state, 'news', `Nachrichtenquellen jetzt: ${enabledFeeds(state.profile).map((x) => `${x.name} (${x.label})`).join(', ') || 'keine'}`); ctx.save();
        return json(res, 200, { ok: true });
      }
      case 'POST /api/location': {
        const { location_name } = await readJson(req);
        if (typeof location_name !== 'string' || !location_name.trim()) return json(res, 400, { error: 'Ort fehlt' });
        const feedsBefore = enabledFeedIds(state.profile);
        try { await executeTool('update_profile', { location_name: location_name.trim().slice(0, 100) }, ctx); }
        catch (e) { return json(res, 400, { error: e.message }); }
        try { const y = Number(localNow(ctx.tz()).date.slice(0, 4)); await ensureHolidays(state.profile, (state.holiday_cache ||= {}), [y, y + 1]); } catch (e) { console.error('Feiertage:', e.message); }
        const fs2 = enabledFeeds(state.profile);
        const added = fs2.filter((f) => !feedsBefore.includes(f.id));
        if (added.length || fs2.length !== feedsBefore.length) queueSettingNote(state, 'news', `Nachrichtenquellen jetzt: ${fs2.map((f) => `${f.name} (${f.label})`).join(', ') || 'keine'}`);
        queueSettingNote(state, 'location', `ihr Ort (für Wetter, Warnungen, Feiertage): ${state.profile.location.name}`); ctx.save();
        return json(res, 200, { ok: true, location: state.profile.location.name, news_added: added.map((f) => `${f.name} (${f.label})`) });
      }
      case 'POST /api/weather/place': {
        const { location_name, label, remove } = await readJson(req);
        if (typeof location_name !== 'string' || !location_name.trim()) return json(res, 400, { error: 'Ort fehlt' });
        try { await executeTool(remove ? 'remove_weather_place' : 'add_weather_place', { location_name: location_name.trim(), label }, ctx); }
        catch (e) { return json(res, 400, { error: e.message }); }
        queueSettingNote(state, `place:${location_name.trim().toLowerCase()}`, remove ? `Wetter-Ort entfernt: ${location_name.trim()}` : `Wetter-Ort hinzugefügt: ${state.profile.weather_places.at(-1)?.name || location_name.trim()}${label ? ` (${label})` : ''}`); ctx.save();
        return json(res, 200, { ok: true, weather_places: state.profile.weather_places.map((p) => ({ name: p.name, label: p.label })) });
      }
      case 'POST /api/ai': {
        const b = await readJson(req);
        const a = (state.ai ||= { provider: null, models: { anthropic: {}, deepseek: {} }, keys: {} });
        if (b.provider !== undefined) {
          if (!PROVIDERS[b.provider]) return json(res, 400, { error: 'Unbekannter Anbieter' });
          if (!apiKey(env, b.provider) && !(b.key && b.key.provider === b.provider)) return json(res, 400, { error: `Für ${PROVIDERS[b.provider]} ist noch kein API-Schlüssel hinterlegt` });
          a.provider = b.provider;
        }
        if (b.model) {
          const { provider: p, role, model } = b.model;
          if (!PROVIDERS[p] || !ROLES.some(([r]) => r === role) || !MODEL_OPTIONS[p].some(([id]) => id === model)) return json(res, 400, { error: 'Ungültige Auswahl' });
          ((a.models ||= {})[p] ||= {})[role] = model;
        }
        if (b.key) {
          const { provider: p, value } = b.key;
          if (!PROVIDERS[p] || typeof value !== 'string') return json(res, 400, { error: 'Ungültiger Schlüssel' });
          const v = value.trim();
          if (v && (v.length < 20 || /\s/.test(v))) return json(res, 400, { error: 'Das sieht nicht nach einem gültigen API-Schlüssel aus' });
          (a.keys ||= {})[p] = v || undefined;
          if (!v && a.provider === p && !apiKey(env, p)) a.provider = null;
        }
        ctx.save();
        console.log(`KI-Einstellung geändert: Anbieter ${aiProvider(env)}, Chat ${resolveModel(env, 'chat')}`);
        return json(res, 200, { ok: true, provider: aiProvider(env) });
      }
      case 'POST /api/memory/forget': {
        const { id } = await readJson(req);
        const m = state.memory.find((x) => x.id === id);
        await executeTool('forget', { id }, ctx);
        if (m) { queueSettingNote(state, `forget:${id}`, `Gelerntes gelöscht, nicht mehr verwenden: „${m.text.slice(0, 160)}“`); ctx.save(); }
        return json(res, 200, { ok: true });
      }
      case 'POST /api/entity': {
        const { id, kind, name, details } = await readJson(req);
        const KINDS = { ziel: 'Ziel', routine: 'Routine', hobby: 'Hobby' };
        if (!KINDS[kind]) return json(res, 400, { error: 'Art fehlt' });
        if (typeof name !== 'string' || !name.trim()) return json(res, 400, { error: 'Name fehlt' });
        const nm = name.trim().slice(0, 100), det = typeof details === 'string' ? details.trim().slice(0, 500) : '';
        let e = id && state.entities.find((x) => x.id === id);
        if (e) {
          const old = `${KINDS[e.kind] || e.kind} „${e.name}“`;
          Object.assign(e, { kind, name: nm, details: det || null });
          queueSettingNote(state, `entity:${e.id}`, `${old} geändert zu ${KINDS[kind]} „${nm}“${det ? ` (${det})` : ''}`);
        } else {
          e = await executeTool('upsert_entity', { kind, name: nm, details: det || undefined }, ctx);
          queueSettingNote(state, `entity:${e.id}`, `neu: ${KINDS[kind]} „${nm}“${det ? ` (${det})` : ''}`);
        }
        ctx.save();
        return json(res, 200, { ok: true });
      }
      case 'POST /api/entity/delete': {
        const { id } = await readJson(req);
        const i = state.entities.findIndex((x) => x.id === id);
        if (i < 0) return json(res, 400, { error: 'Nicht gefunden' });
        const [e] = state.entities.splice(i, 1);
        queueSettingNote(state, `entity:${id}`, `entfernt: ${e.kind} „${e.name}“ – nicht mehr einplanen`);
        ctx.save();
        return json(res, 200, { ok: true });
      }
      case 'POST /api/todo/add': {
        const { title, due, time } = await readJson(req);
        if (typeof title !== 'string' || !title.trim()) return json(res, 400, { error: 'Titel fehlt' });
        await executeTool('add_todo', { title: title.trim().slice(0, 200), ...(due ? { due } : {}), ...(time ? { time } : {}) }, ctx);
        return json(res, 200, todayData(ctx));
      }
      case 'POST /api/reset': {
        const { confirm } = await readJson(req);
        if (confirm !== 'LÖSCHEN') return json(res, 400, { error: 'Bestätigung fehlt' });
        try { (await import('./backup.js')).dailyBackup(env.DATA_FILE || './data/state.json', ctx.today(), 14, '-vor-loeschen'); } catch (e) { console.error('Backup vor Löschen:', e.message); }
        for (const who of ['user', 'assistant']) { try { fs.unlinkSync(avatarFile(who)); } catch { /* egal */ } }
        const keep = { push_subs: state.push_subs, widget_token: state.widget_token, google: state.google, ai: state.ai, gtoday: state.gtoday, gtask_tombstones: state.gtask_tombstones };
        for (const k of Object.keys(state)) delete state[k];
        Object.assign(state, defaultState(), keep);
        ctx.save();
        console.log('Alle Daten wurden zurückgesetzt.');
        return json(res, 200, { ok: true });
      }
      case 'POST /api/google/client': {
        const b = await readJson(req);
        const id = String(b.client_id || '').trim(), secret = String(b.client_secret || '').trim();
        if (!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(id)) return json(res, 400, { error: 'Die Client-ID endet auf .apps.googleusercontent.com, bitte prüfen' });
        if (secret.length < 10) return json(res, 400, { error: 'Der Clientschlüssel fehlt oder ist zu kurz' });
        state.google = { ...state.google, client_id: id, client_secret: secret };
        ctx.save();
        return json(res, 200, { ok: true });
      }
      case 'GET /api/google/start': {
        const c = ctx.calendar.creds();
        if (!c.id || !c.secret) return redirect(res, '/?google=fehlt#profile');
        const nonce = crypto.randomBytes(16).toString('hex');
        pendingOAuth.set(nonce, Date.now() + 10 * 60_000);
        for (const [k, v] of pendingOAuth) if (v < Date.now()) pendingOAuth.delete(k);
        return redirect(res, 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
          client_id: c.id, redirect_uri: redirectUri(req), response_type: 'code', scope: GOOGLE_SCOPES,
          access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: nonce,
        }));
      }
      case 'POST /api/google/disconnect': {
        const tok = state.google?.refresh_token;
        if (tok) fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tok)}`, { method: 'POST' }).catch(() => {});
        state.google = { client_id: state.google?.client_id, client_secret: state.google?.client_secret };
        // Verknüpfungen lösen, damit beim nächsten Verbinden (evtl. anderes Konto) nichts lokal gelöscht wird
        for (const t of state.todos) { if (t.gtask_id) { delete t.gtask_id; delete t.g_updated; if (!t.done) t.dirty = true; } }
        state.gtoday = null;
        state.gtask_deletes = [];
        ctx.save(); ctx.calendar.reset(); ctx.tasks?.reset();
        return json(res, 200, { ok: true, env_connected: ctx.calendar.configured });
      }
      case 'GET /api/widget-url': return json(res, 200, { path: `/api/widget?t=${state.widget_token}` });
      case 'GET /api/push/key': return json(res, 200, { key: vapid.publicKey });
      case 'POST /api/push/subscribe': {
        const { subscription: s } = await readJson(req);
        if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth || !/^https:\/\//.test(s.endpoint)) return json(res, 400, { error: 'ungültiges Abo' });
        state.push_subs = state.push_subs.filter((x) => x.endpoint !== s.endpoint);
        state.push_subs.push({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
        ctx.save();
        return json(res, 200, { ok: true });
      }
      case 'POST /api/push/unsubscribe': {
        const { endpoint } = await readJson(req);
        state.push_subs = state.push_subs.filter((x) => x.endpoint !== endpoint); ctx.save();
        return json(res, 200, { ok: true });
      }
      case 'POST /api/push/test':
        await pushAll(ctx, vapid, env, { title: 'Test ✨', body: L(state)('Benachrichtigungen funktionieren.'), url: '/' });
        return json(res, 200, { ok: true, subscribers: state.push_subs.length });
      default: return json(res, 404, { error: 'not found' });
    }
  }

  /** Datenschutzseite mit den Angaben der Betreiberin/des Betreibers dieser Instanz (aus der .env). */
  function servePrivacy(res) {
    const h = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const op = env.PRIVACY_OPERATOR?.trim();
    const contact = env.PRIVACY_CONTACT?.trim();
    const contactHtml = !contact ? '' : /^https?:\/\//.test(contact) ? `, erreichbar über <a href="${h(contact)}">${h(contact.replace(/^https?:\/\//, ''))}</a>`
      : contact.includes('@') ? `, erreichbar unter <a href="mailto:${h(contact)}">${h(contact)}</a>` : `, ${h(contact)}`;
    const ai = { anthropic: 'Anthropic, Claude', deepseek: 'DeepSeek' }[state.ai?.provider || env.AI_PROVIDER || 'anthropic'] || 'Anthropic, Claude';
    const html = fs.readFileSync(path.join(PUB, 'datenschutz.html'), 'utf8')
      .replaceAll('{{OPERATOR}}', op ? h(op) : 'die Betreiberin bzw. der Betreiber dieser Instanz (Angabe fehlt: PRIVACY_OPERATOR in der .env setzen)')
      .replaceAll('{{CONTACT}}', contactHtml)
      .replaceAll('{{SERVER_LOCATION}}', env.PRIVACY_SERVER_LOCATION?.trim() ? ` (Standort: ${h(env.PRIVACY_SERVER_LOCATION.trim())})` : '')
      .replaceAll('{{AI}}', h(ai))
      .replaceAll('{{TASKLIST}}', h(env.GOOGLE_TASKLIST?.trim() && env.GOOGLE_TASKLIST.trim() !== 'Mein Tag' ? env.GOOGLE_TASKLIST.trim() : 'Alle Aufgaben'))
      .replaceAll('{{TODAYLIST}}', h(env.GOOGLE_TODAY_LIST || 'Heute'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(html);
  }

  function serveStatic(req, res, url) {
    if (url.pathname === '/datenschutz.html' || url.pathname === '/datenschutz' || url.pathname === '/privacy') { servePrivacy(res); return; }
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const file = path.join(PUB, path.normalize(rel));
    if (!file.startsWith(PUB + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end('not found'); return; }
    const ext = path.extname(file);
    res.writeHead(200, {
      'Content-Type': TYPES[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.png' ? 'public, max-age=86400' : 'no-cache',
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    });
    fs.createReadStream(file).pipe(res);
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) await api(req, res, url);
      else if (req.method === 'GET') serveStatic(req, res, url);
      else res.writeHead(405).end();
    } catch (e) {
      console.error('Web-Fehler:', e.message);
      if (!res.headersSent) json(res, e.status || (/nicht gefunden|muss|fehlt|Nicht gefunden/i.test(e.message) ? 400 : 500), { error: e.status || /nicht gefunden|muss|fehlt/i.test(e.message) ? e.message : 'Serverfehler' });
    }
  });
}
