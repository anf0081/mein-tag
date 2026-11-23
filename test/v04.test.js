import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultState } from '../src/store.js';
import { executeTool, undoLast } from '../src/tools.js';
import { createScheduler } from '../src/schedule.js';
import { activeWarnings } from '../src/warnings.js';
import { dailyBackup } from '../src/backup.js';
import { recordUsage, usageSummary } from '../src/usage.js';
import { holidaysForYear } from '../src/holidays.js';
import { createCalendar } from '../src/calendar.js';
import { localNow } from '../src/util.js';

const TZ = 'Atlantic/Madeira';
const mk = () => {
  const state = defaultState();
  state.history = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hallo' }];
  return { env: { ANTHROPIC_API_KEY: 'k' }, state, save() {}, tz: () => TZ, today: () => localNow(TZ).date,
    calendar: { configured: false, listEvents: async () => ({ configured: false, events: [] }) } };
};
const tr = () => { const sent = []; return { sent, noWindow: true, sendText: async (t, o) => sent.push({ t, push: o?.push }), sendButtons: async () => {}, sendTemplate: async () => {} }; };
const claudeReply = (text) => { const calls = []; globalThis.fetch = async (url, opts) => { calls.push(String(url)); if (String(url).includes('ipma')) return { ok: true, json: async () => [] }; return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }] }) }; }; return calls; };

test('Uhrzeit-Erinnerung: wird gespeichert, zur Zeit gepusht, nur einmal', async () => {
  const ctx = mk(); claudeReply('x');
  await assert.rejects(() => executeTool('set_reminder', { text: 'alt', date: '2020-01-01', time: '10:00' }, ctx), /Vergangenheit/);
  const r = await executeTool('set_reminder', { text: 'Hühnerstall', time: '23:59', date: '2099-01-01' }, ctx);
  r.at = Date.now() - 1000; // fällig machen
  const t = tr(); const tick = createScheduler(ctx, t);
  await tick(); await tick();
  const rem = t.sent.filter((s) => s.t.includes('Hühnerstall'));
  assert.equal(rem.length, 1);
  assert.equal(rem[0].push.title, '⏰ Erinnerung'); assert.equal(rem[0].push.body, 'Hühnerstall');
  assert.match(ctx.state.history.at(-1).content, /Erinnerung: Hühnerstall/);
});

test('Fokus: nach Ablauf genau eine Nachfrage, end_focus beendet', async () => {
  const ctx = mk(); claudeReply('Und, ist die Steuer erledigt?');
  await executeTool('start_focus', { task: 'Steuer', minutes: 30 }, ctx);
  ctx.state.focus.until = Date.now() - 1;
  const t = tr(); const tick = createScheduler(ctx, t);
  await tick(); await tick();
  assert.equal(t.sent.filter((s) => s.push?.tag === 'focus').length, 1);
  const out = await executeTool('end_focus', { done: true }, ctx);
  assert.equal(out.done, true); assert.equal(ctx.state.focus, null);
});

test('Check-in und Wochenplanung: nur im Zeitfenster, einmal pro Tag', async () => {
  const ctx = mk(); claudeReply('Wie war dein Tag?');
  ctx.state.onboarding.done = true;
  const n = localNow(TZ);
  const [h, m] = n.time.split(':').map(Number);
  const before = `${String((h + 23) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`; // vor 1 Stunde
  ctx.state.profile.checkin_time = before;
  ctx.state.profile.weekly_day = new Date(`${n.date}T12:00:00Z`).getUTCDay();
  ctx.state.profile.weekly_time = before;
  const t = tr(); const tick = createScheduler(ctx, t);
  await tick(); await tick();
  if (h >= 1) { // um Mitternacht herum wäre „vor 1 Stunde“ gestern
    assert.equal(t.sent.filter((s) => s.push?.tag === 'checkin').length, 1);
    assert.equal(t.sent.filter((s) => s.push?.tag === 'weekly').length, 1);
  }
  const ctx2 = mk(); ctx2.state.onboarding.done = true;
  ctx2.state.profile.checkin_time = `${String((h + 1) % 24).padStart(2, '0')}:00`; // später
  ctx2.state.profile.weekly_enabled = false;
  const t2 = tr(); await createScheduler(ctx2, t2)();
  assert.equal(t2.sent.filter((s) => s.push?.tag === 'checkin').length, 0);
});

test('IPMA: nur Madeira-Gebiete, nicht grün, nicht abgelaufen; Push nur bei neuen', async () => {
  const future = new Date(Date.now() + 6 * 3600e3).toISOString(), past = new Date(Date.now() - 3600e3).toISOString();
  const raw = [
    { idAreaAviso: 'MCS', awarenessTypeName: 'Precipitação', awarenessLevelID: 'yellow', startTime: past, endTime: future, text: 'Aguaceiros fortes' },
    { idAreaAviso: 'MCN', awarenessTypeName: 'Vento', awarenessLevelID: 'green', startTime: past, endTime: future },
    { idAreaAviso: 'LSB', awarenessTypeName: 'Vento', awarenessLevelID: 'red', startTime: past, endTime: future },
    { idAreaAviso: 'MRM', awarenessTypeName: 'Vento', awarenessLevelID: 'orange', startTime: past, endTime: past },
  ];
  const a = activeWarnings(raw, ['MCN', 'MCS', 'MRM']);
  assert.deepEqual(a.map((w) => [w.area, w.level, w.type]), [['Madeira Südküste', 'Gelb', 'Regen']]);
  const ctx = mk();
  ctx.state.profile.location = { name: 'Machico, Portugal', lat: 32.717, lon: -16.767 };
  globalThis.fetch = async () => ({ ok: true, json: async () => raw });
  const t = tr(); const tick = createScheduler(ctx, t);
  await tick();
  assert.equal(t.sent.length, 1); assert.equal(t.sent[0].push.title, '⚠️ Warnung Gelb: Regen');
  assert.equal(ctx.state.current_warnings.length, 1);
});

