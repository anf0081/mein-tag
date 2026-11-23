import { chatTurn, addAssistantNote } from './chat.js';
import { resolveModel, provider } from './claude.js';
import { buildOverview } from './overview.js';
import { proactiveMessage } from './proactive.js';
import { summarizeHistory } from './summary.js';
import { commitBrief, generateBrief } from './brief.js';
import { localNow } from './util.js';
import { createScheduler } from './schedule.js';
import { SECTIONS } from './onboarding.js';

const FB_BUTTONS = [{ id: 'fb:up', title: '👍 Passt' }, { id: 'fb:down', title: '👎 Besser machen' }];
const OPEN_WORDS = new Set(['ok', 'okay', 'ja', 'brief', 'morgenbrief', 'los']);

/**
 * transport: { sendText(text, {kind}), sendButtons(body, buttons), sendTemplate(), noWindow? }
 * noWindow=true: kein 24h-Fenster (Web-App), Briefe werden immer direkt zugestellt.
 * Jeder Aufruf kann einen eigenen Transport mitgeben (z. B. um Antworten einer Web-Anfrage einzusammeln).
 */
export function createBot(ctx, defaultTransport) {
  const { state } = ctx;
  const scheduler = createScheduler(ctx, defaultTransport);
  let queue = Promise.resolve();
  const enqueue = (fn) => {
    const run = queue.then(fn, fn);
    queue = run.catch((e) => console.error('Bot-Fehler:', e));
    return queue;
  };

  async function deliverBrief(tr, text) {
    await tr.sendText(text, { kind: 'brief' });
    try { await tr.sendButtons('War der Brief hilfreich?', FB_BUTTONS); } catch { /* optional */ }
  }

  async function runBrief(tr, { force = false } = {}) {
    const brief = await generateBrief(ctx);
    const fresh = tr.noWindow || Date.now() - state.last_inbound_ts < 23 * 3600 * 1000;
    if (fresh || force) {
      await deliverBrief(tr, brief.text);
    } else {
      // Kanal ohne offenes Antwortfenster: erst Hinweis, Brief wartet auf Antwort
      state.pending_brief = brief.text;
      ctx.save();
      await tr.sendTemplate();
    }
    commitBrief(ctx, brief);
  }

  async function handle(msg, tr) {
    state.last_inbound_ts = Date.now();
    ctx.save();

    if (msg.type === 'other') {
      await tr.sendText('Das kann ich leider noch nicht lesen (nur Text). Schreib es mir bitte kurz auf. 🙂');
      return;
    }

    let opened = false;
    if (state.pending_brief) {
      const t = state.pending_brief; state.pending_brief = null; ctx.save();
      await deliverBrief(tr, t); opened = true;
    }

    if (msg.type === 'button') {
      if (msg.buttonId === 'fb:up') {
        state.feedback.push({ ts: Date.now(), rating: 1 }); state.feedback = state.feedback.slice(-50); ctx.save();
        await tr.sendText('Danke, freut mich! 🙌');
      } else if (msg.buttonId === 'fb:down') {
        state.feedback.push({ ts: Date.now(), rating: -1 }); state.feedback = state.feedback.slice(-50);
        state.awaiting_feedback = true; ctx.save();
        await tr.sendText('Danke fürs Ehrlichsein. Was soll ich beim nächsten Mal anders machen?');
      } else if (!opened) {
        await tr.sendText('Alles klar.');
      }
      return;
    }

    const text = msg.text.trim();
    const low = text.toLowerCase();
    if (opened && OPEN_WORDS.has(low)) return;
    if (['brief', 'morgenbrief', 'tagesbrief'].includes(low)) { await runBrief(tr, { force: true }); return; }
    if (low === 'onboarding neu') {
      state.onboarding = { started: false, done: false, sections: {} }; ctx.save();
      await tr.sendText('Okay, wir gehen das Onboarding nochmal durch (alles Gespeicherte bleibt). Schreib mir „los“.');
      return;
    }
    if (['onboarding', 'onboarding überblick', 'überblick'].includes(low)) {
      const list = buildOverview(state);
      let follow;
      try {
        follow = await proactiveMessage(ctx, `Die Nutzerin hat den Onboarding-Überblick geöffnet. Diese vollständige Liste wird ihr gerade angezeigt (du musst sie NICHT wiederholen):
${list}

Schreib jetzt NUR:
1. „Was noch fehlt:“ als kurze Liste – Bereiche, die leer oder lückenhaft sind (z. B. Personen ohne Geburtstag, fehlender Wohnort, keine Routinen), höchstens 6 Punkte.
2. Dass sie alles einfach per Chat ändern oder ergänzen kann (ein Satz).
3. Zum Schluss GENAU EINE konkrete Frage zum wichtigsten fehlenden Punkt, mit der ihr direkt weitermacht.`, 1500, resolveModel(ctx.env, 'onboarding'));
      } catch (e) { follow = `Was fehlt, kann ich gerade nicht auswerten (${e.message}). Du kannst mir aber jederzeit schreiben, was ich ändern oder ergänzen soll.`; }
      // Liste stammt direkt aus den Daten; Modell für den Rest wie Onboarding (Sonnet)
      state.history.push({ role: 'user', content: 'Zeig mir meinen Onboarding-Überblick.' });
      addAssistantNote(state, `[Vollständiger Überblick aller gespeicherten Daten wurde angezeigt]\n${follow}`);
      ctx.save();
      await tr.sendText(list);
      await tr.sendText(follow);
      return;
    }
    const prompt = text;
    let reply, actions = [];
    try { ({ text: reply, actions } = await chatTurn(ctx, prompt)); }
    catch (e) {
      console.error('Claude-Fehler:', e.message);
      const hint = /401|x-api-key|authentication/i.test(e.message) ? `Der API-Schlüssel stimmt nicht (${provider(ctx.env) === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'ANTHROPIC_API_KEY'} in .env prüfen).`
        : /402|insufficient/i.test(e.message) ? 'Das Guthaben beim KI-Anbieter ist aufgebraucht.'
        : /credit|balance|billing/i.test(e.message) ? 'Das Guthaben in der Claude Console ist aufgebraucht.'
          : `Fehler: ${e.message}`;
      reply = `Ups, ich komme gerade nicht an mein Gehirn. ${hint}`;
    }
    await tr.sendText(reply, { actions });
    // Danach (Antwort ist schon raus): langen Verlauf verdichten
    try { await summarizeHistory(ctx); } catch (e) { console.error('Verlauf verdichten:', e.message); }
  }

  /** Jede Minute aufrufen */
  async function tick() {
    const n = localNow(ctx.tz());
    await scheduler();
    if (!state.onboarding.started && !state.onboarding.done) return;
    if (state.last_brief_date === n.date || n.time < (state.profile.brief_time || '07:30')) return;
    state.last_brief_date = n.date; ctx.save(); // gegen Doppelversand bei Fehler; commitBrief setzt es erneut
    console.log(`Morgenbrief wird erstellt (${n.date} ${n.time})`);
    await runBrief(defaultTransport);
  }

  return {
    onMessage: (msg, tr) => enqueue(() => handle(msg, tr || defaultTransport)),
    tick: () => enqueue(tick),
    runBrief: (tr) => enqueue(() => runBrief(tr || defaultTransport, { force: true })),
  };
}
