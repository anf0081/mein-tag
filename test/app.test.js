import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { addInterval, daysBetween, localNow, localToUtc } from '../src/util.js';
import { birthdaySignals, holidaySignals, nextOccurrence, recurringSignals, todoSignals, markReminded } from '../src/signals.js';
import { executeTool } from '../src/tools.js';
import { defaultState } from '../src/store.js';
import { chatTurn } from '../src/chat.js';
import { createBot } from '../src/bot.js';

const mkCtx = (over = {}) => {
  const state = defaultState();
  return { env: { ANTHROPIC_API_KEY: 'k' }, state, save() {}, tz: () => 'Atlantic/Madeira', today: () => '2026-11-19',
    calendar: { configured: false, listEvents: async () => ({ configured: false, events: [] }) }, ...over };
};

test('util: Zeitzonen und Datumsrechnung', () => {
  assert.equal(addInterval('2026-01-31', 1, 'months'), '2026-02-28');
  assert.equal(addInterval('2026-11-19', 2, 'weeks'), '2026-12-03');
  assert.equal(daysBetween('2026-11-19', '2026-12-25'), 36);
  assert.equal(localToUtc('2026-07-01', '12:00', 'Europe/Berlin').toISOString(), '2026-07-01T10:00:00.000Z');
  assert.match(localNow('Atlantic/Madeira').date, /^\d{4}-\d{2}-\d{2}$/);
});

test('signals: Geburtstage je Stufe, nur einmal pro Stufe', () => {
  const people = [
    { id: 'a', name: 'Oma', birthday: '12-05', tier: 'gift', gift_lead_days: 21 },
    { id: 'b', name: 'Tom', birthday: '1985-11-20', tier: 'call' },
    { id: 'c', name: 'Ferne', birthday: '06-01', tier: 'gift' },
    { id: 'd', name: 'Karte', birthday: '11-25', tier: 'card' },
  ];
  const s = birthdaySignals(people, '2026-11-19');
  assert.deepEqual(s.map((x) => x.personId), ['b', 'd', 'a']);
  assert.match(s[0].text, /morgen.*\(wird 41\)/);
  assert.match(s[2].text, /Geschenk besorgen/);
  markReminded({ people, holidays: [], trips: [] }, s);
  assert.equal(birthdaySignals(people, '2026-11-19').length, 0);
  assert.equal(birthdaySignals(people, '2026-11-26').find((x) => x.personId === 'a'), undefined, 'gleiche Stufe nicht erneut');
  assert.equal(birthdaySignals(people, '2026-11-29').find((x) => x.personId === 'a').days, 6, 'nächste Stufe (7 Tage) meldet erneut');
});

test('signals: Jahreswechsel, Feiertage, Wiederkehrendes, Todos', () => {
  assert.equal(nextOccurrence('01-03', '2026-12-30').date, '2027-01-03');
  const h = holidaySignals([{ id: 'x', name: 'Weihnachten', date: '12-24', lead_days: 35 }], '2026-11-19');
  assert.equal(h[0].days, 35);
  const r = recurringSignals([{ id: 'r', title: 'Stall misten', next_due: '2026-11-17', lead_days: 2 }, { id: 's', title: 'x', next_due: '2027-01-01' }], '2026-11-19');
  assert.equal(r.length, 1); assert.match(r[0].text, /überfällig seit 2/);
  const t = todoSignals([{ id: '1', title: 'später', due: '2026-12-30', priority: 2 }, { id: '2', title: 'Steuer', due: '2026-11-18', priority: 1 }, { id: '3', title: 'ok', done: true }], '2026-11-19');
  assert.deepEqual(t.map((x) => x.id), ['2', '1']); assert.equal(t[0].overdue, true);
});

test('tools: Todos, Personen, Wiederkehrend, Validierung', async () => {
  const ctx = mkCtx();
  const t = await executeTool('add_todo', { title: 'Steuer', due: '2026-12-01', priority: 1 }, ctx);
  await executeTool('complete_todo', { id: t.id }, ctx);
  assert.equal(ctx.state.todos[0].done, true);
  await assert.rejects(() => executeTool('add_todo', { title: 'x', due: 'morgen' }, ctx), /YYYY-MM-DD/);
  await executeTool('upsert_person', { name: 'Oma', birthday: '12-05', tier: 'gift' }, ctx);
  await executeTool('upsert_person', { name: 'oma', notes: 'mag Tee' }, ctx);
  assert.equal(ctx.state.people.length, 1); assert.equal(ctx.state.people[0].birthday, '12-05');
  const r = await executeTool('add_recurring', { title: 'Hundefutter kaufen', every: 6, unit: 'weeks', next_due: '2026-11-20' }, ctx);
  const done = await executeTool('complete_recurring', { id: r.id }, ctx);
  assert.equal(done.next_due, '2026-12-31');
  await executeTool('finish_onboarding', {}, ctx);
  assert.equal(ctx.state.onboarding.done, true);
});

