// Serveur Tribune : sert l'application, relaie l'API ESPN avec cache, et envoie les notifications push.
import http from "node:http";
import fs from "node:fs";
import { generateVAPIDKeys, sendNotification } from "./webpush.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { snapshot, diffEvents, isRelevant, DEFAULT_PREFS, sides } from "../public/detect.js";
import { findComp } from "../public/catalog.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = process.env.DATA_DIR || path.join(ROOT, "data");
const PORT = Number(process.env.PORT) || 3000;
const POLL_MS = Number(process.env.POLL_MS) || 5000;
fs.mkdirSync(DATA, { recursive: true });

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/* ---------- Clés VAPID (push web) ---------- */
function loadVapid() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  const file = path.join(DATA, "vapid.json");
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const keys = generateVAPIDKeys();
  fs.writeFileSync(file, JSON.stringify(keys, null, 2));
  log("Clés VAPID générées dans", file, "— en production, fixe VAPID_PUBLIC_KEY et VAPID_PRIVATE_KEY.");
  return keys;
}
const VAPID = loadVapid();
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

/* ---------- Abonnements ---------- */
const SUBS_FILE = path.join(DATA, "subs.json");
const subs = new Map(); // endpoint -> { subscription, favs, prefs, sent: [timestamps], queue: [] }
try {
  for (const s of JSON.parse(fs.readFileSync(SUBS_FILE, "utf8"))) subs.set(s.subscription.endpoint, { ...s, sent: [], queue: [] });
  log(subs.size, "abonnement(s) chargé(s)");
} catch { /* premier démarrage */ }
let saveTimer = null;
function saveSubs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const out = [...subs.values()].map(({ subscription, favs, prefs, createdAt }) => ({ subscription, favs, prefs, createdAt }));
    fs.writeFileSync(SUBS_FILE, JSON.stringify(out));
  }, 500);
}

/* ---------- Relais ESPN avec cache ---------- */
const HOSTS = { site: process.env.ESPN_SITE || "https://site.api.espn.com", web: process.env.ESPN_WEB || "https://site.web.api.espn.com" };
const cache = new Map(); // url -> { t, ttl, status, body }
const ttlFor = p =>
  /scoreboard|summary/.test(p) ? 4e3 :
  /standings|statistics/.test(p) ? 5 * 60e3 :
  /search/.test(p) ? 10 * 60e3 :
  /news/.test(p) ? 10 * 60e3 :
  /roster|teams\/\d+$|athletes/.test(p) ? 6 * 3600e3 :
  /schedule/.test(p) ? 10 * 60e3 : 60e3;

async function espn(host, pathAndQuery, { fresh = false } = {}) {
  const url = HOSTS[host] + pathAndQuery;
  const hit = cache.get(url);
  if (!fresh && hit && Date.now() - hit.t < hit.ttl) return hit;
  const r = await fetch(url, { headers: { "User-Agent": "Tribune/2.0", Accept: "application/json" } });
  const body = await r.text();
  const entry = { t: Date.now(), ttl: r.ok ? ttlFor(pathAndQuery) : 10e3, status: r.status, body };
  cache.set(url, entry);
  if (cache.size > 3000) for (const k of [...cache.keys()].slice(0, 500)) cache.delete(k);
  return entry;
}
const espnJSON = async (host, p) => { const e = await espn(host, p); if (e.status >= 400) throw new Error(`ESPN ${e.status}`); return JSON.parse(e.body); };

/* ---------- Application HTTP (sans framework) ---------- */
const PUBLIC = path.join(ROOT, "public");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