test('Backup: einmal pro Tag, behält 14', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mt-'));
  const f = path.join(dir, 'state.json'); fs.writeFileSync(f, '{}');
  for (let d = 1; d <= 16; d++) dailyBackup(f, `2026-11-${String(d).padStart(2, '0')}`);
  assert.equal(dailyBackup(f, '2026-11-16'), null, 'gleicher Tag nicht doppelt');
  const files = fs.readdirSync(path.join(dir, 'backups')).sort();
  assert.equal(files.length, 14); assert.equal(files[0], 'state-2026-11-03.json');
  assert.equal((fs.statSync(path.join(dir, 'backups', files[0])).mode & 0o777).toString(8), '600');
});

test('Kosten: Nutzung wird summiert und geschätzt', () => {
  const st = defaultState();
  recordUsage(st, 'claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 }, '2026-11');
  recordUsage(st, 'claude-haiku-5-5', { input_tokens: 2_000_000, output_tokens: 0, server_tool_use: { web_search_requests: 3 } }, '2026-11');
  const s = usageSummary(st, '2026-11');
  assert.equal(s.calls, 2); assert.equal(s.usd, 3.23);
});

test('Feiertage 2026: Ostern, Karfreitag, Fronleichnam, Madeira', () => {
  const h = holidaysForYear(2026, ['machico']).map((x) => x.date);
  for (const d of ['2026-04-03', '2026-04-05', '2026-06-04', '2026-07-01', '2026-12-26', '2026-05-08']) assert.ok(h.includes(d), d);
});

test('Kalender: Termin verschieben behält die Dauer, löschen', async () => {
  const reqs = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url); reqs.push({ u, m: opts.method || 'GET', body: opts.body });
    if (u.includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'a', expires_in: 3600 }) };
    if (u.endsWith('/events/E1') && (opts.method || 'GET') === 'GET') return { ok: true, json: async () => ({ id: 'E1', summary: 'Zahnarzt', start: { dateTime: '2026-11-20T15:00:00Z' }, end: { dateTime: '2026-11-20T16:30:00Z' } }) };
    if (opts.method === 'PATCH') return { ok: true, json: async () => ({ id: 'E1', summary: 'Zahnarzt' }) };
    if (opts.method === 'DELETE') return { ok: true, status: 204, json: async () => ({}) };
    throw new Error(u);
  };
  const cal = createCalendar({ GOOGLE_CLIENT_ID: 'i', GOOGLE_CLIENT_SECRET: 's', GOOGLE_REFRESH_TOKEN: 'r' });
  await cal.updateEvent('E1', { date: '2026-11-23', start: '10:00' }, TZ);
  const body = JSON.parse(reqs.find((r) => r.m === 'PATCH').body);
  assert.deepEqual(body, { start: { dateTime: '2026-11-23T10:00:00', timeZone: TZ }, end: { dateTime: '2026-11-23T11:30:00', timeZone: TZ } });
  const d = await cal.deleteEvent('E1');
  assert.equal(d.title, 'Zahnarzt'); assert.ok(reqs.some((r) => r.m === 'DELETE'));
});

test('Onboarding läuft mit Sonnet, danach mit dem Chat-Modell', async () => {
  const { chatTurn } = await import('../src/chat.js');
  const models = [];
  globalThis.fetch = async (u, o) => { models.push(JSON.parse(o.body).model); return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }) }; };
  const ctx = mk(); ctx.env.CLAUDE_MODEL = 'claude-haiku-5-5';
  await chatTurn(ctx, 'hallo');
  ctx.state.onboarding.done = true;
  await chatTurn(ctx, 'und jetzt');
  assert.deepEqual(models, ['claude-sonnet-5-5', 'claude-haiku-5-5']);
});

test('Onboarding: höheres Limit + Fortsetzung bei Abbruch; Alltag kurz', async () => {
  const { chatTurn } = await import('../src/chat.js');
  const bodies = []; let n = 0;
  globalThis.fetch = async (u, o) => {
    bodies.push(JSON.parse(o.body)); n++;
    if (n === 1) return { ok: true, json: async () => ({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Teil eins, ' }] }) };
    return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Teil zwei.' }] }) };
  };
  const ctx = mk();
  const out = await chatTurn(ctx, 'erzähl');
  assert.equal(out.text, 'Teil eins, Teil zwei.');
  assert.equal(bodies[0].max_tokens, 8000);
  ctx.state.onboarding.done = true; n = 5;
  await chatTurn(ctx, 'kurz bitte');
  assert.equal(bodies.at(-1).max_tokens, 2048);
});

test('Profil: eigener Geburtstag und Persönliches', async () => {
  const ctx = mk();
  await executeTool('update_profile', { birthday: '1993-03-14', about_me: '- Freelance-Webentwicklerin\n- Kraft: Natur, Meditation' }, ctx);
  assert.equal(ctx.state.profile.birthday, '1993-03-14');
  const { buildOverview } = await import('../src/overview.js');
  const o = buildOverview(ctx.state);
  assert.match(o, /Dein Geburtstag: 14\.03\.1993/);
  assert.match(o, /\*Über dich\*\n- Freelance-Webentwicklerin\n- Kraft: Natur, Meditation/);
  await assert.rejects(() => executeTool('update_profile', { birthday: '14.3.' }, ctx), /MM-DD/);
});

test('Push während des Onboardings: Brief und Check-in kommen schon vor dem Abschluss', async () => {
  const { createBot } = await import('../src/bot.js');
  const ctx = mk(); ctx.state.onboarding = { started: true, done: false, sections: {} };
  ctx.state.profile.brief_time = '00:00';
  globalThis.fetch = async (u) => (String(u).includes('anthropic') ? { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '*Guten Morgen*' }] }) } : { ok: true, json: async () => [], text: async () => '' });
  const sent = [];
  const bot = createBot(ctx, { noWindow: true, sendText: async (t, o) => sent.push({ t, kind: o?.kind }), sendButtons: async () => {}, sendTemplate: async () => {} });
  await bot.tick();
  assert.ok(sent.some((s) => s.kind === 'brief'), 'Brief wurde verschickt');
});

