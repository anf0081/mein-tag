import readline from 'node:readline';
import path from 'node:path';
import { createStore } from './store.js';
import { createCalendar } from './calendar.js';
import { createBot } from './bot.js';
import { localNow } from './util.js';
import { loadVapid } from './push.js';
import { createWebServer, createWebTransport } from './web.js';
import { createTaskSync, dedupeTodos } from './tasks.js';
import { setUsageHook, setAiSettings, apiKey, provider, resolveModel } from './claude.js';
import { recordUsage } from './usage.js';
import { addAssistantNote } from './chat.js';

const env = process.env;
const dataFile = env.DATA_FILE || './data/state.json';
const { state, save } = createStore(dataFile);
const calendar = createCalendar(env, () => state);
const tz = () => state.profile.tz || env.TZ || 'Europe/Berlin';
state.ai ||= { provider: null, models: { anthropic: {}, deepseek: {} }, keys: {} };
const ctx = { env, state, save, calendar, tz, dataFile, today: () => localNow(tz()).date };
setUsageHook((model, u) => { recordUsage(state, model, u, localNow(tz()).date.slice(0, 7)); save(); });
ctx.tasks = createTaskSync(ctx);
if (!state.migrations?.dedupe_v1) {
  const n = dedupeTodos(state);
  (state.migrations ||= {}).dedupe_v1 = new Date().toISOString(); save();
  console.log(`Bereinigung: ${n} doppelte bzw. Routine-Schatten-Todos entfernt, Titel-Markierungen bereinigt`);
}
if (!state.migrations?.persona_v2) {
  // Auswahl der Persönlichkeiten entfernt: alte Wahl und Gelerntes dazu aufräumen
  const before = state.memory.length;
  state.memory = state.memory.filter((m) => !/persönlichkeit|persona|kapitän|gouvernante|butler|coach mit biss|beste freundin|bester freund/i.test(m.text));
  const was = state.profile.persona;
  state.profile.persona = 'freundin';
  if (was && was !== 'freundin' && state.history.length) addAssistantNote(state, '[Hinweis: Es gibt keine wählbaren Persönlichkeiten mehr. Ab sofort gilt nur noch die feste Persönlichkeit aus den Anweisungen.]');
  (state.migrations ||= {}).persona_v2 = new Date().toISOString(); save();
  console.log(`Persönlichkeiten zusammengelegt (${before - state.memory.length} alte Einträge dazu entfernt)`);
}
const arg = (a) => process.argv.includes(a);

setAiSettings(() => state.ai);
if (!apiKey(env)) console.warn(`Hinweis: Kein API-Schlüssel für ${provider(env)} (weder in .env noch in der App unter „Über dich → KI“).`);

// ---------- CLI-Testmodus ----------
if (arg('--cli')) {
  const out = {
    noWindow: true,
    sendText: async (t) => console.log(`\n🤖 ${t}\n`),
    sendButtons: async (b, btns) => console.log(`   [${btns.map((x) => `${x.id}=${x.title}`).join(' | ')}]`),
    sendTemplate: async () => {},
  };
  const bot = createBot(ctx, out);
  console.log('CLI-Modus. Tippe Nachrichten, "fb:up"/"fb:down" für Feedback, "exit" zum Beenden.');
  const rl = readline.createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (line.trim() === 'exit') break;
    if (line.startsWith('fb:')) await bot.onMessage({ type: 'button', buttonId: line.trim() });
    else if (line.trim()) await bot.onMessage({ type: 'text', text: line });
  }
  process.exit(0);
}

// ---------- Web-App ----------
if (!env.APP_PASSWORD || env.APP_PASSWORD.length < 8) {
  console.error('APP_PASSWORD fehlt oder ist kürzer als 8 Zeichen (.env). Das Passwort schützt deine Daten.');
  process.exit(1);
}
const vapid = loadVapid(path.join(path.dirname(dataFile), 'vapid.json'));
const transport = createWebTransport(ctx, vapid, env);
const bot = createBot(ctx, transport);

if (arg('--brief-now')) { await bot.runBrief(); console.log('Brief erzeugt und zugestellt.'); process.exit(0); }

const server = createWebServer({ ctx, bot, vapid, env });
const host = env.HOST || '127.0.0.1';
const port = Number(env.PORT || 8080);
server.listen(port, host, () => console.log(`Mein Tag v1.0.0 läuft auf http://${host}:${port} (Kalender: ${calendar.configured ? 'verbunden' : 'nicht verbunden'}, KI: ${provider(env)}, Chat: ${resolveModel(env, 'chat')}, Brief: ${resolveModel(env, 'brief')}, Onboarding: ${resolveModel(env, 'onboarding')})`));
setInterval(() => bot.tick(), 60_000);
ctx.tasks.start();
console.log(`Google Aufgaben: ${ctx.tasks.configured ? 'Sync aktiv' : 'aus'}`);