function sendJSON(res, status, obj, extra = {}) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", ...extra });
  res.end(typeof obj === "string" ? obj : JSON.stringify(obj));
}
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", c => { size += c.length; if (size > limit) { reject(new Error("too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString() || "{}")); } catch { reject(new Error("bad json")); } });
    req.on("error", reject);
  });
}
function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/") rel = "/index.html";
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return sendJSON(res, 403, { error: "Interdit" });
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return sendJSON(res, 404, { error: "Introuvable" });
    const ext = path.extname(file);
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream", "Content-Length": st.size,
      "Cache-Control": /sw\.js$|\.html$/.test(file) ? "no-cache" : "public, max-age=3600" };
    if (file.endsWith("sw.js")) headers["Service-Worker-Allowed"] = "/";
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const cleanFavs = f => ({
  comps: (f?.comps || []).filter(x => typeof x === "string").slice(0, 100),
  teams: (f?.teams || []).map(t => ({ id: String(t.id), s: String(t.s || "soccer"), l: String(t.l || ""), name: String(t.name || "").slice(0, 80) })).slice(0, 200),
  players: (f?.players || []).map(p => ({ id: String(p.id), s: String(p.s || "soccer"), l: String(p.l || ""), teamId: String(p.teamId || ""), name: String(p.name || "").slice(0, 80) })).slice(0, 200),
});

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;
  try {
    if (p === "/api/health") return sendJSON(res, 200, { ok: true, push: true, subscribers: subs.size, pollMs: POLL_MS });

    const m = p.match(/^\/espn\/(site|web)(\/apis\/[A-Za-z0-9_\-./]*)$/);
    if (m && req.method === "GET") {
      try {
        const e = await espn(m[1], m[2] + url.search);
        return sendJSON(res, e.status, e.body, { "Cache-Control": `public, max-age=${Math.round(e.ttl / 1000)}` });
      } catch (err) {
        return sendJSON(res, 502, { error: "Source de données injoignable", detail: String(err.message || err) });
      }
    }

    if (p === "/api/push/key") return sendJSON(res, 200, { publicKey: VAPID.publicKey });

    if (p === "/api/push/subscribe" && req.method === "POST") {
      const { subscription, favs, prefs } = await readBody(req);
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth || !(/^https:\/\//.test(subscription.endpoint) || process.env.ALLOW_HTTP_PUSH === "1"))
        return sendJSON(res, 400, { error: "Abonnement invalide" });
      const prev = subs.get(subscription.endpoint);
      subs.set(subscription.endpoint, {
        subscription: { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
        favs: cleanFavs(favs), prefs: { ...DEFAULT_PREFS, ...(prefs || {}) },
        createdAt: prev?.createdAt || Date.now(), sent: prev?.sent || [], queue: prev?.queue || [],
      });
      saveSubs();
      return sendJSON(res, 200, { ok: true });
    }
    if (p === "/api/push/unsubscribe" && req.method === "POST") {
      const { endpoint } = await readBody(req);
      subs.delete(endpoint); saveSubs();
      return sendJSON(res, 200, { ok: true });
    }
    if (p === "/api/push/test" && req.method === "POST") {
      const { endpoint } = await readBody(req);
      const s = subs.get(endpoint);
      if (!s) return sendJSON(res, 404, { error: "Appareil non abonné" });
      const ok = await send(s, { title: "Tribune", body: "Les notifications fonctionnent sur cet appareil.", tag: "test", url: "/#/profile" });
      return sendJSON(res, ok ? 200 : 502, { ok });
    }
    if (p.startsWith("/api/") || p.startsWith("/espn/")) return sendJSON(res, 404, { error: "Route inconnue" });
    if (req.method === "GET" || req.method === "HEAD") return serveStatic(req, res, p);
    sendJSON(res, 405, { error: "Méthode non autorisée" });
  } catch (err) {
    sendJSON(res, 400, { error: "Requête invalide" });
  }
});

