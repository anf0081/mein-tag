import { callClaude, resolveModel, textOf } from './claude.js';
import { TOOL_DEFS, executeTool, describeAction } from './tools.js';
import { onboardingPrompt } from './onboarding.js';
import { todoSignals } from './signals.js';
import { localNow, daysBetween } from './util.js';
import { personaOf, userGenderNote } from './personas.js';
import { langName } from './lang.js';

const WA_STYLE = `Formatierung (Chat in der App): *fett*, _kursiv_, Listen mit "- ". Keine Markdown-Überschriften, keine Tabellen. Wenige Emojis. LÄNGE: Im Alltag kurz, meist 1 bis 5 Sätze; längere Antworten nur, wenn sie ausdrücklich danach fragt (z. B. Wochenüberblick) oder im Onboarding.`;

/** Hängt eine von der App verschickte Nachricht an den Verlauf an (ohne zwei Assistent-Nachrichten hintereinander). */
/** Änderung im Menü merken; die KI bekommt sie vor ihrer nächsten Antwort als Notiz. Gleicher Schlüssel = nur der neueste Stand. */
export function queueSettingNote(state, key, text) {
  (state.pending_notes ||= {})[key] = text;
}

/** Gesammelte Menü-Änderungen als eine Notiz in den Verlauf schreiben (oder, ohne Verlauf, zurückgeben). */
export function flushSettingNotes(state) {
  const list = Object.values(state.pending_notes || {});
  if (!list.length) return '';
  state.pending_notes = {};
  const note = `[Von ihr im Menü „Über dich“ geändert seit der letzten Nachricht – gilt ab sofort und hat Vorrang vor älteren Aussagen im Verlauf oder Gelerntem: ${list.join('; ')}]`;
  if (state.history.length) { addAssistantNote(state, note); return ''; }
  return note;
}

export function addAssistantNote(state, text) {
  const h = state.history;
  if (!h.length) return;
  if (h[h.length - 1].role === 'assistant') h[h.length - 1] = { role: 'assistant', content: `${h[h.length - 1].content}\n\n${text}` };
  else h.push({ role: 'assistant', content: text });
  state.history = h.slice(-60);
  while (state.history.length && state.history[0].role !== 'user') state.history.shift();
}

export function snapshot(state, today) {
  const todos = todoSignals(state.todos, today).slice(0, 30)
    .map((t) => `[${t.id}] P${t.priority} ${t.title}${t.due ? ` (fällig ${t.due}${t.time ? ` ${t.time}` : ''})` : ''}${t.category ? ` #${t.category}` : ''}`);
  const doneRecent = state.todos.filter((t) => t.done).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || '')).slice(0, 10).map((t) => `[${t.id}] ${t.title} (erledigt ${t.done_at || '?'})`);
  const people = state.people.slice(0, 80).map((p) => `${p.name}${p.relation ? ` (${p.relation})` : ''} ${p.birthday || '?'} ${p.tier || 'call'}`);
  const rec = state.recurring.map((r) => `[${r.id}] ${r.title} alle ${r.every} ${r.unit}, nächste Fälligkeit ${r.next_due}${r.subject ? ` (${r.subject})` : ''}`);
  const ents = state.entities.map((e) => `${e.kind}: ${e.name}${e.details ? ` – ${e.details}` : ''}${e.last_done ? ` (zuletzt gemacht ${e.last_done})` : ''}`);
  const hol = state.holidays.map((h) => `${h.name} ${h.date} (Vorlauf ${h.lead_days ?? 21} Tage)`);
  const trips = state.trips.map((t) => `${t.title} ${t.start}${t.end ? `–${t.end}` : ''} ${t.destination || ''}`);
  const mem = state.memory.slice(-80).map((m) => `[${m.id}] ${m.text}`);
  const timed = (state.timed || []).filter((r) => !r.done).map((r) => `[${r.id}] ${r.date} ${r.time} ${r.text}`);
  const fb = state.feedback.slice(-5).map((f) => `${f.rating > 0 ? '👍' : '👎'} ${f.text || ''}`);
  const sec = (t, a) => (a.length ? `${t}:\n${a.map((x) => `- ${x}`).join('\n')}` : `${t}: (leer)`);
  return [
    `Profil: ${JSON.stringify(state.profile)}`,
    sec('Offene Todos', todos), sec('Kürzlich erledigt', doneRecent), sec('Wiederkehrend', rec), sec('Personen', people), sec('Kinder/Tiere/Orte', ents),
    sec('Feiertage', hol), sec('Reisen', trips), sec('Uhrzeit-Erinnerungen', timed), sec('Gelerntes (Präferenzen/Fakten)', mem), sec('Letztes Brief-Feedback', fb),
  ].join('\n\n');
}

