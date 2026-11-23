import { advanceRecurring } from './signals.js';
import { ensureReminderTodos } from './reminders.js';
import { geocode, getWeather } from './weather.js';
import { fmtEvent } from './calendar.js';
import { SECTIONS } from './onboarding.js';
import { addDays, isDate, isMonthDay, localNow, localToUtc, rid } from './util.js';

const str = (d) => ({ type: 'string', description: d });
const def = (name, description, properties, required = []) => ({
  name, description, input_schema: { type: 'object', properties, required },
});

export const TOOL_DEFS = [
  def('add_todo', 'Neue Aufgabe anlegen.', {
    title: str('Kurzer Titel'), due: str('Fällig am, YYYY-MM-DD (optional)'), time: str('Uhrzeit HH:MM (optional, dann kommt zu dieser Zeit ein Hinweis)'),
    priority: { type: 'integer', description: '1=hoch, 2=normal, 3=niedrig', enum: [1, 2, 3] },
    category: str('z. B. Haushalt, Kind, Arbeit, Land, Tiere, Gesundheit'), notes: str('Details'),
  }, ['title']),
  def('update_todo', 'Aufgabe ändern.', {
    id: str('Todo-ID'), title: str(''), due: str('YYYY-MM-DD oder leer zum Entfernen'), time: str('HH:MM oder leer zum Entfernen'),
    priority: { type: 'integer', enum: [1, 2, 3] }, category: str(''), notes: str(''),
  }, ['id']),
  def('complete_todo', 'Aufgabe als erledigt markieren.', { id: str('Todo-ID') }, ['id']),
  def('reopen_todo', 'Erledigte Aufgabe wieder öffnen (z. B. wenn versehentlich abgehakt oder doch nicht fertig).', { id: str('Todo-ID') }, ['id']),
  def('delete_todo', 'Aufgabe löschen.', { id: str('Todo-ID') }, ['id']),
  def('list_todos', 'Offene Aufgaben auflisten (nach Dringlichkeit sortiert).', { include_done: { type: 'boolean' } }),
  def('upsert_person', 'Person mit Geburtstag speichern oder aktualisieren (Abgleich per Name).', {
    name: str(''), relation: str('z. B. Mutter, Freundin, Nachbar'),
    birthday: str('MM-DD oder YYYY-MM-DD'), tier: { type: 'string', enum: ['gift', 'card', 'call'], description: 'gift=Geschenk, card=Karte/Nachricht, call=nur Anruf/Text' },
    gift_lead_days: { type: 'integer', description: 'Wie viele Tage vorher Geschenk besorgen (Standard 21)' }, notes: str('Geschenkideen, Vorlieben, Adresse...'),
  }, ['name']),
  def('remove_person', 'Person löschen.', { name: str('') }, ['name']),
  def('upsert_entity', 'Flexibles Ding speichern: Kind, Tier, Ort/Grundstück, Fahrzeug... (Abgleich per Name).', {
    kind: { type: 'string', description: 'kind | tier | ort | ziel | routine | hobby | sonstiges' }, name: str(''), details: str('Alles Relevante als Text, z. B. Alter, Futter, Schule, Besonderheiten'),
  }, ['kind', 'name']),
  def('remove_entity', 'Entity löschen.', { name: str('') }, ['name']),
  def('add_recurring', 'Wiederkehrende Aufgabe, z. B. Stall ausmisten alle 2 Wochen, Hundefutter kaufen alle 6 Wochen, Zahnarzt alle 6 Monate.', {
    title: str(''), every: { type: 'integer' }, unit: { type: 'string', enum: ['days', 'weeks', 'months', 'years'] },
    next_due: str('Nächste Fälligkeit YYYY-MM-DD'), subject: str('Worauf bezogen, z. B. Hund, Hühner, Land'), category: str(''),
    lead_days: { type: 'integer', description: 'Wie viele Tage vorher erinnern (Standard 2)' }, notes: str(''),
  }, ['title', 'every', 'unit', 'next_due']),
  def('update_recurring', 'Wiederkehrende Aufgabe ändern (Titel, Rhythmus, nächste Fälligkeit).', {
    id: str(''), title: str(''), every: { type: 'integer' }, unit: { type: 'string', enum: ['days', 'weeks', 'months', 'years'] },
    next_due: str('YYYY-MM-DD'), lead_days: { type: 'integer' }, notes: str(''),
  }, ['id']),
  def('complete_recurring', 'Wiederkehrende Aufgabe als erledigt melden; nächste Fälligkeit wird ab heute (oder angegebenem Datum) berechnet.', { id: str(''), done_date: str('YYYY-MM-DD, Standard heute') }, ['id']),
  def('list_recurring', 'Alle wiederkehrenden Aufgaben auflisten.', {}),
  def('remove_recurring', 'Wiederkehrende Aufgabe löschen.', { id: str('') }, ['id']),
  def('upsert_holiday', 'Feiertag/Fest mit Vorbereitungsvorlauf speichern.', {
    name: str(''), date: str('MM-DD (jährlich) oder YYYY-MM-DD (einmalig)'), lead_days: { type: 'integer' }, notes: str('Was vorzubereiten ist'),
  }, ['name', 'date']),
  def('remove_holiday', 'Feiertag löschen.', { name: str('') }, ['name']),
  def('upsert_trip', 'Reise/Flug speichern.', {
    title: str(''), start: str('YYYY-MM-DD'), end: str('YYYY-MM-DD'), destination: str(''), notes: str('Flugdaten etc.'),
    packing: { type: 'array', items: { type: 'string' }, description: 'Packliste' },
  }, ['title', 'start']),
  def('remove_trip', 'Reise löschen.', { title: str('') }, ['title']),
  def('update_profile', 'Profil ändern. location_name wird automatisch geokodiert (für Wetter).', {
    name: str('Name der Nutzerin'), user_gender: { type: 'string', enum: ['f', 'm', 'd'], description: 'Wie sie sich selbst identifiziert: f weiblich, m männlich, d divers' }, birthday: str('Ihr eigener Geburtstag, MM-DD oder YYYY-MM-DD'),
    about_me: str('Persönliches über sie als Stichpunkte, eine Zeile pro Punkt (Beruf, was ihr Freude und Kraft gibt, Werte/Praxis, Lieblingsdinge, wobei Unterstützung hilft). Immer den VOLLSTÄNDIGEN aktuellen Text schicken: bisherige Punkte übernehmen und Neues ergänzen.'),
    assistant_name: str('Name, den sie dir (der Assistentin) gibt'),
    assistant_gender: { type: 'string', enum: ['f', 'm', 'd'], description: 'weiblich, männlich oder divers' },
    language: { type: 'string', enum: ['de', 'en', 'pt'], description: 'Sprache für Chat und Brief' },
    due_notify_enabled: { type: 'boolean', description: 'Hinweise bei fälligen Aufgaben an/aus' }, due_notify_time: str('HH:MM Sammel-Hinweis für heute fällige Aufgaben ohne Uhrzeit'),
    checkin_enabled: { type: 'boolean', description: 'Abend-Check-in an/aus' }, checkin_time: str('HH:MM Abend-Check-in'),
    weekly_enabled: { type: 'boolean', description: 'Wochenplanung an/aus' }, weekly_day: { type: 'integer', description: '0=Sonntag … 6=Samstag' }, weekly_time: str('HH:MM Wochenplanung'),
    warnings_enabled: { type: 'boolean', description: 'Unwetterwarnungen an/aus' }, holidays_auto: { type: 'boolean', description: 'Feiertage automatisch' }, location_name: str('Ort, z. B. Hamburg oder Lissabon, Portugal'), tz: str('IANA-Zeitzone, z. B. Europe/Berlin'),
    brief_time: str('HH:MM Uhrzeit des Morgenbriefs'), news_topics: { type: 'array', items: { type: 'string' } },
    daily_schedule: str('Typischer Tagesablauf als Text'), notes: str('Allgemeine Notizen'),
  }),
  def('get_weather', 'Wetter für heute und morgen abrufen, für den Wohnort oder einen beliebigen anderen Ort.', { location_name: str('Ort, z. B. München. Leer = Wohnort') }),
  def('add_weather_place', 'Zusätzlichen Wetter-Ort dauerhaft in den Morgenbrief aufnehmen (z. B. Arbeitsort oder Schule der Kinder).', { location_name: str('Ort'), label: str('Wofür, z. B. Büro oder Schule') }, ['location_name']),
  def('remove_weather_place', 'Zusätzlichen Wetter-Ort aus dem Morgenbrief entfernen.', { location_name: str('') }, ['location_name']),
  def('set_news', 'Nachrichten im Morgenbrief ein- oder ausschalten.', {
    world: { type: 'boolean', description: 'Weltnachrichten' }, pt: { type: 'boolean', description: 'Portugal' }, de: { type: 'boolean', description: 'Deutschland' },
  }),
  def('log_goal_progress', 'Festhalten, dass sie etwas für ein Ziel, eine Routine oder ein Hobby getan hat (z. B. „war heute beim Yoga“). Für den Überblick, wo was steht.', {
    name: str('Name des Ziels/der Routine/des Hobbys wie gespeichert'), date: str('YYYY-MM-DD, leer = heute'), note: str('kurz, optional: was/wie viel/wie es war'),
  }, ['name']),
  def('remember', 'Dauerhaft merken: Präferenz, Feedback, Gewohnheit oder Fakt, der künftig Antworten und Briefe verbessern soll. Kurz und konkret formulieren.', { text: str('') }, ['text']),
  def('forget', 'Eine gemerkte Sache vergessen.', { id: str('Memory-ID') }, ['id']),
  def('calendar_list', 'Kalendertermine abrufen.', { from: str('YYYY-MM-DD'), days: { type: 'integer', description: 'Anzahl Tage (Standard 7)' } }),
  def('calendar_create', 'Termin im Google Kalender anlegen. Bei ausdrücklichem Auftrag der Nutzerin direkt ausführen.', {
    title: str(''), date: str('YYYY-MM-DD'), start: str('HH:MM'), end: str('HH:MM'), all_day: { type: 'boolean' }, description: str(''), location: str(''),
  }, ['title', 'date']),
  def('calendar_update', 'Termin im Google Kalender ändern (verschieben, umbenennen). id vorher mit calendar_list holen. Nur Felder angeben, die sich ändern.', {
    id: str('Termin-ID aus calendar_list'), title: str(''), date: str('YYYY-MM-DD'), start: str('HH:MM'), end: str('HH:MM'), all_day: { type: 'boolean' }, location: str(''), description: str(''),
  }, ['id']),
  def('calendar_delete', 'Termin im Google Kalender löschen. Nur auf ausdrücklichen Wunsch; id vorher mit calendar_list holen.', { id: str('Termin-ID aus calendar_list') }, ['id']),
  def('set_reminder', 'Erinnerung zu einer bestimmten Uhrzeit (kommt als Push-Benachrichtigung).', { text: str('Woran erinnern'), date: str('YYYY-MM-DD, Standard heute'), time: str('HH:MM') }, ['text', 'time']),
  def('list_reminders', 'Offene Uhrzeit-Erinnerungen auflisten.', {}),
  def('cancel_reminder', 'Uhrzeit-Erinnerung löschen.', { id: str('') }, ['id']),
  def('start_focus', 'Fokus-Modus starten: Sie arbeitet jetzt an einer Sache; nach der Zeit fragst du nach, ob sie erledigt ist.', { task: str('Woran sie arbeitet'), minutes: { type: 'integer', description: 'Nach wie vielen Minuten nachfragen (Standard 45)' } }, ['task']),
  def('end_focus', 'Fokus-Modus beenden.', { done: { type: 'boolean', description: 'Wurde die Aufgabe erledigt?' } }),
  def('complete_onboarding_section', 'Onboarding-Bereich als abgeschlossen markieren.', { section: { type: 'string', enum: SECTIONS.map((s) => s.id) } }, ['section']),
  def('finish_onboarding', 'Onboarding komplett beenden. Ab dann kommt der tägliche Morgenbrief.', {}),
];

