// Mein Tag – App-Logik (ohne Framework)
import { getLang, locale, setLang, startI18n, tr, missing } from './i18n.js';
import { GOOGLE_STEPS } from './i18n-dict.js';
window.__i18nMissing = missing;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const S = { tab: 'chat', messages: [], today: null, profile: null, pushOn: false, busy: false, name: null, botName: null, avatars: { user: null, assistant: null } };

const ICON = {
  sun: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg>',
  gift: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1s6 1 6 1zM12 8c2-4 6-4 6-1s-6 1-6 1z"/></svg>',
  repeat: '<svg class="ico-repeat" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16"/><path d="M20 21v-5h-5"/></svg>',
  check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>',
  x: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

// ---------- Hilfen ----------
// Bezeichnungen je nach Geschlecht der Assistenz
const BOT = {
  f: { die: 'deine Assistentin', dat: 'deiner Assistentin', gen: 'deiner Assistentin', name: 'Name deiner Assistentin', give: 'Gib ihr einen Namen', pic: 'Bild deiner Assistentin' },
  m: { die: 'dein Assistent', dat: 'deinem Assistenten', gen: 'deines Assistenten', name: 'Name deines Assistenten', give: 'Gib ihm einen Namen', pic: 'Bild deines Assistenten' },
  d: { die: 'deine Assistenz', dat: 'deiner Assistenz', gen: 'deiner Assistenz', name: 'Name deiner Assistenz', give: 'Gib einen Namen', pic: 'Bild deiner Assistenz' },
};
const bot = () => BOT[S.botGender] || BOT.f;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isoToDe = (s) => String(s ?? '').replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3.$2.$1');
const PRIO = { 1: 'hoch', 2: 'normal', 3: 'niedrig' };
const prioBadge = (n) => `<span class="prio p${n}" title="Priorität ${PRIO[n]}">P${n}</span>`;
const inline = (s) => esc(isoToDe(s))
  .replace(/(^|[\s(\[])\[?P([1-3])\]?(?=[\s:.,;)\]–-]|$)/g, (_, a, n) => a + prioBadge(n))
  .replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>')
  .replace(/(^|[\s(])_([^_\n]+)_(?=$|[\s.,!?)])/g, '$1<em>$2</em>');

function richText(text) {
  const out = []; let list = null;
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    const ul = line.match(/^\s*[-•]\s+(.*)$/), ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (ul || ol) {
      const tag = ul ? 'ul' : 'ol';
      if (list !== tag) { if (list) out.push(`</${list}>`); list = tag; out.push(`<${tag}>`); }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }
    if (list) { out.push(`</${list}>`); list = null; }
    if (line.trim()) out.push(`<p>${inline(line)}</p>`);
  }
  if (list) out.push(`</${list}>`);
  return out.join('');
}

function briefHtml(text) {
  const lines = text.split('\n');
  const first = lines.findIndex((l) => l.trim());
  const title = (lines[first] || 'Guten Morgen').replace(/\*/g, '').trim();
  let html = '', cur = [];
  const flush = () => { if (cur.length) html += `<div class="nt" data-no-i18n>${richText(cur.join('\n'))}</div>`; cur = []; };
  for (const line of lines.slice(first + 1)) {
    const m = line.match(/^\s*\*([^*]{2,40})\*\s*(?:[–—-]\s*)?(.*)$/);
    if (m) { flush(); html += `<h3 data-no-i18n>${esc(m[1])}</h3>`; if (m[2]) cur.push(m[2]); } else cur.push(line);
  }
  flush();
  return `<div class="brief-head">${avatarHtml('assistant', 40)}<div><h2 data-no-i18n>${esc(title)}</h2><p class="body-m muted">Dein Tagesplan${S.botName ? ` von ${esc(S.botName)}` : ''}</p></div></div>${html}`;
}

const dayKey = (ts) => new Date(ts).toDateString();
function dayLabel(ts) {
  const d = new Date(ts), now = new Date(), y = new Date(); y.setDate(now.getDate() - 1);
  const time = d.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return `Heute, ${time}`;
  if (d.toDateString() === y.toDateString()) return `Gestern, ${time}`;
  return `${d.toLocaleDateString(locale(), { weekday: 'short' })} ${d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' })}, ${time}`;
}
const numDate = (d) => d.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit', year: 'numeric' });
const regionName = (cc) => { try { return new Intl.DisplayNames([locale()], { type: 'region' }).of(cc); } catch { return cc; } };
const longDate = () => `${new Date().toLocaleDateString(locale(), { weekday: 'long' })}, ${numDate(new Date())}`;
const addDaysISO = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
const shortDate = (iso) => { const d = new Date(`${iso}T12:00:00`); return `${d.toLocaleDateString(locale(), { weekday: 'short' })} ${numDate(d)}`; };

let toastTimer;
function toast(msg, action) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-action">${esc(action.label)}</button>` : ''}`;
  t.hidden = false;
  if (action) t.querySelector('.toast-action').addEventListener('click', () => { t.hidden = true; action.run(); }, { once: true });
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, action ? 7000 : 4000);
}

async function undo() {
  try {
    const j = await api('/api/undo', {});
    if (!j.undone) { toast('Nichts zum Rückgängigmachen'); return; }
    S.today = { ...j.today, events: S.today?.events };
    if (S.tab === 'today') loadDay();
    toast(j.undone.type === 'cleared' ? `Wiederhergestellt: ${j.undone.title}` : `Wieder offen: ${j.undone.title}`);
  } catch (e) { toast(e.message); }
}
document.addEventListener('keydown', (e) => {
  if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return;
  const el = document.activeElement;
  if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return; // dort normales Rückgängig
  if ($('#app').hidden) return;
  e.preventDefault(); undo();
});

function avatarHtml(who, size) {
  const v = S.avatars[who];
  const cls = `av av-${size}${who === 'assistant' ? ' bot' : ''}`;
  if (v) return `<span class="${cls}"><img src="/api/avatar/${who}?v=${encodeURIComponent(v)}" alt=""></span>`;
  if (who === 'assistant') return `<span class="${cls}">${ICON.sun}</span>`;
  return `<span class="${cls}">${esc((S.name || '?').trim().charAt(0).toUpperCase())}</span>`;
}
function setAvatarEl(el, who) {
  const tmp = document.createElement('div'); tmp.innerHTML = avatarHtml(who, 40);
  const n = tmp.firstElementChild; el.className = n.className; el.innerHTML = n.innerHTML;
}
function renderIdentity() {
  $('#chat-title').textContent = S.botName || 'Mein Tag';
  setAvatarEl($('#chat-avatar'), 'assistant');
  setAvatarEl($('#avatar'), 'user');
}
function applyMeta(j) {
  if ('name' in j) S.name = j.name;
  if ('assistant_name' in j) S.botName = j.assistant_name;
  if ('assistant_gender' in j) S.botGender = j.assistant_gender;
  if (j.avatars) S.avatars = j.avatars;
  if (j.language) setLang(j.language, rerenderAll);
  renderIdentity();
}

/** Nach einem Sprachwechsel alles neu zeichnen. */
function rerenderAll() {
  $('#chat-date') && ($('#chat-date').textContent = longDate());
  $('#today-date') && ($('#today-date').textContent = 'Alles auf einen Blick');
  renderIdentity();
  renderMessages();
  if (S.today) renderToday();
  if (S.profile) renderProfile();
}

