// Zwei-Wege-Abgleich der Todos mit einer Google-Aufgaben-Liste (Standard: "Alle Aufgaben", früher "Mein Tag").
// Lokale Änderungen gewinnen bei Konflikten; danach werden Änderungen aus Google übernommen.
import { rid } from './util.js';
import { advanceRecurring } from './signals.js';

const API = 'https://tasks.googleapis.com/tasks/v1';

// Anzeige-Markierungen, die nur in der Google-Liste „Heute“ stehen dürfen, nie im gespeicherten Titel
const MARKER = /^\s*↻\s*|\s*\(überfällig\)\s*$|\s*·\s*\d{1,2}:\d{2}\s*$/;
export const hasMarker = (t) => MARKER.test(String(t || ''));
export function cleanTitle(t) {
  return String(t || '').replace(/^\s*↻\s*/, '').replace(/\s*\(überfällig\)\s*$/i, '').replace(/\s*·\s*\d{1,2}:\d{2}\s*$/, '').trim();
}
export const normTitle = (t) => cleanTitle(t).toLowerCase().replace(/\s+/g, ' ');

function tombstone(st, gid) {
  if (!gid) return;
  st.gtask_tombstones = [...new Set([...(st.gtask_tombstones || []), gid])].slice(-300);
}

/** Einmalige Bereinigung: Markierungen aus Titeln, Routine-Schatten entfernen, Doppelte zusammenführen. */
export function dedupeTodos(st) {
  const removed = [];
  const recNames = new Set((st.recurring || []).map((r) => normTitle(r.title)));
  for (const t of st.todos) {
    if (!hasMarker(t.title)) continue;
    t._wasShadow = /^\s*↻/.test(t.title);
    t._marker = true;
    t.title = cleanTitle(t.title); t.dirty = true;
  }
  // Routine-Schatten: „↻ X“-Todos, die einer Routine entsprechen
  st.todos = st.todos.filter((t) => {
    if (!t.done && t._wasShadow && recNames.has(normTitle(t.title))) { removed.push(t); return false; }
    return true;
  });
  // Doppelte offene Todos mit gleichem Titel zusammenführen (wenn eins aus „Heute“ stammt oder gleiche Fälligkeit)
  const groups = new Map();
  for (const t of st.todos.filter((x) => !x.done)) { const k = normTitle(t.title); (groups.get(k) || groups.set(k, []).get(k)).push(t); }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const dupLike = list.some((t) => t._marker || t.source === 'google-heute') || new Set(list.map((t) => t.due)).size < list.length;
    if (!dupLike) continue;
    const rank = (t) => [t._marker || t.source === 'google-heute' ? 1 : 0, t.priority ?? 2, t.created || '9999'];
    list.sort((a, b) => { const x = rank(a), y = rank(b); return x[0] - y[0] || x[1] - y[1] || String(x[2]).localeCompare(String(y[2])); });
    const keep = list[0];
    keep.priority = Math.min(...list.map((t) => t.priority ?? 2));
    for (const t of list.slice(1)) { removed.push(t); }
    const ids = new Set(list.slice(1).map((t) => t.id));
    st.todos = st.todos.filter((t) => !ids.has(t.id));
  }
  for (const t of removed) if (t.gtask_id) { (st.gtask_deletes ||= []).push(t.gtask_id); tombstone(st, t.gtask_id); }
  for (const t of st.todos) { delete t._marker; delete t._wasShadow; }
  if (st.gtoday) st.gtoday.items = Object.fromEntries(Object.entries(st.gtoday.items || {}).filter(([k]) => !removed.some((t) => k === `todo:${t.id}`)));
  return removed.length;
}

