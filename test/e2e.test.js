// Bout en bout : faux ESPN + faux service push. Le serveur doit détecter le but et livrer une notification chiffrée.
import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import { decrypt, b64u } from "../server/webpush.js";

const team = (id, n) => ({ id: String(id), displayName: n, shortDisplayName: n, abbreviation: n.slice(0, 3) });
let score = 0;
const board = () => ({ events: [{ id: "77", date: new Date().toISOString(), status: { type: { state: "in", name: "STATUS_FIRST_HALF" } },
  competitions: [{ competitors: [{ homeAway: "home", score: String(score), team: team(160, "Paris SG") }, { homeAway: "away", score: "0", team: team(176, "Marseille") }],
    details: score ? [{ scoringPlay: true, type: { text: "Goal" }, clock: { displayValue: "12'" }, team: { id: "160" }, athletesInvolved: [{ id: "231388", displayName: "Ousmane Dembélé" }] }] : [] }] }] });
const listen = srv => new Promise(r => srv.listen(0, () => r(srv.address().port)));

test("un but d'un club suivi arrive chiffré sur l'appareil", { timeout: 20000 }, async () => {
  const espn = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url.includes("/summary")) return res.end(JSON.stringify({ keyEvents: [{ scoringPlay: true, clock: { displayValue: "12'" }, participants: [{ athlete: { id: "231388", displayName: "Ousmane Dembélé" } }, { athlete: { id: "9", displayName: "Vitinha" } }] }] }));
    res.end(JSON.stringify(board()));
  });
  const ua = crypto.createECDH("prime256v1"); ua.generateKeys();
  const auth = b64u(crypto.randomBytes(16));
  const received = [];
  const push = http.createServer((req, res) => {
    const chunks = []; req.on("data", c => chunks.push(c));
    req.on("end", () => { received.push({ headers: req.headers, text: decrypt(Buffer.concat(chunks), ua, auth) }); res.writeHead(201).end(); });
  });
  const [ep, pp] = [await listen(espn), await listen(push)];
  const dir = fs.mkdtempSync("/tmp/tribune-e2e-");
  const port = 4100 + Math.floor(Math.random() * 500);
  const srv = spawn(process.execPath, ["server/index.js"], { env: { ...process.env, PORT: String(port), DATA_DIR: dir, POLL_MS: "500", ESPN_SITE: `http://127.0.0.1:${ep}`, ESPN_WEB: `http://127.0.0.1:${ep}`, ALLOW_HTTP_PUSH: "1" }, stdio: "ignore" });
  try {
    await new Promise(r => setTimeout(r, 600));
    const sub = { endpoint: `http://127.0.0.1:${pp}/push/abc`, keys: { p256dh: b64u(ua.getPublicKey()), auth } };
    const r = await fetch(`http://127.0.0.1:${port}/api/push/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub, favs: { comps: [], teams: [{ id: "160", s: "soccer", l: "fra.1", name: "Paris SG" }], players: [] } }) });
    assert.equal(r.status, 200);
    await new Promise(r => setTimeout(r, 1200)); // premier passage : mémorise l'état sans notifier
    assert.equal(received.length, 0);
    score = 1;
    for (let i = 0; i < 30 && !received.length; i++) await new Promise(r => setTimeout(r, 200));
    assert.equal(received.length, 1);
    const msg = JSON.parse(received[0].text);
    assert.match(msg.title, /BUT pour Paris SG/);
    assert.match(msg.body, /Dembélé 12' \(passe de Vitinha\) · Paris SG 1-0 Marseille/);
    assert.equal(msg.url, "/#/match/soccer/fra.1/77");
    assert.match(received[0].headers.authorization, /^vapid t=.+, k=/);
    assert.equal(received[0].headers["content-encoding"], "aes128gcm");
  } finally { srv.kill(); espn.close(); push.close(); }
});