test('Fällige Aufgaben: Uhrzeit einzeln, Rest als ein Sammel-Hinweis, je einmal', async () => {
  const ctx = mk(); ctx.state.onboarding.started = true; claudeReply('x');
  const n = localNow(TZ);
  const [hh, mm] = n.time.split(':').map(Number);
  const earlier = hh >= 1 ? `${String(hh - 1).padStart(2, '0')}:${String(mm).padStart(2, '0')}` : '00:00';
  await executeTool('add_todo', { title: 'Zahnarzt anrufen', due: n.date, time: earlier }, ctx);
  await executeTool('add_todo', { title: 'Hühnerfutter', due: n.date }, ctx);
  await executeTool('add_todo', { title: 'Steuer', due: '2020-01-01' }, ctx);
  await executeTool('add_todo', { title: 'Später', due: '2099-01-01' }, ctx);
  ctx.state.profile.due_notify_time = earlier;
  const t = tr(); const tick = createScheduler(ctx, t);
  await tick(); await tick();
  const timed = t.sent.filter((s) => s.push?.title === '📋 Jetzt dran');
  const digest = t.sent.filter((s) => s.push?.tag === 'due');
  assert.equal(timed.length, 1); assert.equal(timed[0].push.body, 'Zahnarzt anrufen');
  assert.equal(digest.length, 1);
  assert.match(digest[0].t, /Hühnerfutter/); assert.match(digest[0].t, /Überfällig: Steuer/);
  assert.doesNotMatch(digest[0].t, /Später|Zahnarzt/);
});

test('Eine feste, neutrale Persönlichkeit; alte Auswahl wird ignoriert; Regel im Prompt', async () => {
  const { buildSystem } = await import('../src/chat.js');
  const ctx = mk();
  ctx.state.profile.persona = 'gouvernante';
  const sys = buildSystem(ctx);
  assert.match(sys, /PERSÖNLICHKEIT \(Freundin & Begleiterin\)/);
  assert.match(sys, /keine Kosenamen/);
  assert.match(sys, /NICHT davon aus, dass ihr etwas zu viel ist/);
  assert.doesNotMatch(sys, /Gouvernante/);
  assert.match(sys, /NUR auf, wenn sie es in ihrer aktuellen Nachricht ausdrücklich verlangt/);
  ctx.state.profile.assistant_gender = 'm';
  assert.match(buildSystem(ctx), /PERSÖNLICHKEIT \(Freund & Begleiter\)/);
  ctx.state.profile.assistant_gender = 'd';
  assert.match(buildSystem(ctx), /die persönliche Assistenz \(divers\)[\s\S]*PERSÖNLICHKEIT \(Vertraute Begleitung\)[\s\S]*geschlechtsneutral/);
});

test('KI-Anbieter DeepSeek: richtige Adresse, Schlüssel, Modelle; Claude unverändert', async () => {
  const { callClaude, resolveModel } = await import('../src/claude.js');
  const reqs = [];
  globalThis.fetch = async (u, o) => { reqs.push({ u: String(u), key: o.headers['x-api-key'], model: JSON.parse(o.body).model }); return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] }) }; };
  const ds = { AI_PROVIDER: 'deepseek', DEEPSEEK_API_KEY: 'sk-ds', ANTHROPIC_API_KEY: 'sk-ant', CLAUDE_MODEL: 'claude-haiku-5-5' };
  await callClaude(ds, { system: 's', messages: [{ role: 'user', content: 'hi' }] });
  assert.deepEqual(reqs[0], { u: 'https://api.deepseek.com/anthropic/v1/messages', key: 'sk-ds', model: 'deepseek-flash' });
  assert.equal(resolveModel(ds, 'brief'), 'deepseek-flash');
  assert.equal(resolveModel({ ...ds, DEEPSEEK_ONBOARDING_MODEL: 'deepseek-v4-pro' }, 'onboarding'), 'deepseek-v4-pro');
  const an = { ANTHROPIC_API_KEY: 'sk-ant', CLAUDE_MODEL: 'claude-haiku-5-5' };
  await callClaude(an, { system: 's', messages: [{ role: 'user', content: 'hi' }] });
  assert.deepEqual(reqs[1], { u: 'https://api.anthropic.com/v1/messages', key: 'sk-ant', model: 'claude-haiku-5-5' });
  assert.equal(resolveModel(an, 'onboarding'), 'claude-sonnet-5-5');
});