function fakeClaude(script) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body); calls.push(body);
    const r = script.shift();
    return { ok: true, status: 200, json: async () => r(body) };
  };
  return calls;
}

test('chat: Tool-Loop speichert Todo und merkt Feedback', async () => {
  const ctx = mkCtx();
  const calls = fakeClaude([
    () => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'add_todo', input: { title: 'Zahnarzt anrufen', due: '2026-11-21' } }, { type: 'tool_use', id: 't2', name: 'remember', input: { text: 'Briefe lieber kürzer' } }] }),
    () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Notiert ✅' }] }),
  ]);
  const out = await chatTurn(ctx, 'Zahnarzt bis Samstag anrufen, und bitte kürzere Briefe');
  assert.equal(out.text, 'Notiert ✅');
  assert.deepEqual(out.actions, ['Aufgabe: Zahnarzt anrufen (fällig 2026-11-21)', 'Gemerkt: Briefe lieber kürzer']);
  assert.equal(ctx.state.todos.length, 1); assert.equal(ctx.state.memory.length, 1);
  assert.equal(ctx.state.history.length, 2);
  assert.match(calls[0].system, /ONBOARDING LÄUFT/); assert.match(calls[0].system, /Aktueller Bereich: basics/);
  assert.equal(JSON.parse(calls[1].messages.at(-1).content[0].content).title, 'Zahnarzt anrufen');
});

test('bot: 24h-Fenster -> Template, Brief wird nach Antwort zugestellt; Feedback-Buttons', async () => {
  const ctx = mkCtx(); ctx.state.onboarding.done = true; ctx.state.profile.brief_time = '00:00';
  Object.assign(ctx.state.profile, { checkin_enabled: false, weekly_enabled: false, due_notify_enabled: false }); // sonst je nach Uhrzeit weitere Nachrichten
  const sent = [];
  const tr = { sendText: async (t) => sent.push(['text', t]), sendButtons: async (b, x) => sent.push(['btn', x.map((y) => y.id).join()]), sendTemplate: async () => sent.push(['tpl']) };
  fakeClaude([() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '*Guten Morgen!*' }] })]);
  const bot = createBot(ctx, tr);
  await bot.tick();
  assert.deepEqual(sent, [['tpl']]); assert.equal(ctx.state.pending_brief, '*Guten Morgen!*');
  await bot.tick(); assert.equal(sent.length, 1, 'kein Doppelversand am selben Tag');
  await bot.onMessage({ type: 'button', buttonId: 'brief:open', id: 'x' });
  assert.deepEqual(sent.slice(1).map((s) => s[0]), ['text', 'btn']);
  await bot.onMessage({ type: 'button', buttonId: 'fb:down' });
  assert.equal(ctx.state.awaiting_feedback, true); assert.equal(ctx.state.feedback.at(-1).rating, -1);
});

test('news: RSS und Atom werden gelesen', async () => {
  const { parseFeed } = await import('../src/news.js');
  const rss = `<?xml version="1.0"?><rss><channel><title>X</title>
    <item><title><![CDATA[Regierung beschließt Haushalt &amp; mehr]]></title><link>https://a.de/1</link><pubDate>Thu, 19 Nov 2026 08:00:00 GMT</pubDate><description>&lt;p&gt;Kurz &#252;ber den Plan&lt;/p&gt;</description></item>
    <item><title>Zweite Meldung</title><link>https://a.de/2</link></item></channel></rss>`;
  const r = parseFeed(rss);
  assert.equal(r.length, 2);
  assert.equal(r[0].title, 'Regierung beschließt Haushalt & mehr');
  assert.equal(r[0].summary, 'Kurz über den Plan');
  assert.equal(r[0].date.toISOString(), '2026-11-19T08:00:00.000Z');
  const atom = `<feed><entry><title>Atom-Titel</title><link href="https://b.pt/x"/><updated>2026-11-19T07:00:00Z</updated></entry></feed>`;
  assert.equal(parseFeed(atom)[0].link, 'https://b.pt/x');
});