async function api(path, body) {
  const opts = body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const r = await fetch(path, { credentials: 'same-origin', ...opts });
  if (r.status === 401) { showLogin(); throw new Error('Bitte neu anmelden'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Fehler ${r.status}`);
  return j;
}

// ---------- Anmeldung ----------
function showLogin() { $('#app').hidden = true; $('#login').hidden = false; $('#password').focus(); }
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#login-error').textContent = '';
  const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('#password').value }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { $('#login-error').textContent = j.error || 'Anmeldung fehlgeschlagen'; return; }
  $('#password').value = '';
  startApp();
});

// ---------- Navigation ----------
function setTab(tab) {
  S.tab = tab;
  for (const b of $$('.nav-item')) {
    if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  }
  $('#view-chat').hidden = tab !== 'chat';
  $('#view-today').hidden = tab !== 'today';
  $('#view-profile').hidden = tab !== 'profile';
  if (tab === 'today') loadToday();
  if (tab === 'profile') loadProfile();
  if (tab === 'chat') scrollDown();
}
$$('.nav-item').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

// ---------- Chat ----------
function scrollDown() { const sc = $('#chat-scroll'); requestAnimationFrame(() => { sc.scrollTop = sc.scrollHeight; }); }

function renderMessages() {
  const box = $('#messages');
  if (!S.messages.length) {
    box.innerHTML = `<div class="empty-state">${avatarHtml('assistant', 72)}
      <p class="body-l">Hallo! Ich bin ${S.botName ? esc(S.botName) + ', ' : ''}${bot().die}. Lass uns kurz kennenlernen, dann plane ich ab morgen deinen Tag mit dir.</p>
      <button class="btn filled" data-send="Hallo!">Los geht's</button></div>`;
    return;
  }
  const lastBrief = [...S.messages].reverse().find((m) => m.kind === 'brief');
  let html = '', prevDay = null, prevIn = false;
  for (const m of S.messages) {
    const dk = dayKey(m.ts);
    if (dk !== prevDay) { html += `<p class="sep">${esc(dayLabel(m.ts))}</p>`; prevDay = dk; prevIn = false; }
    const isIn = m.role !== 'user' && m.kind !== 'brief';
    if (m.kind === 'brief') {
      html += `<article class="brief" aria-label="Morgenbrief">${briefHtml(m.text)}${m === lastBrief && !m.rated ? `
        <div class="feedback"><span>Hilfreich?</span>
          <button class="btn outlined small" data-action="fb-up">Passt</button>
          <button class="btn outlined small" data-action="fb-down">Besser machen</button></div>` : ''}</article>`;
    } else if (m.role === 'user') {
      html += `<div class="bubble out" data-no-i18n>${esc(m.text)}</div>`;
    } else {
      const acts = m.actions?.length ? `<ul class="saved" aria-label="Gespeichert">${m.actions.map((x) => `<li>${ICON.check}${esc(x)}</li>`).join('')}</ul>` : '';
      html += `<div class="row-in">${prevIn ? '<span class="spacer"></span>' : avatarHtml('assistant', 32)}<div class="bubble in"><div class="nt" data-no-i18n>${richText(m.text)}</div>${acts}</div></div>`;
    }
    prevIn = isIn;
  }
  if (S.busy) html += '<div class="typing" aria-label="Schreibt…"><i></i><i></i><i></i></div>';
  box.innerHTML = html;
}

async function loadChat() {
  const j = await api('/api/chat');
  applyMeta(j);
  S.messages = j.messages;
  renderMessages(); scrollDown();
}

async function send(text) {
  text = text.trim();
  if (!text || S.busy) return;
  S.busy = true; $('#send').disabled = true;
  S.messages.push({ id: 'tmp', ts: Date.now(), role: 'user', text });
  renderMessages(); scrollDown();
  try {
    const j = await api('/api/chat', { text });
    S.messages = S.messages.filter((m) => m.id !== 'tmp').concat([j.user, ...j.messages]);
    api('/api/chat').then(applyMeta).catch(() => {}); // Name/Bild könnten sich im Gespräch geändert haben
  } catch (e) {
    S.messages = S.messages.filter((m) => m.id !== 'tmp');
    $('#input').value = text;
    toast(e.message);
  }
  S.busy = false; $('#send').disabled = false;
  renderMessages(); scrollDown();
}

async function runBrief() {
  if (S.busy) return;
  S.busy = true; renderMessages(); scrollDown();
  try { const j = await api('/api/brief', {}); S.messages.push(...j.messages); } catch (e) { toast(e.message); }
  S.busy = false; renderMessages(); scrollDown();
}

async function feedback(rating) {
  const b = [...S.messages].reverse().find((m) => m.kind === 'brief');
  if (b) b.rated = true;
  try { const j = await api('/api/feedback', { rating }); S.messages.push(...j.messages); } catch (e) { toast(e.message); }
  renderMessages(); scrollDown();
  if (rating === 'down') $('#input').focus();
}

const input = $('#input');
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const micBtn = $('#mic');
if (SR && micBtn) {
  micBtn.hidden = false;
  let rec = null;
  micBtn.addEventListener('click', () => {
    if (rec) { rec.stop(); return; }
    rec = new SR();
    rec.lang = { de: locale(), en: 'en-GB', pt: 'pt-PT' }[S.profile?.language || 'de'] || locale();
    rec.interimResults = true; rec.continuous = false;
    const base = input.value ? `${input.value.trim()} ` : '';
    rec.onresult = (ev) => { input.value = base + [...ev.results].map((r) => r[0].transcript).join(''); autosize(); };
    rec.onerror = (ev) => { if (ev.error === 'not-allowed') toast('Mikrofon ist blockiert. Erlaube es in den Chrome-Einstellungen.'); };
    rec.onend = () => { rec = null; micBtn.classList.remove('rec'); micBtn.setAttribute('aria-pressed', 'false'); input.focus(); };
    micBtn.classList.add('rec'); micBtn.setAttribute('aria-pressed', 'true');
    rec.start();
  });
}
function autosize() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; }
input.addEventListener('input', autosize);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#composer').requestSubmit(); }
});
$('#composer').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = input.value; input.value = ''; autosize(); send(t);
});

// ---------- Heute ----------
function todoMeta(t, today) {
  if (!t.due) return '<span class="s">Ohne Datum</span>';
  const d = dayDiff(today, t.due);
  if (d < 0) return `<span class="s overdue">${ICON.alert}Überfällig seit ${d === -1 ? 'gestern' : `${-d} Tagen`}</span>`;
  if (d === 0) return `<span class="s">Heute fällig${t.time ? ` um ${esc(t.time)}` : ''}</span>`;
  if (d === 1) return '<span class="s">Morgen fällig</span>';
  return `<span class="s">Fällig ${esc(shortDate(t.due))}</span>`;
}

const relDay = (D, T) => { const n = dayDiff(T, D); return n === 0 ? 'Heute' : n === 1 ? 'Morgen' : n === -1 ? 'Gestern' : new Date(`${D}T12:00:00`).toLocaleDateString(locale(), { weekday: 'long' }); };
const longDay = (D) => { const d = new Date(`${D}T12:00:00`); return `${d.toLocaleDateString(locale(), { weekday: 'long' })}, ${numDate(d)}`; };
function dayCardHtml() {
  const T = S.today.date, D = S.day || T, x = S.dayData?.date === D ? S.dayData : null;
  const n = dayDiff(T, D);
  const arrow = (dir) => `<button type="button" class="icon-btn" data-day-step="${dir}" aria-label="${dir < 0 ? 'Vorheriger Tag' : 'Nächster Tag'}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${dir < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'}"/></svg></button>`;
  let h = `<section class="section day-card" aria-label="Tagesansicht ${esc(longDay(D))}"><div class="day-nav">${arrow(-1)}
    <button type="button" class="day-label" data-day-today ${n === 0 ? 'aria-current="date"' : 'aria-label="Zurück zu heute"'}><span class="day-rel">${esc(n === 0 ? 'Heute' : n === 1 ? 'Morgen' : n === -1 ? 'Gestern' : relDay(D, T))}</span><span class="s">${esc(longDay(D))}${n !== 0 ? ' · zurück zu heute' : ''}</span></button>${arrow(1)}</div>`;
  if (!x) return h + '<div class="item"><span class="s">Lädt …</span></div></section>';
  const ev = S.evCache?.[D];
  const rows = [];
  for (const t of x.notes) rows.push(`<div class="item day-note">${ICON.gift}<p class="grow t">${esc(t)}</p></div>`);
  const timedRows = [];
  if (ev) for (const e of ev) (e.all_day ? rows : timedRows).push({ k: e.start || '', h: `<div class="item"><span class="time">${e.all_day ? 'Tag' : esc(e.start)}</span><div class="grow"><p class="t">${esc(e.title)}</p><p class="s">${e.all_day ? 'Termin · ganztägig' : `Termin · ${esc(e.start)}–${esc(e.end)}`}</p></div></div>` });
  for (const r of x.timed) timedRows.push({ k: r.time, h: `<div class="item${r.done ? ' done' : ''}"><span class="time">${esc(r.time)}</span><div class="grow"><p class="t">${esc(r.text)}</p><p class="s">Erinnerung</p></div></div>` });
  rows.splice(0, rows.length, ...rows.map((r) => (typeof r === 'string' ? r : r.h)), ...timedRows.sort((a, b) => a.k.localeCompare(b.k)).map((r) => r.h));
  for (const it of x.items) {
    const rec = it.kind === 'rec';
    if (it.done) {
      rows.push(`<div class="item todo-row done"><span class="check"><input type="checkbox" checked ${rec ? `data-rec-undone="${esc(it.id)}" data-date="${esc(D)}"` : `data-reopen="${esc(it.id)}"`} aria-label="Wieder öffnen: ${esc(it.title)}"></span>
        <span class="grow"><span class="t" style="display:block">${esc(it.title)}</span><span class="s${rec ? ' rec-meta' : ''}">${rec ? ICON.repeat + 'Routine · ' : ''}Erledigt</span></span></div>`);
      continue;
    }
    const meta = it.overdue ? `<span class="s overdue${rec ? ' rec-meta' : ''}">${rec ? ICON.repeat : ICON.alert}${rec ? 'Routine · ' : ''}Überfällig seit ${esc(shortDate(it.due))}</span>`
      : rec ? `<span class="s rec-meta">${ICON.repeat}Routine</span>` : it.time ? `<span class="s">um ${esc(it.time)}</span>` : '';
    const box = rec ? `<input type="checkbox" data-rec-done="${esc(it.id)}" ${it.can_check ? '' : 'disabled title="Kann erst am Tag abgehakt werden"'} aria-label="Routine erledigt: ${esc(it.title)}">`
      : `<input type="checkbox" data-done="${esc(it.id)}" aria-label="Erledigt: ${esc(it.title)}">`;
    rows.push(`<div class="item todo-row"><span class="check">${box}</span>
      <button type="button" class="row-edit grow" ${rec ? `data-edit-rec="${esc(it.id)}"` : `data-edit-todo="${esc(it.id)}"`} aria-label="Bearbeiten: ${esc(it.title)}"><span class="t" style="display:block">${!rec && it.priority && it.priority !== 2 ? prioBadge(it.priority) + ' ' : ''}${esc(it.title)}</span>${meta}</button></div>`);
  }
  if (!rows.length) rows.push(`<div class="item"><span class="s">${n < 0 ? 'An diesem Tag wurde nichts abgehakt.' : 'Für diesen Tag steht nichts an.'}</span></div>`);
  return h + rows.join('') + '</section>';
}