test('Verlauf: wird ab 24 Nachrichten verdichtet, Neuestes bleibt wörtlich, Zusammenfassung im Prompt', async () => {
  const { summarizeHistory } = await import('../src/summary.js');
  const { buildSystem } = await import('../src/chat.js');
  const ctx = mk();
  ctx.state.history = [];
  for (let i = 0; i < 15; i++) ctx.state.history.push({ role: 'user', content: `Frage ${i}${i === 2 ? ' – nächsten Dienstag Elterngespräch' : ''}` }, { role: 'assistant', content: `Antwort ${i}` });
  let sent;
  globalThis.fetch = async (u, o) => { sent = JSON.parse(o.body); return { ok: true, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '- Elterngespräch am Dienstag, Uhrzeit noch offen' }] }) }; };
  ctx.state.history_summary = '- alte Notiz';
  assert.equal(await summarizeHistory(ctx), true);
  assert.equal(ctx.state.history.length, 10);
  assert.equal(ctx.state.history[0].role, 'user');
  assert.equal(ctx.state.history[0].content, 'Frage 10');
  assert.match(sent.messages[0].content, /alte Notiz[\s\S]*Elterngespräch/);
  assert.equal(ctx.state.history_summary, '- Elterngespräch am Dienstag, Uhrzeit noch offen');
  assert.match(buildSystem(ctx), /ZUSAMMENFASSUNG FRÜHERER GESPRÄCHE[\s\S]*Elterngespräch/);
  assert.equal(await summarizeHistory(ctx), false, 'kurzer Verlauf bleibt unverändert');
});

test('Chatverlauf: Aufbewahrung nach Tagen, „nie“ löscht nichts, Wissen bleibt', async () => {
  const { pruneChatLog } = await import('../src/web.js');
  const st = defaultState();
  const now = Date.now();
  st.chat_log = [40, 10, 1].map((d, i) => ({ id: `m${i}`, ts: now - d * 864e5, role: 'user', text: `vor ${d} Tagen` }));
  st.history_summary = '- wichtig'; st.memory = [{ id: 'x', text: 'mag Tee' }];
  st.profile.chat_retention_days = 0;
  assert.equal(pruneChatLog(st, now), 0); assert.equal(st.chat_log.length, 3);
  st.profile.chat_retention_days = 30;
  assert.equal(pruneChatLog(st, now), 1);
  st.profile.chat_retention_days = 7;
  assert.equal(pruneChatLog(st, now), 1);
  assert.deepEqual(st.chat_log.map((m) => m.text), ['vor 1 Tagen']);
  assert.equal(st.history_summary, '- wichtig'); assert.equal(st.memory.length, 1);
});

test('Rückgängig und Wieder-öffnen: Aufgaben und Routinen', async () => {
  const { undoLast } = await import('../src/tools.js');
  const ctx = mk();
  const a = await executeTool('add_todo', { title: 'Steuer' }, ctx);
  const r = await executeTool('add_recurring', { title: 'Stall', every: 2, unit: 'weeks', next_due: '2026-11-20' }, ctx);
  await executeTool('complete_todo', { id: a.id }, ctx);
  await executeTool('complete_recurring', { id: r.id, done_date: '2026-11-20' }, ctx);
  assert.equal(ctx.state.recurring[0].next_due, '2026-12-04');
  assert.equal(undoLast(ctx.state).title, 'Stall');
  assert.equal(ctx.state.recurring[0].next_due, '2026-11-20');
  assert.equal(undoLast(ctx.state).title, 'Steuer');
  const t = ctx.state.todos[0];
  assert.equal(t.done, false); assert.equal(t.dirty, true, 'geht auch an Google');
  assert.equal(undoLast(ctx.state), null);
  await executeTool('complete_todo', { id: a.id }, ctx);
  await executeTool('reopen_todo', { id: a.id }, ctx);
  assert.equal(ctx.state.todos[0].done, false);
});

test('KI-Einstellungen aus der App: Anbieter, Modell pro Aufgabe, Schlüssel; Kosten pro Modell', async () => {
  const { setAiSettings, provider, resolveModel, apiKey } = await import('../src/claude.js');
  const st = defaultState();
  setAiSettings(() => st.ai);
  const env = { ANTHROPIC_API_KEY: 'sk-ant-env' };
  assert.equal(provider(env), 'anthropic');
  st.ai.provider = 'deepseek'; st.ai.keys.deepseek = 'sk-deepseek-aus-der-app-123';
  st.ai.models.deepseek = { brief: 'deepseek-v4-pro', chat: 'gibts-nicht' };
  assert.equal(provider(env), 'deepseek');
  assert.equal(apiKey(env), 'sk-deepseek-aus-der-app-123');
  assert.equal(resolveModel(env, 'brief'), 'deepseek-v4-pro');
  assert.equal(resolveModel(env, 'chat'), 'deepseek-flash', 'ungültige Auswahl fällt auf Standard zurück');
  assert.equal(resolveModel(env, 'chat', 'anthropic'), 'claude-sonnet-5-5');
  setAiSettings(() => ({}));
  const { recordUsage, usageSummary } = await import('../src/usage.js');
  recordUsage(st, 'deepseek-flash', { input_tokens: 1_000_000, output_tokens: 1_000_000 }, '2026-11');
  recordUsage(st, 'claude-sonnet-5-5', { input_tokens: 100_000, output_tokens: 0 }, '2026-11');
  const s = usageSummary(st, '2026-11');
  assert.deepEqual(s.rows.map((r) => [r.provider, r.model, r.usd]), [['DeepSeek', 'deepseek-flash', 0.42], ['Claude', 'claude-sonnet-5-5', 0.2]]);
});

test('Routine bearbeiten: Titel, Rhythmus, nächster Termin; Validierung', async () => {
  const ctx = mk();
  const r = await executeTool('add_recurring', { title: 'Stall', every: 2, unit: 'weeks', next_due: '2026-11-20' }, ctx);
  await executeTool('update_recurring', { id: r.id, title: 'Hühnerstall ausmisten', every: 10, unit: 'days', next_due: '2026-11-25' }, ctx);
  assert.deepEqual((({ title, every, unit, next_due }) => ({ title, every, unit, next_due }))(ctx.state.recurring[0]), { title: 'Hühnerstall ausmisten', every: 10, unit: 'days', next_due: '2026-11-25' });
  await assert.rejects(() => executeTool('update_recurring', { id: r.id, every: 0 }, ctx), /ganze Zahl/);
  await assert.rejects(() => executeTool('update_recurring', { id: r.id, next_due: 'morgen' }, ctx), /YYYY-MM-DD/);
});