function pushUndo(state, entry) {
  (state.undo_stack ||= []).push({ ...entry, ts: Date.now() });
  state.undo_stack = state.undo_stack.slice(-20);
}

/** Macht das letzte Abhaken rückgängig. Gibt eine Beschreibung zurück oder null. */
export function undoLast(state) {
  const e = (state.undo_stack || []).pop();
  if (!e) return null;
  if (e.type === 'todo') {
    const t = state.todos.find((x) => x.id === e.id); if (!t) return undoLast(state);
    t.done = false; t.done_at = null; t.dirty = true; delete t.notified;
    return { type: 'todo', title: t.title };
  }
  if (e.type === 'rec') {
    const r = state.recurring.find((x) => x.id === e.id); if (!r) return undoLast(state);
    r.next_due = e.next_due; r.last_done = e.last_done;
    if (r.done_log?.length) r.done_log.pop();
    return { type: 'rec', title: r.title };
  }
  if (e.type === 'cleared') {
    const have = new Set(state.todos.map((t) => t.id));
    const back = (e.todos || []).filter((t) => !have.has(t.id));
    state.todos.push(...back);
    return { type: 'cleared', title: `${back.length} erledigte Aufgabe(n)` };
  }
  return null;
}

const byName = (list, name) => list.find((x) => x.name.toLowerCase() === name.toLowerCase());
const patch = (obj, input, keys) => { for (const k of keys) if (input[k] !== undefined) obj[k] = input[k]; };
const needDate = (s, label) => { if (!isDate(s)) throw new Error(`${label} muss YYYY-MM-DD sein`); };

