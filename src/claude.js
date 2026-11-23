// KI-Anbieter: Anthropic (Claude, Standard) oder DeepSeek (über dessen Claude-kompatible Schnittstelle)
export const CHAT_MODEL_DEFAULT = 'claude-sonnet-5-5';
export const BRIEF_MODEL_DEFAULT = 'claude-sonnet-5-5';
// Einstellungen aus der App (Über dich → KI); haben Vorrang vor der .env
let getAi = () => ({});
export const setAiSettings = (fn) => { getAi = fn; };
const ai = () => getAi() || {};

export const PROVIDERS = { anthropic: 'Claude', deepseek: 'DeepSeek' };
export const MODEL_OPTIONS = {
  anthropic: [['claude-sonnet-5-5', 'Sonnet 5.5 (zuverlässig)'], ['claude-haiku-5-5', 'Haiku 5.5 (günstig)']],
  deepseek: [['deepseek-flash', 'DeepSeek Flash'], ['deepseek-v4-pro', 'DeepSeek V4 Pro']],
};
export const ROLES = [['chat', 'Chat'], ['onboarding', 'Onboarding & Überblick'], ['brief', 'Morgenbrief'], ['proactive', 'Check-in, Woche, Fokus'], ['summary', 'Verlauf zusammenfassen']];

export const provider = (env) => ((ai().provider || env.AI_PROVIDER || 'anthropic').toLowerCase() === 'deepseek' ? 'deepseek' : 'anthropic');

/** Welches Modell für welche Aufgabe: chat | onboarding | brief | proactive | summary */
export function resolveModel(env, role = 'chat', p = provider(env)) {
  const chosen = ai().models?.[p]?.[role];
  if (chosen && MODEL_OPTIONS[p].some(([id]) => id === chosen)) return chosen;
  if (p === 'deepseek') {
    const chat = env.DEEPSEEK_MODEL || 'deepseek-flash';
    if (role === 'brief' || role === 'summary') return env.DEEPSEEK_BRIEF_MODEL || chat;
    if (role === 'onboarding') return env.DEEPSEEK_ONBOARDING_MODEL || chat;
    return chat;
  }
  if (role === 'brief' || role === 'summary') return env.BRIEF_MODEL || env.CLAUDE_MODEL || BRIEF_MODEL_DEFAULT;
  if (role === 'onboarding') return env.ONBOARDING_MODEL || 'claude-sonnet-5-5';
  return env.CLAUDE_MODEL || CHAT_MODEL_DEFAULT;
}

export function apiKey(env, p = provider(env)) {
  return p === 'deepseek' ? (env.DEEPSEEK_API_KEY || ai().keys?.deepseek) : (env.ANTHROPIC_API_KEY || ai().keys?.anthropic);
}
const endpoint = (env) => (provider(env) === 'deepseek' ? 'https://api.deepseek.com/anthropic/v1/messages' : 'https://api.anthropic.com/v1/messages');
let usageHook = null;
export const setUsageHook = (fn) => { usageHook = fn; };

export async function callClaude(env, { system, messages, tools, maxTokens = 2048, model }) {
  const useModel = model || resolveModel(env, 'chat');
  const r = await fetch(endpoint(env), {
    method: 'POST',
    headers: { 'x-api-key': apiKey(env), 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: useModel, max_tokens: maxTokens, system, messages, ...(tools?.length ? { tools } : {}) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${provider(env) === 'deepseek' ? 'DeepSeek' : 'Claude'} API ${r.status}: ${j.error?.message || 'Fehler'}`);
  try { usageHook?.(provider(env) === 'deepseek' ? useModel : (j.model || useModel), j.usage); } catch { /* egal */ }
  return j;
}

export const textOf = (content) => content.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