function renderToday() {
  const d = S.today; if (!d) return;
  const box = $('#today'); let html = '';
  if (d.warnings?.length) html += `<section class="warn" role="alert">${ICON.alert}<div><h2>Unwetterwarnung</h2>${d.warnings.map((w) => `<p>${esc(w)}</p>`).join('')}</div></section>`;
  html += dayCardHtml();
  if (d.events === null) {
    html += '<section class="section"><h2>Kommende Termine</h2><div class="item"><span class="s">Google Kalender ist noch nicht verbunden.</span></div></section>';
  } else if (d.events?.some((e) => e.date > d.date)) {
    html += '<section class="section" aria-label="Kommende Termine"><h2>Kommende Termine</h2>' + d.events.filter((e) => e.date > d.date).slice(0, 12).map((e) => `
      <div class="item"><span class="time">${e.all_day ? 'Tag' : esc(e.start)}</span>
        <div class="grow"><p class="t">${esc(e.title)}</p><p class="s">${esc(relDay(e.date, d.date))}${e.all_day ? ' · ganztägig' : ` · ${esc(e.start)}–${esc(e.end)}`}</p></div></div>`).join('') + '</section>';
  }
  const dated = d.todos.filter((t) => t.due);
  const relevant = dated.filter((t) => t.overdue || t.today || dayDiff(d.date, t.due) <= 7);
  const later = dated.filter((t) => !relevant.includes(t));
  const undated = d.todos.filter((t) => !t.due);
  const todoRow = (t) => `<div class="item todo-row"><span class="check"><input type="checkbox" data-done="${esc(t.id)}" aria-label="Erledigt: ${esc(t.title)}"></span>
      <button type="button" class="row-edit grow" data-edit-todo="${esc(t.id)}" aria-label="Bearbeiten: ${esc(t.title)}"><span class="t" style="display:block">${t.priority && t.priority !== 2 ? prioBadge(t.priority) + ' ' : ''}${esc(t.title)}</span>${t.due ? todoMeta(t, d.date) : ''}</button></div>`;
  const recMeta = (r) => {
    const n = r.days;
    const when = n < 0 ? `Überfällig seit ${n === -1 ? 'gestern' : `${-n} Tagen`}` : n === 0 ? 'Heute fällig' : n === 1 ? 'Morgen fällig' : `Fällig ${esc(shortDate(r.next_due))}`;
    return `<span class="s rec-meta${n < 0 ? ' overdue' : ''}">${ICON.repeat}Routine · ${when}</span>`;
  };
  const recRow = (r) => `<div class="item todo-row"><span class="check"><input type="checkbox" data-rec-done="${esc(r.id)}" aria-label="Routine erledigt: ${esc(r.title)}"></span>
      <button type="button" class="row-edit grow" data-edit-rec="${esc(r.id)}" aria-label="Routine bearbeiten: ${esc(r.title)}"><span class="t" style="display:block">${esc(r.title)}</span>${recMeta(r)}</button></div>`;
  // Aufgaben und fällige Routinen gemeinsam, nach Fälligkeit (überfällig zuerst); innerhalb eines Tages bleibt die Prioritäts-Reihenfolge
  const merged = [
    ...relevant.map((t) => ({ days: dayDiff(d.date, t.due), html: todoRow(t) })),
    ...d.recurring.map((r) => ({ days: r.days, html: recRow(r) })),
  ].sort((x, y) => x.days - y.days);
  html += '<section class="section" aria-label="Aufgaben der nächsten 7 Tage"><h2>Aufgaben · nächste 7 Tage</h2>' + (merged.length ? merged.map((x) => x.html).join('')
    : '<div class="item"><span class="s">Nichts fällig. Genieß den Tag!</span></div>') + '</section>';
  if (later.length) {
    html += `<details class="section done-list" data-fold="later" ${S.fold?.later ? 'open' : ''}><summary><span>Später (${later.length})</span><svg class="chev" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>${later.map(todoRow).join('')}</details>`;
  }
  if (undated.length) {
    html += `<details class="section done-list" data-fold="nodate" ${(S.fold?.nodate ?? true) ? 'open' : ''}><summary><span>Ohne Datum (${undated.length})</span><svg class="chev" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>${undated.map(todoRow).join('')}</details>`;
  }
  if (d.all_recurring?.length) {
    const U = { days: ['Tag', 'Tage'], weeks: ['Woche', 'Wochen'], months: ['Monat', 'Monate'], years: ['Jahr', 'Jahre'] };
    html += `<details class="section done-list" data-fold="routines" ${S.fold?.routines ? 'open' : ''}><summary><span>Alle Routinen (${d.all_recurring.length})</span><svg class="chev" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>`
      + d.all_recurring.map((r) => `<div class="item"><button type="button" class="row-edit grow" data-edit-rec="${esc(r.id)}" aria-label="Bearbeiten: ${esc(r.title)}"><span class="t" style="display:block">${esc(r.title)}</span>
        <span class="s">${r.every === 1 ? `jede${r.unit === 'weeks' ? ' Woche' : r.unit === 'days' ? 'n Tag' : r.unit === 'months' ? 'n Monat' : 's Jahr'}` : `alle ${r.every} ${U[r.unit]?.[1] || r.unit}`} · nächstes Mal ${esc(shortDate(r.next_due))}</span></button></div>`).join('') + '</details>';
  }
  if (d.done?.length) {
    html += `<details class="section done-list" ${S.doneOpen ? 'open' : ''}><summary><span>Erledigt (${d.done.length})</span>
      <svg class="chev" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>`
      + d.done.map((t) => `<div class="item done"><span class="check"><input type="checkbox" checked data-reopen="${esc(t.id)}" aria-label="Wieder öffnen: ${esc(t.title)}"></span>
        <span class="grow"><span class="t" style="display:block">${esc(t.title)}</span><span class="s">${t.done_at ? `Erledigt ${esc(shortDate(t.done_at))}` : 'Erledigt'}</span></span></div>`).join('')
      + '<div class="item clear-row"><button type="button" class="btn text small" data-clear-done>Liste leeren</button></div></details>';
  }
  if (d.reminders.length) {
    html += `<section class="note" aria-label="Nicht vergessen">${ICON.gift}<div><h2>Nicht vergessen</h2>${d.reminders.map((r) => `<p>${esc(r)}</p>`).join('')}</div></section>`;
  }
  box.innerHTML = html;
}