const handlers = {
  add_todo({ title, due, time, priority = 2, category, notes }, { state, today }) {
    if (due) needDate(due, 'due');
    if (time && !/^\d{2}:\d{2}$/.test(time)) throw new Error('time muss HH:MM sein');
    if (time && !due) due = today();
    const t = { id: rid(), title, due: due || null, time: time || null, priority, category: category || null, notes: notes || null, done: false, created: today(), dirty: true };
    state.todos.push(t);
    return t;
  },
  update_todo({ id, ...rest }, { state }) {
    const t = state.todos.find((x) => x.id === id); if (!t) throw new Error('Todo nicht gefunden');
    if (rest.due) needDate(rest.due, 'due');
    if (rest.time && !/^\d{2}:\d{2}$/.test(rest.time)) throw new Error('time muss HH:MM sein');
    patch(t, { ...rest, due: rest.due === '' ? null : rest.due, time: rest.time === '' ? null : rest.time }, ['title', 'due', 'time', 'priority', 'category', 'notes']);
    delete t.notified;
    t.dirty = true;
    return t;
  },
  complete_todo({ id }, { state, today }) {
    const t = state.todos.find((x) => x.id === id); if (!t) throw new Error('Todo nicht gefunden');
    if (!t.done) pushUndo(state, { type: 'todo', id });
    t.done = true; t.done_at = today(); t.dirty = true; return t;
  },
  reopen_todo({ id }, { state }) {
    const t = state.todos.find((x) => x.id === id); if (!t) throw new Error('Todo nicht gefunden');
    t.done = false; t.done_at = null; t.dirty = true; delete t.notified; return t;
  },
  delete_todo({ id }, { state }) {
    const i = state.todos.findIndex((x) => x.id === id); if (i < 0) throw new Error('Todo nicht gefunden');
    const [t] = state.todos.splice(i, 1);
    if (t.gtask_id) { (state.gtask_deletes ||= []).push(t.gtask_id); state.gtask_tombstones = [...new Set([...(state.gtask_tombstones || []), t.gtask_id])].slice(-300); }
    return { ok: true };
  },
  list_todos({ include_done }, { state }) {
    return state.todos.filter((t) => include_done || !t.done)
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.priority - b.priority);
  },
  upsert_person({ name, relation, birthday, tier, gift_lead_days, notes }, { state }) {
    if (birthday && !isMonthDay(birthday)) throw new Error('birthday muss MM-DD oder YYYY-MM-DD sein');
    let p = byName(state.people, name);
    if (!p) { p = { id: rid(), name }; state.people.push(p); }
    patch(p, { relation, birthday, tier, gift_lead_days, notes }, ['relation', 'birthday', 'tier', 'gift_lead_days', 'notes']);
    return p;
  },
  remove_person({ name }, { state }) {
    const i = state.people.findIndex((p) => p.name.toLowerCase() === name.toLowerCase());
    if (i < 0) throw new Error('Person nicht gefunden'); state.people.splice(i, 1); return { ok: true };
  },
  upsert_entity({ kind, name, details }, { state }) {
    let e = byName(state.entities, name);
    if (!e) { e = { id: rid(), name, kind }; state.entities.push(e); }
    patch(e, { kind, details }, ['kind', 'details']);
    return e;
  },
  remove_entity({ name }, { state }) {
    const i = state.entities.findIndex((e) => e.name.toLowerCase() === name.toLowerCase());
    if (i < 0) throw new Error('Nicht gefunden'); state.entities.splice(i, 1); return { ok: true };
  },
  add_recurring({ title, every, unit, next_due, subject, category, lead_days, notes }, { state }) {
    needDate(next_due, 'next_due');
    const r = { id: rid(), title, every, unit, next_due, subject: subject || null, category: category || null, lead_days: lead_days ?? 2, notes: notes || null };
    state.recurring.push(r); return r;
  },
  complete_recurring({ id, done_date }, { state, today }) {
    const r = state.recurring.find((x) => x.id === id); if (!r) throw new Error('Nicht gefunden');
    if (done_date) needDate(done_date, 'done_date');
    pushUndo(state, { type: 'rec', id, next_due: r.next_due, last_done: r.last_done ?? null });
    advanceRecurring(r, done_date || today()); return r;
  },
  update_recurring({ id, ...rest }, { state }) {
    const r = state.recurring.find((x) => x.id === id); if (!r) throw new Error('Nicht gefunden');
    if (rest.next_due) needDate(rest.next_due, 'next_due');
    if (rest.every !== undefined && (!Number.isInteger(rest.every) || rest.every < 1)) throw new Error('every muss eine ganze Zahl ab 1 sein');
    if (rest.title !== undefined && !String(rest.title).trim()) throw new Error('Titel fehlt');
    patch(r, rest, ['title', 'every', 'unit', 'next_due', 'lead_days', 'notes']);
    return r;
  },
  list_recurring(_i, { state }) { return state.recurring; },
  remove_recurring({ id }, { state }) {
    const i = state.recurring.findIndex((x) => x.id === id); if (i < 0) throw new Error('Nicht gefunden');
    state.recurring.splice(i, 1); return { ok: true };
  },
  upsert_holiday({ name, date, lead_days, notes }, { state }) {
    if (!isMonthDay(date)) throw new Error('date muss MM-DD oder YYYY-MM-DD sein');
    let h = byName(state.holidays, name);
    if (!h) { h = { id: rid(), name }; state.holidays.push(h); }
    patch(h, { date, lead_days, notes }, ['date', 'lead_days', 'notes']); return h;
  },
  remove_holiday({ name }, { state }) {
    const i = state.holidays.findIndex((h) => h.name.toLowerCase() === name.toLowerCase());
    if (i < 0) throw new Error('Nicht gefunden'); state.holidays.splice(i, 1); return { ok: true };
  },
  upsert_trip({ title, start, end, destination, notes, packing }, { state }) {
    needDate(start, 'start'); if (end) needDate(end, 'end');
    let t = state.trips.find((x) => x.title.toLowerCase() === title.toLowerCase());
    if (!t) { t = { id: rid(), title }; state.trips.push(t); }
    patch(t, { start, end, destination, notes, packing }, ['start', 'end', 'destination', 'notes', 'packing']); return t;
  },
  remove_trip({ title }, { state }) {
    const i = state.trips.findIndex((x) => x.title.toLowerCase() === title.toLowerCase());
    if (i < 0) throw new Error('Nicht gefunden'); state.trips.splice(i, 1); return { ok: true };
  },
  async update_profile({ location_name, ...rest }, { state }) {
    const p = state.profile;
    if (rest.birthday && !isMonthDay(rest.birthday)) throw new Error('birthday muss MM-DD oder YYYY-MM-DD sein');
    if (rest.about_me !== undefined) { p.about = String(rest.about_me).slice(0, 4000); delete rest.about_me; }
    if (rest.brief_time && !/^\d{2}:\d{2}$/.test(rest.brief_time)) throw new Error('brief_time muss HH:MM sein');
    if (rest.assistant_name !== undefined) rest.assistant_name = String(rest.assistant_name).trim().slice(0, 40) || null;
    for (const k of ['checkin_time', 'weekly_time', 'due_notify_time']) if (rest[k] && !/^\d{2}:\d{2}$/.test(rest[k])) throw new Error(`${k} muss HH:MM sein`);
    patch(p, rest, ['birthday', 'due_notify_enabled', 'due_notify_time', 'checkin_enabled', 'checkin_time', 'weekly_enabled', 'weekly_day', 'weekly_time', 'warnings_enabled', 'holidays_auto', 'name', 'assistant_name', 'assistant_gender', 'user_gender', 'language', 'tz', 'brief_time', 'news_topics', 'daily_schedule', 'notes']);
    if (location_name) {
      const g = await geocode(location_name);
      p.location = { name: g.name, lat: g.lat, lon: g.lon, elevation: g.elevation, country_code: g.country_code };
      if (!rest.tz && !p.tz) p.tz = g.tz;
    }
    return p;
  },
  async get_weather({ location_name }, { state, tz }) {
    let loc = state.profile.location;
    if (location_name) { const g = await geocode(location_name); loc = { name: g.name, lat: g.lat, lon: g.lon }; }
    if (!loc) throw new Error('Kein Ort bekannt, bitte nachfragen');
    return (await getWeather(loc, tz())).text + ` (Ort: ${loc.name})`;
  },
  async add_weather_place({ location_name, label }, { state }) {
    const g = await geocode(location_name);
    const list = (state.profile.weather_places ||= []);
    const i = list.findIndex((p) => p.name === g.name);
    const place = { name: g.name, lat: g.lat, lon: g.lon, elevation: g.elevation, label: label || null };
    if (i >= 0) list[i] = place; else { if (list.length >= 5) throw new Error('Maximal 5 zusätzliche Orte'); list.push(place); }
    return place;
  },
  remove_weather_place({ location_name }, { state }) {
    const list = state.profile.weather_places || [];
    const q = location_name.toLowerCase();
    const i = list.findIndex((p) => p.name.toLowerCase().startsWith(q) || p.name.toLowerCase().includes(q) || (p.label || '').toLowerCase().includes(q));
    if (i < 0) throw new Error('Ort nicht gefunden');
    return list.splice(i, 1)[0];
  },
  set_news(input, { state }) {
    const n = (state.profile.news ||= {});
    for (const k of ['world', 'pt', 'de']) if (typeof input[k] === 'boolean') n[k] = input[k];
    return n;
  },
  log_goal_progress({ name, date, note }, { state, today }) {
    const d = date || today(); needDate(d, 'date');
    const e = state.entities.find((x) => ['ziel', 'routine', 'hobby'].includes(x.kind) && x.name.toLowerCase() === String(name).toLowerCase())
      || state.entities.find((x) => ['ziel', 'routine', 'hobby'].includes(x.kind) && x.name.toLowerCase().includes(String(name).toLowerCase()));
    if (!e) throw new Error(`Kein Ziel/Routine/Hobby „${name}“ gespeichert – erst mit upsert_entity anlegen`);
    e.log = [...(e.log || []), { date: d, note: note ? String(note).slice(0, 200) : null }].slice(-60);
    if (!e.last_done || d > e.last_done) e.last_done = d;
    return { name: e.name, last_done: e.last_done, times_last_30_days: e.log.filter((x) => x.date >= addDays(today(), -30)).length };
  },
  remember({ text }, { state, today }) {
    const m = { id: rid(), text, created: today() }; state.memory.push(m);
    state.memory = state.memory.slice(-120); return m;
  },
  forget({ id }, { state }) {
    const i = state.memory.findIndex((m) => m.id === id); if (i < 0) throw new Error('Nicht gefunden');
    state.memory.splice(i, 1); return { ok: true };
  },
  async calendar_update({ id, ...ch }, { calendar, tz }) { return calendar.updateEvent(id, ch, tz()); },
  async calendar_delete({ id }, { calendar }) { return calendar.deleteEvent(id); },
  set_reminder({ text, date, time }, { state, tz, today }) {
    const d = date || today();
    needDate(d, 'date');
    if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('time muss HH:MM sein');
    const at = localToUtc(d, time, tz()).getTime();
    if (at < Date.now() - 60_000) throw new Error('Dieser Zeitpunkt liegt in der Vergangenheit');
    const r = { id: rid(), text, date: d, time, at, done: false };
    (state.timed ||= []).push(r);
    return r;
  },
  list_reminders(_i, { state }) { return (state.timed || []).filter((r) => !r.done); },
  cancel_reminder({ id }, { state }) {
    const r = (state.timed || []).find((x) => x.id === id); if (!r) throw new Error('Nicht gefunden');
    state.timed = state.timed.filter((x) => x.id !== id); return r;
  },
  start_focus({ task, minutes = 45 }, { state }) {
    state.focus = { task, started: Date.now(), until: Date.now() + Math.max(5, Math.min(480, minutes)) * 60_000, pinged: false };
    return state.focus;
  },
  end_focus({ done }, { state }) {
    const f = state.focus; state.focus = null;
    if (!f) throw new Error('Kein Fokus aktiv');
    return { task: f.task, done: !!done };
  },
  async calendar_list({ from, days = 7 }, { calendar, today, tz }) {
    const f = from || today();
    const { configured, events } = await calendar.listEvents(f, addDays(f, days), tz());
    return configured ? events.map((e) => `[${e.id}] ${fmtEvent(e)}`) : { error: 'Google Kalender ist nicht verbunden' };
  },
  calendar_create(input, { calendar, tz }) { return calendar.createEvent(input, tz()); },
  complete_onboarding_section({ section }, { state }) { state.onboarding.sections[section] = true; return { ok: true }; },
  finish_onboarding(_i, { state }) {
    state.onboarding.done = true;
    for (const s of SECTIONS) state.onboarding.sections[s.id] = true;
    return { ok: true };
  },
};

