// Nutzung der Claude-API mitschreiben und Kosten schätzen (USD pro 1 Mio. Tokens).
export const PRICES = {
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-haiku-5-5': { in: 0.10, out: 0.50 },
  'deepseek-flash': { in: 0.14, out: 0.28 },
  'deepseek-v4-pro': { in: 0.43, out: 0.87 },
};
const SEARCH_USD = 10 / 1000;

export function recordUsage(state, model, u, month) {
  if (!u) return;
  const m = ((state.usage ||= {})[month] ||= {});
  const r = (m[model] ||= { calls: 0, in: 0, out: 0, searches: 0 });
  r.calls += 1;
  r.in += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  r.out += u.output_tokens || 0;
  r.searches += u.server_tool_use?.web_search_requests || 0;
  const months = Object.keys(state.usage).sort();
  for (const old of months.slice(0, -6)) delete state.usage[old];
}

export function usageSummary(state, month) {
  const m = state.usage?.[month] || {};
  let usd = 0, calls = 0, known = true;
  const rows = [];
  for (const [model, r] of Object.entries(m)) {
    const p = PRICES[model]; calls += r.calls;
    const cost = p ? (r.in / 1e6) * p.in + (r.out / 1e6) * p.out + r.searches * SEARCH_USD : null;
    if (cost === null) known = false; else usd += cost;
    rows.push({ model, provider: model.startsWith('deepseek') ? 'DeepSeek' : model.startsWith('claude') ? 'Claude' : 'Andere', calls: r.calls, usd: cost === null ? null : Math.round(cost * 10000) / 10000 });
  }
  rows.sort((a, b) => (b.usd ?? 0) - (a.usd ?? 0));
  return { month, calls, usd: Math.round(usd * 10000) / 10000, known, models: m, rows };
}