export function buildSystem(ctx) {
  const { state, tz } = ctx;
  const n = localNow(tz());
  const me = state.profile.assistant_name;
  const P = personaOf(state.profile);
  return `Du bist ${me ? `„${me}“, ` : ''}${P.g === 'm' ? 'der persönliche Assistent' : P.g === 'd' ? 'die persönliche Assistenz (divers)' : 'die persönliche Assistentin'} der Nutzerin in ihrer App „Mein Tag“ (ein Chat auf ihrem Handy, kein WhatsApp). Du duzt sie.
${me ? `Dein Name ist ${me}.` : 'Du hast noch keinen Namen. Frag sie im Onboarding (Bereich basics), wie sie dich nennen möchte, und speichere ihn mit update_profile (assistant_name).'}
PERSÖNLICHKEIT (${P.label}): ${P.tone}
${userGenderNote(state.profile)}
EINSTELLUNGEN: Weiblich/männlich/divers, dein Name und die Sprache stellt sie unter „Über dich“ ein. Deine Persönlichkeit ist fest (siehe oben) und nicht wählbar. Die Werte oben sind IMMER die gültigen, auch wenn frühere Nachrichten im Verlauf oder Gelerntes etwas anderes sagen (z. B. eine früher gewählte andere Persönlichkeit). Rufe update_profile für assistant_gender, assistant_name oder language NUR auf, wenn sie es in ihrer aktuellen Nachricht ausdrücklich verlangt. Stell niemals eine Einstellung von dir aus zurück.
Du interessierst dich ehrlich für ihre höheren Ziele, Werte, Routinen und Hobbys und hilfst ihr, diese im Alltag unterzubringen. Bleib bei Widersprüchen zwischen Zielen und Alltag ehrlich, ohne zu belehren.
Du führst ihre Termine, Todos, Fristen, Geburtstage, Geschenke, Feiertags-Vorbereitungen, Reisen/Packlisten, Arzt-/Vorsorgetermine, Tiere und Haus/Land-Aufgaben, priorisierst und erstellst jeden Morgen einen einfachen Tagesplan.
Heute ist ${n.weekday}, ${n.date}, ${n.time} Uhr (${tz()}). SPRACHE: Antworte immer auf ${langName(state.profile)}, auch wenn Inhalte (Nachrichten, Termine) in anderen Sprachen vorliegen. Nur wenn sie dich ausdrücklich in einer anderen Sprache anschreibt, darfst du in dieser antworten.

Regeln:
- Speichere alles, was sie dir sagt, SOFORT über die Tools (Todos, Personen, wiederkehrende Aufgaben, Feste, Reisen, Profil).
- EHRLICHKEIT BEIM SPEICHERN: Sag nur „gespeichert“, „eingetragen“ oder „notiert“, wenn du in DIESER Antwort das passende Tool aufgerufen hast und es ohne Fehler zurückkam. Bei mehreren Dingen rufst du für JEDES ein Tool auf. Kam ein Fehler zurück, sag das offen. Die App zeigt unter deiner Antwort automatisch an, was wirklich gespeichert wurde. Beginne deshalb nicht mit Bestätigungen wie „Gespeichert“, „Notiert“ oder „Okay“, sondern antworte direkt auf das, was sie gesagt hat.
- Termine ändern/löschen: Hol dir zuerst mit calendar_list die ID, dann calendar_update bzw. calendar_delete. Löschen nur auf ausdrücklichen Wunsch; bei mehreren passenden Terminen nachfragen.
- Erinnerungen zu einer Uhrzeit („erinnere mich um 16 Uhr…“): set_reminder. Fokus („ich muss jetzt X erledigen“): start_focus mit einer sinnvollen Zeit (frag kurz, wie lange, falls unklar).
- Wetter: Nutze get_weather für jeden Ort (auch andere als den Wohnort). Soll ein Ort täglich im Brief stehen, nutze add_weather_place.
- Erfinde nie Termine, Daten oder IDs. Frage nach, wenn ein Datum fehlt. Rechne relative Angaben ("nächsten Freitag") korrekt in YYYY-MM-DD um.
- Lernen: Wenn sie Feedback, Korrekturen, Vorlieben oder Gewohnheiten äußert ("lieber kürzer", "Freitag nachmittags nie Termine", "Mama ruft man nur an"), rufe remember auf, mit kurzem, konkretem Satz. Doppelte oder überholte Einträge entfernst du mit forget.
- Ziele & Routinen: Speichere höhere Ziele, Werte, Routinen und Hobbys mit upsert_entity (kind="ziel", "routine" oder "hobby"; in details: Warum, gewünschte Häufigkeit/Dauer, bevorzugte Tageszeit). Frag gelegentlich und nie aufdringlich nach, wie es läuft und was sich gut anfühlt. Wiederkehrende Gewohnheiten mit festem Rhythmus zusätzlich als add_recurring anlegen. Erzählt sie, dass sie etwas davon gemacht hat (oder hakt eine passende Routine ab), rufe log_goal_progress auf, damit du verfolgen kannst, wo jedes Ziel steht.
- Priorisieren: Zuerst Fristen und Dinge mit Konsequenzen, dann Wichtiges mit Vorlauf (Geschenke, Arzttermine), dann Kleinkram. Passt nicht alles in den Tag, sagst du sachlich, was sich verschieben lässt.
- Datum: Schreibe Daten im Text immer als TT.MM.JJJJ (z. B. 22.11.2026), nie JJJJ-MM-TT. Nur in Werkzeug-Aufrufen bleibt es bei YYYY-MM-DD.
- Kalender: Bittet sie dich ausdrücklich, einen Termin anzulegen, und nennt Datum und Titel (Uhrzeit optional, dann ganztägig oder nachfragen, wenn eine Uhrzeit offensichtlich gemeint ist), rufe calendar_create sofort auf, ohne Rückfrage. Ohne Endzeit dauert ein Termin 1 Stunde. Schlägst du von dir aus einen Termin vor, frag vorher. Ist Google nicht verbunden, sag ihr, dass sie das unter „Über dich“ verbinden kann.
- ${WA_STYLE}

${state.onboarding.done ? '' : onboardingPrompt(state)}
${state.last_brief && daysBetween(state.last_brief.date, n.date) <= 1 ? `DEIN LETZTER MORGENBRIEF (von dir am ${state.last_brief.date} geschickt, steht so in ihrem Chat; beziehe dich darauf, wenn sie danach fragt oder etwas daraus ändern will):
"""
${state.last_brief.text}
"""` : ''}
${state.history_summary ? `ZUSAMMENFASSUNG FRÜHERER GESPRÄCHE (ältere Nachrichten, die nicht mehr wörtlich im Verlauf stehen):
${state.history_summary}` : ''}
${state.focus ? `FOKUS AKTIV: Sie arbeitet gerade an „${state.focus.task}“ (seit ${Math.round((Date.now() - state.focus.started) / 60000)} Min.). Halte sie freundlich beim Thema: Bei Ablenkungen kurz antworten und zurück zur Aufgabe lenken. Sagt sie, dass es erledigt ist, feiere es und rufe end_focus mit done=true auf; bricht sie ab, end_focus mit done=false.` : ''}
${state.awaiting_feedback ? 'Die Nutzerin hat den letzten Morgenbrief mit 👎 bewertet. Ihre nächste Nachricht ist vermutlich Feedback dazu: halte es mit remember fest und bedanke dich kurz.' : ''}

AKTUELLER STAND:
${snapshot(state, n.date)}`;
}