async function loadToday() {
  $('#today-date').textContent = 'Alles auf einen Blick';
  try {
    S.today = await api('/api/today');
    S.evCache = {};
    if (S.today.events === null) S.calOff = true;
    else if (!S.today.events_error) { S.calOff = false; for (let i = 0; i < 8; i++) { const day = addDaysISO(S.today.date, i); S.evCache[day] = S.today.events.filter((e) => e.date === day); } }
    if (!S.day || S.dayAnchor !== S.today.date) { S.day = S.today.date; S.dayAnchor = S.today.date; }
    renderToday();
    await loadDay();
  } catch (e) { toast(e.message); }
}
let dayReq = 0;
async function loadDay() {
  if (!S.today) return;
  const D = S.day || S.today.date; const my = ++dayReq;
  const needEv = !S.calOff && S.evCache?.[D] === undefined;
  try {
    const j = await api(`/api/day?date=${D}&events=${needEv ? 1 : 0}`);
    if (my !== dayReq) return;
    if (j.events !== undefined) { if (j.events === null) S.calOff = true; else (S.evCache ||= {})[D] = j.events; }
    S.dayData = j; renderToday();
  } catch (e) { toast(e.message); }
}

$('#today').addEventListener('toggle', (e) => {
  if (!e.target.classList?.contains('done-list')) return;
  if (e.target.dataset.fold) (S.fold ||= {})[e.target.dataset.fold] = e.target.open; else S.doneOpen = e.target.open;
}, true);
$('#today').addEventListener('change', async (e) => {
  const rid = e.target.dataset.reopen;
  if (rid) {
    e.target.disabled = true;
    try { S.today = { ...(await api('/api/todo/reopen', { id: rid })), events: S.today.events }; toast('Wieder offen'); loadDay(); }
    catch (err) { toast(err.message); e.target.checked = true; e.target.disabled = false; }
    return;
  }
  const undoneId = e.target.dataset.recUndone;
  if (undoneId) {
    e.target.disabled = true;
    try { S.today = { ...(await api('/api/recurring/undone', { id: undoneId, date: e.target.dataset.date })), events: S.today.events }; toast('Wieder offen'); loadDay(); }
    catch (err) { toast(err.message); e.target.checked = true; e.target.disabled = false; }
    return;
  }
  const recId = e.target.dataset.recDone;
  if (recId) {
    e.target.disabled = true;
    try { S.today = { ...(await api('/api/recurring/done', { id: recId })), events: S.today.events }; toast('Abgehakt, nächster Termin ist eingeplant.', { label: 'Rückgängig', run: undo }); loadDay(); }
    catch (err) { toast(err.message); e.target.checked = false; e.target.disabled = false; }
    return;
  }
  const id = e.target.dataset.done; if (!id) return;
  e.target.disabled = true;
  try { S.today = { ...(await api('/api/todo/done', { id })), events: S.today.events }; toast('Erledigt. Stark!', { label: 'Rückgängig', run: undo }); loadDay(); }
  catch (err) { toast(err.message); e.target.checked = false; e.target.disabled = false; }
});
const editDlg = () => $('#edit-dialog');
function openEdit(kind, id) {
  const d = S.today; const f = $('#edit-form');
  f.dataset.kind = kind; f.dataset.id = id;
  $('#edit-todo-fields').hidden = kind !== 'todo'; $('#edit-rec-fields').hidden = kind !== 'rec';
  if (kind === 'todo') {
    const t = d.todos.find((x) => x.id === id) || S.dayData?.items.find((x) => x.kind === 'todo' && x.id === id); if (!t) return;
    $('#edit-title').textContent = 'Aufgabe bearbeiten';
    $('#e-name').value = t.title; $('#e-due').value = t.due || ''; $('#e-time').value = t.time || '';
  } else {
    const r = d.all_recurring.find((x) => x.id === id); if (!r) return;
    $('#edit-title').textContent = 'Routine bearbeiten';
    $('#e-name').value = r.title; $('#e-every').value = r.every; $('#e-unit').value = r.unit; $('#e-next').value = r.next_due;
  }
  editDlg().showModal(); $('#e-name').focus();
}
$('#edit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target; const title = $('#e-name').value.trim();
  if (!title) { toast('Bitte einen Text eingeben'); return; }
  try {
    const body = f.dataset.kind === 'todo'
      ? { id: f.dataset.id, title, due: $('#e-due').value, time: $('#e-time').value }
      : { id: f.dataset.id, title, every: Number($('#e-every').value), unit: $('#e-unit').value, next_due: $('#e-next').value };
    if (f.dataset.kind === 'todo' && body.time && !body.due) body.due = S.today.date;
    S.today = { ...(await api(f.dataset.kind === 'todo' ? '/api/todo/update' : '/api/recurring/update', body)), events: S.today.events };
    editDlg().close(); loadDay(); toast('Gespeichert');
  } catch (err) { toast(err.message); }
});
$('#edit-delete').addEventListener('click', async () => {
  const f = $('#edit-form');
  if (!confirm(tr(f.dataset.kind === 'todo' ? 'Diese Aufgabe löschen?' : 'Diese Routine löschen?'))) return;
  try {
    S.today = { ...(await api(f.dataset.kind === 'todo' ? '/api/todo/delete' : '/api/recurring/delete', { id: f.dataset.id })), events: S.today.events };
    editDlg().close(); loadDay(); toast('Gelöscht');
  } catch (err) { toast(err.message); }
});
$('#edit-cancel').addEventListener('click', () => editDlg().close());
$('#edit-clear-due').addEventListener('click', () => { $('#e-due').value = ''; $('#e-time').value = ''; });

$('#today').addEventListener('click', async (e) => {
  const st = e.target.closest('[data-day-step]');
  if (st) { S.day = addDaysISO(S.day || S.today.date, Number(st.dataset.dayStep)); S.dayData = null; renderToday(); loadDay(); return; }
  if (e.target.closest('[data-day-today]')) { if (S.day !== S.today.date) { S.day = S.today.date; S.dayData = null; renderToday(); loadDay(); } return; }
  const et = e.target.closest('[data-edit-todo]'); if (et) { openEdit('todo', et.dataset.editTodo); return; }
  const er = e.target.closest('[data-edit-rec]'); if (er) { openEdit('rec', er.dataset.editRec); return; }
  const c = e.target.closest('[data-clear-done]'); if (!c) return;
  c.disabled = true;
  try {
    const j = await api('/api/todo/clear-done', {});
    S.today = { ...j, events: S.today.events }; loadDay();
    toast(`${j.cleared} erledigte Aufgabe${j.cleared === 1 ? '' : 'n'} entfernt`, { label: 'Rückgängig', run: undo });
  } catch (err) { toast(err.message); c.disabled = false; }
});

const dlg = $('#add-dialog');
$('#add-btn').addEventListener('click', () => { $('#add-form').reset(); dlg.showModal(); $('#add-name').focus(); });
$('#add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = $('#add-name').value, due = $('#add-due').value, time = $('#add-time').value;
  try { S.today = { ...(await api('/api/todo/add', { title, due, time })), events: S.today?.events }; dlg.close(); loadDay(); toast('Aufgabe gespeichert'); }
  catch (err) { toast(err.message); }
});

