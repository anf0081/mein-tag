// Langen Gesprächsverlauf für die KI verdichten: ältere Nachrichten -> fortlaufende Zusammenfassung.
import { callClaude, resolveModel, textOf } from './claude.js';
import { snapshot } from './chat.js';
import { localNow } from './util.js';

export const SUMMARY_TRIGGER = 24; // ab so vielen Nachrichten im Verlauf
export const KEEP_RECENT = 10;     // so viele bleiben wörtlich

export async function summarizeHistory(ctx) {
  const { state, env } = ctx;
  const h = state.history;
  if (h.length <= SUMMARY_TRIGGER) return false;
  let cut = h.length - KEEP_RECENT;
  while (cut < h.length && h[cut].role !== 'user') cut++; // Rest muss mit einer Nutzer-Nachricht beginnen
  if (cut >= h.length) return false;
  const old = h.slice(0, cut);
  const transcript = old.map((m) => `${m.role === 'user' ? 'Sie' : 'Du'}: ${String(m.content).slice(0, 1500)}`).join('\n');
  const today = localNow(ctx.tz()).date;
  const res = await callClaude(env, {
    model: resolveModel(env, 'summary'), maxTokens: 1500,
    system: 'Du verdichtest den Gesprächsverlauf einer persönlichen Assistentin mit ihrer Nutzerin, damit die Assistentin später nichts Wichtiges vergisst. Schreib auf Deutsch, knapp, in Stichpunkten mit "- ".',
    messages: [{ role: 'user', content: `Heute ist ${today}.
BISHERIGE ZUSAMMENFASSUNG:
${state.history_summary || '(noch keine)'}

BEREITS GESPEICHERT (muss NICHT in die Zusammenfassung):
${snapshot(state, today)}

ÄLTERE GESPRÄCHSTEILE, DIE JETZT VERDICHTET WERDEN:
${transcript}

Erstelle eine aktualisierte Gesamt-Zusammenfassung (bisherige + neue Teile, höchstens ca. 350 Wörter). Behalte: offene Fragen und Absprachen, was du ihr zugesagt hast, Pläne und Wünsche, die nicht gespeichert sind, wichtigen Kontext (z. B. Stimmung, Belastung, Entscheidungen und warum), Rückmeldungen zu deinem Verhalten. Lass weg: alles, was oben schon gespeichert ist, Smalltalk, Erledigtes ohne Bedeutung für später. Gib relative Zeitangaben als Datum an. Nur die Stichpunkte, ohne Einleitung.` }],
  });
  const text = textOf(res.content).trim();
  if (!text) return false;
  // Verlauf könnte sich inzwischen verändert haben: nur die verdichteten Nachrichten entfernen
  if (state.history[0] !== old[0]) return false;
  state.history_summary = text.slice(0, 6000);
  state.history = state.history.slice(old.length);
  ctx.save();
  console.log(`Verlauf verdichtet: ${old.length} Nachrichten in die Zusammenfassung übernommen`);
  return true;
}