export const ONBOARDING_MODEL_DEFAULT = 'claude-sonnet-5-5'; // nur noch für Rückwärtskompatibilität

export async function chatTurn(ctx, userText, opts = {}) {
  const { state, env } = ctx;
  const pendingNote = flushSettingNotes(state);
  const system = buildSystem(ctx) + (pendingNote ? `\n${pendingNote}` : '');
  const messages = [...state.history, { role: 'user', content: userText }];
  let finalText = '';
  let partial = '';
  const actions = [];
  for (let i = 0; i < 10; i++) {
    const onb = !state.onboarding.done;
    const model = opts.model || resolveModel(env, onb ? 'onboarding' : 'chat');
    const res = await callClaude(env, { system, messages, tools: TOOL_DEFS, model, maxTokens: onb ? 8000 : 2048 });
    messages.push({ role: 'assistant', content: res.content });
    if (onb && res.stop_reason === 'max_tokens' && !res.content.some((b) => b.type === 'tool_use') && i < 8) {
      partial += res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      messages.push({ role: 'user', content: 'Schreib genau an der Stelle weiter, an der du aufgehört hast, ohne Wiederholung.' });
      continue;
    }
    const uses = res.content.filter((b) => b.type === 'tool_use');
    if (res.stop_reason !== 'tool_use' || !uses.length) { finalText = (partial + res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n')).trim(); break; }
    const results = [];
    for (const u of uses) {
      let out;
      try {
        out = await executeTool(u.name, u.input, ctx);
        const d = describeAction(u.name, u.input, out);
        if (d) actions.push(d);
      } catch (e) { out = { error: e.message }; }
      results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out) });
    }
    messages.push({ role: 'user', content: results });
  }
  if (!finalText) finalText = 'Erledigt.';
  state.onboarding.started = true;
  state.awaiting_feedback = false;
  state.history.push({ role: 'user', content: userText }, { role: 'assistant', content: finalText });
  state.history = state.history.slice(-60);
  while (state.history.length && state.history[0].role !== 'user') state.history.shift();
  ctx.save();
  return { text: finalText, actions };
}
