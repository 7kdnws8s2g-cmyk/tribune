import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { encrypt, decrypt, generateVAPIDKeys, vapidHeader, b64u, unb64u } from "../server/webpush.js";

test("le chiffrement aes128gcm se déchiffre côté navigateur", () => {
  const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
  const auth = b64u(crypto.randomBytes(16));
  const msg = JSON.stringify({ title: "⚽ BUT pour PSG !", body: "Dembélé 23' · PSG 1-0 OM" });
  const body = encrypt(msg, { p256dh: b64u(ua.getPublicKey()), auth });
  assert.equal(body.readUInt32BE(16), 4096);
  assert.equal(body.readUInt8(20), 65);
  assert.equal(decrypt(body, ua, auth), msg);
});

test("l'en-tête VAPID contient un JWT ES256 vérifiable", () => {
  const v = generateVAPIDKeys();
  const h = vapidHeader("https://fcm.googleapis.com/fcm/send/abc", v, "mailto:test@example.com");
  const [, jwt] = h.match(/^vapid t=([^,]+), k=/);
  const [hd, cl, sig] = jwt.split(".");
  const claims = JSON.parse(unb64u(cl));
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  const pub = unb64u(v.publicKey);
  const key = crypto.createPublicKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33)) } });
  assert.ok(crypto.verify("sha256", Buffer.from(`${hd}.${cl}`), { key, dsaEncoding: "ieee-p1363" }, unb64u(sig)));
});