test('Erledigt-Liste leeren lässt sich rückgängig machen', async () => {
  const ctx = mk();
  const a = await executeTool('add_todo', { title: 'A' }, ctx);
  await executeTool('add_todo', { title: 'B' }, ctx);
  await executeTool('complete_todo', { id: a.id }, ctx);
  const removed = ctx.state.todos.filter((t) => t.done);
  ctx.state.todos = ctx.state.todos.filter((t) => !t.done);
  ctx.state.undo_stack.push({ type: 'cleared', todos: removed });
  assert.equal(ctx.state.todos.length, 1);
  const u = undoLast(ctx.state);
  assert.equal(u.type, 'cleared');
  assert.equal(ctx.state.todos.length, 2);
  assert.ok(ctx.state.todos.find((t) => t.title === 'A').done);
});

test('Tagesansicht: heute Abgehaktes bleibt sichtbar, Erledigt-Liste erst ab morgen; Routinen-Vorschau und Zurücknehmen', async () => {
  const { dayData, todayData } = await import('../src/web.js');
  const { addDays } = await import('../src/util.js');
  const ctx = mk(); const T = ctx.today();
  const a = await executeTool('add_todo', { title: 'Zahnarzt anrufen', due: T }, ctx);
  await executeTool('add_todo', { title: 'Alt', due: addDays(T, -2) }, ctx);
  await executeTool('add_todo', { title: 'Übermorgen', due: addDays(T, 2) }, ctx);
  const old = await executeTool('add_todo', { title: 'Gestern erledigt' }, ctx);
  await executeTool('complete_todo', { id: old.id }, ctx); old.done_at = addDays(T, -1);
  await executeTool('complete_todo', { id: a.id }, ctx);
  let d = dayData(ctx, T);
  assert.deepEqual(d.items.map((x) => [x.title, x.done, !!x.overdue]), [['Alt', false, true], ['Zahnarzt anrufen', true, false]]);
  assert.deepEqual(todayData(ctx).done.map((x) => x.title), ['Gestern erledigt']);
  assert.deepEqual(dayData(ctx, addDays(T, -1)).items.map((x) => x.title), ['Gestern erledigt']);
  assert.deepEqual(dayData(ctx, addDays(T, 2)).items.map((x) => x.title), ['Übermorgen']);

  const r = await executeTool('add_recurring', { title: 'Hühner füttern', every: 2, unit: 'days', next_due: T }, ctx);
  assert.ok(dayData(ctx, addDays(T, 4)).items.some((x) => x.title === 'Hühner füttern'));
  assert.ok(!dayData(ctx, addDays(T, 3)).items.some((x) => x.title === 'Hühner füttern'));
  await executeTool('complete_recurring', { id: r.id }, ctx);
  d = dayData(ctx, T);
  assert.ok(d.items.find((x) => x.title === 'Hühner füttern').done, 'abgehakte Routine bleibt heute sichtbar');
  const { uncompleteRecurring } = await import('../src/signals.js');
  assert.ok(uncompleteRecurring(ctx.state.recurring[0], T));
  assert.equal(ctx.state.recurring[0].next_due, T);
  assert.equal(dayData(ctx, T).items.find((x) => x.title === 'Hühner füttern').done, false);
});

test('Wetter menschlich, Datumsformat TT.MM.JJJJ', async () => {
  const { humanWeather } = await import('../src/weather.js');
  const { isoToDe, deDate } = await import('../src/util.js');
  assert.equal(humanWeather({ summary: 'leichte Schauer', tmin: 19, tmax: 20, rain_prob: 5, rain_mm: 3, wind_kmh: 10, gusts_kmh: 30, uv: 3 }), 'leichte Schauer, 19–20 °C, Regen eher unwahrscheinlich, kaum Wind');
  assert.equal(humanWeather({ summary: 'Regen', tmin: 14, tmax: 17, rain_prob: 90, rain_mm: 12, wind_kmh: 45, gusts_kmh: 70 }), 'Regen, 14–17 °C, viel Regen, starker Wind, Böen bis 70 km/h');
  assert.equal(isoToDe('Zahnarzt am 2026-11-25, Frist 2026-12-01.'), 'Zahnarzt am 25.11.2026, Frist 01.12.2026.');
  assert.equal(deDate('2026-01-05'), '05.01.2026');
});

test('News: Quellen werden gemischt, Zeichensatz wird beachtet', async () => {
  const { getHeadlines, decodeBody, FEED_BY_ID } = await import('../src/news.js');
  const item = (t, h) => `<item><title>${t}</title><pubDate>${new Date(Date.now() - h * 3600e3).toUTCString()}</pubDate></item>`;
  globalThis.fetch = async (url) => {
    const body = url.includes('bbc') ? `<rss>${item('BBC one', 5)}${item('BBC two', 6)}</rss>`
      : url.includes('tagesschau') ? `<rss>${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => item(`TS ${i}`, i * 0.1)).join('')}</rss>`
      : '<html>Blocked</html>';
    return { ok: true, headers: new Map([['content-type', 'text/xml']]), arrayBuffer: async () => new TextEncoder().encode(body).buffer };
  };
  const h = await getHeadlines([FEED_BY_ID.ts_world, FEED_BY_ID.bbc_world, FEED_BY_ID.rtp_pt]);
  assert.ok(h.groups.Welt.some((x) => x.text.startsWith('BBC one')), 'BBC wird nicht verdrängt');
  assert.match(h.errors.join(' '), /RTP: keine Meldungen/);
  const latin = Uint8Array.from([...'<?xml version="1.0" encoding="ISO-8859-1"?><t>Ação</t>'].map((c) => c.charCodeAt(0)));
  assert.match(decodeBody(latin, 'text/xml'), /Ação/);
});