export function createTaskSync(ctx) {
  const { env } = ctx;
  const isOn = () => !!ctx.calendar?.configured && env.GOOGLE_TASKS !== '0';
  let listId = null, todayListId = null, running = null, again = false, timer = null;

  async function g(p, opts = {}) {
    const r = await fetch(API + p, { ...opts, headers: { Authorization: `Bearer ${await ctx.calendar.accessToken()}`, 'Content-Type': 'application/json' } });
    if (r.status === 204) return {};
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(`Google Aufgaben: ${j.error?.message || r.status}`); e.status = r.status; throw e; }
    return j;
  }
  async function all(p) {
    const items = []; let page;
    do {
      const j = await g(`${p}${p.includes('?') ? '&' : '?'}maxResults=100${page ? `&pageToken=${page}` : ''}`);
      items.push(...(j.items || [])); page = j.nextPageToken;
    } while (page);
    return items;
  }
  async function findOrCreateList(name, oldName = null) {
    const lists = await all('/users/@me/lists');
    const found = lists.find((l) => l.title === name);
    if (found) return found.id;
    // alte Liste umbenennen statt neu anlegen (behält alle Aufgaben und Verknüpfungen)
    const old = oldName && lists.find((l) => l.title === oldName);
    if (old) { await g(`/users/@me/lists/${encodeURIComponent(old.id)}`, { method: 'PATCH', body: JSON.stringify({ title: name }) }); console.log(`Google Aufgaben: Liste „${oldName}“ heißt jetzt „${name}“`); return old.id; }
    return (await g('/users/@me/lists', { method: 'POST', body: JSON.stringify({ title: name }) })).id;
  }
  async function ensureList() {
    // „Mein Tag“ war früher der Standard (auch in .env.example) – dann gilt der neue Name und die alte Liste wird umbenannt
    const custom = env.GOOGLE_TASKLIST && env.GOOGLE_TASKLIST.trim() !== 'Mein Tag' ? env.GOOGLE_TASKLIST.trim() : null;
    if (!listId) listId = await findOrCreateList(custom || 'Alle Aufgaben', custom ? null : 'Mein Tag');
    return listId;
  }
  async function ensureTodayList() {
    if (!todayListId) todayListId = await findOrCreateList(env.GOOGLE_TODAY_LIST || 'Heute');
    return todayListId;
  }

  /** Liste „Heute“: nur heute fällige/überfällige Aufgaben und fällige Routinen. Abhaken dort erledigt in der App. */
  async function syncToday() {
    if (env.GOOGLE_TODAY === '0') return;
    const st = ctx.state; const today = ctx.today();
    const L = encodeURIComponent(await ensureTodayList());
    const map = (st.gtoday ||= { date: today, items: {}, dismissed: [] });
    if (map.date !== today) { map.date = today; map.dismissed = []; }
    let changed = false;

    // 1. Was wurde in Google abgehakt, gelöscht oder neu eingetragen?
    const remote = await all(`/lists/${L}/tasks?showCompleted=true&showHidden=true&showDeleted=true`);
    const byGid = Object.fromEntries(Object.entries(map.items).map(([k, gid]) => [gid, k]));
    // Kandidaten, die in „Heute“ gehören (für Einträge, deren Zuordnung verloren ging)
    const candidates = [
      ...st.todos.filter((x) => !x.done && x.due && x.due <= today).map((t) => [`todo:${t.id}`, normTitle(t.title)]),
      ...st.recurring.filter((x) => x.next_due <= today).map((r) => [`rec:${r.id}:${r.next_due}`, normTitle(r.title)]),
    ];
    const mappedKeys = new Set(Object.keys(map.items));
    for (const r of remote) {
      const key = byGid[r.id];
      if (!key) {
        if (r.deleted || r.status === 'completed' || !r.title?.trim()) continue;
        const nt = normTitle(r.title);
        const match = candidates.find(([k, n]) => n === nt && !mappedKeys.has(k));
        if (match) { map.items[match[0]] = r.id; mappedKeys.add(match[0]); byGid[r.id] = match[0]; continue; } // wiedererkannt
        if (hasMarker(r.title)) { // eigener, verwaister Eintrag (z. B. nach „Alles löschen“): weg damit, nicht importieren
          try { await g(`/lists/${L}/tasks/${r.id}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) throw e; }
          continue;
        }
        // Wirklich neu von ihr in „Heute“ eingetragen: vorhandenes offenes Todo gleichen Namens auf heute legen, sonst neu anlegen
        const existing = st.todos.find((x) => !x.done && normTitle(x.title) === nt);
        if (existing) { if (existing.due !== today) { existing.due = today; existing.dirty = true; } map.items[`todo:${existing.id}`] = r.id; mappedKeys.add(`todo:${existing.id}`); }
        else {
          const t = { id: rid(), title: cleanTitle(r.title), due: today, time: null, priority: 2, category: null, notes: r.notes || null, done: false, created: today, dirty: true, source: 'google-heute' };
          st.todos.push(t); map.items[`todo:${t.id}`] = r.id; mappedKeys.add(`todo:${t.id}`);
        }
        changed = true;
        continue;
      }
      if (r.deleted) { delete map.items[key]; map.dismissed.push(key); continue; }
      if (r.status === 'completed') {
        const [kind, id] = key.split(':');
        if (kind === 'todo') { const t = st.todos.find((x) => x.id === id); if (t && !t.done) { t.done = true; t.done_at = today; t.dirty = true; changed = true; } }
        if (kind === 'rec') { const rr = st.recurring.find((x) => x.id === id); if (rr && rr.next_due <= today) { advanceRecurring(rr, today); changed = true; } }
      }
    }
    // 2. Soll-Zustand
    const want = {};
    for (const t of st.todos.filter((x) => !x.done && x.due && x.due <= today)) want[`todo:${t.id}`] = { title: `${t.title}${t.time ? ` · ${t.time}` : ''}${t.due < today ? ' (überfällig)' : ''}`, notes: t.notes || '' };
    for (const r of st.recurring.filter((x) => x.next_due <= today)) want[`rec:${r.id}:${r.next_due}`] = { title: `↻ ${r.title}`, notes: r.notes || '' };
    // 3. Überflüssiges entfernen (erledigt, verschoben, abgehakt)
    for (const [key, gid] of Object.entries(map.items)) {
      if (want[key]) continue;
      try { await g(`/lists/${L}/tasks/${gid}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) throw e; }
      delete map.items[key];
    }
    // 4. Fehlendes anlegen, Titel aktuell halten
    const remoteById = Object.fromEntries(remote.map((r) => [r.id, r]));
    for (const [key, w] of Object.entries(want)) {
      if (map.dismissed.includes(key)) continue;
      const gid = map.items[key];
      if (!gid) { map.items[key] = (await g(`/lists/${L}/tasks`, { method: 'POST', body: JSON.stringify({ title: w.title, notes: w.notes, due: `${today}T00:00:00.000Z` }) })).id; continue; }
      const r = remoteById[gid];
      if (r && r.title !== w.title && r.status !== 'completed') await g(`/lists/${L}/tasks/${gid}`, { method: 'PATCH', body: JSON.stringify({ title: w.title }) });
    }
    ctx.save();
    if (changed) again = true; // Erledigtes auch in der Hauptliste nachziehen
  }
  const toRemote = (t) => ({
    title: t.title, notes: t.notes || '', due: t.due ? `${t.due}T00:00:00.000Z` : null,
    status: t.done ? 'completed' : 'needsAction', ...(t.done ? {} : { completed: null }),
  });

  async function syncOnce() {
    const st = ctx.state;
    const L = encodeURIComponent(await ensureList());
    // 1. Löschungen hochladen
    for (const id of st.gtask_deletes || []) {
      try { await g(`/lists/${L}/tasks/${id}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) throw e; }
      tombstone(st, id);
    }
    st.gtask_deletes = [];
    // 2. Lokale Änderungen hochladen
    for (const t of st.todos.filter((x) => x.dirty)) {
      let r;
      try {
        r = t.gtask_id
          ? await g(`/lists/${L}/tasks/${t.gtask_id}`, { method: 'PATCH', body: JSON.stringify(toRemote(t)) })
          : await g(`/lists/${L}/tasks`, { method: 'POST', body: JSON.stringify(toRemote(t)) });
      } catch (e) {
        if (e.status !== 404 || !t.gtask_id) throw e;
        r = await g(`/lists/${L}/tasks`, { method: 'POST', body: JSON.stringify(toRemote(t)) }); // in Google gelöscht -> neu anlegen
      }
      t.gtask_id = r.id; t.g_updated = r.updated; t.dirty = false;
    }
    ctx.save();
    // 3. Änderungen aus Google übernehmen
    const remote = await all(`/lists/${L}/tasks?showCompleted=true&showHidden=true&showDeleted=true`);
    const byG = new Map(st.todos.filter((t) => t.gtask_id).map((t) => [t.gtask_id, t]));
    const gone = new Set();
    const tomb = new Set(st.gtask_tombstones || []);
    const recNames = new Set(st.recurring.map((x) => normTitle(x.title)));
    for (const r of remote) {
      let local = byG.get(r.id);
      if (r.deleted) { if (local && !local.dirty) gone.add(local.id); continue; }
      if (!r.title?.trim()) continue;
      if (tomb.has(r.id) && !local) { // in der App gelöscht: nicht wiederherstellen
        try { await g(`/lists/${L}/tasks/${r.id}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) throw e; }
        continue;
      }
      const fields = { title: cleanTitle(r.title), notes: r.notes || null, due: r.due ? r.due.slice(0, 10) : null, done: r.status === 'completed' };
      if (!local) {
        if (fields.done) continue;
        if (/^\s*↻/.test(r.title) && recNames.has(normTitle(r.title))) { // Routine-Schatten gehört nicht in die Liste
          try { await g(`/lists/${L}/tasks/${r.id}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404) throw e; }
          continue;
        }
        // Wiedererkennen: offenes Todo gleichen Namens ohne gültige Google-Verknüpfung
        const remoteIds = new Set(remote.map((x) => x.id));
        local = st.todos.find((t) => !t.done && normTitle(t.title) === normTitle(r.title) && (!t.gtask_id || !remoteIds.has(t.gtask_id)) && (!t.due || !fields.due || t.due === fields.due || hasMarker(r.title)));
        if (local) { local.gtask_id = r.id; local.g_updated = r.updated; byG.set(r.id, local); if (!local.dirty && fields.due) local.due = fields.due; continue; }
        st.todos.push({ id: rid(), ...fields, priority: 2, category: null, created: ctx.today(), gtask_id: r.id, g_updated: r.updated, dirty: hasMarker(r.title), source: 'google' });
      } else if (!local.dirty && r.updated !== local.g_updated) {
        if (fields.done && !local.done) local.done_at = ctx.today();
        Object.assign(local, fields, { g_updated: r.updated });
      }
    }
    const ids = new Set(remote.map((r) => r.id));
    st.todos = st.todos.filter((t) => !gone.has(t.id) && (!t.gtask_id || t.dirty || ids.has(t.gtask_id)));
    ctx.save();
    await syncToday();
  }

  function sync() {
    if (!isOn()) return Promise.resolve();
    if (running) { again = true; return running; }
    running = syncOnce()
      .catch((e) => console.error('Aufgaben-Sync:', e.message))
      .finally(() => { running = null; if (again) { again = false; sync(); } });
    return running;
  }
  function scheduleSync() {
    if (!isOn()) return;
    clearTimeout(timer); timer = setTimeout(sync, 3000);
  }
  function start(intervalMs = 5 * 60_000) {
    sync(); setInterval(sync, intervalMs); // prüft bei jedem Lauf, ob Google verbunden ist
  }
  return { get configured() { return isOn(); }, dedupe: () => dedupeTodos(ctx.state), sync, syncOnce, syncToday, scheduleSync, start, reset() { listId = null; todayListId = null; } };
}
