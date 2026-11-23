// Erinnerungen (Geburtstage, Feste, Reisen) als Aufgaben anlegen, damit sie auch in Google Aufgaben erscheinen,
// und Wochenausblick für den Brief.
import { nextOccurrence } from './signals.js';
import { addDays, daysBetween, rid } from './util.js';

const clip = (d, today) => (d < today ? today : d);

/** Legt fehlende Erinnerungs-Aufgaben an. Jede nur einmal pro Anlass (auch wenn sie später gelöscht wird). */
export function ensureReminderTodos(state, today) {
  const keys = new Set(state.reminder_keys || []);
  const created = [];
  const add = (key, title, due, notes) => {
    if (keys.has(key)) return;
    keys.add(key);
    const t = { id: rid(), title, due, priority: 1, category: 'Erinnerung', notes: notes || null, done: false, created: today, dirty: true, source: 'reminder' };
    state.todos.push(t); created.push(t);
  };
  for (const p of state.people || []) {
    if (!p.birthday) continue;
    const n = nextOccurrence(p.birthday, today);
    const tier = p.tier || 'call';
    const lead = Math.max(p.gift_lead_days ?? 21, 7);
    if (tier === 'gift' && n.days <= lead) add(`bday:${p.id}:${n.date}:gift`, `Geschenk für ${p.name} besorgen`, clip(addDays(n.date, -7), today), `Geburtstag am ${n.date}${p.notes ? ` · ${p.notes}` : ''}`);
    if (tier === 'card' && n.days <= 10) add(`bday:${p.id}:${n.date}:card`, `Karte/Nachricht für ${p.name}`, clip(addDays(n.date, -3), today), `Geburtstag am ${n.date}`);
    if (n.days <= 7) add(`bday:${p.id}:${n.date}:greet`, `${p.name} gratulieren${tier === 'call' ? ' (anrufen/schreiben)' : ''}`, n.date, n.age ? `wird ${n.age}` : null);
  }
  for (const h of state.holidays || []) {
    const n = h.date.length === 5 ? nextOccurrence(h.date, today) : { date: h.date, days: daysBetween(today, h.date) };
    const lead = h.lead_days ?? 21;
    if (n.days >= 0 && n.days <= lead) add(`hol:${h.id}:${n.date}`, `${h.name} vorbereiten`, clip(addDays(n.date, -Math.min(7, lead)), today), h.notes || null);
  }
  for (const t of state.trips || []) {
    const d = daysBetween(today, t.start);
    if (d >= 0 && d <= 7) add(`trip:${t.id}:${t.start}`, `Packen für ${t.title}`, clip(addDays(t.start, -1), today), t.packing?.length ? `Packliste: ${t.packing.join(', ')}` : null);
  }
  state.reminder_keys = [...keys].slice(-500);
  return created;
}

/** Alles Wichtige der nächsten `days` Tage (ohne heute), unabhängig davon, ob schon erinnert wurde. */
export function upcoming(state, today, days = 7, events = []) {
  const out = [];
  const label = (d) => `${d.date}`;
  for (const p of state.people || []) {
    if (!p.birthday) continue;
    const n = nextOccurrence(p.birthday, today);
    if (n.days >= 1 && n.days <= days) out.push({ date: n.date, text: `Geburtstag ${p.name}${n.age ? ` (wird ${n.age})` : ''} – ${{ gift: 'Geschenk', card: 'Karte/Nachricht', call: 'anrufen/schreiben' }[p.tier || 'call']}` });
  }
  for (const h of state.holidays || []) {
    const n = h.date.length === 5 ? nextOccurrence(h.date, today) : { date: h.date, days: daysBetween(today, h.date) };
    if (n.days >= 1 && n.days <= days) out.push({ date: n.date, text: `${h.name}${h.notes ? ` – ${h.notes}` : ''}` });
  }
  for (const t of state.trips || []) {
    const d = daysBetween(today, t.start);
    if (d >= 1 && d <= days) out.push({ date: t.start, text: `Reise: ${t.title}${t.destination ? ` (${t.destination})` : ''}` });
  }
  for (const t of (state.todos || []).filter((x) => !x.done && x.due)) {
    const d = daysBetween(today, t.due);
    if (d >= 1 && d <= days) out.push({ date: t.due, text: `Frist: ${t.title}` });
  }
  for (const r of state.recurring || []) {
    const d = daysBetween(today, r.next_due);
    if (d >= 1 && d <= days) out.push({ date: r.next_due, text: `${r.title}` });
  }
  for (const e of events) {
    const d = daysBetween(today, e.date);
    if (d >= 2 && d <= days) out.push({ date: e.date, text: `Termin: ${e.all_day ? '' : `${e.start} `}${e.title}` });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date)).map((x) => `${label(x)}: ${x.text}`);
}