test('Warngebiete ergeben sich aus Wohnort und Wetter-Orten', async () => {
  const { areaFor, areasFor } = await import('../src/warnings.js');
  assert.equal(areaFor({ lat: 32.717, lon: -16.767 }), 'MCS'); // Machico
  assert.equal(areaFor({ lat: 32.65, lon: -16.91 }), 'MCS'); // Funchal
  assert.equal(areaFor({ lat: 32.80, lon: -16.88 }), 'MCN'); // Santana
  assert.equal(areaFor({ lat: 32.74, lon: -16.93, elevation: 1200 }), 'MRM'); // Bergregion
  assert.equal(areaFor({ lat: 33.06, lon: -16.34 }), 'MPS'); // Porto Santo
  assert.equal(areaFor({ lat: 38.72, lon: -9.14 }), 'LSB'); // Lissabon
  assert.equal(areaFor({ lat: 53.55, lon: 9.99 }), null); // Hamburg
  assert.deepEqual(areasFor({ location: { lat: 32.717, lon: -16.767 }, weather_places: [{ lat: 32.65, lon: -16.91 }, { lat: 32.80, lon: -16.88 }] }), ['MCS', 'MCN']);
});

test('Feiertage nach Wohnort: Madeira mit Gemeinde, Festland, Deutschland, unbekannt', async () => {
  const { holidayPlace, holidaysForYear, holidayLabel } = await import('../src/holidays.js');
  const mad = holidayPlace({ location: { name: 'Machico, Portugal', lat: 32.717, lon: -16.767 }, weather_places: [{ name: 'Funchal, Portugal', lat: 32.65, lon: -16.91 }] });
  assert.deepEqual(mad, { country: 'PT', region: 'madeira', municipality: 'machico' });
  assert.equal(holidayLabel(mad), 'Portugal, Madeira und Machico');
  const md = holidaysForYear(2026, mad).map((x) => x.date);
  assert.ok(md.includes('2026-05-08') && md.includes('2026-07-01') && !md.includes('2026-08-21'), 'Machico ja, Funchal (nur Wetter-Ort) nein');
  const lis = holidayPlace({ location: { name: 'Lissabon, Portugal', lat: 38.72, lon: -9.14 } });
  assert.equal(lis.region, 'mainland');
  assert.ok(!holidaysForYear(2026, lis).some((x) => x.date === '2026-07-01'), 'kein Madeira-Feiertag in Lissabon');
  const hh = holidayPlace({ location: { name: 'Hamburg, Deutschland', lat: 53.55, lon: 9.99 } });
  assert.equal(hh.country, 'DE');
  assert.ok(holidaysForYear(2026, hh).some((x) => x.date === '2026-10-03'));
  assert.equal(holidayLabel(holidayPlace({ location: { name: 'Paris, Frankreich', lat: 48.85, lon: 2.35 } })), null);
});

test('Menü-Änderungen landen als eine Notiz vor der nächsten Antwort', async () => {
  const { queueSettingNote, flushSettingNotes } = await import('../src/chat.js');
  const ctx = mk();
  queueSettingNote(ctx.state, 'brief_time', 'Morgenbrief um 07:00');
  queueSettingNote(ctx.state, 'brief_time', 'Morgenbrief um 08:00');
  queueSettingNote(ctx.state, 'entity:x', 'neu: Hobby „Yoga“');
  assert.equal(flushSettingNotes(ctx.state), '');
  const last = ctx.state.history.at(-1).content;
  assert.match(last, /Morgenbrief um 08:00; neu: Hobby „Yoga“/);
  assert.doesNotMatch(last, /07:00/);
  assert.deepEqual(ctx.state.pending_notes, {});
});

test('Eigene Identität (weiblich/männlich/divers) steht im Prompt', async () => {
  const { buildSystem } = await import('../src/chat.js');
  const ctx = mk();
  assert.doesNotMatch(buildSystem(ctx), /ÜBER DIE PERSON/);
  ctx.state.profile.user_gender = 'd';
  assert.match(buildSystem(ctx), /identifiziert sich als divers[\s\S]*geschlechtsneutral/);
  ctx.state.profile.user_gender = 'm';
  assert.match(buildSystem(ctx), /identifiziert sich als männlich/);
});

test('Ziele: Fortschritt festhalten und im Brief mit Stand zeigen', async () => {
  const { gatherFacts, commitBrief } = await import('../src/brief.js');
  const { addDays } = await import('../src/util.js');
  const ctx = mk(); const T = ctx.today();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
  ctx.state.profile.news = {};
  await executeTool('upsert_entity', { kind: 'hobby', name: 'Klettern', details: '1x pro Woche' }, ctx);
  await executeTool('upsert_entity', { kind: 'routine', name: 'Yoga' }, ctx);
  await executeTool('log_goal_progress', { name: 'klett', date: addDays(T, -3) }, ctx);
  await assert.rejects(() => executeTool('log_goal_progress', { name: 'Klavier' }, ctx), /Kein Ziel/);
  const g = await gatherFacts(ctx);
  assert.match(g.facts.goals_routines[0], /Klettern – 1x pro Woche \| zuletzt gemacht: vor 3 Tag\(en\), 1× in 30 Tagen/);
  assert.match(g.facts.goals_routines[1], /Yoga \| zuletzt gemacht: unbekannt/);
  commitBrief(ctx, { date: T, text: '*Tagesplan*\n- 18:00 Yoga', reminders: [] });
  assert.equal(ctx.state.entities.find((e) => e.name === 'Yoga').brief_planned, T);
});