/* ---------- Envoi des push avec anti-spam ---------- */
async function send(s, payload) {
  try {
    await sendNotification(s.subscription, JSON.stringify(payload), { vapid: VAPID, subject: VAPID_SUBJECT, topic: (payload.tag || "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 32) || undefined });
    return true;
  } catch (err) {
    if (err.statusCode === 404 || err.statusCode === 410) { subs.delete(s.subscription.endpoint); saveSubs(); log("Abonnement expiré supprimé"); }
    else log("Échec push", err.statusCode || err.message);
    return false;
  }
}

const MAX_PER_MIN = 5;
async function flushQueues() {
  const now = Date.now();
  for (const s of subs.values()) {
    if (!s.queue.length) continue;
    s.sent = s.sent.filter(t => now - t < 60e3);
    const room = MAX_PER_MIN - s.sent.length;
    if (room <= 0) continue; // on garde la file pour la minute suivante
    if (s.queue.length > 3 || room === 1 && s.queue.length > 1) {
      // Regroupement : une seule notification qui résume
      const items = s.queue.splice(0);
      const goals = items.filter(i => i.kind === "goal" || i.kind === "penalty").length;
      await send(s, {
        title: goals > 1 ? `⚽ ${goals} buts dans tes matchs suivis` : `${items.length} nouveaux événements`,
        body: items.slice(0, 4).map(i => `${i.title.replace(/^\S+\s/, "")} · ${i.body}`).join("\n"),
        tag: "group", url: "/#/live",
      });
      s.sent.push(now);
    } else {
      for (const item of s.queue.splice(0, room)) { await send(s, item); s.sent.push(now); }
    }
  }
}

/* ---------- Surveillance des matchs ---------- */
const state = new Map();       // matchId -> snapshot
const lineupDone = new Set();  // matchIds déjà notifiés pour la compo
const subsDone = new Set();    // clés de remplacement déjà notifiées

function watchedLeagues() {
  const set = new Map();
  for (const s of subs.values()) {
    for (const k of s.favs.comps) { const [sp, l] = k.split("/"); if (sp && l) set.set(k, { s: sp, l }); }
    for (const t of [...s.favs.teams, ...s.favs.players]) if (t.l) set.set(`${t.s}/${t.l}`, { s: t.s, l: t.l });
  }
  return [...set.values()];
}

function dispatch(events, extraFilter) {
  for (const e of events) {
    for (const s of subs.values()) {
      if (!isRelevant(e, s.favs, s.prefs)) continue;
      if (extraFilter && !extraFilter(s, e)) continue;
      if (s.queue.some(q => q.tag === e.tag)) continue;
      s.queue.push({ kind: e.kind, title: e.title, body: e.body, tag: e.tag, url: `/#/match/${e.sport}/${e.league}/${e.matchId}` });
    }
  }
}

async function enrichAssist(lg, e) {
  // Le tableau de scores donne le buteur ; le résumé du match donne aussi le passeur.
  try {
    const sum = await espnJSON("site", `/apis/site/v2/sports/${lg.s}/${lg.l}/summary?event=${e.matchId}`);
    const k = (sum.keyEvents || []).filter(x => x.scoringPlay).find(x => !e.clock || x.clock?.displayValue === e.clock) ;
    const parts = (k?.participants || []).map(p => p.athlete?.displayName).filter(Boolean);
    if (parts[1] && e.playerIds.length) e.body = e.body.replace(" · ", ` (passe de ${parts[1]}) · `);
    for (const p of k?.participants || []) if (p.athlete?.id) e.playerIds.push(String(p.athlete.id));
  } catch { /* le passeur reste inconnu */ }
}

async function checkSummaries(lg, ev) {
  const snap = snapshot(ev);
  const { home, away } = sides(ev);
  const kickoff = new Date(ev.date).getTime();
  const teamFollowed = [...subs.values()].some(s => s.favs.teams.some(t => [snap.hId, snap.aId].includes(t.id)) || s.favs.players.some(p => [snap.hId, snap.aId].includes(p.teamId)));
  if (!teamFollowed) return;
  const pre = snap.state === "pre" && kickoff - Date.now() < 75 * 60e3 && kickoff - Date.now() > -5 * 60e3;
  const live = snap.state === "in";
  if (!(pre && !lineupDone.has(snap.id)) && !live) return;
  let sum;
  try { sum = await espnJSON("site", `/apis/site/v2/sports/${lg.s}/${lg.l}/summary?event=${snap.id}`); } catch { return; }
  const base = { matchId: snap.id, teamIds: [snap.hId, snap.aId], league: lg.l, sport: lg.s, playerIds: [] };
  if (pre && !lineupDone.has(snap.id) && (sum.rosters || []).some(r => (r.roster || []).length)) {
    lineupDone.add(snap.id);
    const ids = (sum.rosters || []).flatMap(r => (r.roster || []).filter(p => p.starter).map(p => String(p.athlete?.id)));
    dispatch([{ ...base, kind: "lineup", title: "📋 Compositions officielles", body: `${home.team?.displayName} – ${away.team?.displayName}`, tag: `lineup-${snap.id}`, playerIds: ids }]);
  }
  if (live) {
    for (const k of sum.keyEvents || []) {
      if (!/substitution/i.test(k.type?.type || k.type?.text || "")) continue;
      const key = `${snap.id}-${k.id || k.clock?.displayValue}`;
      if (subsDone.has(key)) continue;
      subsDone.add(key);
      const ids = (k.participants || []).map(p => String(p.athlete?.id || ""));
      const names = (k.participants || []).map(p => p.athlete?.displayName).filter(Boolean);
      dispatch([{ ...base, kind: "sub", title: "🔁 Remplacement", body: `${k.clock?.displayValue || ""} ${names[0] ? "Entrée : " + names[0] : ""}${names[1] ? " · Sortie : " + names[1] : ""}`, tag: `sub-${key}`, playerIds: ids }],
        (s) => s.favs.players.some(p => ids.includes(p.id)));
    }
  }
}

let polling = false;
async function poll() {
  if (polling || !subs.size) return;
  polling = true;
  try {
    for (const lg of watchedLeagues()) {
      let data;
      try { data = JSON.parse((await espn("site", `/apis/site/v2/sports/${lg.s}/${lg.l}/scoreboard`, { fresh: true })).body); }
      catch { continue; }
      const league = findComp(lg.s, lg.l) || { ...lg, n: lg.l };
      for (const ev of data.events || []) {
        const prev = state.get(String(ev.id));
        const events = diffEvents(prev, ev, league);
        for (const e of events) if ((e.kind === "goal" || e.kind === "penalty") && !e.scorerOnly) await enrichAssist(lg, e);
        if (events.length) { log(lg.l, events.map(e => e.kind).join(",")); dispatch(events); }
        state.set(String(ev.id), snapshot(ev));
        await checkSummaries(lg, ev);
      }
    }
    await flushQueues();
  } catch (err) { log("Erreur de surveillance", err.message); }
  finally { polling = false; }
}

setInterval(poll, POLL_MS);
setInterval(() => { if (state.size > 5000) state.clear(); if (subsDone.size > 20000) subsDone.clear(); }, 3600e3);

server.listen(PORT, () => log(`Tribune en ligne sur http://localhost:${PORT} · surveillance toutes les ${POLL_MS / 1000} s`));
