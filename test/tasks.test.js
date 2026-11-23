import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskSync } from '../src/tasks.js';
import { executeTool } from '../src/tools.js';
import { defaultState } from '../src/store.js';

// Mini-Google-Aufgaben im Speicher, mit mehreren Listen
function fakeGoogle() {
  const lists = []; const store = {}; let n = 0; let clock = 0;
  const now = () => new Date(Date.UTC(2026, 10, 19, 12, 0, clock++)).toISOString();
  const tasksOf = (l) => (store[l] ||= new Map());
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(url); const p = u.pathname.replace('/tasks/v1', ''); const m = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    const ok = (j, s = 200) => ({ ok: true, status: s, json: async () => j });
    if (p === '/users/@me/lists' && m === 'GET') return ok({ items: lists });
    { const lm = p.match(/^\/users\/@me\/lists\/([^/]+)$/); if (lm && m === 'PATCH') { const l = lists.find((x) => x.id === decodeURIComponent(lm[1])); Object.assign(l, body); return ok(l); } }
    if (p === '/users/@me/lists' && m === 'POST') { const l = { id: `L${lists.length + 1}`, title: body.title }; lists.push(l); return ok(l); }
    const mm = p.match(/^\/lists\/([^/]+)\/tasks(?:\/([^/]+))?$/);
    if (mm) {
      const T = tasksOf(decodeURIComponent(mm[1])); const id = mm[2];
      if (!id && m === 'GET') return ok({ items: [...T.values()] });
      if (!id && m === 'POST') { const t = { id: `g${++n}`, status: 'needsAction', ...body, updated: now() }; T.set(t.id, t); return ok(t); }
      if (id && !T.has(id)) return { ok: false, status: 404, json: async () => ({ error: { message: 'Not found' } }) };
      if (m === 'PATCH') { const t = { ...T.get(id), ...body, updated: now() }; T.set(id, t); return ok(t); }
      if (m === 'DELETE') { T.delete(id); return { ok: true, status: 204, json: async () => ({}) }; }
    }
    throw new Error(`unerwartet ${m} ${p}`);
  };
  const listByName = (name) => lists.find((l) => l.title === name)?.id;
  return { lists, store, now, listByName, get tasks() { return tasksOf(listByName('Alle Aufgaben')); }, tasksIn: (name) => tasksOf(listByName(name)) };
}

test('tasks: Zwei-Wege-Sync mit Google Aufgaben', async () => {
  const G = fakeGoogle();
  const ctx = { env: {}, state: defaultState(), save() {}, today: () => '2026-11-19', tz: () => 'Atlantic/Madeira',
    calendar: { configured: true, accessToken: async () => 'tok' } };
  ctx.env.GOOGLE_TODAY = '0'; // in diesem Test nur die Hauptliste
  const sync = createTaskSync(ctx);
  ctx.tasks = { scheduleSync() {} };

  // lokal anlegen -> landet in Google, Liste "Alle Aufgaben" wird erstellt
  const t = await executeTool('add_todo', { title: 'Hühnerfutter kaufen', due: '2026-11-20' }, ctx);
  await sync.syncOnce();
  assert.ok(G.listByName('Alle Aufgaben'));
  const g1 = G.tasks.get(t.gtask_id);
  assert.equal(g1.title, 'Hühnerfutter kaufen'); assert.equal(g1.due, '2026-11-20T00:00:00.000Z'); assert.equal(t.dirty, false);

  // in Google neu angelegt -> kommt lokal an
  G.tasks.set('gx', { id: 'gx', title: 'Lea Turnbeutel', status: 'needsAction', updated: G.now() });
  // in Google abgehakt -> lokal erledigt
  G.tasks.set(t.gtask_id, { ...g1, status: 'completed', updated: G.now() });
  await sync.syncOnce();
  assert.ok(ctx.state.todos.find((x) => x.title === 'Lea Turnbeutel' && x.source === 'google'));
  assert.equal(ctx.state.todos.find((x) => x.id === t.id).done, true);

  // lokal löschen -> in Google gelöscht
  const local = ctx.state.todos.find((x) => x.gtask_id === 'gx');
  await executeTool('delete_todo', { id: local.id }, ctx);
  await sync.syncOnce();
  assert.equal(G.tasks.has('gx'), false);

  // in Google gelöscht (verschwindet) -> lokal weg
  G.tasks.delete(t.gtask_id);
  await sync.syncOnce();
  assert.equal(ctx.state.todos.length, 0);
});