test('DWD-Warnungen (Deutschland) über Bright Sky, gemeinsam mit IPMA', async () => {
  const { getWarnings, inGermany, warningRegions, describeWarning } = await import('../src/warnings.js');
  const profile = { location: { name: 'Hamburg, Deutschland', lat: 53.55, lon: 9.99, country_code: 'DE' }, weather_places: [{ name: 'Machico, Portugal', lat: 32.717, lon: -16.767 }] };
  assert.equal(inGermany(profile.location), true);
  assert.equal(inGermany(profile.weather_places[0]), false);
  assert.deepEqual(warningRegions(profile), ['Madeira Südküste (IPMA)', 'Hamburg (DWD)']);
  const now = Date.parse('2026-11-23T10:00:00Z');
  globalThis.fetch = async (url) => {
    if (String(url).includes('brightsky')) return { ok: true, json: async () => ({ location: { name_short: 'Hamburg' }, alerts: [
      { alert_id: 'a1', status: 'actual', response_type: 'prepare', severity: 'moderate', event_de: 'STURMBÖEN', headline_de: 'Amtliche WARNUNG vor STURMBÖEN', onset: '2026-11-23T08:00:00+00:00', expires: '2026-11-23T20:00:00+00:00' },
      { alert_id: 'a2', status: 'actual', response_type: 'allclear', severity: 'minor', event_de: 'FROST', onset: '2026-11-23T00:00:00+00:00', expires: null },
      { alert_id: 'a3', status: 'actual', response_type: 'prepare', severity: 'minor', event_de: 'FROST', onset: '2026-11-22T00:00:00+00:00', expires: '2026-11-22T09:00:00+00:00' },
    ] }) };
    return { ok: true, json: async () => [{ idAreaAviso: 'MCS', awarenessLevelID: 'yellow', awarenessTypeName: 'Vento', startTime: '2026-11-23T06:00:00', endTime: '2026-11-23T18:00:00', text: '' }] };
  };
  const { warnings, errors } = await getWarnings(profile, now);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings.map((w) => [w.source, w.level, w.type, w.area]), [['IPMA', 'Gelb', 'Wind', 'Madeira Südküste'], ['DWD', 'Orange', 'Sturmböen', 'Hamburg']]);
  assert.match(describeWarning(warnings[1], 'Europe/Berlin'), /^Orange: Sturmböen, Hamburg \(.* bis .*\) – Amtliche WARNUNG vor STURMBÖEN \[DWD\]$/);
});

test('Warnungen weiterer Länder: NWS, Met Office, MeteoAlarm, INMET', async () => {
  const W = await import('../src/warnings.js');
  const now = Date.parse('2026-11-23T12:00:00Z');
  const ny = { name: 'New York, USA', lat: 40.71, lon: -74.0, country_code: 'US' };
  const london = { name: 'London, UK', lat: 51.5, lon: -0.12, country_code: 'GB' };
  const wien = { name: 'Wien, Österreich', lat: 48.2, lon: 16.37, country_code: 'AT', admin1: 'Wien' };
  const sp = { name: 'São Paulo, Brasilien', lat: -23.55, lon: -46.63, country_code: 'BR', admin1: 'São Paulo' };
  const sydney = { name: 'Sydney, Australien', lat: -33.87, lon: 151.2, country_code: 'AU' };
  assert.deepEqual([ny, london, wien, sp, sydney].map(W.providerFor), ['NWS', 'Met Office', 'MeteoAlarm', 'INMET', null]);
  assert.equal(W.ukRegionFor(london), 'se');
  assert.deepEqual(W.warningRegions({ location: wien, weather_places: [ny, sydney] }), ['Wien (MeteoAlarm)', 'New York (NWS)']);

  const nws = W.nwsWarnings({ features: [
    { properties: { id: 'n1', status: 'Actual', messageType: 'Alert', severity: 'Moderate', event: 'Winter Storm Warning', headline: 'Winter Storm Warning until Tue', onset: '2026-11-23T10:00:00Z', ends: '2026-11-24T10:00:00Z' } },
    { properties: { id: 'n2', status: 'Test', severity: 'Severe', event: 'Test' } },
  ] }, ny, now);
  assert.deepEqual(nws.map((w) => [w.levelId, w.type, w.area]), [['orange', 'Winter Storm Warning', 'New York']]);

  const mo = W.metOfficeWarnings(`<rss><channel><item><title>Yellow warning of wind affecting London &amp; South East England</title><description>Strong winds Tuesday</description><guid>g1</guid><pubDate>Mon, 23 Nov 2026 09:00:00 GMT</pubDate></item><item><title>Something else</title></item></channel></rss>`, 'se', [london]);
  assert.deepEqual(mo.map((w) => [w.levelId, w.type, w.type_en]), [['yellow', 'Wind', 'Wind']]);

  const ma = W.meteoalarmWarnings(`<feed><entry><id>x</id><cap:identifier>a1</cap:identifier><cap:areaDesc>Wien</cap:areaDesc><cap:event>Gewitter</cap:event><cap:severity>Severe</cap:severity><cap:onset>2026-11-23T10:00:00+01:00</cap:onset><cap:expires>2026-11-23T20:00:00+01:00</cap:expires></entry>
    <entry><cap:identifier>a2</cap:identifier><cap:areaDesc>Tirol</cap:areaDesc><cap:event>Schnee</cap:event><cap:severity>Moderate</cap:severity><cap:expires>2026-11-23T20:00:00+01:00</cap:expires></entry>
    <entry><cap:identifier>a3</cap:identifier><cap:areaDesc>Wien</cap:areaDesc><cap:event>Wind</cap:event><cap:severity>Minor</cap:severity></entry></feed>`, [wien], now);
  assert.deepEqual(ma.map((w) => [w.levelId, w.type, w.area]), [['orange', 'Gewitter', 'Wien']]);

  const br = W.inmetWarnings(`<rss><item><title>Aviso de Tempestade. Severidade Grau: Perigo</title><description>Estados: São Paulo, Paraná. Fim: 24/11/2026 10:00</description><guid>i1</guid></item>
    <item><title>Aviso de Chuvas Intensas. Severidade Grau: Perigo Potencial</title><description>Estados: Bahia</description></item></rss>`, [sp], now);
  assert.deepEqual(br.map((w) => [w.levelId, w.type, w.area]), [['orange', 'Tempestade', 'São Paulo']]);
});

