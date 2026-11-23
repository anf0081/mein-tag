// Web Push ohne Abhängigkeiten: VAPID (RFC 8292) + Nachrichtenverschlüsselung aes128gcm (RFC 8291/8188)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url');

function hkdf(salt, ikm, info, len) {
  const prk = crypto.createHmac('sha256', salt).update(ikm).digest();
  return crypto.createHmac('sha256', prk).update(Buffer.concat([info, Buffer.from([1])])).digest().subarray(0, len);
}

export function loadVapid(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* neu erzeugen */ }
  const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
  const v = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(v), { mode: 0o600 });
  return v;
}

/** Verschlüsselt payload (Buffer) für ein Abo {p256dh, auth}. Optional feste Werte für Tests. */
export function encryptPayload(payload, { p256dh, auth }, fixed = {}) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  const asEcdh = crypto.createECDH('prime256v1');
  if (fixed.asPrivate) asEcdh.setPrivateKey(unb64u(fixed.asPrivate)); else asEcdh.generateKeys();
  const asPublic = asEcdh.getPublicKey();
  const salt = fixed.salt ? unb64u(fixed.salt) : crypto.randomBytes(16);
  const ecdhSecret = asEcdh.computeSecret(uaPublic);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]);
  const ikm = hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16);
  const nonce = hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12);
  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  const header = Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic]);
  return { body: Buffer.concat([header, body]), debug: { ecdhSecret, ikm, cek, nonce } };
}

function vapidJwt(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const pub = unb64u(vapid.publicKey);
  const key = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: 'jwk',
  });
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `${head}.${claims}.${b64u(sig)}`;
}

/** Sendet eine Push-Nachricht. Gibt 'gone' zurück, wenn das Abo ungültig ist. */
export async function sendPush(sub, data, vapid, subject = 'mailto:admin@localhost') {
  const { body } = encryptPayload(Buffer.from(JSON.stringify(data)), sub.keys);
  const r = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: `vapid t=${vapidJwt(sub.endpoint, vapid, subject)}, k=${vapid.publicKey}`,
      'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal',
    },
    body,
  });
  if (r.status === 404 || r.status === 410) return 'gone';
  if (!r.ok) throw new Error(`Push ${r.status}`);
  return 'ok';
}