test('tasks: Liste „Heute“ zeigt nur Heutiges, Abhaken erledigt in der App', async () => {
  const G = fakeGoogle();
  const ctx = { env: {}, state: defaultState(), save() {}, today: () => '2026-11-20', tz: () => 'Atlantic/Madeira',
    calendar: { configured: true, accessToken: async () => 'tok' } };
  ctx.tasks = { scheduleSync() {} };
  const sync = createTaskSync(ctx);
  const a = await executeTool('add_todo', { title: 'Hühnerfutter', due: '2026-11-20', time: '16:00' }, ctx);
  await executeTool('add_todo', { title: 'Steuer', due: '2026-11-18' }, ctx);
  await executeTool('add_todo', { title: 'Später', due: '2026-11-30' }, ctx);
  await executeTool('add_todo', { title: 'Ohne Datum' }, ctx);
  const r = await executeTool('add_recurring', { title: 'Stall misten', every: 2, unit: 'weeks', next_due: '2026-11-20' }, ctx);
  await executeTool('add_recurring', { title: 'Zahnarzt', every: 6, unit: 'months', next_due: '2027-03-01' }, ctx);
  await sync.syncOnce();
  const titles = () => [...G.tasksIn('Heute').values()].map((t) => t.title).sort();
  assert.deepEqual(titles(), ['Hühnerfutter · 16:00', 'Steuer (überfällig)', '↻ Stall misten']);

  // Im Widget abhaken -> in der App erledigt bzw. Routine weitergeschaltet, und aus „Heute“ entfernt
  const heute = G.tasksIn('Heute');
  for (const t of heute.values()) if (t.title.startsWith('Hühner') || t.title.startsWith('↻')) heute.set(t.id, { ...t, status: 'completed' });
  await sync.syncOnce();
  assert.equal(ctx.state.todos.find((t) => t.id === a.id).done, true);
  assert.equal(ctx.state.recurring.find((x) => x.id === r.id).next_due, '2026-12-04');
  assert.deepEqual(titles(), ['Steuer (überfällig)']);

  // Direkt in „Heute“ eingetragen -> wird Aufgabe für heute
  heute.set('neu', { id: 'neu', title: 'Lea abholen', status: 'needsAction', updated: G.now() });
  await sync.syncOnce();
  assert.ok(ctx.state.todos.find((t) => t.title === 'Lea abholen' && t.due === '2026-11-20'));

  // Neuer Tag: Liste wird neu aufgebaut
  ctx.today = () => '2026-11-30';
  await sync.syncOnce();
  assert.ok(titles().includes('Später'));
});

const mkSync = (G, today = '2026-11-20') => {
  const ctx = { env: {}, state: defaultState(), save() {}, today: () => today, tz: () => 'Atlantic/Madeira',
    calendar: { configured: true, accessToken: async () => 'tok' } };
  ctx.tasks = { scheduleSync() {} };
  return { ctx, sync: createTaskSync(ctx) };
};
const openTitles = (st) => st.todos.filter((t) => !t.done).map((t) => `${t.title}|${t.due}`).sort();

test('Bug: verlorene Zuordnung (z. B. nach „Alles löschen“) erzeugt keine Doppel mit ↻/(überfällig)', async () => {
  const G = fakeGoogle();
  const { ctx, sync } = mkSync(G);
  await executeTool('add_todo', { title: 'Weihnachtsbilder bei der Schule abholen', due: '2026-11-19', priority: 1 }, ctx);
  await executeTool('add_recurring', { title: 'Hühnerstall ausmisten', every: 2, unit: 'weeks', next_due: '2026-11-19' }, ctx);
  await sync.syncOnce();
  assert.deepEqual([...G.tasksIn('Heute').values()].map((t) => t.title).sort(), ['Weihnachtsbilder bei der Schule abholen (überfällig)', '↻ Hühnerstall ausmisten']);
  ctx.state.gtoday = null; // Zuordnung weg
  await sync.syncOnce(); await sync.syncOnce();
  assert.deepEqual(openTitles(ctx.state), ['Weihnachtsbilder bei der Schule abholen|2026-11-19']);
  assert.ok(ctx.state.todos.every((t) => !/↻|überfällig/.test(t.title)), 'keine Markierungen im Titel');
  assert.equal(G.tasksIn('Heute').size, 2, 'in „Heute“ steht jeder Punkt genau einmal');
});

test('Akzeptanz: zwei Sync-Läufe ändern die Anzahl nicht', async () => {
  const G = fakeGoogle();
  const { ctx, sync } = mkSync(G);
  await executeTool('add_todo', { title: 'A', due: '2026-11-20' }, ctx);
  await executeTool('add_todo', { title: 'B', due: '2026-11-18' }, ctx);
  await executeTool('add_recurring', { title: 'C', every: 1, unit: 'weeks', next_due: '2026-11-20' }, ctx);
  await sync.syncOnce();
  const n = ctx.state.todos.length, h = G.tasksIn('Heute').size, m = G.tasksIn('Alle Aufgaben').size;
  await sync.syncOnce(); await sync.syncOnce();
  assert.equal(ctx.state.todos.length, n); assert.equal(G.tasksIn('Heute').size, h); assert.equal(G.tasksIn('Alle Aufgaben').size, m);
});