test('Nachrichten: Quellen-Liste, alte Einstellung, Land automatisch, eigene Feeds sicher', async () => {
  const N = await import('../src/news.js');
  assert.deepEqual(N.enabledFeedIds({ news: { world: true, pt: true, de: false } }), ['ts_world', 'bbc_world', 'rtp_pt']);
  const p = { news: { world: true, de: true } };
  let r = N.applyCountryFeeds(p, 'AT');
  assert.deepEqual(p.news_feeds, ['ts_world', 'bbc_world', 'ts_de', 'orf_at']);
  assert.deepEqual(r.added.map((f) => f.id), ['orf_at']);
  r = N.applyCountryFeeds(p, 'BR');
  assert.deepEqual(p.news_feeds, ['ts_world', 'bbc_world', 'ts_de', 'g1_br', 'abr_br'], 'ORF (automatisch) fällt weg, tagesschau (selbst gewählt) bleibt');
  assert.deepEqual(r.removed.map((f) => f.id), ['orf_at']);
  p.custom_feeds = [{ id: 'c_1', name: 'Mein Blog', url: 'https://blog.example.org/feed' }]; p.news_feeds.push('c_1');
  assert.equal(N.enabledFeeds(p).at(-1).label, 'Mein Blog');
  for (const bad of ['http://localhost/x', 'http://192.168.1.5/rss', 'file:///etc/passwd', 'http://10.0.0.1/', 'http://intranet/feed', 'kein url']) assert.throws(() => N.safeFeedUrl(bad), bad);
  assert.equal(N.safeFeedUrl('https://rss.orf.at/news.xml'), 'https://rss.orf.at/news.xml');

  globalThis.fetch = async (url) => ({ ok: true, headers: new Map(), arrayBuffer: async () => new TextEncoder().encode(`<rss><channel><title>Feed</title><item><title>${url.includes('orf') ? 'Wien' : 'Welt'} Meldung</title><pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`).buffer });
  const h = await N.getHeadlines([N.FEED_BY_ID.orf_at, N.FEED_BY_ID.bbc_world]);
  assert.deepEqual(Object.keys(h.groups).sort(), ['Welt', 'Österreich']);
  assert.match(h.groups['Österreich'][0].text, /^Wien Meldung \(ORF\)/);
});

test('Ortswechsel: Zeitzone und Nachrichten des neuen Landes', async () => {
  const ctx = mk();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ results: [{ name: 'Wien', country: 'Österreich', latitude: 48.2, longitude: 16.37, timezone: 'Europe/Vienna', country_code: 'AT', admin1: 'Wien' }] }) });
  await executeTool('update_profile', { location_name: 'Wien' }, ctx);
  assert.equal(ctx.state.profile.tz, 'Europe/Vienna');
  assert.equal(ctx.state.profile.location.admin1, 'Wien');
  assert.ok(ctx.state.profile.news_feeds.includes('orf_at'));
  await executeTool('set_news', { disable: ['orf_at'], enable: ['npr_us'] }, ctx);
  assert.ok(!ctx.state.profile.news_feeds.includes('orf_at') && ctx.state.profile.news_feeds.includes('npr_us'));
  await assert.rejects(() => executeTool('set_news', { enable: ['gibtsnicht'] }, ctx), /Unbekannte Quelle/);
});

test('Feiertage anderer Länder über date.nager.at, zwischengespeichert', async () => {
  const H = await import('../src/holidays.js');
  const profile = { location: { name: 'Wien, Österreich', lat: 48.2, lon: 16.37, country_code: 'AT' } };
  const cache = {};
  let calls = 0;
  globalThis.fetch = async (url) => { calls++; assert.match(url, /PublicHolidays\/(2026|2027)\/AT$/); return { ok: true, status: 200, json: async () => [
    { date: url.includes('2026') ? '2026-10-26' : '2027-10-26', localName: 'Nationalfeiertag', name: 'National Holiday', global: true, types: ['Public'] },
    { date: '2026-03-19', localName: 'Josef', name: 'St. Joseph', global: false, counties: ['AT-2'], types: ['Public'] },
  ] }; };
  assert.equal(await H.ensureHolidays(profile, cache, [2026, 2027]), true);
  assert.equal(await H.ensureHolidays(profile, cache, [2026, 2027]), false, 'nicht erneut laden');
  assert.equal(calls, 2);
  const place = H.holidayPlace(profile, cache);
  assert.deepEqual(H.holidaysBetween('2026-10-01', '2026-12-31', place), [{ date: '2026-10-26', name: 'Nationalfeiertag' }]);
  assert.equal(H.holidayLabel(place), 'AT (landesweite Feiertage)');
  // Madeira bleibt bei der eigenen, genaueren Liste
  assert.equal(H.holidayPlace({ location: { name: 'Machico, Portugal', lat: 32.717, lon: -16.767 } }, cache).region, 'madeira');
});
