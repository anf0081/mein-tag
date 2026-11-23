// Oberflächensprache: Die App ist auf Deutsch geschrieben; dieses Modul übersetzt die angezeigten Texte
// automatisch ins Englische oder Portugiesische (Wörterbuch + Muster). Inhalte (Chat, eigene Aufgaben) bleiben unverändert.
import { DICT, RULES } from './i18n-dict.js';

const LOCALES = { de: 'de-DE', en: 'en-GB', pt: 'pt-PT' };
let lang = 'de';
let saved = null;
try { saved = typeof localStorage !== 'undefined' ? localStorage.getItem('mt-lang') : null; } catch { /* privat */ }
if (LOCALES[saved]) lang = saved;
else if (typeof navigator !== 'undefined') { const n = (navigator.language || '').slice(0, 2); if (LOCALES[n]) lang = n; }

export const getLang = () => lang;
export const locale = () => LOCALES[lang];

/** Einen deutschen UI-Text übersetzen (unbekannte Texte bleiben, wie sie sind). */
export function tr(s) {
  if (lang === 'de' || s == null) return s;
  const str = String(s);
  const key = str.trim();
  if (!key) return str;
  const d = DICT[lang];
  const wrap = (t) => str.replace(key, t);
  if (d[key] !== undefined) return wrap(d[key]);
  for (const [re, out] of RULES) {
    const m = key.match(re);
    if (m && out[lang] !== undefined) return wrap(typeof out[lang] === 'function' ? out[lang](...m.slice(1).map((x) => (x === undefined ? x : tr(x)))) : key.replace(re, out[lang]));
  }
  const p = key.match(/^([^:]{2,48}): (.+)$/s); // „Gemerkt: …“, „Sprache: …“
  if (p && d[p[1]] !== undefined) return wrap(`${d[p[1]]}: ${p[2]}`);
  return str;
}

const SKIP = 'script,style,[data-no-i18n]';
const ATTRS = ['placeholder', 'aria-label', 'title'];

function doText(node) {
  if (node.parentElement?.tagName === 'TEXTAREA') return; // Eingaben nie anfassen
  if (node.__tr !== undefined && node.nodeValue === node.__tr && node.__lang === lang) return; // schon übersetzt
  if (node.__de === undefined || node.nodeValue !== node.__tr) node.__de = node.nodeValue; // neuer (deutscher) Text
  const out = tr(node.__de);
  node.__tr = out; node.__lang = lang;
  if (node.nodeValue !== out) node.nodeValue = out;
}
function doEl(el) {
  el.__deAttrs ||= {};
  for (const a of ATTRS) {
    if (!el.hasAttribute(a)) continue;
    const v = el.getAttribute(a);
    if (el.__deAttrs[a] === undefined || v !== el.__trAttrs?.[a]) el.__deAttrs[a] = v;
    const out = tr(el.__deAttrs[a]);
    (el.__trAttrs ||= {})[a] = out;
    if (v !== out) el.setAttribute(a, out);
  }
}

/** Alles unterhalb von root übersetzen. */
export function translateTree(root) {
  if (!root) return;
  if (root.nodeType === 3) { if (!root.parentElement?.closest(SKIP)) doText(root); return; }
  if (root.nodeType !== 1 || root.closest?.(SKIP)) return;
  doEl(root);
  const w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let n = w.nextNode(); n; n = w.nextNode()) (n.nodeType === 3 ? doText(n) : doEl(n));
}

let observer = null;
export function startI18n() {
  document.documentElement.lang = lang;
  translateTree(document.body);
  observer = new MutationObserver((muts) => {
    for (const m of muts) {
      if (m.type === 'childList') m.addedNodes.forEach(translateTree);
      else if (m.type === 'characterData') { if (!m.target.parentElement?.closest(SKIP)) doText(m.target); }
      else if (m.type === 'attributes' && ATTRS.includes(m.attributeName)) { if (!m.target.closest(SKIP)) doEl(m.target); }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}

/** Sprache wechseln; die App rendert danach neu (rerender). */
export function setLang(l, rerender) {
  if (!LOCALES[l] || l === lang) return false;
  lang = l;
  try { localStorage.setItem('mt-lang', l); } catch { /* egal */ }
  if (typeof document === 'undefined') return true;
  document.documentElement.lang = l;
  translateTree(document.body); // statische Texte (mit gemerktem Original)
  rerender?.();
  return true;
}

// Für Tests: deutsche Texte sammeln, die noch nicht übersetzt sind
export function missing(all = false) {
  const out = new Set();
  const de = /[äöüßÄÖÜ]|\b(der|die|das|und|nicht|ist|du|dich|dein|deine|mit|für|heute|morgen|Aufgabe|Erledigt|Uhrzeit|Name|Ort|Bild|Ändern|Speichern|Löschen|Abbrechen|Schließen|Termine?|Routinen?|Ziele?|Wetter|Nachrichten|Sprache|Daten|Kosten)\b/i;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    if (n.parentElement?.closest(SKIP) || (!all && n.parentElement?.closest('[hidden]'))) continue;
    const t = n.nodeValue.trim(); if (t && (all ? /\p{L}/u.test(t) : de.test(t))) out.add(t);
  }
  document.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => { if (el.closest(SKIP)) return; for (const a of ATTRS) { const v = el.getAttribute(a); if (v && (all ? /\p{L}/u.test(v) : de.test(v))) out.add(`@${a}: ${v}`); } });
  return [...out];
}
