import { callClaude, resolveModel, textOf } from './claude.js';
import { getWeather } from './weather.js';
import { deDate, isoToDe } from './util.js';
import { fmtEvent } from './calendar.js';
import { addDays, localNow } from './util.js';
import { personaOf, userGenderNote } from './personas.js';
import { langName } from './lang.js';
import { getHeadlines, NEWS_CATEGORIES } from './news.js';
import { upcoming } from './reminders.js';
import { holidayLabel, holidayPlace, holidaysBetween } from './holidays.js';
import { describeWarning } from './warnings.js';
import { addAssistantNote } from './chat.js';
import { birthdaySignals, holidaySignals, markReminded, recurringSignals, todoSignals, tripSignals } from './signals.js';

export async function gatherFacts(ctx) {
  const { state, calendar, tz } = ctx;
  const z = tz();
  const n = localNow(z);
  const today = { events: [], todos: [], routines: [] }; // für die Vollständigkeitsprüfung
  const facts = { language: langName(state.profile), language_code: state.profile.language || 'de', date: deDate(n.date), weekday: n.weekday, name: state.profile.name, daily_schedule: state.profile.daily_schedule };
  const warnings = [];

  try {
    const { configured, events } = await calendar.listEvents(n.date, addDays(n.date, 8), z);
    facts.calendar = configured ? events.filter((e) => e.date === n.date).map(fmtEvent) : [];
    today.events = configured ? events.filter((e) => e.date === n.date).map((e) => ({ title: e.title, line: fmtEvent(e) })) : [];
    facts._weekEvents = configured ? events : [];
    if (!configured) warnings.push('Google Kalender nicht verbunden');
  } catch (e) { warnings.push(`Kalender: ${e.message}`); facts.calendar = []; }

  try { facts.weather = (await getWeather(state.profile.location, z))?.todayText ?? null; }
  catch (e) { warnings.push(`Wetter: ${e.message}`); }
  if (!state.profile.location) warnings.push('Kein Ort für Wetter hinterlegt');
  facts.weather_other_places = [];
  for (const p of state.profile.weather_places || []) {
    try { facts.weather_other_places.push(`${p.label ? `${p.label} – ` : ''}${p.name}: ${(await getWeather(p, z)).todayText}`); }
    catch (e) { warnings.push(`Wetter ${p.name}: ${e.message}`); }
  }
  const newsOn = state.profile.news || {};
  if (Object.values(newsOn).some(Boolean)) {
    try {
      const h = await getHeadlines(newsOn);
      facts.headlines = Object.fromEntries(Object.keys(NEWS_CATEGORIES).filter((k) => h[k]?.length).map((k) => [NEWS_CATEGORIES[k].label, h[k].map((x) => `[${x.lang}] ${x.text}`)]));
      facts._headlinesRaw = h;
      state.news_status = { at: Date.now(), counts: Object.fromEntries(Object.keys(NEWS_CATEGORIES).filter((k) => newsOn[k]).map((k) => [NEWS_CATEGORIES[k].label, h[k]?.length || 0])), errors: h.errors || [] };
      if (h.errors.length) warnings.push(`Nachrichten teils nicht erreichbar (${h.errors.join('; ')})`);
    } catch (e) { warnings.push(`Nachrichten: ${e.message}`); }
  }

  const reminders = [
    ...birthdaySignals(state.people, n.date), ...holidaySignals(state.holidays, n.date), ...tripSignals(state.trips, n.date),
  ];
  const remText = (r) => r.text + (r.packing?.length ? ` | Packliste: ${r.packing.join(', ')}` : '');
  facts.reminders = reminders.filter((r) => r.days <= 0).map(remText); // heute
  facts.upcoming_reminders = reminders.filter((r) => r.days > 0).map(remText); // nur für die Vorausschau
  facts.recurring_due = recurringSignals(state.recurring, n.date).filter((r) => r.days <= 0).map((r) => r.text);
  facts.todos = todoSignals(state.todos, n.date).filter((t) => t.overdue || t.today).slice(0, 40).map((t) =>
    `P${t.priority} ${t.title}${t.due ? ` (fällig ${t.due}${t.overdue ? ', ÜBERFÄLLIG' : ''})` : ''}${t.category ? ` #${t.category}` : ''}`);
  // Aufgaben ohne Datum: täglich prüfen, ob eine davon langsam Priorität bekommt
  const ago = (d) => (d ? Math.round((Date.parse(n.date) - Date.parse(d)) / 864e5) : null);
  facts.todos_next_days = todoSignals(state.todos, n.date).filter((t) => t.due && !t.overdue && !t.today && t.due <= addDays(n.date, 7)).slice(0, 10).map((t) => `P${t.priority} ${t.title} (fällig ${t.due})`);
  facts.undated_todos = state.todos.filter((t) => !t.done && !t.due).slice(0, 40).map((t) => {
    const age = ago(t.created), seen = ago(t.brief_mentioned);
    return `P${t.priority ?? 2} ${t.title}${t.category ? ` #${t.category}` : ''}${age !== null ? ` | offen seit ${age} Tag(en)` : ''}${seen !== null ? ` | zuletzt im Brief kommentiert vor ${seen} Tag(en)` : ''}${t.notes ? ` | Notiz: ${String(t.notes).slice(0, 120)}` : ''}`;
  });
  facts.goals_routines = state.entities.filter((e) => ['ziel', 'routine', 'hobby'].includes(e.kind)).map((e) => {
    const done = ago(e.last_done), planned = ago(e.brief_planned);
    const n30 = (e.log || []).filter((x) => x.date >= addDays(n.date, -30)).length;
    return `${e.kind}: ${e.name}${e.details ? ` – ${e.details}` : ''} | zuletzt gemacht: ${done === null ? 'unbekannt' : done === 0 ? 'heute' : `vor ${done} Tag(en)`}${n30 ? `, ${n30}× in 30 Tagen` : ''}${planned !== null ? ` | zuletzt im Brief eingeplant vor ${planned} Tag(en)` : ''}`;
  });
  const P = personaOf(state.profile);
  facts.about_person = userGenderNote(state.profile) || undefined;
  facts.persona = `${P.label}${state.profile.assistant_name ? ` namens ${state.profile.assistant_name}` : ''}: ${P.tone}`;
  facts.next_7_days = upcoming(state, n.date, 7, facts._weekEvents || []);
  if (state.profile.birthday && state.profile.birthday.slice(-5) === n.date.slice(5)) facts.her_birthday_today = true;
  facts.about_her = state.profile.about || '';
  if (state.profile.holidays_auto !== false) {
    const hol = holidaysBetween(n.date, addDays(n.date, 7), holidayPlace(state.profile));
    const todayHol = hol.filter((h) => h.date === n.date).map((h) => h.name);
    if (todayHol.length) facts.today_is_holiday = todayHol.join(', ');
    facts.next_7_days.push(...hol.filter((h) => h.date > n.date).map((h) => `${h.date}: Feiertag – ${h.name}`));
    facts.next_7_days.sort();
  }
  if (state.profile.warnings_enabled !== false && state.current_warnings?.length) facts.weather_warnings = state.current_warnings.map((w) => describeWarning(w, z));
  delete facts._weekEvents;
  delete facts._headlinesRaw;
  facts.news_topics = state.profile.news_topics;
  facts.learned = state.memory.slice(-80).map((m) => m.text);
  facts.recent_chat = state.history.slice(-16).map((m) => `${m.role === 'user' ? 'Sie' : 'Du'}: ${String(m.content).replace(/\[Morgenbrief vom[\s\S]*/, '[Morgenbrief]').slice(0, 500)}`);
  facts.feedback = state.feedback.slice(-5).map((f) => `${f.rating > 0 ? '👍' : '👎'} ${f.text || ''}`);
  console.log(`Brief ${n.date}: Wetter ${facts.weather ? 'ok' : 'fehlt'}, weitere Orte ${facts.weather_other_places.length}/${(state.profile.weather_places || []).length}, Nachrichten ${facts.headlines ? Object.entries(facts.headlines).map(([k, v]) => `${k} ${v.length}`).join(', ') : 'keine'}${warnings.length ? ` | Hinweise: ${warnings.join('; ')}` : ''}`);
  today.todos = todoSignals(state.todos, n.date).filter((t) => t.overdue || t.today).slice(0, 40).map((t) => ({ title: t.title, line: `${t.overdue ? '⚠️ ' : ''}${t.title}` }));
  today.routines = recurringSignals(state.recurring, n.date).filter((r) => r.days <= 0).map((r) => { const x = state.recurring.find((y) => y.id === r.recurringId); return { title: x?.title || r.text, line: `↻ ${x?.title || r.text}` }; });
  return { facts, reminders, warnings, date: n.date, today };
}

export function plainBrief({ facts, warnings }) {
  const L = [`*Guten Morgen${facts.name ? `, ${facts.name}` : ''}!* ☀️ ${facts.weekday}, ${facts.date}`];
  if (facts.weather) L.push('', '*Wetter*', facts.weather);
  for (const w of facts.weather_other_places || []) L.push(w);
  if (facts.calendar.length) L.push('', '*Termine*', ...facts.calendar.map((e) => `- ${e}`));
  const must = [...facts.recurring_due, ...facts.reminders];
  if (must.length) L.push('', '*Nicht vergessen*', ...must.map((e) => `- ${e}`));
  if (facts.todos.length) L.push('', '*Heute zu tun*', ...facts.todos.map((e) => `- ${e}`), ...(facts.recurring_due || []).map((e) => `- ↻ ${e}`));
  const next = facts.next_7_days?.[0];
  if (next) L.push('', '*Vorausschau*', `- ${next}`);
  // Ohne Claude kann nicht übersetzt werden: nur Meldungen zeigen, die schon in der eingestellten Sprache sind
  if (facts.headlines) for (const [k, v] of Object.entries(facts.headlines)) {
    const own = v.filter((x) => x.startsWith(`[${facts.language_code}]`)).slice(0, 3).map((x) => `- ${x.replace(/^\[\w+\] /, '').split(' – ')[0]}`);
    if (own.length) L.push('', `*${k}*`, ...own);
  }
  if (warnings.length) L.push('', `_Hinweis: ${warnings.join('; ')}_`);
  return L.join('\n');
}

const BRIEF_SYSTEM = `Du erstellst den täglichen Morgenbrief für den Chat in der App „Mein Tag“. Du duzt sie. Schreibe den GESAMTEN Brief in der Sprache aus "language", auch die Abschnittsüberschriften. Halte dich an die Persönlichkeit aus "persona" (Ton, Wortwahl), ohne kitschig zu werden. Beachte "about_person" (wie sich die Person identifiziert) bei allen Formen. Nutze NUR die gelieferten Fakten, erfinde nichts. Format: *fett*, "- " Listen, keine Überschriften mit #, keine Tabellen. Fasse dich bei allem außer den beiden Heute-Listen kurz; die Heute-Listen sind immer vollständig, egal wie lang.
FOKUS: Der Brief handelt NUR vom heutigen Tag. Andere Tage kommen ausschließlich im einen Punkt *Vorausschau* vor.
DATUM: Schreibe Daten immer als TT.MM.JJJJ (z. B. 22.11.2026), nie als JJJJ-MM-TT. Statt eines Datums gern nur den Wochentag, wenn es in den nächsten Tagen liegt.
Aufbau:
*Guten Morgen, {Name}!* ☀️ {Wochentag}, {date}
*Wetter* – nur HEUTE, eine kurze, menschliche Zeile aus "weather" (keine Messwerte wie mm oder UV) plus ein praktischer Tipp, wenn er sich anbietet (Jacke, Wäsche, Garten). Falls "weather_warnings" vorhanden, zuerst deutlich die offizielle Warnung (IPMA bzw. DWD, steht in eckigen Klammern) mit Stufe und Zeitraum. Für jeden Ort in weather_other_places eine weitere kurze Zeile mit dem Label, ggf. mit Tipp (z. B. was das Kind anziehen sollte).
Hat sie heute selbst Geburtstag ("her_birthday_today"), beginne mit einem herzlichen Glückwunsch und plane den Tag leichter. Nutze "about_her", um Vorschläge persönlich zu machen.
Ist heute ein Feiertag ("today_is_holiday"), erwähne es oben und plane entsprechend (Geschäfte, Schule zu).
*Top 3 heute* – die wichtigsten 3 Dinge von heute ("calendar", "todos", "recurring_due", "reminders") mit kurzer Begründung.
*Termine heute* – ALLE Einträge aus "calendar", je eine Zeile mit Uhrzeit (bzw. „ganztägig“) und Titel, chronologisch. Keinen weglassen. Gibt es keine, eine Zeile „Keine Termine“.
*Aufgaben heute* – ALLE Einträge aus "todos" und "recurring_due", je eine eigene Zeile (nicht mehrere in einer Zeile zusammenfassen): Überfälliges zuerst und als überfällig markiert, dann nach Priorität (P1, P2, P3); Routinen mit „↻“ davor. Keine weglassen, auch wenn sie schon in den Top 3 stehen.
*Tagesplan* – einfache Zeitblöcke für heute (kurz; die Einzelheiten stehen in den Listen oben, hier nur, wann was dran ist). Kalendertermine sind fix. Todos und fällige Routinen in Lücken passend zum typischen Tagesablauf ("daily_schedule"). Plane 1 Ziel/Routine/Hobby aus "goals_routines" realistisch als Zeitblock ein. Nicht überladen.
*Ziele & Routinen* – ein kurzer Fließtext (2–4 Sätze, keine Liste), zusätzlich zu den Listen oben: Denk über ihre Ziele, Routinen und Hobbys aus "goals_routines" nach – Passt heute etwas davon gut hinein (Wetter, freie Zeit, gewünschter Rhythmus aus den Details)? Wird etwas vernachlässigt (lange nicht gemacht oder lange nicht eingeplant)? Und wo steht es ungefähr (z. B. „Yoga lief diese Woche schon zweimal, Contact Dance seit drei Wochen nicht mehr“). Nur aus den Fakten, nichts erfinden; ist „zuletzt gemacht“ unbekannt, darfst du freundlich nachfragen. Wechsle über die Tage ab, statt immer dasselbe zu nennen.
*Nicht vergessen* – nur, was HEUTE ansteht und noch nicht oben steht (Geburtstag heute, fällige Routinen, Packliste für eine Abreise heute). Sonst weglassen.
*Vorausschau* – EIN kleiner Punkt, höchstens 2 kurze Zeilen. Wähle klug das eine, was jetzt den größten Unterschied macht:
  • etwas aus "next_7_days", "upcoming_reminders" oder "todos_next_days", das heute schon Vorbereitung braucht (Geschenk besorgen, Unterlagen, packen, eine Frist) – mit Wochentag;
  • ODER, wenn heute wenig ansteht (wenige Termine und Todos): eine Aufgabe aus "undated_todos", die heute gut passt (Wetter, freie Zeit, liegt schon lange, passt zu ihren Zielen oder zu "recent_chat"), mit konkretem Vorschlag, wann. Bevorzuge Aufgaben, die nicht in den letzten 3 Tagen "zuletzt im Brief kommentiert" wurden.
  Formuliere so, dass sie im Chat leicht zustimmen kann (z. B. „Soll ich es für Donnerstag eintragen?“). Gibt es nichts Sinnvolles, lass den Punkt weg.
*Nachrichten* – nur aus "headlines": je Kategorie (Welt, Portugal, Deutschland) die 1–2 wichtigsten Meldungen, je eine neutrale Zeile in eigenen Worten, übersetzt in die Sprache aus "language" (Originale sind teils Englisch oder Portugiesisch), mit Quelle in Klammern, z. B. "- Portugal: … (RTP)". Wähle nach Tragweite, nicht nach Sensation; keine Wertung, nichts dazuerfinden. Danach optional 1 Zeile zu ihren eigenen Themen (news_topics), nur falls Websuche-Ergebnisse von heute/gestern vorliegen. Ohne headlines den Abschnitt weglassen.
Berücksichtige "learned" und "feedback" strikt (Stil, Länge, Vorlieben). Lass leere Abschnitte weg.
Nutze "recent_chat" (die letzte Unterhaltung mit dir): Was sie dort über heute gesagt hat (Pläne, Termine, Stimmung, Energie), fließt in den Tagesplan ein. Erfinde daraus aber keine Fakten.
PFLICHT, auch wenn sie sich kürzere Briefe wünscht (dann kürzer formulieren, aber nichts weglassen):
- *Termine heute* enthält JEDEN Kalendereintrag von heute und *Aufgaben heute* JEDE Aufgabe aus "todos" und JEDE Routine aus "recurring_due" – vollständig, je eine Zeile.
- Für JEDEN Eintrag in weather_other_places steht im Wetter-Abschnitt eine eigene Zeile.
- Wenn "goals_routines" Einträge hat, gibt es den Abschnitt *Ziele & Routinen* als kurzen Fließtext, und mindestens eins davon steht als Zeitblock im Tagesplan.
- Wenn "headlines" Einträge hat, gibt es den Abschnitt *Nachrichten* mit JEDER darin enthaltenen Kategorie (Welt, Portugal, Deutschland – keine auslassen).
- ÜBERSETZEN: Jede Schlagzeile ist mit ihrer Originalsprache markiert ([de], [en], [pt]). Gib KEINE Schlagzeile im Original wieder, sondern formuliere jede Meldung neu in der Sprache aus "language". Auch Eigennamen-Zusätze und Überschriften gehören in diese Sprache.`;

/** Sicherheitsnetz: Was die KI an heutigen Terminen/Aufgaben ausgelassen hat, wird unten ergänzt. */
export function ensureComplete(text, today, lang = 'de') {
  if (!today) return text;
  const norm = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const hay = norm(text);
  const found = (title) => { const k = norm(title); return !k || hay.includes(k.slice(0, 22)) || (k.split(' ').filter((w) => w.length > 3).length > 1 && k.split(' ').filter((w) => w.length > 3).every((w) => hay.includes(w))); };
  const miss = [...today.events, ...today.todos, ...today.routines].filter((x) => !found(x.title));
  if (!miss.length) return text;
  return `${text}\n\n*${({ en: 'Also today', pt: 'Também hoje' })[lang] || 'Außerdem heute'}*\n${miss.map((x) => `- ${x.line}`).join('\n')}`;
}

const NEWS_HEAD = /\*(nachrichten|news|notícias|noticias)\*/i;
/** Fehlt der Nachrichten-Abschnitt (z. B. weil die KI ihn vergessen hat), wird er in einem kleinen Extra-Aufruf erzeugt. */
async function ensureNews(env, text, g) {
  const h = g.facts.headlines;
  if (!h || !Object.values(h).some((l) => l?.length) || NEWS_HEAD.test(text)) return text;
  console.log('Brief: Nachrichten fehlten, erzeuge sie nach');
  try {
    const res = await callClaude(env, {
      model: resolveModel(env, 'brief'), maxTokens: 1500,
      system: `Schreibe NUR den Abschnitt *Nachrichten* eines Morgenbriefs in der Sprache "${g.facts.language}". Beginne mit der Zeile "*Nachrichten*" (Überschrift in dieser Sprache). Je Kategorie die 1–2 wichtigsten Meldungen, je eine neutrale Zeile in eigenen Worten, übersetzt, mit Quelle in Klammern, z. B. "- Portugal: … (RTP)". Keine Kategorie auslassen, nichts erfinden, keine Einleitung.`,
      messages: [{ role: 'user', content: JSON.stringify(h, null, 2) }],
    });
    const add = textOf(res.content).trim();
    if (add) return `${text}\n\n${NEWS_HEAD.test(add) ? add : `*Nachrichten*\n${add}`}`;
  } catch (e) { console.error('Brief: Nachrichten nachträglich fehlgeschlagen:', e.message); }
  const raw = Object.entries(h).flatMap(([cat, l]) => (l || []).slice(0, 2).map((x) => `- ${cat}: ${String(x).replace(/^\[\w+\]\s*/, '')}`));
  return `${text}\n\n*Nachrichten*\n${raw.join('\n')}`;
}

export async function generateBrief(ctx) {
  const g = await gatherFacts(ctx);
  const { env } = ctx;
  const useNews = env.NEWS_ENABLED === '1' && (g.facts.news_topics?.length > 0);
  const messages = [{ role: 'user', content: `Fakten (JSON):\n${isoToDe(JSON.stringify(g.facts, null, 2))}\n\nHinweise zum Setup: ${g.warnings.join('; ') || 'keine'}` }];
  const base = { system: BRIEF_SYSTEM, maxTokens: 8000, model: resolveModel(env, 'brief') };
  const tools = useNews ? [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }] : [];
  let text = '';
  try {
    let res; let partial = '';
    for (let i = 0; i < 6; i++) {
      try { res = await callClaude(env, { ...base, messages, tools }); }
      catch (e) { if (tools.length) { tools.length = 0; res = await callClaude(env, { ...base, messages }); } else throw e; }
      if (res.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: res.content }); continue; }
      if (res.stop_reason === 'max_tokens') {
        // abgeschnitten: genau an der Stelle weiterschreiben lassen
        const chunk = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
        partial += chunk;
        console.log(`Brief: Antwort bei ${partial.length} Zeichen abgeschnitten, lasse weiterschreiben`);
        messages.push({ role: 'assistant', content: partial || ' ' }, { role: 'user', content: 'Du wurdest mitten im Text unterbrochen. Schreib genau an der Stelle weiter, ohne etwas zu wiederholen und ohne Einleitung.' });
        continue;
      }
      break;
    }
    const last = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    text = (partial + last).trim();
    if (res.stop_reason === 'max_tokens') console.warn('Brief: auch nach Fortsetzungen noch abgeschnitten');
    if (text) text = await ensureNews(env, text, g);
  } catch (e) {
    console.error('Brief: Claude-Fehler, nutze Ersatz-Brief:', e.message);
    text = plainBrief(g) + `\n\n_(Claude war gerade nicht erreichbar: ${e.message})_`;
  }
  if (!text) text = plainBrief(g);
  text = ensureComplete(text, g.today, g.facts.language_code);
  text = isoToDe(text);
  return { text, reminders: g.reminders, date: g.date };
}

/** Nach erfolgreicher Zustellung aufrufen, damit Erinnerungen nicht jeden Tag wiederholt werden. */
export function commitBrief(ctx, brief) {
  markReminded(ctx.state, brief.reminders);
  ctx.state.last_brief_date = brief.date;
  ctx.state.last_brief = { date: brief.date, text: brief.text };
  // merken, welche Aufgaben ohne Datum heute kommentiert wurden (für die Abwechslung)
  const low = brief.text.toLowerCase();
  for (const t of ctx.state.todos) {
    if (t.done || t.due || !t.title) continue;
    const key = t.title.toLowerCase().trim();
    if (key.length >= 4 && (low.includes(key) || (key.length > 24 && low.includes(key.slice(0, 24))))) t.brief_mentioned = brief.date;
  }
  for (const e of ctx.state.entities) {
    if (!['ziel', 'routine', 'hobby'].includes(e.kind) || !e.name) continue;
    const key = e.name.toLowerCase().trim();
    if (key.length >= 3 && low.includes(key)) e.brief_planned = brief.date;
  }
  addAssistantNote(ctx.state, `[Morgenbrief vom ${brief.date}, von dir geschickt]\n${brief.text}`);
  ctx.save();
}