// ---------- Über dich ----------
const usd = (v) => (v > 0 && v < 0.01 ? '< 0,01 $' : v.toLocaleString(locale(), { style: 'currency', currency: 'USD' }));
const modelLabel = (ai, id) => Object.values(ai?.options || {}).flat().find(([m]) => m === id)?.[1] || id;
function aiSection(ai) {
  if (!ai) return '';
  const p = S.aiView || ai.provider;
  const keyNote = ai.key_in_env[p] ? 'Schlüssel ist in der .env hinterlegt' : ai.has_key[p] ? 'Schlüssel ist gespeichert' : 'Noch kein Schlüssel';
  return `<section class="section" aria-label="KI"><h2>KI</h2>
    <div class="segmented" role="radiogroup" aria-label="Aktiver Anbieter">
      ${Object.entries(ai.providers).map(([k, l]) => `<label><input type="radio" name="ai-provider" value="${k}" ${ai.provider === k ? 'checked' : ''}>${l}${ai.provider === k ? ' (aktiv)' : ''}</label>`).join('')}
    </div>
    <div class="item"><span class="grow"><span class="t" style="display:block">Einstellungen für</span><span class="s">Modelle und Schlüssel je Anbieter</span></span>
      <select id="ai-view" aria-label="Anbieter bearbeiten">${Object.entries(ai.providers).map(([k, l]) => `<option value="${k}" ${p === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    ${ai.roles.map(([role, label]) => `<div class="item"><label class="grow t" for="m-${role}">${esc(label)}</label>
      <select id="m-${role}" data-ai-role="${role}" data-ai-provider="${p}">${ai.options[p].map(([id, l]) => `<option value="${id}" ${ai.models[p][role] === id ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`).join('')}
    <form class="item add-place" id="ai-key-form" data-provider="${p}">
      <label for="ai-key" class="sr">API-Schlüssel für ${esc(ai.providers[p])}</label>
      <input id="ai-key" type="password" autocomplete="off" placeholder="${ai.key_in_env[p] ? 'In .env hinterlegt' : `API-Schlüssel ${esc(ai.providers[p])}`}" ${ai.key_in_env[p] ? 'disabled' : ''}>
      <button class="btn tonal small" type="submit" ${ai.key_in_env[p] ? 'disabled' : ''}>Speichern</button>
    </form>
    <div class="item"><span class="grow s">${keyNote}. ${p === 'deepseek' ? 'Schlüssel von platform.deepseek.com.' : 'Schlüssel von console.anthropic.com.'}</span>
      ${ai.has_key[p] && !ai.key_in_env[p] ? `<button class="btn text small" data-ai-key-del="${p}">Entfernen</button>` : ''}</div>
  </section>`;
}
function renderProfile() {
  const p = S.profile; if (!p) return;
  applyMeta(p);
  const avBtn = (who) => `<button type="button" class="av-btn" data-photo-menu="${who}" aria-label="${who === 'user' ? 'Dein Profilbild' : 'Bild deiner Assistenz'} – ansehen oder ändern">${avatarHtml(who, 56)}<span class="av-edit" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg></span></button>`;
  let html = `<section class="section" aria-label="Profilbilder und Namen"><h2>Du &amp; ${bot().die}</h2>
    <div class="ident">${avBtn('user')}<div class="grow"><label for="name-user">Dein Name</label>
      <input type="text" id="name-user" maxlength="40" value="${esc(p.name || '')}" autocomplete="given-name">
      <div class="segmented mini three" role="radiogroup" aria-label="Du identifizierst dich als">
        ${[['f', 'Weiblich'], ['m', 'Männlich'], ['d', 'Divers']].map(([k, l]) => `<label><input type="radio" name="user_gender" value="${k}" ${p.user_gender === k ? 'checked' : ''}>${l}</label>`).join('')}
      </div></div></div>
    <div class="ident">${avBtn('assistant')}<div class="grow"><label for="name-bot">${bot().name}</label>
      <input type="text" id="name-bot" maxlength="40" value="${esc(p.assistant_name || '')}" placeholder="${bot().give}">
      <div class="segmented mini three" role="radiogroup" aria-label="Deine Assistenz ist">
        ${[['f', 'Weiblich'], ['m', 'Männlich'], ['d', 'Divers']].map(([k, l]) => `<label><input type="radio" name="gender" value="${k}" ${(p.assistant_gender || 'f') === k ? 'checked' : ''}>${l}</label>`).join('')}
      </div></div></div>
  </section>
  <section class="section"><h2 id="h-lang">Sprache</h2>
    <div class="segmented three" role="radiogroup" aria-labelledby="h-lang">
      ${[['de', 'Deutsch'], ['en', 'English'], ['pt', 'Português']].map(([k, l]) => `<label><input type="radio" name="language" value="${k}" ${(p.language || 'de') === k ? 'checked' : ''}>${l}</label>`).join('')}
    </div>
  </section>
  <section class="section" aria-label="Morgenbrief"><h2>Morgenbrief</h2>
    <label class="item"><span class="grow t">Uhrzeit</span><input type="time" id="brief-time" value="${esc(p.brief_time || '07:30')}"></label>
    <label class="item"><span class="grow t">Benachrichtigung auf diesem Gerät</span><input type="checkbox" role="switch" class="switch" id="push-switch" ${S.pushOn ? 'checked' : ''}></label>
  </section>
  <section class="section" aria-label="Begleitung"><h2>Begleitung</h2>
    <label class="item"><span class="grow"><span class="t" style="display:block">Hinweis bei fälligen Aufgaben</span><span class="s">Mit Uhrzeit: zur Uhrzeit. Ohne: Sammel-Hinweis</span></span>
      <input type="checkbox" role="switch" class="switch" data-set="due_notify_enabled" ${p.companion?.due_notify_enabled ? 'checked' : ''}></label>
    <label class="item"><span class="grow t">Sammel-Hinweis um</span><input type="time" data-set="due_notify_time" value="${esc(p.companion?.due_notify_time || '09:00')}"></label>
    <label class="item"><span class="grow"><span class="t" style="display:block">Abend-Check-in</span><span class="s">Was hat geklappt, was wandert auf morgen?</span></span>
      <input type="checkbox" role="switch" class="switch" data-set="checkin_enabled" ${p.companion?.checkin_enabled ? 'checked' : ''}></label>
    <label class="item"><span class="grow t">Uhrzeit Check-in</span><input type="time" data-set="checkin_time" value="${esc(p.companion?.checkin_time || '20:30')}"></label>
    <label class="item"><span class="grow"><span class="t" style="display:block">Wochenplanung</span><span class="s">Ausblick und Prioritäten für die Woche</span></span>
      <input type="checkbox" role="switch" class="switch" data-set="weekly_enabled" ${p.companion?.weekly_enabled ? 'checked' : ''}></label>
    <div class="item"><label for="weekly-day" class="grow t">Tag und Uhrzeit</label>
      <select id="weekly-day" data-set="weekly_day">${['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'].map((w, i) => `<option value="${i}" ${(p.companion?.weekly_day ?? 0) === i ? 'selected' : ''}>${w}</option>`).join('')}</select>
      <input type="time" aria-label="Uhrzeit Wochenplanung" data-set="weekly_time" value="${esc(p.companion?.weekly_time || '18:00')}"></div>
  </section>
  <section class="section" aria-label="Unwetter und Feiertage"><h2>Unwetter &amp; Feiertage</h2>
    <label class="item"><span class="grow"><span class="t" style="display:block">Unwetterwarnungen</span><span class="s">${p.safety?.warning_areas?.length ? `Offizielle Warnungen als Push · ${esc(p.safety.warning_areas.join(', '))}` : 'Für deine Orte gibt es keinen Warndienst'}</span></span>
      <input type="checkbox" role="switch" class="switch" data-set="warnings_enabled" ${p.safety?.warnings_enabled ? 'checked' : ''}></label>
    <label class="item"><span class="grow"><span class="t" style="display:block">Feiertage automatisch</span><span class="s">${p.safety?.holiday_label ? `Nach deinem Ort: ${esc(p.safety.holiday_cc ? `${regionName(p.safety.holiday_cc)} (landesweite Feiertage)` : p.safety.holiday_label)}` : 'Für deinen Ort kenne ich keine Feiertage'}</span></span>
      <input type="checkbox" role="switch" class="switch" data-set="holidays_auto" ${p.safety?.holidays_auto ? 'checked' : ''}></label>
  </section>
  <section class="section" aria-label="Nachrichten im Brief"><h2>Nachrichten im Brief</h2>
    ${(p.news_feeds || []).map((f) => `<div class="item tight"><span class="grow"><span class="t" style="display:block">${esc(f.label)}</span><span class="s">${f.custom ? esc(f.url.replace(/^https?:\/\//, '').slice(0, 48)) : esc(f.name)}</span></span>
      <button class="icon-btn" data-news-off="${esc(f.id)}" data-custom="${f.custom ? 1 : ''}" aria-label="Entfernen: ${esc(f.name)}">${ICON.x}</button></div>`).join('') || '<div class="item"><span class="s">Keine Nachrichten im Brief</span></div>'}
    ${(() => { const on = new Set((p.news_feeds || []).map((f) => f.id)); const rest = (p.news_catalog || []).filter((f) => !on.has(f.id));
      return rest.length ? `<form class="item add-place" id="news-add-form"><label for="news-pick" class="sr">Weitere Quelle aus der Liste</label>
      <select id="news-pick" aria-label="Weitere Quelle aus der Liste"><option value="">Weitere Quelle aus der Liste …</option>${rest.map((f) => `<option value="${esc(f.id)}">${esc(f.label)} – ${esc(f.name)}</option>`).join('')}</select>
      <button class="btn tonal small">Hinzufügen</button></form>` : ''; })()}
    <form class="item add-place" id="news-custom-form"><label for="news-url" class="sr">Eigener RSS-Feed</label>
      <input id="news-url" type="url" inputmode="url" placeholder="Eigener RSS-Feed (Adresse)" autocomplete="off">
      <input id="news-name" type="text" maxlength="40" placeholder="Name (optional)" aria-label="Name (optional)">
      <button class="btn tonal small">Hinzufügen</button></form>
    ${p.news_status ? `<div class="item"><span class="s">Letzter Abruf ${esc(dayLabel(p.news_status.at))}: ${esc(Object.entries(p.news_status.counts).map(([k, v]) => `${k} ${v}`).join(' · ') || '–')}${p.news_status.errors?.length ? `<br>Probleme: ${esc(p.news_status.errors.join('; '))}` : ''}</span></div>` : ''}
  </section>
  <section class="section" aria-label="Wetter-Orte"><h2>Wetter-Orte</h2>
    ${S.editLocation ? `<form class="item add-place" id="location-form">
      <label for="location-name" class="sr">Wo bist du?</label>
      <input id="location-name" type="text" placeholder="Ort, z. B. Hamburg" value="${esc((p.location || '').split(',')[0])}" autocomplete="off">
      <button type="button" class="btn text small" data-location-cancel>Abbrechen</button>
      <button class="btn tonal small">Speichern</button></form>`
    : `<div class="item"><span class="grow"><span class="t" style="display:block">${esc(p.location || 'Noch kein Ort')}</span><span class="s">Hier bist du · für Wetter, Warnungen und Feiertage</span></span>
      <button type="button" class="btn text small" data-location-edit>Ändern</button></div>`}
    ${(p.weather_places || []).map((w) => `<div class="item tight"><span class="grow"><span class="t" style="display:block">${esc(w.name)}</span>${w.label ? `<span class="s">${esc(w.label)}</span>` : ''}</span>
      <button class="icon-btn" data-place-del="${esc(w.name)}" aria-label="Entfernen: ${esc(w.name)}">${ICON.x}</button></div>`).join('')}
    <form class="item add-place" id="place-form">
      <label for="place-name" class="sr">Weiterer Ort</label>
      <input id="place-name" type="text" placeholder="Weiterer Ort, z. B. Arbeitsort" autocomplete="off">
      <label for="place-label" class="sr">Wofür</label>
      <input id="place-label" type="text" placeholder="Wofür, z. B. Schule" autocomplete="off">
      <button class="btn tonal small" type="submit">Hinzufügen</button>
    </form>
  </section>`;
  html += `<details class="section done-list learned" ${S.learnedOpen ? 'open' : ''}><summary><span>Das habe ich gelernt (${p.memory.length})</span>
      <svg class="chev" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></summary>`
    + (p.memory.length ? p.memory.map((m) => `
    <div class="item tight"><p class="grow t">${esc(m.text)}</p>
      <button class="icon-btn" data-forget="${esc(m.id)}" aria-label="Vergessen: ${esc(m.text)}">${ICON.x}</button></div>`).join('')
    : '<div class="item"><span class="s">Noch nichts. Sag mir einfach im Chat, was dir wichtig ist oder was ich anders machen soll.</span></div>') + '</details>';
  {
    const KIND = { ziel: 'Ziel', routine: 'Routine', hobby: 'Hobby' };
    const kindSel = (v, id) => `<select id="${id}" aria-label="Art">${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${v === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
    html += `<section class="section" aria-label="Ziele, Routinen und Hobbys"><h2>Ziele, Routinen &amp; Hobbys</h2>`
      + p.goals.map((g) => S.editGoal === g.id ? `<form class="item add-place goal-form" data-goal-id="${esc(g.id)}">
          ${kindSel(g.kind, 'goal-kind')}<input id="goal-name" type="text" maxlength="100" value="${esc(g.name)}" aria-label="Name" required>
          <input id="goal-details" type="text" maxlength="500" value="${esc(g.details)}" placeholder="Details, z. B. 3× pro Woche morgens" aria-label="Details">
          <button type="button" class="btn text small" data-goal-cancel>Abbrechen</button><button class="btn tonal small">Speichern</button></form>`
        : `<div class="item tight"><button type="button" class="row-edit grow" data-goal-edit="${esc(g.id)}" aria-label="Bearbeiten: ${esc(g.name)}"><span class="t" style="display:block"><span class="kind-chip">${KIND[g.kind] || esc(g.kind)}</span> ${esc(g.name)}</span>${g.details || g.last_done ? `<span class="s">${[g.details && esc(g.details), g.last_done && `zuletzt gemacht ${esc(shortDate(g.last_done))}`].filter(Boolean).join(' · ')}</span>` : ''}</button>
          <button class="icon-btn" data-goal-del="${esc(g.id)}" aria-label="Entfernen: ${esc(g.name)}">${ICON.x}</button></div>`).join('')
      + `<form class="item add-place goal-form" data-goal-id="">${kindSel('ziel', 'goal-kind-new')}<input id="goal-name-new" type="text" maxlength="100" placeholder="Neu, z. B. Yoga" aria-label="Name">
          <input id="goal-details-new" type="text" maxlength="500" placeholder="Details (optional)" aria-label="Details"><button class="btn tonal small">Hinzufügen</button></form></section>`;
  }
  const g = p.google || {};
  const gBtn = p.calendar
    ? (g.via_env ? '<span class="ok">Verbunden</span>' : '<button class="btn outlined small" data-action="google-disconnect">Trennen</button>')
    : `<button class="btn filled small" data-action="${g.has_client ? 'google-connect' : 'google-setup'}">Verbinden</button>`;
  html += `<section class="section" aria-label="Verbunden"><h2>Verbunden</h2>
    <div class="item"><div class="grow"><p class="t">Google Kalender &amp; Aufgaben</p>
      <span class="s email">${p.calendar ? (g.email ? `Als ${esc(g.email)}` : 'Verbunden') + (p.tasks ? ' · Listen „Alle Aufgaben“ und „Heute“ synchron' : '') : 'Nicht verbunden'}</span></div>${gBtn}</div>
    ${!p.calendar && g.has_client ? '<div class="item"><span class="grow s">Zugangsdaten sind gespeichert.</span><button class="btn text small" data-action="google-setup">Ändern</button></div>' : ''}
    ${p.location ? `<div class="item"><span class="grow t">Wetter-Ort</span><span class="ok">${esc(p.location)}</span></div>` : ''}
  </section>
  ${aiSection(p.ai)}
  <section class="section" aria-label="Kosten"><h2>Kosten diesen Monat</h2>
    <div class="item"><span class="grow"><span class="t" style="display:block">ca. ${usd(p.usage?.usd ?? 0)} gesamt</span>
      <span class="s">${p.usage?.calls ?? 0} Anfragen · Schätzung nach Listenpreis. Genaue Abrechnung bei Anthropic bzw. DeepSeek.</span></span></div>
    ${(p.usage?.rows || []).map((r) => `<div class="item"><span class="grow"><span class="t" style="display:block">${esc(r.provider)} · ${esc(modelLabel(p.ai, r.model))}</span><span class="s">${r.calls} Anfragen</span></span><span class="value">${r.usd === null ? 'Preis unbekannt' : usd(r.usd)}</span></div>`).join('')}
  </section>
  <section class="section" aria-label="Daten"><h2>Daten</h2>
    <div class="item"><label for="retention" class="grow"><span class="t" style="display:block">Chatverlauf behalten</span><span class="s">Ältere Nachrichten verschwinden aus der Ansicht. Was ich über dich weiß, bleibt.</span></label>
      <select id="retention">${[[7, '7 Tage'], [30, '30 Tage'], [365, '1 Jahr'], [0, 'Nie löschen']].map(([v, l]) => `<option value="${v}" ${(p.chat_retention_days ?? 30) === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="item"><span class="grow s">Alles zurücksetzen und neu anfangen. Kalender und Aufgaben bei Google bleiben erhalten.</span>
      <button class="btn outlined small" data-action="reset">Alles löschen</button></div>
  </section>
  <button class="btn text" data-action="logout">Abmelden</button>`;
  $('#profile').innerHTML = html;
}

async function loadProfile() {
  try { S.profile = await api('/api/profile'); await checkPush(); renderProfile(); } catch (e) { toast(e.message); }
}

$('#profile').addEventListener('toggle', (e) => { if (e.target.classList?.contains('learned')) S.learnedOpen = e.target.open; }, true);
$('#profile').addEventListener('change', async (e) => {
  if (e.target.id === 'name-user' || e.target.id === 'name-bot') {
    const key = e.target.id === 'name-user' ? 'name' : 'assistant_name';
    try { applyMeta(await api('/api/profile', { [key]: e.target.value })); toast(key === 'name' ? 'Name gespeichert' : `Schön, ab jetzt heiße ich ${e.target.value.trim() || 'wieder Mein Tag'}!`); }
    catch (err) { toast(err.message); }
  }
  if (e.target.name === 'user_gender') {
    try { await api('/api/profile', { user_gender: e.target.value }); S.profile.user_gender = e.target.value; toast('Gespeichert'); }
    catch (err) { toast(err.message); }
  }
  if (e.target.name === 'gender') {
    try {
      const j = await api('/api/profile', { assistant_gender: e.target.value });
      S.botGender = j.assistant_gender; toast(`Ab jetzt ${({ f: 'weiblich', m: 'männlich', d: 'divers' })[j.assistant_gender]}`);
      loadProfile();
    } catch (err) { toast(err.message); }
  }
  if (e.target.name === 'ai-provider') {
    try { await api('/api/ai', { provider: e.target.value }); S.aiView = e.target.value; toast(`Aktiv: ${e.target.value === 'deepseek' ? 'DeepSeek' : 'Claude'}`); }
    catch (err) { toast(err.message); }
    loadProfile(); return;
  }
  if (e.target.id === 'ai-view') { S.aiView = e.target.value; renderProfile(); return; }
  if (e.target.dataset.aiRole) {
    try { await api('/api/ai', { model: { provider: e.target.dataset.aiProvider, role: e.target.dataset.aiRole, model: e.target.value } }); toast('Modell gespeichert'); }
    catch (err) { toast(err.message); }
    return;
  }
  if (e.target.id === 'retention') {
    const v = Number(e.target.value);
    try { await api('/api/profile', { chat_retention_days: v }); toast(v ? `Chatverlauf wird ${v === 365 ? '1 Jahr' : `${v} Tage`} behalten` : 'Chatverlauf wird nie gelöscht'); loadChat().catch(() => {}); }
    catch (err) { toast(err.message); }
  }
  if (e.target.name === 'language') {
    try { const j = await api('/api/profile', { language: e.target.value }); S.profile.language = j.language; setLang(j.language, rerenderAll); toast({ de: 'Sprache: Deutsch', en: 'Language: English', pt: 'Idioma: Português' }[j.language]); }
    catch (err) { toast(err.message); }
  }
  if (e.target.dataset.set) {
    const k = e.target.dataset.set;
    const v = e.target.type === 'checkbox' ? e.target.checked : k === 'weekly_day' ? Number(e.target.value) : e.target.value;
    try { await api('/api/profile', { [k]: v }); toast('Gespeichert'); } catch (err) { toast(err.message); }
  }

  if (e.target.id === 'brief-time') {
    try { await api('/api/profile', { brief_time: e.target.value }); toast(`Morgenbrief kommt jetzt um ${e.target.value} Uhr`); } catch (err) { toast(err.message); }
  }
  if (e.target.id === 'push-switch') {
    if (e.target.checked) { if (!(await enablePush())) e.target.checked = false; } else await disablePush();
  }
});
let photoFor = null;
async function resizeImage(file, size = 640) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  bmp.close?.();
  return c.toDataURL('image/jpeg', 0.85);
}
$('#file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file || !photoFor) return;
  try {
    const image = await resizeImage(file);
    const j = await api(`/api/avatar/${photoFor}`, { image });
    S.avatars = j.avatars; renderIdentity(); renderProfile(); renderMessages(); toast('Foto gespeichert');
  } catch (err) { toast(`Foto ging nicht: ${err.message}`); }
});
function openPhotoMenu(who) {
  photoFor = who;
  const has = !!S.avatars[who];
  $('#photo-title').textContent = who === 'user' ? 'Dein Profilbild' : bot().pic;
  $('#photo-big').innerHTML = has ? `<img src="/api/avatar/${who}?v=${encodeURIComponent(S.avatars[who])}" alt="">` : (who === 'assistant' ? ICON.sun : '<span class="photo-empty">Noch kein Bild</span>');
  $('#photo-change').textContent = has ? 'Foto ändern' : 'Foto hochladen';
  $('#photo-remove').hidden = !has;
  $('#photo-dialog').showModal();
}
$('#photo-change').addEventListener('click', () => { $('#photo-dialog').close(); $('#file-input').click(); });
$('#photo-close').addEventListener('click', () => $('#photo-dialog').close());
$('#photo-dialog').addEventListener('click', (e) => { if (e.target.id === 'photo-dialog') $('#photo-dialog').close(); });
$('#photo-remove').addEventListener('click', async () => {
  try { const j = await api(`/api/avatar/${photoFor}/delete`, {}); S.avatars = j.avatars; $('#photo-dialog').close(); renderIdentity(); renderProfile(); renderMessages(); toast('Foto entfernt'); }
  catch (err) { toast(err.message); }
});
$('#profile').addEventListener('click', async (e) => {
  const pm = e.target.closest('[data-photo-menu]'); if (pm) { openPhotoMenu(pm.dataset.photoMenu); return; }
  const ph = e.target.closest('[data-photo]');
  if (ph) { photoFor = ph.dataset.photo; $('#file-input').click(); return; }
  const kd = e.target.closest('[data-ai-key-del]');
  if (kd) {
    if (!confirm(tr('Schlüssel entfernen?'))) return;
    try { await api('/api/ai', { key: { provider: kd.dataset.aiKeyDel, value: '' } }); toast('Schlüssel entfernt'); loadProfile(); } catch (err) { toast(err.message); }
    return;
  }
  const ge = e.target.closest('[data-goal-edit]'); if (ge) { S.editGoal = ge.dataset.goalEdit; renderProfile(); $('#goal-name')?.focus(); return; }
  if (e.target.closest('[data-goal-cancel]')) { S.editGoal = null; renderProfile(); return; }
  const gd = e.target.closest('[data-goal-del]');
  if (gd) { try { await api('/api/entity/delete', { id: gd.dataset.goalDel }); toast('Entfernt'); loadProfile(); } catch (err) { toast(err.message); } return; }
  const no = e.target.closest('[data-news-off]');
  if (no) { try { await api(no.dataset.custom ? '/api/news/custom/delete' : '/api/news', no.dataset.custom ? { id: no.dataset.newsOff } : { disable: no.dataset.newsOff }); toast('Entfernt'); loadProfile(); } catch (err) { toast(err.message); } return; }
  if (e.target.closest('[data-location-edit]')) { S.editLocation = true; renderProfile(); $('#location-name')?.focus(); return; }
  if (e.target.closest('[data-location-cancel]')) { S.editLocation = false; renderProfile(); return; }
  const pd = e.target.closest('[data-place-del]');
  if (pd) {
    try { const j = await api('/api/weather/place', { location_name: pd.dataset.placeDel, remove: true }); loadProfile(); }
    catch (err) { toast(err.message); }
    return;
  }
  const del = e.target.closest('[data-photo-del]');
  if (del) {
    try { const j = await api(`/api/avatar/${del.dataset.photoDel}/delete`, {}); S.avatars = j.avatars; renderIdentity(); renderProfile(); renderMessages(); }
    catch (err) { toast(err.message); }
    return;
  }
  const b = e.target.closest('[data-forget]'); if (!b) return;
  try { await api('/api/memory/forget', { id: b.dataset.forget }); S.profile.memory = S.profile.memory.filter((m) => m.id !== b.dataset.forget); renderProfile(); toast('Vergessen'); }
  catch (err) { toast(err.message); }
});

$('#profile').addEventListener('submit', async (e) => {
  if (e.target.id === 'ai-key-form') {
    e.preventDefault();
    const v = $('#ai-key').value.trim(); if (!v) return;
    try { await api('/api/ai', { key: { provider: e.target.dataset.provider, value: v } }); toast('Schlüssel gespeichert'); loadProfile(); }
    catch (err) { toast(err.message); }
    return;
  }
  if (e.target.classList.contains('goal-form')) {
    e.preventDefault();
    const id = e.target.dataset.goalId, sfx = id ? '' : '-new';
    const name = $(`#goal-name${sfx}`).value.trim(); if (!name) return;
    try {
      await api('/api/entity', { id: id || undefined, kind: $(`#goal-kind${sfx}`).value, name, details: $(`#goal-details${sfx}`).value });
      S.editGoal = null; toast(id ? 'Gespeichert' : 'Hinzugefügt'); loadProfile();
    } catch (err) { toast(err.message); }
    return;
  }
  if (e.target.id === 'news-add-form') {
    e.preventDefault();
    const id = $('#news-pick').value; if (!id) return;
    try { await api('/api/news', { enable: id }); toast('Hinzugefügt'); loadProfile(); } catch (err) { toast(err.message); }
    return;
  }
  if (e.target.id === 'news-custom-form') {
    e.preventDefault();
    const url = $('#news-url').value.trim(); if (!url) return;
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { const j = await api('/api/news/custom', { url, name: $('#news-name').value }); toast(`Hinzugefügt: ${j.name}`); loadProfile(); }
    catch (err) { toast(err.message); btn.disabled = false; }
    return;
  }
  if (e.target.id === 'location-form') {
    e.preventDefault();
    const v = $('#location-name').value.trim(); if (!v) return;
    try { const j = await api('/api/location', { location_name: v }); S.editLocation = false; toast(j.news_added?.length ? `Ort: ${j.location} · Nachrichten dazu: ${j.news_added.join(', ')}` : `Ort: ${j.location}`); loadProfile(); }
    catch (err) { toast(err.message); }
    return;
  }
  if (e.target.id !== 'place-form') return;
  e.preventDefault();
  const name = $('#place-name').value.trim(), label = $('#place-label').value.trim();
  if (!name) return;
  try { const j = await api('/api/weather/place', { location_name: name, label }); loadProfile(); toast('Ort hinzugefügt'); }
  catch (err) { toast(err.message); }
});

$('#google-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('/api/google/client', { client_id: $('#g-id').value, client_secret: $('#g-secret').value });
    location.href = '/api/google/start';
  } catch (err) { toast(err.message); }
});

$('#reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (![tr('LÖSCHEN'), 'LÖSCHEN'].includes($('#reset-confirm').value.trim().toUpperCase())) { toast('Bitte genau LÖSCHEN eintippen'); return; }
  try {
    await api('/api/reset', { confirm: 'LÖSCHEN' });
    $('#reset-dialog').close();
    S.messages = []; S.today = null; S.profile = null; S.name = null; S.botName = null; S.avatars = { user: null, assistant: null };
    renderIdentity(); setTab('chat'); renderMessages(); toast('Alles gelöscht. Frischer Start!');
  } catch (err) { toast(err.message); }
});

// ---------- Push ----------
function b64ToU8(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function checkPush() {
  S.pushOn = false;
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const reg = await navigator.serviceWorker.ready;
  S.pushOn = !!(await reg.pushManager.getSubscription()) && Notification.permission === 'granted';
  $('#push-banner').hidden = S.pushOn || Notification.permission === 'denied' || localStorageGet('push-banner-hidden');
}
function localStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function localStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* egal */ } }

async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast('Dieser Browser kann keine Benachrichtigungen. Öffne die App über Chrome.'); return false; }
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { toast('Benachrichtigungen sind blockiert. Erlaube sie in den Android-Einstellungen für Chrome.'); return false; }
  try {
    const reg = await navigator.serviceWorker.ready;
    const { key } = await api('/api/push/key');
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
    await api('/api/push/subscribe', { subscription: sub.toJSON() });
    S.pushOn = true; $('#push-banner').hidden = true;
    toast('Benachrichtigungen sind an. Bis morgen früh!');
    return true;
  } catch (e) { toast(`Hat nicht geklappt: ${e.message}`); return false; }
}
async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) { await api('/api/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
  S.pushOn = false; toast('Benachrichtigungen auf diesem Gerät aus');
}

// ---------- Globale Aktionen ----------
const menu = $('#menu'), menuBtn = $('#menu-btn');
menuBtn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', String(!menu.hidden)); });
document.addEventListener('click', async (e) => {
  if (!menu.hidden && !menu.contains(e.target)) { menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  const el = e.target.closest('[data-action],[data-send]'); if (!el) return;
  if (el.dataset.send) { if (S.tab !== 'chat') setTab('chat'); send(el.dataset.send === 'Onboarding' ? 'Onboarding' : tr(el.dataset.send)); return; } // „Onboarding“ ist ein Befehl und bleibt
  const a = el.dataset.action;
  if (a === 'brief') { menu.hidden = true; if (S.tab !== 'chat') setTab('chat'); runBrief(); }
  if (a === 'push-test') {
    menu.hidden = true;
    await checkPush().catch(() => {});
    if (!S.pushOn && !(await enablePush())) return;
    api('/api/push/test', {}).then((j) => toast(j.subscribers ? `Test an ${j.subscribers} Gerät${j.subscribers > 1 ? 'e' : ''} gesendet, gleich müsste sie aufpoppen` : 'Kein Gerät angemeldet')).catch((err) => toast(err.message));
  }
  if (a === 'push-on') enablePush();
  if (a === 'fb-up') feedback('up');
  if (a === 'fb-down') feedback('down');
  if (a === 'add-cancel') dlg.close();
  if (a === 'google-setup') {
    const steps = $('#google-steps'); steps.__de ||= steps.innerHTML;
    steps.innerHTML = GOOGLE_STEPS[getLang()] || steps.__de;
    $('#redirect-uri').textContent = S.profile?.google?.redirect_uri || `${location.origin}/api/google/callback`;
    $('#g-id').value = ''; $('#g-secret').value = '';
    $('#google-dialog').showModal();
  }
  if (a === 'google-cancel') $('#google-dialog').close();
  if (a === 'copy-uri') { navigator.clipboard?.writeText($('#redirect-uri').textContent).then(() => toast('Adresse kopiert'), () => toast('Bitte von Hand kopieren')); }
  if (a === 'google-connect') location.href = '/api/google/start';
  if (a === 'google-disconnect') {
    if (!confirm(tr('Google-Verbindung trennen? Deine Termine und Aufgaben bei Google bleiben erhalten.'))) return;
    try { await api('/api/google/disconnect', {}); toast('Google getrennt'); loadProfile(); } catch (err) { toast(err.message); }
  }
  if (a === 'reset') { $('#reset-confirm').value = ''; $('#reset-dialog').showModal(); $('#reset-confirm').focus(); }
  if (a === 'reset-cancel') $('#reset-dialog').close();
  if (a === 'logout') { await api('/api/logout', {}).catch(() => {}); showLogin(); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { menu.hidden = true; menuBtn.focus(); } });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || $('#app').hidden) return;
  if (S.tab === 'chat' && !S.busy) loadChat().catch(() => {});
  if (S.tab === 'today') loadToday();
});

// ---------- Start ----------
async function startApp() {
  $('#login').hidden = true; $('#app').hidden = false;
  $('#chat-date').textContent = longDate();
  await loadChat().catch((e) => toast(e.message));
  checkPush().catch(() => {});
  const gp = new URLSearchParams(location.search).get('google');
  if (gp || location.hash === '#profile') {
    history.replaceState(null, '', '/');
    setTab('profile');
    const msg = { ok: 'Google ist verbunden! Deine Aufgaben werden jetzt abgeglichen.', abgebrochen: 'Verbindung abgebrochen', abgelaufen: 'Das hat zu lange gedauert, bitte nochmal verbinden', fehlt: 'Bitte zuerst die Zugangsdaten eintragen', fehler: 'Google hat die Verbindung abgelehnt. Stimmt die Weiterleitungs-Adresse im Google-Client?' }[gp];
    if (msg) toast(msg);
  }
}

startI18n();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
fetch('/api/session', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => (j.authed ? startApp() : showLogin())).catch(() => showLogin());