test('chat: kennt den heutigen Morgenbrief', async () => {
  const { commitBrief } = await import('../src/brief.js');
  const { buildSystem } = await import('../src/chat.js');
  const { localNow } = await import('../src/util.js');
  const ctx = mkCtx();
  ctx.state.history = [{ role: 'user', content: 'gn' }, { role: 'assistant', content: 'Schlaf gut!' }];
  const today = localNow('Atlantic/Madeira').date;
  commitBrief(ctx, { date: today, text: '*Top 3 heute*\n1. Zahnarzt anrufen', reminders: [] });
  assert.match(buildSystem(ctx), /DEIN LETZTER MORGENBRIEF[\s\S]*Zahnarzt anrufen/);
  assert.match(ctx.state.history.at(-1).content, /Schlaf gut![\s\S]*Morgenbrief vom[\s\S]*Zahnarzt/);
  assert.equal(ctx.state.history.filter((m) => m.role === 'assistant').length, 1, 'keine zwei Assistent-Nachrichten hintereinander');
});

test('brief: sieht die letzte Unterhaltung', async () => {
  const { gatherFacts } = await import('../src/brief.js');
  const ctx = mkCtx();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
  ctx.state.profile.news = {};
  ctx.state.history = [{ role: 'user', content: 'Morgen bin ich erst ab 10 Uhr frei' }, { role: 'assistant', content: 'Alles klar!' }];
  const g = await gatherFacts(ctx);
  assert.deepEqual(g.facts.recent_chat, ['Sie: Morgen bin ich erst ab 10 Uhr frei', 'Du: Alles klar!']);
});

test('reminders: Aufgaben für Geburtstage/Feste/Reisen, je einmal; Wochenausblick', async () => {
  const { ensureReminderTodos, upcoming } = await import('../src/reminders.js');
  const st = defaultState();
  st.people = [{ id: 'p', name: 'Papa', birthday: '1960-12-05', tier: 'gift', gift_lead_days: 21 }, { id: 'b', name: 'Bruder', birthday: '11-23', tier: 'call' }];
  st.holidays = [{ id: 'x', name: 'Weihnachten', date: '12-24', lead_days: 35 }];
  st.trips = [{ id: 't', title: 'Hamburg', start: '2026-11-24' }];
  const made = ensureReminderTodos(st, '2026-11-19');
  assert.deepEqual(made.map((t) => [t.title, t.due]), [
    ['Geschenk für Papa besorgen', '2026-11-28'], ['Bruder gratulieren (anrufen/schreiben)', '2026-11-23'],
    ['Weihnachten vorbereiten', '2026-12-17'], ['Packen für Hamburg', '2026-11-23']]);
  assert.ok(made.every((t) => t.dirty), 'für Google-Sync markiert');
  st.todos = st.todos.filter((t) => !t.title.startsWith('Bruder')); // gelöscht
  assert.equal(ensureReminderTodos(st, '2026-11-20').length, 0, 'nicht doppelt, auch nach Löschen');
  const week = upcoming(st, '2026-11-19', 7, [{ date: '2026-11-22', title: 'Yoga', start: '18:00', all_day: false }]);
  assert.ok(week.some((x) => x.startsWith('2026-11-23: Geburtstag Bruder')));
  assert.ok(week.some((x) => x.includes('Termin: 18:00 Yoga')));
  assert.ok(week.some((x) => x.includes('Reise: Hamburg')));
});