const U = { days: 'Tage', weeks: 'Wochen', months: 'Monate', years: 'Jahre' };
/** Kurze, ehrliche Beschreibung einer erfolgreichen Änderung (für die Anzeige unter der Antwort). null = nur gelesen. */
export function describeAction(name, input = {}, out = {}) {
  const i = input, o = out || {};
  switch (name) {
    case 'add_todo': return `Aufgabe: ${i.title}${i.due || i.time ? ` (fällig ${i.due || 'heute'}${i.time ? ` ${i.time}` : ''})` : ''}`;
    case 'update_todo': return `Aufgabe geändert: ${o.title || ''}`;
    case 'complete_todo': return `Erledigt: ${o.title || ''}`;
    case 'reopen_todo': return `Wieder offen: ${o.title || ''}`;
    case 'delete_todo': return 'Aufgabe gelöscht';
    case 'upsert_person': return `Person: ${i.name}${i.birthday ? ` (Geburtstag ${i.birthday})` : ''}`;
    case 'remove_person': return `Person entfernt: ${i.name}`;
    case 'upsert_entity': return `${i.kind ? i.kind.charAt(0).toUpperCase() + i.kind.slice(1) : 'Eintrag'}: ${i.name}`;
    case 'remove_entity': return `Entfernt: ${i.name}`;
    case 'add_recurring': return `Wiederkehrend: ${i.title} (alle ${i.every} ${U[i.unit] || i.unit}, nächstes Mal ${i.next_due})`;
    case 'complete_recurring': return `Erledigt: ${o.title || ''}, nächstes Mal ${o.next_due || ''}`;
    case 'remove_recurring': return 'Wiederkehrende Aufgabe entfernt';
    case 'update_recurring': return `Routine geändert: ${o.title || ''}`;
    case 'upsert_holiday': return `Fest: ${i.name} (${i.date})`;
    case 'remove_holiday': return `Fest entfernt: ${i.name}`;
    case 'upsert_trip': return `Reise: ${i.title} (${i.start})`;
    case 'remove_trip': return `Reise entfernt: ${i.title}`;
    case 'update_profile': return `Profil: ${Object.keys(i).map((k) => ({ name: 'Name', birthday: 'dein Geburtstag', about_me: 'Persönliches', assistant_name: 'mein Name', persona: 'Persönlichkeit', assistant_gender: 'weiblich/männlich', language: 'Sprache', location_name: 'Wohnort', tz: 'Zeitzone', brief_time: 'Brief-Uhrzeit', news_topics: 'News-Themen', daily_schedule: 'Tagesablauf', notes: 'Notizen' }[k] || k)).join(', ')}`;
    case 'remember': return `Gemerkt: ${i.text}`;
    case 'log_goal_progress': return `Fortschritt: ${o.name || i.name}`;
    case 'forget': return 'Vergessen';
    case 'calendar_create': return `Termin: ${i.title} (${i.date}${i.start ? ` ${i.start}` : ''})`;
    case 'calendar_update': return `Termin geändert: ${o.title || ''}`;
    case 'calendar_delete': return `Termin gelöscht: ${o.title || ''}`;
    case 'set_reminder': return `Erinnerung: ${i.text} (${o.date} ${i.time})`;
    case 'cancel_reminder': return `Erinnerung gelöscht: ${o.text || ''}`;
    case 'start_focus': return `Fokus: ${i.task} (ich frage nach ${i.minutes || 45} Min. nach)`;
    case 'end_focus': return `Fokus beendet${o.done ? ': erledigt' : ''}`;
    case 'add_weather_place': return `Wetter-Ort: ${o.name || i.location_name}`;
    case 'remove_weather_place': return `Wetter-Ort entfernt: ${o.name || i.location_name}`;
    case 'set_news': return `Nachrichten: ${['world', 'pt', 'de'].filter((k) => o[k]).map((k) => ({ world: 'Welt', pt: 'Portugal', de: 'Deutschland' }[k])).join(', ') || 'aus'}`;
    default: return null;
  }
}

export async function executeTool(name, input, ctx) {
  const h = handlers[name];
  if (!h) throw new Error(`Unbekanntes Tool ${name}`);
  const out = await h(input || {}, ctx);
  let made = [];
  if (['upsert_person', 'upsert_holiday', 'upsert_trip'].includes(name)) made = ensureReminderTodos(ctx.state, ctx.today());
  ctx.save();
  if (name.includes('todo') || name.includes('recurring') || made.length) ctx.tasks?.scheduleSync();
  return out;
}
