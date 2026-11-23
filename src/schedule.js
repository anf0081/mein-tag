// Alles, was zu bestimmten Zeiten passiert (wird jede Minute aufgerufen).
import { localNow, daysBetween } from './util.js';
import { ensureReminderTodos, upcoming } from './reminders.js';
import { dailyBackup } from './backup.js';
import { activeWarnings, describeWarning, fetchWarnings, areasFor } from './warnings.js';
import { proactiveMessage } from './proactive.js';
import { addAssistantNote } from './chat.js';
import { pruneChatLog } from './web.js';

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const minutesSince = (now, hhmm) => { const [h, m] = hhmm.split(':').map(Number); const [nh, nm] = now.split(':').map(Number); return nh * 60 + nm - (h * 60 + m); };
const inWindow = (now, hhmm, maxMin = 180) => { const d = minutesSince(now, hhmm); return d >= 0 && d <= maxMin; };

export function createScheduler(ctx, transport) {
  const { state } = ctx;
  let lastWarnCheck = 0;

  async function send(text, push) {
    await transport.sendText(text, { kind: 'proactive', push });
    addAssistantNote(state, text);
    ctx.save();
  }

  async function daily(n) {
    if (state.daily_done === n.date) return;
    state.daily_done = n.date;
    try { const f = dailyBackup(ctx.dataFile, n.date); if (f) console.log(`Backup: ${f}`); } catch (e) { console.error('Backup fehlgeschlagen:', e.message); }
    const pruned = pruneChatLog(state);
    if (pruned) console.log(`${pruned} alte Chat-Nachrichten gelöscht (Aufbewahrung ${state.profile.chat_retention_days} Tage)`);
    const made = ensureReminderTodos(state, n.date);
    if (made.length) { console.log(`${made.length} Erinnerungs-Aufgabe(n) angelegt`); ctx.tasks?.scheduleSync(); }
    ctx.save();
  }

  async function timedReminders() {
    const due = (state.timed || []).filter((r) => !r.done && r.at <= Date.now());
    for (const r of due) {
      r.done = true; ctx.save();
      await send(`⏰ Erinnerung: ${r.text}`, { title: '⏰ Erinnerung', body: r.text, tag: `rem-${r.id}` });
    }
    state.timed = (state.timed || []).filter((r) => !r.done || Date.now() - r.at < 7 * 864e5);
  }

  async function focusPing() {
    const f = state.focus;
    if (!f || f.pinged || Date.now() < f.until) return;
    f.pinged = true; ctx.save();
    const text = await proactiveMessage(ctx, `Fokus-Nachfrage: Sie wollte „${f.task}“ erledigen, die vereinbarte Zeit ist um. Frag kurz und im Ton deiner Persönlichkeit, ob es erledigt ist. Bei „nein“ biete an, noch einen kurzen Block dranzuhängen oder den nächsten kleinen Schritt zu benennen. Maximal 3 Sätze.`, 300);
    await send(text, { title: 'Fokus-Check', body: 'Wie läuft es? Tippe zum Antworten.', tag: 'focus' });
  }

  async function dueTasks(n) {
    const p = state.profile;
    if (p.due_notify_enabled === false) return;
    // a) Aufgaben mit Uhrzeit: einzeln zur Uhrzeit
    for (const t of state.todos.filter((x) => !x.done && x.due === n.date && x.time && x.time <= n.time && x.notified !== `${x.due} ${x.time}`)) {
      t.notified = `${t.due} ${t.time}`; ctx.save();
      await send(`📋 Jetzt dran: ${t.title}`, { title: '📋 Jetzt dran', body: t.title, tag: `todo-${t.id}` });
    }
    // b) Heute fällig ohne Uhrzeit, überfällig und fällige Routinen: ein Sammel-Hinweis zur eingestellten Zeit
    if (state.due_digest_date === n.date || !inWindow(n.time, p.due_notify_time || '09:00', 12 * 60)) return;
    state.due_digest_date = n.date; ctx.save();
    const today = state.todos.filter((x) => !x.done && x.due === n.date && !x.time).map((x) => x.title);
    const overdue = state.todos.filter((x) => !x.done && x.due && x.due < n.date).map((x) => x.title);
    const routines = (state.recurring || []).filter((r) => r.next_due <= n.date).map((r) => r.title);
    const all = [...today, ...routines];
    if (!all.length && !overdue.length) return;
    const lines = [...all.map((x) => `- ${x}`), ...(overdue.length ? [`Überfällig: ${overdue.join(', ')}`] : [])];
    const body = [...all, ...overdue.map((x) => `${x} (überfällig)`)];
    await send(`📋 Heute fällig:\n${lines.join('\n')}`, { title: `📋 Heute fällig (${body.length})`, body: body.slice(0, 3).join(' · ') + (body.length > 3 ? ` +${body.length - 3}` : ''), tag: 'due' });
  }

  async function checkin(n) {
    const p = state.profile;
    if (!p.checkin_enabled || state.last_checkin === n.date || !inWindow(n.time, p.checkin_time || '20:30')) return;
    state.last_checkin = n.date; ctx.save();
    const doneToday = state.todos.filter((t) => t.done && t.done_at === n.date).map((t) => t.title);
    const open = state.todos.filter((t) => !t.done && t.due && t.due <= n.date).map((t) => `${t.title}${t.due < n.date ? ' (überfällig)' : ''}`);
    const text = await proactiveMessage(ctx, `Abend-Check-in für heute (${n.date}). Heute erledigt: ${doneToday.join('; ') || 'nichts abgehakt'}. Noch offen (heute fällig/überfällig): ${open.join('; ') || 'nichts'}.
Schreib einen kurzen, warmen Check-in (höchstens 6 Zeilen): Feiere, was geschafft wurde (auch Kleines). Frag bei offenen Punkten, ob du sie auf morgen legen, später einplanen oder streichen sollst. Frag kurz, wie ihr Tag/ihre Energie war. Keine langen Listen.`);
    await send(text, { title: 'Abend-Check-in', body: 'Wie war dein Tag? Tippe zum Öffnen.', tag: 'checkin' });
  }

  async function weekly(n) {
    const p = state.profile;
    const today = new Date(`${n.date}T12:00:00Z`).getUTCDay();
    if (!p.weekly_enabled || today !== (p.weekly_day ?? 0) || state.last_weekly === n.date || !inWindow(n.time, p.weekly_time || '18:00')) return;
    state.last_weekly = n.date; ctx.save();
    const week = upcoming(state, n.date, 8);
    const goals = state.entities.filter((e) => ['ziel', 'routine', 'hobby'].includes(e.kind)).map((e) => e.name);
    const text = await proactiveMessage(ctx, `Wochenplanung (heute ist ${WEEKDAYS[today]}). Die nächsten Tage: ${week.join('; ') || 'nichts Besonderes eingetragen'}. Ihre Ziele/Routinen/Hobbys: ${goals.join(', ') || 'noch keine'}.
Schreib eine kurze Wochenvorschau (höchstens 10 Zeilen): die wichtigsten Termine/Geburtstage/Fristen, was vorbereitet werden muss, und frag, welchen 1–2 Zielen oder Routinen sie diese Woche bewusst Zeit geben möchte. Schlag 3 Prioritäten für die Woche vor.`);
    await send(text, { title: 'Deine Woche', body: 'Kurze Wochenplanung. Tippe zum Öffnen.', tag: 'weekly' });
  }

  async function warnings() {
    const p = state.profile;
    if (!p.warnings_enabled || Date.now() - lastWarnCheck < 30 * 60_000) return;
    lastWarnCheck = Date.now();
    let list;
    try { list = activeWarnings(await fetchWarnings(), areasFor(p)); } catch (e) { console.error('IPMA:', e.message); return; }
    state.current_warnings = list; 
    const seen = new Set(state.warn_seen || []);
    const fresh = list.filter((w) => !seen.has(w.key));
    state.warn_seen = list.map((w) => w.key); // nur aktuelle merken
    ctx.save();
    if (!fresh.length) return;
    const top = fresh.sort((a, b) => ['yellow', 'orange', 'red'].indexOf(b.levelId) - ['yellow', 'orange', 'red'].indexOf(a.levelId))[0];
    const text = `⚠️ Unwetterwarnung (IPMA)\n${fresh.map((w) => `- ${describeWarning(w, ctx.tz())}`).join('\n')}`;
    await send(text, { title: `⚠️ Warnung ${top.level}: ${top.type}`, body: `${top.area}${fresh.length > 1 ? ` und ${fresh.length - 1} weitere` : ''}`, tag: 'warning' });
  }

  async function run(step, fn) { try { await fn(); } catch (e) { console.error(`Zeitplan (${step}):`, e.message); } }

  return async function tick() {
    const n = localNow(ctx.tz());
    await run('täglich', () => daily(n));
    await run('erinnerungen', timedReminders);
    await run('fokus', focusPing);
    await run('unwetter', warnings);
    if (!state.onboarding.started && !state.onboarding.done) return;
    await run('fällig', () => dueTasks(n));
    await run('check-in', () => checkin(n));
    await run('woche', () => weekly(n));
  };
}

export { daysBetween };