test('bot: Onboarding-Knopf zeigt vollständige Liste + Frage', async () => {
  const ctx = mkCtx();
  ctx.state.people = Array.from({ length: 95 }, (_, i) => ({ id: `p${i}`, name: `Person${i}`, birthday: i % 10 ? '05-12' : null, tier: 'call' }));
  ctx.state.profile.location = { name: 'Machico, Portugal' };
  const calls = fakeClaude([() => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Was noch fehlt: …\nWann hat Person0 Geburtstag?' }] })]);
  const sent = [];
  const bot = createBot(ctx, { noWindow: true, sendText: async (t) => sent.push(t), sendButtons: async () => {}, sendTemplate: async () => {} });
  await bot.onMessage({ type: 'text', text: 'Onboarding' });
  assert.equal(sent.length, 2, 'Liste und Frage als zwei Nachrichten');
  for (let i = 0; i < 95; i++) assert.ok(sent[0].includes(`- Person${i} `) || sent[0].includes(`- Person${i}:`), `Person${i} fehlt`);
  assert.match(sent[0], /\*Basics\*[\s\S]*Wohnort \(Wetter\): Machico[\s\S]*Haustiere & Tiere\*\n- Noch leer/);
  assert.doesNotMatch(sent[0], /Wann hat Person0/);
  assert.match(sent[1], /Wann hat Person0 Geburtstag\?$/);
  assert.equal(calls[0].model, 'claude-sonnet-5-5');
});

test('brief: prüft Aufgaben ohne Datum und merkt sich, was kommentiert wurde', async () => {
  const { gatherFacts, commitBrief } = await import('../src/brief.js');
  const { localNow, addDays } = await import('../src/util.js');
  const ctx = mkCtx();
  globalThis.fetch = async () => ({ ok: true, json: async () => ({}), text: async () => '' });
  ctx.state.profile.news = {};
  const today = localNow('Atlantic/Madeira').date;
  ctx.state.todos = [
    { id: 'u1', title: 'Zaun reparieren', due: null, priority: 2, done: false, created: addDays(today, -40) },
    { id: 'u2', title: 'Fotos sortieren', due: null, priority: 3, done: false, created: addDays(today, -3) },
    { id: 'd1', title: 'Zahnarzt', due: today, priority: 1, done: false },
  ];
  const g = await gatherFacts(ctx);
  assert.equal(g.facts.undated_todos.length, 2);
  assert.match(g.facts.undated_todos[0], /Zaun reparieren \| offen seit 40 Tag/);
  commitBrief(ctx, { date: today, text: '*Ohne Datum im Blick*\n- Der Zaun reparieren liegt seit Wochen …', reminders: [] });
  assert.equal(ctx.state.todos[0].brief_mentioned, today);
  assert.equal(ctx.state.todos[1].brief_mentioned, undefined);
  const g2 = await gatherFacts(ctx);
  assert.match(g2.facts.undated_todos[0], /zuletzt im Brief kommentiert vor 0 Tag/);
});

test('brief: ausgelassene Termine/Aufgaben von heute werden ergänzt', async () => {
  const { ensureComplete } = await import('../src/brief.js');
  const today = { events: [{ title: 'PAKET abholen', line: '09:30 PAKET abholen' }, { title: 'Mittagessen mit Sam', line: '13:30 Mittagessen mit Sam' }],
    todos: [{ title: 'Zahnarzt-Termin ausmachen', line: 'Zahnarzt-Termin ausmachen' }, { title: 'Vermieter-Mail nachhaken', line: 'Vermieter-Mail nachhaken' }],
    routines: [{ title: 'Hühnerstall ausmisten', line: '↻ Hühnerstall ausmisten' }] };
  const text = '*Termine heute*\n- 09:30 Paket abholen\n- 13:30 Mittagessen mit Sam in der Stadt\n*Aufgaben heute*\n- Zahnarzt Termin ausmachen';
  const out = ensureComplete(text, today);
  assert.match(out, /\*Außerdem heute\*\n- Vermieter-Mail nachhaken\n- ↻ Hühnerstall ausmisten$/);
  assert.equal(ensureComplete(out, today), out, 'nichts doppelt');
});

test('brief: abgeschnittene Antwort wird fortgesetzt, fehlende Nachrichten werden nachgeliefert', async () => {
  const { generateBrief } = await import('../src/brief.js');
  const ctx = mkCtx();
  ctx.state.profile.news = { pt: true };
  const replies = [
    { stop_reason: 'max_tokens', content: [{ type: 'text', text: '*Guten Morgen!*\n*Tagesplan*\n- 08:15 Vermieter-Mail nach' }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: 'haken\n- 10:00 Rosen schneiden' }] },
    { stop_reason: 'end_turn', content: [{ type: 'text', text: '*Nachrichten*\n- Portugal: Neue Bahnlinie beschlossen (RTP)' }] },
  ];
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('/messages')) { calls.push(JSON.parse(opts.body)); return { ok: true, json: async () => ({ ...replies.shift(), usage: {} }) }; }
    if (String(url).includes('rtp')) {
      const xml = `<rss><item><title>Nova linha ferroviária aprovada</title><pubDate>${new Date().toUTCString()}</pubDate></item></rss>`;
      return { ok: true, headers: new Map([['content-type', 'text/xml']]), arrayBuffer: async () => new TextEncoder().encode(xml).buffer };
    }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  const b = await generateBrief(ctx);
  assert.match(b.text, /Vermieter-Mail nachhaken\n- 10:00 Rosen schneiden/);
  assert.match(b.text, /\*Nachrichten\*\n- Portugal: Neue Bahnlinie beschlossen \(RTP\)/);
  assert.equal(calls.length, 3);
  assert.match(JSON.stringify(calls[1].messages.at(-1)), /genau an der Stelle weiter/);
});
