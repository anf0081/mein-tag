// Von der Assistentin selbst angestoßene Nachrichten (Check-in, Wochenplanung, Fokus-Nachfrage).
import { callClaude, resolveModel, textOf } from './claude.js';
import { buildSystem } from './chat.js';

export async function proactiveMessage(ctx, instruction, maxTokens = 900, model) {
  const system = buildSystem(ctx);
  const messages = [...ctx.state.history, { role: 'user', content: `[Automatischer Auftrag der App, nicht von der Nutzerin geschrieben]\n${instruction}\nSchreib direkt die Nachricht an sie, ohne Vorbemerkung. Keine Tools.` }];
  if (messages[0]?.role !== 'user') messages.shift();
  // Zwei Nutzer-Nachrichten hintereinander vermeiden
  for (let i = messages.length - 1; i > 0; i--) if (messages[i].role === 'user' && messages[i - 1].role === 'user') { messages[i - 1] = { role: 'user', content: `${messages[i - 1].content}\n\n${messages[i].content}` }; messages.splice(i, 1); }
  const res = await callClaude(ctx.env, { system, messages, maxTokens, model: model || resolveModel(ctx.env, 'proactive') });
  return textOf(res.content);
}
