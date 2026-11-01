// Push web sans dépendance : VAPID (RFC 8292) + chiffrement aes128gcm (RFC 8291 / RFC 8188).
import crypto from "node:crypto";

export const b64u = buf => Buffer.from(buf).toString("base64url");
export const unb64u = str => Buffer.from(str, "base64url");

export function generateVAPIDKeys() {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

function privateKeyObject(publicKeyB64, privateKeyB64) {
  const pub = unb64u(publicKeyB64);
  return crypto.createPrivateKey({
    format: "jwk",
    key: { kty: "EC", crv: "P-256", d: privateKeyB64, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
  });
}

export function vapidHeader(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const data = `${header}.${claims}`;
  const sig = crypto.sign("sha256", Buffer.from(data), { key: privateKeyObject(vapid.publicKey, vapid.privateKey), dsaEncoding: "ieee-p1363" });
  return `vapid t=${data}.${b64u(sig)}, k=${vapid.publicKey}`;
}

const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();

/** Chiffre un message pour un abonnement { keys: { p256dh, auth } }. Retourne le corps HTTP complet. */
export function encrypt(payload, keys, { salt = crypto.randomBytes(16), serverECDH } = {}) {
  const uaPublic = unb64u(keys.p256dh);
  const authSecret = unb64u(keys.auth);
  const ecdh = serverECDH || crypto.createECDH("prime256v1");
  if (!serverECDH) ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const ecdhSecret = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(authSecret, ecdhSecret);
  const keyInfo = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]);
  const ikm = hmac(prkKey, Buffer.concat([keyInfo, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);

  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02 = dernier enregistrement
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(4096, 16);
  header.writeUInt8(asPublic.length, 20);
  return Buffer.concat([header, asPublic, body]);
}

/** Déchiffrement côté navigateur, utilisé uniquement par les tests pour vérifier le chiffrement. */
export function decrypt(body, uaECDH, authSecretB64) {
  const salt = body.subarray(0, 16);
  const idlen = body.readUInt8(20);
  const asPublic = body.subarray(21, 21 + idlen);
  const data = body.subarray(21 + idlen);
  const uaPublic = uaECDH.getPublicKey();
  const ecdhSecret = uaECDH.computeSecret(asPublic);
  const prkKey = hmac(unb64u(authSecretB64), ecdhSecret);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(data.subarray(data.length - 16));
  const plain = Buffer.concat([d.update(data.subarray(0, data.length - 16)), d.final()]);
  return plain.subarray(0, plain.lastIndexOf(2)).toString();
}

export class PushError extends Error {
  constructor(statusCode, body) { super(`Push refusé (${statusCode}) ${body || ""}`.trim()); this.statusCode = statusCode; }
}

export async function sendNotification(subscription, payload, { vapid, subject, ttl = 600, urgency = "high", topic } = {}) {
  const headers = {
    TTL: String(ttl),
    Urgency: urgency,
    "Content-Encoding": "aes128gcm",
    "Content-Type": "application/octet-stream",
    Authorization: vapidHeader(subscription.endpoint, vapid, subject),
  };
  if (topic) headers.Topic = topic;
  const r = await fetch(subscription.endpoint, { method: "POST", headers, body: encrypt(payload, subscription.keys) });
  if (!r.ok) throw new PushError(r.status, await r.text().catch(() => ""));
  return r.status;
}
