import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { encryptPayload } from '../src/push.js';

// Testwerte aus RFC 8291, Abschnitt 5 / Anhang A
const V = {
  plaintext: 'V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg', salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  ecdh: 'kyrL1jIIOHEzg3sM2ZWRHDRB62YACZhhSlknJ672kSs', ikm: 'S4lYMb_L0FxCeq0WhDx813KgSYqU26kOyzWUdsXYyrg',
  cek: 'oIhVW04MRdy2XN9CiKLxTg', nonce: '4h_95klXJ5E_qnoN',
};

test('push: Schlüsselableitung stimmt mit RFC-8291-Testvektor überein', () => {
  const plain = Buffer.from(V.plaintext, 'base64url');
  assert.equal(plain.toString(), 'When I grow up, I want to be a watermelon');
  const { body, debug } = encryptPayload(plain, { p256dh: V.uaPublic, auth: V.auth }, { asPrivate: V.asPrivate, salt: V.salt });
  assert.equal(debug.ecdhSecret.toString('base64url'), V.ecdh);
  assert.equal(debug.ikm.toString('base64url'), V.ikm);
  assert.equal(debug.cek.toString('base64url'), V.cek);
  assert.equal(debug.nonce.toString('base64url'), V.nonce);
  // Header: salt(16) rs(4) idlen(1) as_public(65)
  assert.equal(body.subarray(0, 16).toString('base64url'), V.salt);
  assert.equal(body.readUInt32BE(16), 4096);
  assert.equal(body[20], 65);
  assert.equal(body.subarray(21, 86).toString('base64url'), V.asPublic);
  // Entschlüsseln mit dem CEK aus dem Testvektor
  const ct = body.subarray(86);
  const d = crypto.createDecipheriv('aes-128-gcm', Buffer.from(V.cek, 'base64url'), Buffer.from(V.nonce, 'base64url'));
  d.setAuthTag(ct.subarray(ct.length - 16));
  const out = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(out.subarray(0, out.length - 1).toString(), 'When I grow up, I want to be a watermelon');
  assert.equal(out[out.length - 1], 2);
});
