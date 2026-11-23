// Vollständiger Onboarding-Überblick direkt aus den gespeicherten Daten (ohne KI, ohne Kürzung).
import { personaOf } from './personas.js';
import { langName } from './lang.js';

const TIER = { gift: 'Geschenk', card: 'Karte/Nachricht', call: 'Anruf/Nachricht' };
const UNIT = { days: 'Tage', weeks: 'Wochen', months: 'Monate', years: 'Jahre' };
const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const fmtBday = (b) => { if (!b) return 'Geburtstag fehlt'; const p = b.split('-'); return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : `${p[1]}.${p[0]}.`; };
const ent = (state, kinds) => state.entities.filter((e) => kinds.includes((e.kind || '').toLowerCase()));
const line = (e) => `- ${e.name}${e.details ? `: ${e.details}` : ''}`;

export function buildOverview(state) {
  const p = state.profile;
  const P = personaOf(p);
  const S = [];
  const sec = (title, lines) => S.push(`*${title}*\n${lines.length ? lines.join('\n') : '- Noch leer'}`);

  sec('Basics', [
    `- Name: ${p.name || 'fehlt'}`,
    `- Dein Geburtstag: ${p.birthday ? fmtBday(p.birthday) : 'fehlt'}`,
    `- Wohnort (Wetter): ${p.location?.name || 'fehlt'}`,
    `- Morgenbrief um: ${p.brief_time || '07:30'}`,
    `- Sprache: ${langName(p)}`,
    `- Meine Persönlichkeit: ${P.label}${p.assistant_name ? `, Name: ${p.assistant_name}` : ', noch kein Name'}`,
  ]);
  sec('Über dich', (p.about || '').split('\n').map((l) => l.trim()).filter(Boolean).map((l) => `- ${l.replace(/^[-•]\s*/, '')}`));
  sec('Tagesablauf', p.daily_schedule ? p.daily_schedule.split('\n').filter(Boolean).map((l) => `- ${l.replace(/^-\s*/, '')}`) : []);
  sec('Wichtige Menschen & Geburtstage', state.people.map((x) => `- ${x.name}${x.relation ? ` (${x.relation})` : ''}: ${fmtBday(x.birthday)} · ${TIER[x.tier || 'call']}${x.tier === 'gift' ? `, ${x.gift_lead_days ?? 21} Tage Vorlauf` : ''}${x.notes ? ` · ${x.notes}` : ''}`));
  sec('Ziele, Routinen & Hobbys', ent(state, ['ziel', 'routine', 'hobby']).map((e) => `- ${e.kind[0].toUpperCase() + e.kind.slice(1)}: ${e.name}${e.details ? ` – ${e.details}` : ''}`));
  sec('Kinder & Familie', ent(state, ['kind', 'kinder', 'familie']).map(line));
  sec('Haustiere & Tiere', ent(state, ['tier', 'tiere', 'haustier']).map(line));
  sec('Zuhause & Land', ent(state, ['ort', 'zuhause', 'land', 'haus', 'grundstück']).map(line));
  const known = new Set(['ziel', 'routine', 'hobby', 'kind', 'kinder', 'familie', 'tier', 'tiere', 'haustier', 'ort', 'zuhause', 'land', 'haus', 'grundstück']);
  const other = state.entities.filter((e) => !known.has((e.kind || '').toLowerCase()));
  if (other.length) sec('Sonstiges', other.map((e) => `- ${e.kind ? `${e.kind}: ` : ''}${e.name}${e.details ? ` – ${e.details}` : ''}`));
  sec('Wiederkehrende Aufgaben', state.recurring.map((r) => `- ${r.title}: alle ${r.every} ${UNIT[r.unit] || r.unit}, nächstes Mal ${r.next_due}${r.subject ? ` (${r.subject})` : ''}`));
  sec('Feiertage & Feste', state.holidays.map((h) => `- ${h.name}: ${h.date.length === 5 ? `${h.date.slice(3)}.${h.date.slice(0, 2)}.` : h.date}, ${h.lead_days ?? 21} Tage Vorlauf${h.notes ? ` · ${h.notes}` : ''}`));
  sec('Gesundheit & Vorsorge', state.recurring.filter((r) => /gesund|arzt|vorsorge|zahn/i.test(`${r.category || ''} ${r.title}`)).map((r) => `- ${r.title}: nächstes Mal ${r.next_due}`));
  sec('Reisen', state.trips.map((t) => `- ${t.title}: ${t.start}${t.end ? ` bis ${t.end}` : ''}${t.destination ? `, ${t.destination}` : ''}${t.packing?.length ? ` · Packliste: ${t.packing.join(', ')}` : ''}`));
  const news = p.news || {};
  sec('Nachrichten & Brief', [
    `- Nachrichten: ${[['world', 'Welt'], ['pt', 'Portugal'], ['de', 'Deutschland']].filter(([k]) => news[k]).map(([, l]) => l).join(', ') || 'aus'}`,
    ...(p.news_topics?.length ? [`- Eigene Themen: ${p.news_topics.join(', ')}`] : []),
    `- Weitere Wetter-Orte: ${(p.weather_places || []).map((w) => `${w.name}${w.label ? ` (${w.label})` : ''}`).join(', ') || 'keine'}`,
    `- Abend-Check-in: ${p.checkin_enabled === false ? 'aus' : p.checkin_time || '20:30'} · Wochenplanung: ${p.weekly_enabled === false ? 'aus' : `${WD[p.weekly_day ?? 0]} ${p.weekly_time || '18:00'}`}`,
  ]);
  sec('Das habe ich gelernt', state.memory.map((m) => `- ${m.text}`));
  if (state.history_summary) sec('Aus früheren Gesprächen', state.history_summary.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => (l.startsWith('-') ? l : `- ${l}`)));
  return S.join('\n\n');
}
