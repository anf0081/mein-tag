import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang, tr, getLang } from '../public/i18n.js';
import { DICT } from '../public/i18n-dict.js';

test('Oberfläche: Wörterbuch und Muster (en/pt), Inhalte bleiben', () => {
  setLang('en');
  assert.equal(getLang(), 'en');
  assert.equal(tr('Übersicht'), 'Overview');
  assert.equal(tr('  Speichern '), '  Save ');
  assert.equal(tr('Später (3)'), 'Later (3)');
  assert.equal(tr('Routine · Heute fällig'), 'Routine · Due today');
  assert.equal(tr('Überfällig seit 4 Tagen'), 'Overdue for 4 days');
  assert.equal(tr('alle 2 Wochen · nächstes Mal Mon 23/11/2026'), 'every 2 weeks · next Mon 23/11/2026');
  assert.equal(tr('Gemerkt: Mag Tee'), 'Noted: Mag Tee');
  assert.equal(tr('Nach deinem Ort: Portugal, Madeira und Machico'), 'Based on your location: Portugal, Madeira and Machico');
  assert.equal(tr('Pflanzen gießen'), 'Pflanzen gießen', 'eigene Inhalte bleiben unverändert');
  setLang('pt');
  assert.equal(tr('Erledigt (2)'), 'Feito (2)');
  assert.equal(tr('Heute, 09:15'), 'Hoje, 09:15');
  assert.equal(tr('Test an 2 Geräte gesendet, gleich müsste sie aufpoppen'), 'Teste enviado para 2 dispositivo(s), deve aparecer já');
  setLang('de');
  assert.equal(tr('Übersicht'), 'Übersicht');
  assert.deepEqual(Object.keys(DICT.en).filter((k) => !(k in DICT.pt)), [], 'jeder Text hat beide Übersetzungen');
});

test('Server-Texte und Warnungen in der eingestellten Sprache', async () => {
  const { L } = await import('../src/i18n.js');
  const { describeWarning } = await import('../src/warnings.js');
  assert.equal(L({ profile: { language: 'en' } })('Heute fällig'), 'Due today');
  assert.equal(L({ profile: { language: 'de' } })('Heute fällig'), 'Heute fällig');
  const w = { source: 'DWD', level: 'Orange', type: 'Sturmböen', type_en: 'Gale-Force Gusts', area: 'Hamburg', start: '2026-11-23T08:00:00Z', end: null, text: 'Amtliche WARNUNG', text_en: 'Official WARNING' };
  assert.match(describeWarning(w, 'Europe/Berlin', 'en'), /^Orange: Gale-Force Gusts, Hamburg \(from .*\) – Official WARNING \[DWD\]$/);
  assert.match(describeWarning(w, 'Europe/Berlin', 'pt'), /^Laranja: Gale-Force Gusts, Hamburg \(a partir de /);
});
