import { addDays, addInterval, daysBetween } from './util.js';

/** Nächstes Auftreten eines Datums 'MM-DD' oder 'YYYY-MM-DD' (jährlich wiederkehrend). */
export function nextOccurrence(md, today) {
  const p = md.split('-');
  const [mm, dd] = p.slice(-2);
  const birthYear = p.length === 3 ? Number(p[0]) : null;
  let y = Number(today.slice(0, 4));
  let date = `${y}-${mm}-${dd}`;
  if (date < today) { y += 1; date = `${y}-${mm}-${dd}`; }
  return { date, days: daysBetween(today, date), age: birthYear ? y - birthYear : null };
}

/** Kleinste Schwelle t mit days <= t, sonst null. */
function stageFor(days, thresholds) {
  const ts = [...new Set(thresholds)].sort((a, b) => a - b);
  return ts.find((t) => days <= t) ?? null;
}

const TIER = {
  gift: (lead) => [lead, 7, 3, 0],
  card: () => [7, 2, 0],
  call: () => [1, 0],
};

export function birthdaySignals(people, today) {
  const out = [];
  for (const p of people) {
    if (!p.birthday) continue;
    const tier = p.tier || 'call';
    const lead = p.gift_lead_days ?? 21;
    const n = nextOccurrence(p.birthday, today);
    const stage = stageFor(n.days, (TIER[tier] || TIER.call)(lead));
    if (stage === null) continue;
    const key = `bday:${p.id}:${n.date}:${stage}`;
    if (p.reminded === key) continue;
    const when = n.days === 0 ? 'HEUTE' : n.days === 1 ? 'morgen' : `in ${n.days} Tagen (${n.date})`;
    const age = n.age ? ` (wird ${n.age})` : '';
    let text;
    if (n.days === 0) text = `${p.name} hat heute Geburtstag${age}: ${tier === 'call' ? 'anrufen/schreiben' : 'gratulieren'}`;
    else if (tier === 'gift') text = n.days > 3
      ? `${p.name}: Geburtstag ${when}${age} – Geschenk besorgen/bestellen (Versand einplanen)`
      : `${p.name}: Geburtstag ${when}${age} – Geschenk muss jetzt bereit sein`;
    else if (tier === 'card') text = `${p.name}: Geburtstag ${when}${age} – Karte/Nachricht vorbereiten`;
    else text = `${p.name}: Geburtstag ${when}${age} – kurz anrufen/schreiben`;
    out.push({ key, kind: 'birthday', personId: p.id, days: n.days, tier, text });
  }
  return out.sort((a, b) => a.days - b.days);
}

export function holidaySignals(holidays, today) {
  const out = [];
  for (const h of holidays) {
    const n = h.date.length === 5 ? nextOccurrence(h.date, today) : { date: h.date, days: daysBetween(today, h.date) };
    if (n.days < 0) continue;
    const lead = h.lead_days ?? 21;
    const stage = stageFor(n.days, [lead, 14, 7, 3, 0].filter((t) => t <= lead));
    if (stage === null) continue;
    const key = `hol:${h.id}:${n.date}:${stage}`;
    if (h.reminded === key) continue;
    out.push({ key, kind: 'holiday', holidayId: h.id, days: n.days,
      text: `${h.name} in ${n.days} Tagen (${n.date})${h.notes ? ` – ${h.notes}` : ''}` });
  }
  return out.sort((a, b) => a.days - b.days);
}

export function tripSignals(trips, today) {
  const out = [];
  for (const t of trips) {
    const days = daysBetween(today, t.start);
    if (days < 0 || days > 14) continue;
    const stage = stageFor(days, [14, 7, 3, 1]);
    const key = `trip:${t.id}:${stage}`;
    if (t.reminded === key) continue;
    out.push({ key, kind: 'trip', tripId: t.id, days,
      text: `Reise „${t.title}“ in ${days} Tagen (${t.start}${t.destination ? `, ${t.destination}` : ''}) – Packliste/Check-in prüfen`,
      packing: t.packing || [] });
  }
  return out;
}

export function recurringSignals(recurring, today) {
  const out = [];
  for (const r of recurring) {
    const days = daysBetween(today, r.next_due);
    const lead = r.lead_days ?? 2;
    if (days > lead) continue;
    out.push({ kind: 'recurring', recurringId: r.id, days,
      text: days < 0 ? `${r.title} – überfällig seit ${-days} Tag(en)` : days === 0 ? `${r.title} – heute fällig` : `${r.title} – fällig in ${days} Tag(en)`,
      subject: r.subject || null });
  }
  return out.sort((a, b) => a.days - b.days);
}

export function todoSignals(todos, today) {
  const open = todos.filter((t) => !t.done);
  const score = (t) => (t.due ? daysBetween(today, t.due) : 999) + (t.priority ?? 2) * 0.5;
  return open
    .map((t) => ({ ...t, overdue: t.due ? t.due < today : false, today: t.due === today }))
    .sort((a, b) => score(a) - score(b));
}

export function markReminded(state, signals) {
  for (const s of signals) {
    const list = s.kind === 'birthday' ? state.people : s.kind === 'holiday' ? state.holidays : s.kind === 'trip' ? state.trips : null;
    const id = s.personId || s.holidayId || s.tripId;
    const item = list?.find((x) => x.id === id);
    if (item && s.key) item.reminded = s.key;
  }
}

export function advanceRecurring(r, doneDate) {
  // Verlauf, damit die Tagesansicht Abgehaktes zeigen und das Abhaken einzeln zurücknehmen kann
  r.done_log = [...(r.done_log || []), { date: doneDate, prev_next_due: r.next_due, prev_last_done: r.last_done ?? null }].slice(-60);
  r.last_done = doneDate;
  r.next_due = addInterval(doneDate, r.every, r.unit);
}

/** Nimmt das Abhaken einer Routine an einem Tag zurück. */
export function uncompleteRecurring(r, date) {
  const log = r.done_log || [];
  const i = log.map((x) => x.date).lastIndexOf(date);
  if (i < 0) return false;
  if (i === log.length - 1) { r.next_due = log[i].prev_next_due; r.last_done = log[i].prev_last_done; }
  log.splice(i, 1); r.done_log = log;
  return true;
}

/** Fällt eine Routine (bei regelmäßiger Erledigung) auf Tag D? Überfälliges zählt für heute. */
export function recurringOccursOn(r, D, T) {
  let x = r.next_due < T ? T : r.next_due;
  for (let i = 0; i < 800 && x < D; i++) x = addInterval(x, r.every || 1, r.unit || 'days');
  return x === D;
}

export { addDays };