test('Akzeptanz: in der App gelöscht bleibt gelöscht, auch wenn Google es noch liefert', async () => {
  const G = fakeGoogle();
  const { ctx, sync } = mkSync(G);
  const t = await executeTool('add_todo', { title: 'Weg damit', due: '2026-11-25' }, ctx);
  await sync.syncOnce();
  const gid = ctx.state.todos[0].gtask_id;
  const snapshotCopy = { ...G.tasksIn('Alle Aufgaben').get(gid) };
  await executeTool('delete_todo', { id: t.id }, ctx);
  await sync.syncOnce();
  G.tasksIn('Alle Aufgaben').set(gid, snapshotCopy); // Google liefert es (z. B. verzögert) erneut
  await sync.syncOnce();
  assert.equal(ctx.state.todos.length, 0);
  assert.equal(G.tasksIn('Alle Aufgaben').has(gid), false);
});

test('Akzeptanz: in Google verschobenes Datum aktualisiert das bestehende Todo', async () => {
  const G = fakeGoogle();
  const { ctx, sync } = mkSync(G);
  await executeTool('add_todo', { title: 'Zahnarzt', due: '2026-11-21' }, ctx);
  await sync.syncOnce();
  const gid = ctx.state.todos[0].gtask_id;
  const r = G.tasksIn('Alle Aufgaben').get(gid);
  G.tasksIn('Alle Aufgaben').set(gid, { ...r, due: '2026-11-28T00:00:00.000Z', updated: G.now() });
  await sync.syncOnce();
  assert.deepEqual(openTitles(ctx.state), ['Zahnarzt|2026-11-28']);
});

test('Bereinigung: vorhandene Doppel und Routine-Schatten werden zusammengeführt', async () => {
  const { dedupeTodos } = await import('../src/tasks.js');
  const st = defaultState();
  st.recurring = [{ id: 'r', title: 'Hühnerstall ausmisten', every: 2, unit: 'weeks', next_due: '2026-11-19' }];
  st.todos = [
    { id: '1', title: 'Weihnachtsbilder bei der Schule abholen', due: '2026-11-19', priority: 1, done: false, created: '2026-11-15', gtask_id: 'g1' },
    { id: '2', title: 'Weihnachtsbilder bei der Schule abholen (überfällig)', due: '2026-11-20', priority: 2, done: false, created: '2026-11-20', gtask_id: 'g2', source: 'google-heute' },
    { id: '3', title: '↻ Hühnerstall ausmisten', due: '2026-11-20', priority: 2, done: false, created: '2026-11-20', gtask_id: 'g3' },
    { id: '4', title: 'Einkaufen', due: '2026-11-21', done: false }, { id: '5', title: 'Einkaufen', due: '2026-11-28', done: false },
  ];
  assert.equal(dedupeTodos(st), 2);
  assert.deepEqual(st.todos.map((t) => `${t.id}:${t.title}:P${t.priority ?? 2}`), ['1:Weihnachtsbilder bei der Schule abholen:P1', '4:Einkaufen:P2', '5:Einkaufen:P2']);
  assert.deepEqual(st.gtask_deletes.sort(), ['g2', 'g3']);
});

test('tasks: alte Liste „Mein Tag“ wird zu „Alle Aufgaben“ umbenannt, nicht doppelt angelegt', async () => {
  const G = fakeGoogle();
  G.lists.push({ id: 'Lold', title: 'Mein Tag' });
  G.store.Lold = new Map([['g99', { id: 'g99', title: 'Steuer', status: 'needsAction', updated: G.now() }]]);
  const ctx = { env: { GOOGLE_TODAY: '0', GOOGLE_TASKLIST: 'Mein Tag' }, state: defaultState(), save() {}, today: () => '2026-11-19', tz: () => 'Atlantic/Madeira',
    calendar: { configured: true, accessToken: async () => 'tok' } };
  const sync = createTaskSync(ctx); ctx.tasks = { scheduleSync() {} };
  await sync.syncOnce();
  assert.deepEqual(G.lists.map((l) => l.title), ['Alle Aufgaben'], 'alter Standard aus .env wird ignoriert');
  assert.equal(G.listByName('Alle Aufgaben'), 'Lold');
  assert.ok(ctx.state.todos.some((t) => t.title === 'Steuer'));
});
