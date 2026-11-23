import fs from 'node:fs';
import path from 'node:path';

export const defaultState = () => ({
  version: 1,
  owner: null,
  profile: { name: null, birthday: null, about: '', assistant_name: null, persona: 'freundin', assistant_gender: 'f', language: 'de', chat_retention_days: 30, due_notify_enabled: true, due_notify_time: '09:00', checkin_enabled: true, checkin_time: '20:30', weekly_enabled: true, weekly_day: 0, weekly_time: '18:00', warnings_enabled: true, holidays_auto: true, weather_places: [], news: { world: true, pt: false, de: true }, tz: null, location: null, brief_time: '07:30', news_topics: [], daily_schedule: '', notes: '' },
  onboarding: { started: false, done: false, sections: {} },
  todos: [], people: [], entities: [], recurring: [], holidays: [], trips: [], holiday_cache: {},
  memory: [], feedback: [], history: [], history_summary: '', chat_log: [], push_subs: [], widget_token: null, gtask_deletes: [], reminder_keys: [], undo_stack: [], timed: [], focus: null, warn_seen: [], usage: {}, avatars: { user: null, assistant: null }, google: {}, ai: { provider: null, models: { anthropic: {}, deepseek: {} }, keys: {} },
  pending_brief: null, last_brief_date: null, last_brief: null, last_inbound_ts: 0, awaiting_feedback: false,
});

export function createStore(file) {
  let state = defaultState();
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const d = defaultState();
    state = { ...d, ...raw, profile: { ...d.profile, ...raw.profile, news: { ...d.profile.news, ...raw.profile?.news } }, onboarding: { ...d.onboarding, ...raw.onboarding } };
  } catch { /* neue Datei */ }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }
  return { state, save };
}
