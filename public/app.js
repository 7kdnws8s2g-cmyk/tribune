// Tribune — application (module). Données ESPN, via le serveur Tribune s'il est présent, sinon en direct.
import { CATALOG, keyOf, findComp, LIVE_LEAGUES } from "./catalog.js";
import { NOTIF_TYPES, DEFAULT_PREFS, snapshot, diffEvents, isRelevant, scoreVal, sides } from "./detect.js";
import { demoRespond } from "./demo.js";

/* ====================== Utilitaires ====================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ymd = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
const fmtTime = iso => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
const fmtDay = iso => new Date(iso).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
const fmtLong = iso => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage plein ou bloqué */ } },
};
const ICON = {
  star: '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg>',
  starO: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8z"/></svg>',
};

/* ====================== Réglages, favoris, index ====================== */
let settings = store.get("tribune.settings", {});
settings = { theme: "auto", opaque: false, motion: true, ...settings, prefs: { ...DEFAULT_PREFS, ...(settings.prefs || {}) } };
const saveSettings = () => { store.set("tribune.settings", settings); applySettings(); syncPushSoon(); };

let favs = store.get("tribune.favs2", null);
if (!favs) {
  const old = store.get("tribune.favs", null);
  favs = { comps: Array.isArray(old) ? old : ["soccer/fra.1", "soccer/uefa.champions", "soccer/eng.1", "soccer/esp.1"], teams: [], players: [] };
}
const saveFavs = () => { store.set("tribune.favs2", favs); syncPushSoon(); };
const isFav = (type, id) => type === "comps" ? favs.comps.includes(id) : favs[type].some(x => String(x.id) === String(id));
function toggleFav(type, item) {
  if (type === "comps") favs.comps = favs.comps.includes(item) ? favs.comps.filter(x => x !== item) : [...favs.comps, item];
  else favs[type] = isFav(type, item.id) ? favs[type].filter(x => String(x.id) !== String(item.id)) : [...favs[type], item];
  saveFavs();
  return isFav(type, type === "comps" ? item : item.id);
}

for (const c of store.get("tribune.customs", [])) if (!findComp(c.s, c.l)) CATALOG.push(c);

// Index local des clubs et joueurs déjà vus : alimente la recherche instantanée
const idx = store.get("tribune.idx", { t: {}, p: {} });
const saveIdx = debounce(() => {
  const trim = (o, n) => { const k = Object.keys(o); if (k.length > n) for (const x of k.slice(0, k.length - n)) delete o[x]; };
  trim(idx.t, 4000); trim(idx.p, 6000); store.set("tribune.idx", idx);
}, 1500);
function noteTeam(t, s, l) {
  if (!t?.id) return;
  const prev = idx.t[t.id] || {};
  idx.t[t.id] = { id: String(t.id), n: t.displayName || t.name || prev.n, a: t.abbreviation || prev.a || "", c: t.color || prev.c || "", c2: t.alternateColor || prev.c2 || "", logo: t.logo || t.logos?.[0]?.href || prev.logo || "", s: s || prev.s, l: prev.l && prev.l !== "all" && /\.\d$/.test(prev.l) ? prev.l : (l || prev.l) };
  saveIdx();
}
idx.lg ||= {};
// Logos officiels des compétitions : fournis par la source à chaque lecture, donc remplacés automatiquement
// quand l'organisateur change de logo (nouvelle Coupe du monde, nouvelle identité de la Ligue des champions…)
function noteLeague(c, v) {
  const logos = v?.leagues?.[0]?.logos || [];
  if (!logos.length) return;
  const dark = logos.find(x => (x.rel || []).includes("dark"))?.href;
  const def = (logos.find(x => !(x.rel || []).includes("dark")) || logos[0]).href;
  const prev = idx.lg[c.l] || {};
  if (prev.d !== def || prev.k !== dark) { idx.lg[c.l] = { d: def, k: dark || "" }; saveIdx(); }
}
const darkUI = () => { const t = document.documentElement.dataset.theme; return t ? t === "dark" : !matchMedia("(prefers-color-scheme: light)").matches; };
function leagueBadge(c, size = 22) {
  const e = idx.lg[c.l];
  const href = typeof e === "string" ? e : e && ((darkUI() && e.k) || e.d);
  if (href) return `<img src="${esc(href)}" alt="" style="width:${size}px;height:${size}px;object-fit:contain" data-ph="${esc(c.f)}">`;
  return `<span data-lgfill="${esc(keyOf(c))}" data-size="${size}">${c.f}</span>`;
}
// Va chercher les logos manquants pour ce qui est affiché à l'écran, sans bloquer la page
let filling = false;
async function fillLeagueLogos() {
  if (DEMO || filling) return;
  const keys = [...new Set($$("[data-lgfill]").map(x => x.dataset.lgfill))].slice(0, 40);
  if (!keys.length) return;
  filling = true;
  try {
    await pool(keys, 4, async k => {
      const [sp, l] = k.split("/");
      const c = findComp(sp, l) || { s: sp, l };
      await API.scoreboard(c);
      for (const el of $$(`[data-lgfill="${CSS.escape(k)}"]`)) {
        const html = leagueBadge(c, +el.dataset.size || 22);
        if (!html.includes("data-lgfill")) el.outerHTML = html;
      }
    });
  } finally { filling = false; }
}
function notePlayer(a, s, l, team) {
  if (!a?.id) return;
  idx.p[a.id] = { id: String(a.id), n: a.displayName || a.fullName || a.name, img: a.headshot?.href || a.headshot || "", tn: team?.displayName || team?.name || idx.p[a.id]?.tn || "", tid: String(team?.id || idx.p[a.id]?.tid || ""), s, l };
  saveIdx();
}

/* ====================== Données (ESPN) ====================== */
let PROXY = false;      // vrai quand le serveur Tribune répond : relais + cache + push
let DEMO = false;       // vrai quand aucune source réelle n'est joignable : données fictives
const HOST = { site: "https://site.api.espn.com", web: "https://site.web.api.espn.com" };
const mem = new Map();
const liveIds = new Set();

const REFRESH = 5000;
let refreshing = false; // vrai pendant une mise à jour automatique : on garde l'écran, on remplace seulement les données
const softRun = fn => { refreshing = true; try { fn(); } finally { refreshing = false; } };
async function get(host, path, ttl = 20000) {
  if (DEMO) { await sleep(120 + Math.random() * 200); const v = demoRespond(path); if (!v || v.code) throw new Error("Introuvable"); return v; }
  const u = PROXY ? `/espn/${host}${path}` : HOST[host] + path;
  const hit = mem.get(u);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(u, { signal: ctl.signal });
    if (!r.ok) throw new Error(r.status === 404 ? "Introuvable" : `Erreur ${r.status}`);
    const v = await r.json();
    mem.set(u, { t: Date.now(), v });
    if (mem.size > 400) mem.delete(mem.keys().next().value);
    return v;
  } catch (e) {
    if (hit) return hit.v; // hors ligne : on sert la dernière version connue
    throw e.name === "AbortError" ? new Error("Délai dépassé") : e;
  } finally { clearTimeout(timer); }
}
async function firstOk(fns) {
  let last;
  for (const f of fns) { try { const v = await f(); if (v && !v.code) return v; } catch (e) { last = e; } }
  throw last || new Error("Indisponible");
}
const API = {
  scoreboard: (c, date) => get("site", `/apis/site/v2/sports/${c.s}/${c.l}/scoreboard${date ? `?dates=${date}` : ""}`, 4000).then(v => { noteLeague(c, v); return v; }),
  standings: c => get("site", `/apis/v2/sports/${c.s}/${c.l}/standings`, 120000),
  news: c => get("site", `/apis/site/v2/sports/${c.s}/${c.l}/news`, 300000),
  summary: (s, l, id) => get("site", `/apis/site/v2/sports/${s}/${l}/summary?event=${id}`, 4000),
  team: (s, l, id) => get("site", `/apis/site/v2/sports/${s}/${l}/teams/${id}`, 3600e3),
  roster: (s, l, id) => get("site", `/apis/site/v2/sports/${s}/${l}/teams/${id}/roster`, 3600e3),
  schedule: (s, l, id) => get("site", `/apis/site/v2/sports/${s}/${l}/teams/${id}/schedule`, 600e3),
  athlete: (s, l, id) => firstOk([
    () => get("web", `/apis/common/v3/sports/${s}/athletes/${id}`, 3600e3),
    ...(l && l !== "x" ? [() => get("web", `/apis/common/v3/sports/${s}/${l}/athletes/${id}`, 3600e3)] : []),
  ]),
  athleteStats: (s, l, id) => firstOk([
    () => get("web", `/apis/common/v3/sports/${s}/athletes/${id}/stats`, 3600e3),
    ...(l && l !== "x" ? [() => get("web", `/apis/common/v3/sports/${s}/${l}/athletes/${id}/stats`, 3600e3)] : []),
  ]),
  leaders: c => firstOk([
    () => get("site", `/apis/site/v2/sports/${c.s}/${c.l}/statistics`, 600e3),
    () => get("web", `/apis/site/v2/sports/${c.s}/${c.l}/statistics`, 600e3),
  ]),
  search: q => firstOk([
    () => get("web", `/apis/search/v2?query=${encodeURIComponent(q)}&limit=10`, 600e3),
    () => get("web", `/apis/common/v3/search?query=${encodeURIComponent(q)}&limit=12&mode=prefix`, 600e3),
  ]),
};
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = { ok: true, v: await fn(items[k], k) }; } catch (e) { out[k] = { ok: false, e }; } }
  }));
  return out;
}

/* ====================== Rendu commun ====================== */
const view = () => $("#view");
let navId = 0;

function crestStyle(team) {
  const c1 = team?.color || idx.t[team?.id]?.c, c2 = team?.alternateColor || idx.t[team?.id]?.c2;
  if (!c1) return "";
  const lum = h => { const n = parseInt(h.replace("#", "").padEnd(6, "0").slice(0, 6), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000; };
  return ` style="background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.45),transparent 45%),linear-gradient(145deg,#${esc(c1)},#${esc(c2 || c1)});color:${lum(c1) > 160 ? "#111" : "#fff"};box-shadow:inset 0 0 0 2px rgba(255,255,255,.35)"`;
}
function logo(team, cls = "logo") {
  const src = team?.logo || team?.logos?.[0]?.href;
  const ab = esc((team?.abbreviation || team?.shortDisplayName || team?.displayName || "?").slice(0, 3));
  if (!src) return `<span class="${cls} ph"${crestStyle(team)}>${ab}</span>`;
  return `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async" data-ph="${ab}">`;
}
function face(src, name, cls = "ph-img") {
  const ini = esc(String(name || "?").split(/\s+/).map(w => w[0]).slice(0, 2).join(""));
  return src ? `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" data-ph="${ini}">` : `<span class="${cls}">${ini}</span>`;
}
// Remplace les images cassées par des initiales
document.addEventListener("error", e => {
  const img = e.target;
  if (img.tagName !== "IMG" || !img.dataset.ph) return;
  const span = document.createElement("span");
  span.className = img.className + (img.classList.contains("logo") ? " ph" : "");
  span.textContent = img.dataset.ph;
  img.replaceWith(span);
}, true);

function status(ev) {
  const st = ev.status || ev.competitions?.[0]?.status || {};
  const t = st.type || {};
  return { state: t.state || "pre", detail: t.shortDetail || t.detail || "", name: t.name || "" };
}
function stateLabel(ev) {
  const s = status(ev);
  if (s.state === "in") {
    let lbl = s.detail;
    if (/HALF/i.test(s.name) && /HALFTIME/i.test(s.name) || /^HT$/i.test(lbl)) lbl = "Mi-temps";
    return `<span class="pill live"><span class="dot"></span>${esc(lbl || "En direct")}</span>`;
  }
  if (s.state === "post") {
    let lbl = "Terminé";
    if (/POSTPONED/i.test(s.name)) lbl = "Reporté"; else if (/CANCEL/i.test(s.name)) lbl = "Annulé";
    else if (/PEN/i.test(s.detail) || /SHOOTOUT/i.test(s.name)) lbl = "T.a.b."; else if (/AET|ET\b/.test(s.detail)) lbl = "Après prol.";
    return `<span class="pill">${lbl}</span>`;
  }
  if (/POSTPONED/i.test(s.name)) return `<span class="pill">Reporté</span>`;
  const sameDay = new Date(ev.date).toDateString() === new Date().toDateString();
  return `<span class="pill">${sameDay ? "Aujourd'hui" : esc(fmtDay(ev.date))}</span>`;
}
const lastScore = new Map();
function matchRow(ev, c) {
  const { home, away, comp } = sides(ev);
  const s = status(ev);
  const showScore = s.state !== "pre" && !/POSTPONED|CANCEL/i.test(s.name);
  const hs = scoreVal(home.score), as = scoreVal(away.score);
  const prev = lastScore.get(ev.id);
  const [ph, pa] = prev ? prev.split("-") : [];
  if (showScore) lastScore.set(ev.id, `${hs}-${as}`);
  if (s.state === "in") liveIds.add(ev.id); else liveIds.delete(ev.id);
  noteTeam(home.team, c.s, c.l); noteTeam(away.team, c.s, c.l);
  const lg = comp?.league?.slug || c.l;
  const reds = id => (comp?.details || []).filter(d => (d.redCard || /red card/i.test(d.type?.text || "")) && String(d.team?.id) === String(id)).length;
  const today = new Date(ev.date).toDateString() === new Date().toDateString();
  let st;
  if (s.state === "in") st = `<span class="lmin">${/HALFTIME/i.test(s.name) || /^HT$|mi-temps/i.test(s.detail) ? "MT" : esc(s.detail.replace(/\s/g, "") || "Live")}</span>`;
  else if (s.state === "post") st = `<span class="fin">${/POSTPONED/i.test(s.name) ? "Rep." : /CANCEL/i.test(s.name) ? "Ann." : /PEN|SHOOTOUT/i.test(s.detail + s.name) ? "T.a.b." : /AET|ET\b/.test(s.detail) ? "A.p." : "Fin"}</span>`;
  else st = /POSTPONED/i.test(s.name) ? `<span class="fin">Rep.</span>` : `<span class="ko">${fmtTime(ev.date)}</span>${today ? "" : `<small>${esc(new Date(ev.date).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }))}</small>`}`;
  const line = (cpt, win, lose) => { const n = reds(cpt.team?.id);
    return `<div class="mt${lose ? " lose" : ""}">${logo(cpt.team)}<span class="tn">${esc(cpt.team?.shortDisplayName || cpt.team?.displayName || "—")}</span>${n ? `<i class="rc" title="Carton rouge">${n > 1 ? n : ""}</i>` : ""}${win ? '<span class="cup" title="Gagnant">🏆</span>' : ""}</div>`; };
  const fl = (now, before) => prev && before !== undefined && String(before) !== String(now) ? ' class="flash"' : "";
  return `<a class="mrow press${s.state === "in" ? " is-live" : ""}" href="#/match/${c.s}/${esc(lg)}/${esc(ev.id)}">
    <div class="mst">${st}</div>
    <div class="mts">${line(home, home.winner === true, away.winner === true)}${line(away, away.winner === true, home.winner === true)}</div>
    <div class="msc${s.state === "in" ? " live" : ""}">${showScore ? `<b${fl(hs, ph)}>${esc(hs || "0")}</b><b${fl(as, pa)}>${esc(as || "0")}</b>` : ""}</div>
  </a>`;
}
let collapsed = new Set(store.get("tribune.collapsed", []));
const CHEV = '<svg class="chev icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
function blockHTML(c, evs, opts = {}) {
  const k = opts.key || keyOf(c);
  const live = evs.filter(e => status(e).state === "in").length;
  const sub = opts.sub ?? c.c;
  return `<section class="block glass${collapsed.has(k) ? " collapsed" : ""}" data-block="${esc(k)}">
    <div class="bhead"><button class="bh-toggle" data-collapse="${esc(k)}" aria-expanded="${!collapsed.has(k)}">
      <span class="bh-logo">${opts.icon || leagueBadge(c)}</span><span class="grow ellip"><b>${esc(opts.title || c.n)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
      ${live ? `<span class="pill live"><span class="dot"></span>${live}</span>` : `<span class="count">${evs.length}</span>`}${CHEV}</button>
      ${opts.noLink ? "" : `<a class="bh-go press" href="#/comp/${c.s}/${esc(c.l)}" aria-label="Ouvrir ${esc(c.n)}">›</a>`}</div>
    <div class="matches">${opts.rows || evs.map(e => matchRow(e, c)).join("")}</div></section>`;
}
const sortEvents = evs => { const r = e => ({ in: 0, pre: 1, post: 2 })[status(e).state] ?? 1; return [...evs].sort((a, b) => r(a) - r(b) || new Date(a.date) - new Date(b.date)); };
const skeleton = (n = 3, h = 58) => `<div class="matches">${Array.from({ length: n }, () => `<div class="skel" style="height:${h}px"></div>`).join("")}</div>`;
const errorBox = (msg, what = "les données") => `<div class="state glass"><div class="em">📡</div><b>Impossible de charger ${what}</b><span class="muted">${esc(msg)}. Vérifie ta connexion puis réessaie.</span><button class="btn press" data-act="retry">Réessayer</button></div>`;
const emptyBox = (em, title, text = "") => `<div class="state glass"><div class="em">${em}</div><b>${esc(title)}</b>${text ? `<span class="muted">${text}</span>` : ""}</div>`;
const compHead = c => `<a class="bhead press" href="#/comp/${c.s}/${esc(c.l)}"><span style="font-size:20px;display:grid;place-items:center">${leagueBadge(c)}</span><b>${esc(c.n)}</b><span class="faint" style="font-size:13px">${esc(c.c)}</span><span class="go">Voir ›</span></a>`;
const starBtn = (type, payload, on) => `<button class="star press ${on ? "on" : ""}" data-fav="${type}" data-payload="${esc(JSON.stringify(payload))}" aria-pressed="${on}" aria-label="${on ? "Retirer des favoris" : "Ajouter aux favoris"}">${on ? "★" : "☆"}</button>`;
const followBtn = (type, payload, on) => `<button class="follow glass press ${on ? "on" : ""}" data-fav="${type}" data-payload="${esc(JSON.stringify(payload))}" aria-pressed="${on}">${on ? "★ Suivi" : "☆ Suivre"}</button>`;

function segHTML(tabs, cur, base) {
  return `<div class="seg glass" role="tablist"><span class="blob" style="${lastBlob}"></span>${tabs.map(([k, label]) =>
    `<button role="tab" aria-selected="${k === cur}" class="${k === cur ? "on" : ""}" data-seg="${base}/${k}">${label}</button>`).join("")}</div>`;
}
function placeBlobs() {
  for (const seg of $$(".seg")) {
    const on = $("button.on", seg), blob = $(".blob", seg);
    if (on && blob) { blob.style.width = on.offsetWidth + "px"; blob.style.transform = `translateX(${on.offsetLeft}px)`; lastBlob = `width:${on.offsetWidth}px;transform:translateX(${on.offsetLeft}px)`; }
  }
  const dockOn = $(".dock button.on"), blob = $("#dockBlob");
  if (dockOn) { blob.style.opacity = 1; blob.style.width = dockOn.offsetWidth + "px"; blob.style.transform = `translateX(${dockOn.offsetLeft}px)`; }
  else blob.style.opacity = 0;
}

function toast(title, body, href) {
  const el = document.createElement(href ? "a" : "div");
  el.className = "toast glass press";
  if (href) el.href = href;
  el.innerHTML = `<div><b>${esc(title)}</b><span>${esc(body || "")}</span></div>`;
  $("#toasts").prepend(el);
  setTimeout(() => { el.classList.add("out"); setTimeout(() => el.remove(), 400); }, 5200);
}

let lastBlob = "";
function bindTabs(loader) {
  view()._tab = tab => {
    $$(".seg button").forEach(b => { const on = b.dataset.seg.endsWith("/" + tab); b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    placeBlobs(); navId++; clearTimeout(refreshTimer); loader(tab, navId);
  };
}
/* ====================== Navigation ====================== */
const ROOT_TABS = ["home", "live", "comps", "favs", "search", "profile"];
const routes = [
  [/^#?\/?(home)?$/, () => renderHome(), "home"],
  [/^#\/live$/, () => renderLive(), "live"],
  [/^#\/comps$/, () => renderComps(), "comps"],
  [/^#\/comp\/([\w-]+)\/([\w.\-]+)(?:\/(\w+))?$/, (s, l, t) => renderComp(s, l, t || "matchs"), "comps"],
  [/^#\/favs$/, () => renderFavs(), "favs"],
  [/^#\/add\/(club|nation|player|comp)$/, k => renderAdd(k), "favs"],
  [/^#\/search$/, () => renderSearch(), "search"],
  [/^#\/profile$/, () => renderProfile(), "profile"],
  [/^#\/team\/([\w-]+)\/([\w.\-]+)\/(\d+)(?:\/(\w+))?$/, (s, l, id, t) => renderTeam(s, l, id, t || "matchs"), null],
  [/^#\/player\/([\w-]+)\/([\w.\-]+)\/(\d+)$/, (s, l, id) => renderPlayer(s, l, id), null],
  [/^#\/match\/([\w-]+)\/([\w.\-]+)\/(\d+)(?:\/(\w+))?$/, (s, l, id, t) => renderMatch(s, l, id, t || "resume"), null],
];
let refreshTimer = null;
function setChrome(tab, title) {
  $$(".dock button").forEach(b => b.classList.toggle("on", b.dataset.tab === tab));
  const root = !title;
  $("#backBtn").classList.toggle("hidden", root);
  $("#brand").classList.toggle("hidden", !root);
  $("#topTitle").textContent = title || "";
  $("#searchBtn").classList.toggle("hidden", tab === "search");
  requestAnimationFrame(placeBlobs);
}
function clubSky(c1, c2) {
  const sky = $("#sky");
  if (c1) { sky.classList.add("club"); sky.style.setProperty("--club1", "#" + c1.replace("#", "")); sky.style.setProperty("--club2", "#" + (c2 || c1).replace("#", "")); }
  else sky.classList.remove("club");
}
function route(soft = false) {
  clearTimeout(refreshTimer);
  const h = location.hash || "#/home";
  for (const [re, fn, tab] of routes) {
    const m = h.match(re);
    if (!m) continue;
    const run = () => { navId++; view()._tab = null; if (!soft) { window.scrollTo({ top: 0 }); lastBlob = ""; } clubSky(); setChrome(tab, tab && ROOT_TABS.includes(tab) && !/comp\//.test(h) ? "" : "…"); fn(...m.slice(1)); };
    if (!soft && document.startViewTransition && settings.motion) document.startViewTransition(run); else run();
    setTimeout(() => fillLeagueLogos().catch(() => {}), 900);
    return;
  }
  location.hash = "#/home";
}
addEventListener("hashchange", () => route());
const go = h => { if (location.hash === h) route(true); else location.hash = h; };
const alive = id => id === navId;
function scheduleRefresh(fn, ms) { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => { if (document.hidden) return scheduleRefresh(fn, ms); fn(); }, ms); }
function updateLivePill() {
  const n = liveIds.size;
  $("#liveCount").textContent = n;
  $("#livePill").classList.toggle("hidden", !n);
  $("#liveDot").classList.toggle("hidden", !n);
}

/* ====================== Accueil ====================== */
function relevantLeagues() {
  const m = new Map();
  for (const k of favs.comps) { const [s, l] = k.split("/"); m.set(k, findComp(s, l) || { s, l, n: l, c: "", f: "➕" }); }
  for (const t of [...favs.teams, ...favs.players]) if (t.l && t.l !== "x" && t.l !== "auto") { const k = `${t.s}/${t.l}`; if (!m.has(k)) m.set(k, findComp(t.s, t.l) || { s: t.s, l: t.l, n: t.l, c: "", f: "🏟️" }); }
  return [...m.values()];
}
let homeDate = null, homeFilter = "all";
const TOP_HOME = ["uefa.champions", "fra.1", "eng.1", "esp.1", "ita.1", "ger.1", "uefa.europa", "uefa.europa.conf", "uefa.nations", "fifa.world", "fifa.worldq.uefa", "fifa.friendly", "por.1", "ned.1"];
const isNat = t => !!t && (t.nat || COUNTRIES.has(norm(t.name || t.n || t.displayName || "")));
function followRail() {
  const item = (href, av, label) => `<a class="press" href="${href}"><span class="av">${av}</span><span class="ellip">${esc(label)}</span></a>`;
  const comps = favs.comps.map(k => { const [s, l] = k.split("/"); return findComp(s, l) || { s, l, n: l, f: "➕" }; });
  return `<div class="rail">
    ${item("#/add/club", '<span class="plus">+</span>', "Ajouter")}
    ${favs.teams.map(t => item(`#/team/${t.s}/${esc(t.l || "auto")}/${t.id}`, logo({ id: t.id, logo: t.logo, abbreviation: idx.t[t.id]?.a || t.name }), t.name)).join("")}
    ${favs.players.map(p => item(`#/player/${p.s}/${esc(p.l || "x")}/${p.id}`, face(p.img, p.name, "ph-img"), p.name.split(" ").slice(-1)[0])).join("")}
    ${comps.map(c => item(`#/comp/${c.s}/${esc(c.l)}`, leagueBadge(c, 30), c.n)).join("")}
  </div>`;
}
function homeDays() {
  const base = new Date(); base.setHours(12, 0, 0, 0);
  const cur = homeDate || ymd(new Date());
  return `<div class="days hdays">${Array.from({ length: 9 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i - 3); const k = ymd(d);
    const lbl = i === 2 ? "Hier" : i === 3 ? "Aujourd'hui" : i === 4 ? "Demain" : d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }).replace(".", "");
    return `<button class="day wide press ${k === cur ? "on" : ""}" data-hday="${k}"><b>${esc(lbl)}</b></button>`; }).join("")}</div>`;
}
const passFilter = e => homeFilter === "all" || status(e).state === (homeFilter === "live" ? "in" : homeFilter);
async function renderHome() {
  const my = navId;
  const date = homeDate || ymd(new Date());
  const isToday = date === ymd(new Date());
  if (!(refreshing && $("#homeList"))) {
    view().innerHTML = `
    ${followRail()}
    ${homeDays()}
    <div class="chips" id="homeChips">${[["all", "Tous"], ["live", '<span class="dot"></span>En direct'], ["pre", "À venir"], ["post", "Terminés"]].map(([k, l]) => `<button class="chip press ${homeFilter === k ? "on" : ""}" data-hf="${k}">${l}</button>`).join("")}</div>
    <div id="homeList" style="margin-top:6px">${Array.from({ length: 3 }, () => `<div class="block glass">${skeleton(3, 54)}</div>`).join("")}</div>`;
    $(".hdays .day.on")?.scrollIntoView({ inline: "center", block: "nearest" });
  }
  const favL = relevantLeagues();
  const others = TOP_HOME.map(l => findComp("soccer", l)).filter(c => c && !favL.some(f => keyOf(f) === keyOf(c)));
  const all = [...favL, ...others];
  const res = await pool(all, 6, c => API.scoreboard(c, date));
  if (!alive(my)) return;
  const teamIds = new Set([...favs.teams.map(t => String(t.id)), ...favs.players.map(p => String(p.teamId))]);
  const mine = [], seen = new Set();
  const per = res.map((r, i) => ({ c: all[i], ok: r.ok, evs: r.ok ? sortEvents(r.v.events || []) : [] }));
  for (const g of per) for (const e of g.evs) { const { home, away } = sides(e); if ((teamIds.has(String(home.team?.id)) || teamIds.has(String(away.team?.id))) && !seen.has(e.id)) { seen.add(e.id); mine.push({ e, c: g.c }); } }
  let html = "";
  const mineF = mine.filter(x => passFilter(x.e));
  if (mineF.length) html += blockHTML({ s: "soccer", l: "mine", n: "Mes équipes" }, mineF.map(x => x.e), { key: "mine", title: "Mes équipes et joueurs", sub: "", icon: "⭐", noLink: true, rows: mineF.map(x => matchRow(x.e, x.c)).join("") });
  const favBlocks = per.filter(g => favL.some(f => keyOf(f) === keyOf(g.c)));
  const favHTML = favBlocks.map(g => { const evs = g.evs.filter(passFilter); return evs.length ? blockHTML(g.c, evs) : ""; }).join("");
  if (favHTML) html += `<div class="sec"><h2>Mes compétitions</h2></div>${favHTML}`;
  const othHTML = per.filter(g => !favBlocks.includes(g)).map(g => { const evs = g.evs.filter(passFilter); return evs.length ? { live: evs.some(e => status(e).state === "in"), h: blockHTML(g.c, evs) } : null; }).filter(Boolean).sort((a, b) => b.live - a.live).map(x => x.h).join("");
  if (othHTML) html += `<div class="sec"><h2>Autres compétitions</h2><a class="chip press" href="#/comps">Toutes</a></div>${othHTML}`;
  if (!html) html = per.every(g => !g.ok) ? errorBox("Aucune compétition n'a répondu", "les matchs") : emptyBox(homeFilter === "live" ? "⏳" : "🗓️", homeFilter === "live" ? "Aucun match en cours" : "Aucun match ce jour-là", homeFilter !== "all" ? 'Essaie le filtre <button class="chip press" data-hf="all">Tous</button>' : "Choisis un autre jour.");
  $("#homeList").innerHTML = html; $("#homeList").style.opacity = 1;
  $$("#homeChips .chip").forEach(b => b.classList.toggle("on", b.dataset.hf === homeFilter));
  updateLivePill();
  if (isToday) scheduleRefresh(() => softRun(() => route(true)), REFRESH);
}

/* ====================== Live ====================== */
let liveFilter = "live";
async function renderLive() {
  const my = navId;
  if (!(refreshing && $("#liveList"))) view().innerHTML = `
    <div class="sec" style="margin-top:6px"><h2>Matchs du jour</h2><span class="chip" id="liveStamp">Chargement…</span></div>
    <div class="chips" id="liveChips">${[["live", '<span class="dot"></span>En direct'], ["all", "Tous"], ["pre", "À venir"], ["post", "Terminés"]].map(([k, l]) => `<button class="chip press ${liveFilter === k ? "on" : ""}" data-lf="${k}">${l}</button>`).join("")}</div>
    <div id="liveList" style="margin-top:8px">${Array.from({ length: 3 }, () => `<div class="block glass">${skeleton(3)}</div>`).join("")}</div>`;
  const today = ymd(new Date());
  const res = await pool(LIVE_LEAGUES, 6, c => API.scoreboard(c, today));
  if (!alive(my)) return;
  const groups = res.map((r, i) => ({ c: LIVE_LEAGUES[i], evs: r.ok ? sortEvents(r.v.events || []) : [] })).filter(g => g.evs.length);
  const draw = () => {
    const f = liveFilter;
    const html = groups.map(g => {
      const evs = f === "all" ? g.evs : g.evs.filter(e => status(e).state === (f === "live" ? "in" : f));
      return evs.length ? { live: evs.some(e => status(e).state === "in"), h: blockHTML(g.c, evs) } : null;
    }).filter(Boolean).sort((a, b) => b.live - a.live).map(x => x.h).join("");
    $("#liveList").innerHTML = html || emptyBox(f === "live" ? "⏳" : "🗓️", f === "live" ? "Aucun match en cours" : "Aucun match", f === "live" ? 'Regarde les matchs <button class="chip press" data-lf="pre">à venir</button>' : "");
    $$("#liveChips .chip").forEach(b => b.classList.toggle("on", b.dataset.lf === f));
  };
  if (liveFilter === "live" && !groups.some(g => g.evs.some(e => status(e).state === "in"))) liveFilter = "all";
  view()._drawLive = draw;
  draw();
  const failed = res.filter(r => !r.ok).length;
  $("#liveStamp").textContent = `${failed < res.length ? "● " : ""}Mis à jour ${new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}${failed === res.length ? " · hors ligne" : ""}`;
  if (failed === res.length) $("#liveList").innerHTML = errorBox("Aucune compétition n'a répondu", "les matchs");
  updateLivePill();
  scheduleRefresh(() => softRun(() => route(true)), REFRESH);
}

/* ====================== Compétitions ====================== */
let compQuery = "";
function renderComps() {
  const q = norm(compQuery);
  const list = CATALOG.filter(c => !q || norm(`${c.n} ${c.c} ${c.l} ${c.g}`).includes(q));
  const groups = {};
  list.forEach(c => (groups[c.g] ||= []).push(c));
  view().innerHTML = `
    <div class="sec" style="margin-top:6px"><h2>Compétitions</h2><span class="chip">${list.length}</span></div>
    <label class="searchbox glass" for="compQ"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="compQ" type="search" placeholder="Ligue, pays, coupe…" value="${esc(compQuery)}" autocomplete="off"></label>
    <div id="compBody">${Object.entries(groups).map(([g, cs]) => `<section class="region"><h3>${esc(g)} · ${cs.length}</h3><div class="grid">${cs.map(c => `
      <div class="tile glass press" role="link" tabindex="0" data-href="#/comp/${c.s}/${esc(c.l)}"><span class="badge">${leagueBadge(c, 30)}</span><span class="grow"><div class="t1 ellip">${esc(c.n)}</div><div class="t2 ellip">${esc(c.c)}</div></span>${starBtn("comps", keyOf(c), isFav("comps", keyOf(c)))}</div>`).join("")}</div></section>`).join("") || emptyBox("🔎", "Aucune compétition trouvée", "Essaie un autre mot, ou ajoute-la par son code ci-dessous.")}
    <form class="glass" id="customForm" style="padding:16px;margin-top:18px;display:grid;gap:10px">
      <b>Une compétition manque ? Ajoute-la avec son code ESPN</b>
      <span class="muted" style="font-size:13px">Le code figure dans l'adresse d'une page ESPN : <b>sco.2</b> (Écosse D2), <b>bel.2</b>, <b>ita.3</b>… Les compétitions de jeunes y sont aussi quand ESPN les couvre.</span>
      <div class="row wrap"><select class="sel" id="cSport" aria-label="Sport"><option value="soccer">Football</option><option value="basketball">Basket</option><option value="football">Football US</option><option value="hockey">Hockey</option><option value="baseball">Baseball</option></select>
      <input class="field grow" id="cCode" placeholder="Code, ex. sco.2" required style="width:auto"><input class="field grow" id="cName" placeholder="Nom (facultatif)" style="width:auto"><button class="btn primary press" type="submit">Ajouter</button></div>
    </form></div>`;
  setChrome("comps", "");
  const inp = $("#compQ");
  setTimeout(() => fillLeagueLogos().catch(() => {}), 300);
  inp.addEventListener("input", debounce(() => { compQuery = inp.value; const pos = inp.selectionStart; renderComps(); const n = $("#compQ"); n.focus(); n.setSelectionRange(pos, pos); }, 120));
}

async function renderComp(s, l, tab) {
  const my = navId;
  const c = findComp(s, l) || { s, l, n: l.toUpperCase(), c: "Code ESPN", f: "➕" };
  setChrome("comps", c.n);
  const base = `#/comp/${s}/${l}`;
  view().innerHTML = `
    <section class="ent glass"><span class="big">${leagueBadge(c, 46)}</span><div class="grow"><h1 class="ellip">${esc(c.n)}</h1><span class="muted">${esc(c.c)}</span></div>${followBtn("comps", keyOf(c), isFav("comps", keyOf(c)))}</section>
    ${segHTML([["matchs", "Matchs"], ["classement", "Classement"], ["buteurs", "Buteurs"], ["actus", "Actus"]], tab, base)}
    <div id="cBody"></div>`;
  requestAnimationFrame(placeBlobs);
  const load = (t, id) => { const body = $("#cBody"); if (t === "matchs") return compMatches(c, body, id); if (t === "classement") return standingsInto(c, body, id); if (t === "buteurs") return leadersInto(c, body, id); return newsInto(c, body, id); };
  bindTabs(load);
  return load(tab, my);
}
let compDate = null;
function dayStrip() {
  const base = new Date(); base.setHours(12, 0, 0, 0);
  const days = Array.from({ length: 18 }, (_, i) => { const d = new Date(base); d.setDate(base.getDate() + i - 7); return d; });
  return `<div class="days"><button class="day press ${!compDate ? "on" : ""}" data-day=""><small>Actuel</small><b>●</b></button>${days.map(d => {
    const k = ymd(d), t = k === ymd(new Date());
    return `<button class="day press ${compDate === k ? "on" : ""}" data-day="${k}"><small>${t ? "Auj." : d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "")}</small><b>${d.getDate()}</b></button>`;
  }).join("")}</div>`;
}
async function compMatches(c, body, my) {
  if (!body) return;
  if (!(refreshing && $("#cm"))) {
    body.innerHTML = dayStrip() + `<div class="block glass" id="cm">${skeleton(5)}</div>`;
    $(".day.on", body)?.scrollIntoView({ inline: "center", block: "nearest" });
  }
  try {
    const d = await API.scoreboard(c, compDate);
    if (!alive(my)) return;
    const evs = sortEvents(d.events || []);
    const box = $("#cm");
    if (!box) return;
    if (!evs.length) { box.outerHTML = emptyBox("🗓️", `Aucun match ${compDate ? "ce jour-là" : "en ce moment"}`, "Choisis une autre date."); return; }
    const byDay = {};
    evs.forEach(e => (byDay[new Date(e.date).toDateString()] ||= []).push(e));
    const keys = Object.keys(byDay).sort((a, b) => new Date(a) - new Date(b));
    const round = d.week?.number ? `Journée ${d.week.number}` : "";
    box.innerHTML = (round ? `<div class="label">${round}</div>` : "") + keys.map(k => `${keys.length > 1 ? `<div class="label faint" style="text-transform:capitalize">${esc(fmtLong(k))}</div>` : ""}<div class="matches">${sortEvents(byDay[k]).map(e => matchRow(e, c)).join("")}</div>`).join("");
    updateLivePill();
    if (evs.some(e => status(e).state === "in") || !compDate) scheduleRefresh(() => softRun(() => { navId++; compMatches(c, $("#cBody"), navId); }), REFRESH);
  } catch (e) { if (!refreshing) $("#cm")?.replaceWith(Object.assign(document.createElement("div"), { innerHTML: errorBox(e.message, "les matchs") })); }
}

const COLS = {
  soccer: [["gamesPlayed", "J"], ["wins", "G"], ["ties", "N"], ["losses", "P"], ["pointsFor", "BP"], ["pointsAgainst", "BC"], ["pointDifferential", "Diff"], ["points", "Pts"]],
  basketball: [["wins", "V"], ["losses", "D"], ["winPercent", "%"], ["gamesBehind", "Écart"], ["streak", "Série"]],
  football: [["wins", "V"], ["losses", "D"], ["ties", "N"], ["winPercent", "%"], ["pointDifferential", "Diff"]],
  hockey: [["gamesPlayed", "J"], ["wins", "V"], ["losses", "D"], ["otLosses", "DP"], ["points", "Pts"]],
  baseball: [["wins", "V"], ["losses", "D"], ["winPercent", "%"], ["gamesBehind", "Écart"], ["streak", "Série"]],
};
const stat = (e, n) => { const s = (e.stats || []).find(x => x.name === n || x.type === n.toLowerCase()); return s ? (s.displayValue ?? s.value) : ""; };
const flatGroups = (node, out = []) => { if (node?.standings?.entries) out.push({ name: node.name || "", entries: node.standings.entries }); (node?.children || []).forEach(ch => flatGroups(ch, out)); return out; };
async function standingsInto(c, body, my, highlight) {
  body.innerHTML = `<div class="glass" style="padding:10px">${skeleton(8, 40)}</div>`;
  try {
    const d = await API.standings(c);
    if (!alive(my)) return;
    const groups = flatGroups(d);
    if (!groups.some(g => g.entries.length)) { body.innerHTML = emptyBox("📊", "Pas de classement", "Cette compétition se joue sans doute en élimination directe."); return; }
    const cols = (COLS[c.s] || COLS.soccer).filter(([n]) => groups[0].entries.some(e => stat(e, n) !== ""));
    const notes = new Map();
    body.innerHTML = `<div class="glass" style="padding:4px">${groups.map(g => `${groups.length > 1 ? `<div class="gname">${esc(g.name)}</div>` : ""}
      <div class="twrap"><table><thead><tr><th>#</th><th class="l">Équipe</th>${cols.map(([, l]) => `<th>${l}</th>`).join("")}</tr></thead><tbody>${
      [...g.entries].sort((a, b) => (+stat(a, "rank") || 0) - (+stat(b, "rank") || 0)).map((e, i) => {
        noteTeam(e.team, c.s, c.l);
        const col = e.note?.color ? (e.note.color.startsWith("#") ? e.note.color : "#" + e.note.color) : "";
        if (col && e.note.description) notes.set(col, e.note.description);
        return `<tr class="click ${String(e.team?.id) === String(highlight) ? "hl" : ""}" data-href="#/team/${c.s}/${c.l}/${e.team?.id}">
          <td><span class="rk" style="${col ? `background:${esc(col)}33;box-shadow:inset 3px 0 0 ${esc(col)}` : ""}">${esc(stat(e, "rank") || i + 1)}</span></td>
          <td class="l"><div class="tcell">${logo(e.team)}<span>${esc(e.team?.shortDisplayName || e.team?.displayName)}</span></div></td>
          ${cols.map(([n, l]) => `<td class="${l === "Pts" ? "b" : ""}">${esc(stat(e, n))}</td>`).join("")}</tr>`;
      }).join("")}</tbody></table></div>`).join("")}
      ${notes.size ? `<div class="legend">${[...notes].map(([col, t]) => `<span><i style="background:${esc(col)}"></i>${esc(t)}</span>`).join("")}</div>` : ""}</div>`;
  } catch (e) { body.innerHTML = errorBox(e.message, "le classement"); }
}
function parseLeaders(d) {
  const cats = d?.stats || d?.categories || d?.leaders || [];
  return (Array.isArray(cats) ? cats : []).map(cat => ({
    name: cat.displayName || cat.name || "",
    key: cat.name || "",
    leaders: (cat.leaders || []).map(x => ({ a: x.athlete || {}, v: x.displayValue ?? x.value, team: x.athlete?.team || x.team })),
  })).filter(c => c.leaders.length);
}
const CAT_FR = { goals: "Buteurs", goalsLeaders: "Buteurs", assists: "Passeurs", assistsLeaders: "Passeurs" };
async function leadersInto(c, body, my) {
  body.innerHTML = `<div class="glass" style="padding:10px">${skeleton(6, 50)}</div>`;
  try {
    const cats = parseLeaders(await API.leaders(c));
    if (!alive(my)) return;
    if (!cats.length) throw new Error("vide");
    body.innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${cats.slice(0, 4).map(cat => `
      <div class="glass" style="padding:8px"><div class="gname" style="padding:8px 10px">${esc(CAT_FR[cat.key] || cat.name)}</div>${cat.leaders.slice(0, 10).map((x, i) => {
        notePlayer(x.a, c.s, c.l, x.team);
        return `<a class="person press" href="#/player/${c.s}/${c.l}/${x.a.id}"><span class="num">${i + 1}</span>${face(x.a.headshot?.href, x.a.displayName)}<span class="grow"><div class="ellip" style="font-weight:700">${esc(x.a.displayName)}</div><div class="faint ellip" style="font-size:12.5px">${esc(x.team?.displayName || "")}</div></span><b style="font-size:18px">${esc(x.v)}</b></a>`;
      }).join("")}</div>`).join("")}</div>`;
  } catch {
    if (!alive(my)) return;
    body.innerHTML = emptyBox("🥇", "Classement des buteurs indisponible", "La source ne le fournit pas pour cette compétition.");
  }
}
async function newsInto(c, body, my) {
  body.innerHTML = `<div class="news-grid">${Array.from({ length: 6 }, () => '<div class="skel" style="height:220px;border-radius:18px"></div>').join("")}</div>`;
  try {
    const arts = ((await API.news(c)).articles || []).slice(0, 18);
    if (!alive(my)) return;
    if (!arts.length) { body.innerHTML = emptyBox("📰", "Pas d'actualité"); return; }
    body.innerHTML = `<p class="note">Articles ESPN, en anglais.</p><div class="news-grid">${arts.map(a => `
      <a class="news glass press" href="${esc(a.links?.web?.href || "#")}" target="_blank" rel="noopener">
        <div class="img">${a.images?.[0]?.url ? `<img src="${esc(a.images[0].url)}" alt="" loading="lazy">` : ""}</div>
        <div class="body"><span class="faint" style="font-size:12px">${a.published ? esc(new Date(a.published).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })) : ""}</span><h3>${esc(a.headline)}</h3><p>${esc(a.description || "")}</p></div></a>`).join("")}</div>`;
  } catch (e) { body.innerHTML = errorBox(e.message, "les actus"); }
}

/* ====================== Club ====================== */
async function resolveTeamLeague(s, id) {
  const known = idx.t[id]?.l;
  const tries = [...new Set([known, ...LIVE_LEAGUES.filter(c => c.s === s).map(c => c.l)].filter(Boolean))].slice(0, 14);
  for (const l of tries) { try { const d = await API.team(s, l, id); if (d?.team?.id) return { l, d }; } catch { /* suivant */ } }
  throw new Error("Club introuvable");
}
const POS_FR = { goalkeeper: "Gardien", defender: "Défenseur", midfielder: "Milieu", forward: "Attaquant", "center back": "Défenseur central", "centre-back": "Défenseur central", "left back": "Latéral gauche", "right back": "Latéral droit", "defensive midfielder": "Milieu défensif", "attacking midfielder": "Milieu offensif", "central midfielder": "Milieu central", "left wing": "Ailier gauche", "right wing": "Ailier droit", winger: "Ailier", striker: "Avant-centre", "center forward": "Avant-centre" };
const posFr = p => POS_FR[norm(p)] || p;
const POS_ORDER = [["Gardiens", /^(g|gk)|goal/i], ["Défenseurs", /^(d|df)\b|^d$|defen|back/i], ["Milieux", /^(m|mf)\b|^m$|midfield/i], ["Attaquants", /^(f|fw)\b|^f$|forward|attack|striker|wing/i]];
function posGroup(a) {
  const p = `${a.position?.abbreviation || ""}|${a.position?.name || a.position?.displayName || ""}`;
  for (const [g, re] of POS_ORDER) if (re.test(p.split("|")[0]) || re.test(p.split("|")[1])) return g;
  return a.position?.displayName || a.position?.name || "Effectif";
}
async function renderTeam(s, l, id, tab) {
  const my = navId;
  setChrome(null, idx.t[id]?.n || "Club");
  view().innerHTML = `<section class="ent glass"><span class="big">${idx.t[id]?.logo ? `<img src="${esc(idx.t[id].logo)}" alt="">` : "🏟️"}</span><div class="grow"><h1 class="ellip">${esc(idx.t[id]?.n || "Chargement…")}</h1><span class="muted">…</span></div></section><div class="glass" style="padding:10px;margin-top:14px">${skeleton(5)}</div>`;
  let d;
  try {
    if (l === "auto") { const r = await resolveTeamLeague(s, id); l = r.l; d = r.d; history.replaceState(null, "", `#/team/${s}/${l}/${id}/${tab}`); }
    else d = await API.team(s, l, id);
  } catch (e) { if (alive(my)) view().innerHTML = errorBox(e.message, "ce club"); return; }
  if (!alive(my)) return;
  const t = d.team || {};
  noteTeam(t, s, l);
  const c = findComp(s, l);
  setChrome(null, t.shortDisplayName || t.displayName);
  clubSky(t.color, t.alternateColor);
  const payload = { id: String(t.id), s, l, name: t.displayName, logo: t.logos?.[0]?.href || "", nat: isNat(t) || /nations|worldq|friendly|^fifa\.world$|euro$|america$|caf\.nations/.test(l) };
  const base = `#/team/${s}/${l}/${id}`;
  view().innerHTML = `
    <section class="ent glass"><span class="big">${logo(t)}</span><div class="grow"><h1 class="ellip">${esc(t.displayName)}</h1><span class="muted ellip" style="display:block">${esc(t.standingSummary || (c ? c.n : ""))}</span></div>${followBtn("teams", payload, isFav("teams", t.id))}</section>
    ${segHTML([["matchs", "Matchs"], ["effectif", "Effectif"], ["classement", "Classement"], ["infos", "Infos"]], tab, base)}
    <div id="tBody"></div>`;
  requestAnimationFrame(placeBlobs);
  const load = (tb, n) => { const body = $("#tBody"); if (tb === "matchs") return teamMatches(s, l, id, body, n); if (tb === "effectif") return teamRoster(s, l, t, body, n);
    if (tb === "classement") return c ? standingsInto(c, body, n, id) : (body.innerHTML = emptyBox("📊", "Classement indisponible")); return teamInfo(s, l, t, body, n); };
  bindTabs(load);
  return load(tab, my);
}
async function teamMatches(s, l, id, body, my) {
  body.innerHTML = `<div class="glass" style="padding:8px">${skeleton(6)}</div>`;
  try {
    const d = await API.schedule(s, l, id);
    if (!alive(my)) return;
    const c = findComp(s, l) || { s, l };
    const evs = d.events || [];
    const past = evs.filter(e => status(e).state === "post").sort((a, b) => new Date(b.date) - new Date(a.date));
    const next = evs.filter(e => status(e).state !== "post").sort((a, b) => new Date(a.date) - new Date(b.date));
    const form = past.slice(0, 5).map(e => { const { home, away } = sides(e); const me = String(home.team?.id) === String(id) ? home : away; const op = me === home ? away : home;
      const a = +scoreVal(me.score), b = +scoreVal(op.score); return a > b ? ["V", "var(--good)"] : a < b ? ["D", "var(--live)"] : ["N", "var(--warn)"]; });
    body.innerHTML = `${form.length ? `<div class="glass row" style="padding:12px 16px;margin-bottom:12px"><b class="grow">Forme</b>${form.map(([x, col]) => `<span class="rk" style="background:${col};color:#06101f">${x}</span>`).join("")}</div>` : ""}
      ${next.length ? `<div class="block glass"><div class="label">À venir</div><div class="matches">${next.slice(0, 8).map(e => matchRow(e, c)).join("")}</div></div>` : ""}
      ${past.length ? `<div class="block glass"><div class="label">Résultats</div><div class="matches">${past.slice(0, 15).map(e => matchRow(e, c)).join("")}</div></div>` : ""}
      ${!evs.length ? emptyBox("🗓️", "Calendrier vide pour le moment") : ""}`;
  } catch (e) { body.innerHTML = errorBox(e.message, "le calendrier"); }
}
async function teamRoster(s, l, t, body, my) {
  body.innerHTML = `<div class="glass" style="padding:8px">${skeleton(8, 52)}</div>`;
  try {
    const d = await API.roster(s, l, t.id);
    if (!alive(my)) return;
    let ath = d.athletes || [];
    if (ath.length && ath[0].items) ath = ath.flatMap(g => g.items.map(a => ({ ...a, position: a.position || { displayName: g.position } })));
    if (!ath.length) { body.innerHTML = emptyBox("👥", "Effectif indisponible"); return; }
    const groups = {};
    ath.forEach(a => (groups[posGroup(a)] ||= []).push(a));
    const order = [...POS_ORDER.map(x => x[0]), ...Object.keys(groups)];
    const coach = (d.coach || [])[0];
    body.innerHTML = `${coach ? `<div class="glass person" style="margin-bottom:12px"><span class="ph-img">🧑‍💼</span><span class="grow"><div class="faint" style="font-size:12px">Entraîneur</div><b>${esc(`${coach.firstName || ""} ${coach.lastName || ""}`.trim())}</b></span></div>` : ""}
      ${[...new Set(order)].filter(g => groups[g]).map(g => `<div class="glass" style="padding:6px;margin-bottom:12px"><div class="gname" style="padding:10px 10px 6px">${esc(g)} · ${groups[g].length}</div>
      ${groups[g].sort((a, b) => (+a.jersey || 99) - (+b.jersey || 99)).map(a => { notePlayer(a, s, l, t);
        return `<a class="person press" href="#/player/${s}/${l}/${a.id}"><span class="num">${esc(a.jersey || "")}</span>${face(a.headshot?.href, a.displayName)}<span class="grow"><div class="ellip" style="font-weight:700">${esc(a.displayName || a.fullName)}</div><div class="faint ellip" style="font-size:12.5px">${[a.age ? a.age + " ans" : "", a.citizenship || "", a.displayHeight || ""].filter(Boolean).map(esc).join(" · ")}</div></span>${a.flag?.href ? `<img src="${esc(a.flag.href)}" alt="" style="width:22px;border-radius:3px">` : ""}</a>`; }).join("")}</div>`).join("")}`;
  } catch (e) { body.innerHTML = errorBox(e.message, "l'effectif"); }
}
function teamInfo(s, l, t, body) {
  const venue = t.franchise?.venue || t.venue || {};
  const rec = (t.record?.items || []).map(r => `${r.description || r.type || ""} ${r.summary}`.trim()).join(" · ");
  const next = t.nextEvent?.[0];
  body.innerHTML = `<div class="glass" style="padding:14px"><div class="kv">
    ${venue.fullName ? `<div><small>Stade</small><b>${esc(venue.fullName)}</b></div>` : ""}
    ${venue.address?.city ? `<div><small>Ville</small><b>${esc(venue.address.city)}</b></div>` : ""}
    ${t.location ? `<div><small>Lieu</small><b>${esc(t.location)}</b></div>` : ""}
    ${t.abbreviation ? `<div><small>Abréviation</small><b>${esc(t.abbreviation)}</b></div>` : ""}
    ${rec ? `<div><small>Bilan</small><b>${esc(rec)}</b></div>` : ""}
    ${t.standingSummary ? `<div><small>Classement</small><b>${esc(t.standingSummary)}</b></div>` : ""}
    ${next ? `<div><small>Prochain match</small><b>${esc(next.shortName || next.name || "")} · ${esc(fmtDay(next.date))}</b></div>` : ""}
  </div>
  <p class="note">Palmarès, historique, transferts et blessés : non fournis par la source de données gratuite. Ils pourront être branchés sur un fournisseur payant (voir LISEZ-MOI).</p>
  ${t.links?.[0]?.href ? `<a class="btn press" href="${esc(t.links[0].href)}" target="_blank" rel="noopener">Page du club sur ESPN</a>` : ""}</div>`;
}

/* ====================== Joueur ====================== */
function parseStats(d) {
  const cats = d?.categories || [];
  const teams = d?.teams || {};
  return cats.map(cat => ({
    name: cat.displayName || cat.name || "Statistiques",
    labels: cat.labels || cat.names || [],
    names: cat.names || [],
    rows: (cat.statistics || []).map(st => ({
      season: st.season?.displayName || st.season?.year || st.displayName || "",
      team: teams[st.teamId]?.displayName || teams[st.teamId]?.abbreviation || st.teamSlug || "",
      league: st.league?.name || st.league?.abbreviation || "",
      stats: st.stats || [],
    })),
    totals: cat.totals || [],
  })).filter(c => c.rows.length);
}
function pickMetrics(cat) {
  const find = arr => { for (const k of arr) { const i = cat.names.findIndex(n => n === k); if (i >= 0) return i; const j = cat.labels.findIndex(n => n === k); if (j >= 0) return j; } return -1; };
  const g = find(["totalGoals", "goals", "G"]), a = find(["goalAssists", "assists", "A"]);
  if (g >= 0) return [[g, "Buts", "#7cc4ff"], ...(a >= 0 ? [[a, "Passes déc.", "#ff7aa8"]] : [])];
  const p = find(["avgPoints", "points", "PTS"]);
  if (p >= 0) return [[p, cat.labels[p] || "Points", "#7cc4ff"]];
  return [[0, cat.labels[0] || "", "#7cc4ff"]];
}
const NAT_COMP = /world cup|coupe du monde|nations|friendl|amical|euro\b|european championship|qualif|copa am|africa cup|afcon|asian cup|gold cup|international/i;
const isNational = r => COUNTRIES.has(norm(r.team)) || NAT_COMP.test(r.league || "");
function careerSummary(cat) {
  const col = names => { for (const k of names) { const i = cat.names.indexOf(k); if (i >= 0) return i; const j = cat.labels.indexOf(k); if (j >= 0) return j; } return -1; };
  const iG = col(["totalGoals", "goals", "G", "B"]), iA = col(["goalAssists", "assists", "A", "PD"]), iM = col(["appearances", "gamesPlayed", "starts", "GP", "MJ", "APP"]);
  if (iG < 0 && iM < 0) return "";
  const num = (r, i) => i < 0 ? 0 : parseFloat(String(r.stats[i]).replace(",", ".")) || 0;
  const sum = (rows, i) => rows.reduce((a, r) => a + num(r, i), 0);
  const nat = cat.rows.filter(isNational), club = cat.rows.filter(r => !isNational(r));
  const byTeam = new Map();
  for (const r of cat.rows) { const k = r.team || r.league || "—"; const v = byTeam.get(k) || { team: k, m: 0, g: 0, a: 0, seasons: new Set(), nat: isNational(r) }; v.m += num(r, iM); v.g += num(r, iG); v.a += num(r, iA); v.seasons.add(r.season); byTeam.set(k, v); }
  const tiles = [["Buts au total", sum(cat.rows, iG)], ["Matchs", sum(cat.rows, iM)], ["Passes décisives", sum(cat.rows, iA)], ["Buts en club", sum(club, iG)], ...(nat.length ? [["Buts en sélection", sum(nat, iG)]] : [])].filter(([, v], i) => i === 0 ? iG >= 0 : v || i === 3);
  return `<div class="glass" style="padding:14px;margin-bottom:14px"><div class="kv">${tiles.map(([k, v]) => `<div><small>${k}</small><b style="font-size:24px">${Math.round(v)}</b></div>`).join("")}</div>
    <div class="twrap" style="margin-top:12px"><table><thead><tr><th class="l">Équipe</th><th>Saisons</th><th>Matchs</th><th>Buts</th><th>Passes</th></tr></thead><tbody>
    ${[...byTeam.values()].sort((a, b) => b.g - a.g).map(v => `<tr><td class="l">${esc(v.team)}${v.nat ? " 🏳️" : ""}</td><td>${v.seasons.size}</td><td>${Math.round(v.m)}</td><td class="b">${Math.round(v.g)}</td><td>${Math.round(v.a)}</td></tr>`).join("")}</tbody></table></div>
    <p class="note" style="margin:10px 2px 0">Totaux calculés sur les saisons que publie la source. Trophées et palmarès : non fournis par la source gratuite.</p></div>`;
}
function seasonChart(cat) {
  const metrics = pickMetrics(cat);
  const by = new Map();
  for (const r of cat.rows) { const k = String(r.season); const cur = by.get(k) || metrics.map(() => 0); metrics.forEach(([i], j) => { cur[j] += parseFloat(String(r.stats[i]).replace(",", ".")) || 0; }); by.set(k, cur); }
  const seasons = [...by.keys()].slice(-10);
  if (seasons.length < 2) return "";
  const W = 640, H = 220, padL = 28, padB = 34, padT = 26;
  const max = Math.max(1, ...seasons.flatMap(s => by.get(s)));
  const step = (W - padL - 8) / seasons.length, bw = Math.min(26, (step - 10) / metrics.length);
  const y = v => H - padB - (v / max) * (H - padB - padT);
  const ticks = [0, Math.round(max / 2), Math.round(max)];
  return `<div class="chart glass"><div class="row" style="padding:0 6px 6px;justify-content:space-between"><b>Évolution par saison</b><span class="row" style="gap:12px;font-size:12.5px">${metrics.map(([, n, col]) => `<span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:3px;background:${col};display:inline-block"></i>${esc(n)}</span>`).join("")}</span></div>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution par saison">
      ${ticks.map(t => `<line x1="${padL}" x2="${W - 4}" y1="${y(t)}" y2="${y(t)}" stroke="currentColor" stroke-opacity=".12"/><text x="${padL - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join("")}
      ${seasons.map((s, i) => { const x0 = padL + i * step + (step - bw * metrics.length) / 2; return metrics.map(([, , col], j) => { const v = by.get(s)[j]; const x = x0 + j * bw;
        return `<rect x="${x}" y="${y(v)}" width="${bw - 3}" height="${Math.max(0, H - padB - y(v))}" rx="4" fill="${col}" fill-opacity=".85"><title>${esc(s)} : ${v}</title></rect>${v ? `<text class="lab" x="${x + (bw - 3) / 2}" y="${y(v) - 5}" text-anchor="middle">${Math.round(v * 10) / 10}</text>` : ""}`; }).join("") +
        `<text x="${padL + i * step + step / 2}" y="${H - 12}" text-anchor="middle">${esc(String(s).replace(/^(\d{2})(\d{2})-(\d{2})(\d{2})$/, "$2/$4").replace(/^20(\d\d)-20?(\d\d)$/, "$1/$2"))}</text>`; }).join("")}
    </svg></div>`;
}
async function renderPlayer(s, l, id) {
  const my = navId;
  const known = idx.p[id];
  setChrome(null, known?.n || "Joueur");
  view().innerHTML = `<section class="ent glass"><span class="big photo">${face(known?.img, known?.n, "")}</span><div class="grow"><h1>${esc(known?.n || "Chargement…")}</h1><span class="muted">${esc(known?.tn || "")}</span></div></section><div class="glass" style="padding:10px;margin-top:14px">${skeleton(4)}</div>`;
  let a;
  try { a = (await API.athlete(s, l, id)).athlete; if (!a) throw new Error("Joueur introuvable"); }
  catch (e) {
    if (!alive(my)) return;
    view().innerHTML = known ? `<section class="ent glass"><span class="big photo">${face(known.img, known.n, "")}</span><div class="grow"><h1>${esc(known.n)}</h1><span class="muted">${esc(known.tn)}</span></div>${followBtn("players", { id, s, l, name: known.n, teamId: known.tid, img: known.img }, isFav("players", id))}</section>${errorBox(e.message, "la fiche détaillée")}` : errorBox(e.message, "ce joueur");
    return;
  }
  if (!alive(my)) return;
  const team = a.team || {};
  notePlayer(a, s, l, team);
  setChrome(null, a.displayName);
  const payload = { id: String(a.id), s, l: l !== "x" ? l : (idx.t[team.id]?.l || "x"), name: a.displayName, teamId: String(team.id || ""), img: a.headshot?.href || "" };
  const info = [
    ["Âge", a.age ? `${a.age} ans` : ""], ["Naissance", a.dateOfBirth ? new Date(a.dateOfBirth).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : ""],
    ["Lieu de naissance", a.displayBirthPlace || [a.birthPlace?.city, a.birthPlace?.country].filter(Boolean).join(", ")],
    ["Nationalité", a.citizenship || a.citizenshipCountry?.name || ""], ["Poste", posFr(a.position?.displayName || a.position?.name || "")],
    ["Numéro", a.jersey ? `#${a.jersey}` : ""], ["Taille", a.displayHeight || ""], ["Poids", a.displayWeight || ""],
    ["Pied fort", a.foot || a.footed || a.preferredFoot || ""], ["Club", team.displayName || ""],
  ].filter(([, v]) => v);
  view().innerHTML = `
    <section class="ent glass"><span class="big photo">${face(a.headshot?.href, a.displayName, "")}</span>
      <div class="grow"><h1>${esc(a.displayName)}</h1>${team.id ? `<a class="muted row" style="text-decoration:none;gap:6px;margin-top:3px" href="#/team/${s}/${payload.l !== "x" ? payload.l : "auto"}/${team.id}">${logo({ logo: team.logos?.[0]?.href, abbreviation: team.abbreviation }, "logo")}<span>${esc(team.displayName || "")}</span></a>` : ""}</div>
      ${followBtn("players", payload, isFav("players", a.id))}</section>
    <div class="glass" style="padding:14px;margin-top:14px"><div class="kv">${info.map(([k, v]) => `<div><small>${k}</small><b>${esc(v)}</b></div>`).join("")}</div></div>
    <div id="pStats" style="margin-top:14px">${skeleton(3)}</div>`;
  try {
    const cats = parseStats(await API.athleteStats(s, l, id));
    if (!alive(my)) return;
    if (!cats.length) throw new Error("vide");
    const main = cats[0];
    $("#pStats").innerHTML = `${careerSummary(main)}${seasonChart(main)}
      ${cats.slice(0, 3).map(cat => `<div class="glass" style="padding:4px;margin-top:14px"><div class="gname">${esc(cat.name)}</div><div class="twrap"><table><thead><tr><th class="l">Saison</th><th class="l">Équipe</th>${cat.labels.map(x => `<th>${esc(x)}</th>`).join("")}</tr></thead><tbody>
        ${[...cat.rows].reverse().map(r => `<tr><td class="l">${esc(r.season)}</td><td class="l">${esc(r.team || r.league)}</td>${r.stats.map(v => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}
        ${cat.totals.length ? `<tr><td class="l b">Total</td><td></td>${cat.totals.map(v => `<td class="b">${esc(v)}</td>`).join("")}</tr>` : ""}</tbody></table></div></div>`).join("")}
      <p class="note">Statistiques telles que fournies par ESPN (abréviations d'origine). Buts de la tête, coups francs, pied gauche ou droit, doublés, triplés, palmarès et valeur marchande ne figurent pas dans cette source.</p>`;
  } catch {
    if (!alive(my)) return;
    $("#pStats").innerHTML = emptyBox("📈", "Statistiques détaillées indisponibles", "La source ne les publie pas pour ce joueur.");
  }
}

/* ====================== Match ====================== */
const STAT_ROWS = [["possessionPct", "Possession", "%"], ["totalShots", "Tirs"], ["shotsOnTarget", "Tirs cadrés"], ["wonCorners", "Corners"], ["foulsCommitted", "Fautes"], ["offsides", "Hors-jeu"], ["saves", "Arrêts"], ["yellowCards", "Cartons jaunes"], ["redCards", "Cartons rouges"], ["accuratePasses", "Passes réussies"], ["passPct", "Précision des passes", "%"]];
function evIcon(k) {
  const t = `${k.type?.type || ""} ${k.type?.text || ""}`.toLowerCase();
  if (/own/.test(t) && /goal/.test(t)) return ["⚽", "But contre son camp"];
  if (/penalty/.test(t) && /(miss|save)/.test(t)) return ["❌", "Penalty manqué"];
  if (/goal|penalty---scored|penalty - scored/.test(t) || k.scoringPlay) return ["⚽", /penalty/.test(t) ? "But sur penalty" : "But"];
  if (/red/.test(t)) return ["🟥", "Carton rouge"];
  if (/yellow/.test(t)) return ["🟨", "Carton jaune"];
  if (/substitution/.test(t)) return ["🔁", "Remplacement"];
  if (/var/.test(t)) return ["🖥️", "VAR"];
  if (/kickoff|start/.test(t)) return ["🟢", "Coup d'envoi"];
  if (/halftime|half-time/.test(t)) return ["⏸️", "Mi-temps"];
  if (/end|final|full/.test(t)) return ["🏁", "Fin du match"];
  return ["•", k.type?.text || ""];
}
async function renderMatch(s, l, id, tab) {
  const my = navId;
  setChrome(null, "Match");
  if (!view().querySelector("#mHead") || view().dataset.match !== id) {
    view().dataset.match = id;
    view().innerHTML = `<div class="glass" id="mHead">${skeleton(1, 150)}</div><div id="mSeg"></div><div id="mBody"></div>`;
  }
  let d;
  try { d = await API.summary(s, l, id); }
  catch (e) { if (alive(my)) view().innerHTML = errorBox(e.message, "ce match"); return; }
  if (!alive(my)) return;
  const comp = d.header?.competitions?.[0] || {};
  const ev = { id, date: comp.date, status: comp.status, competitions: [comp] };
  const { home, away } = sides(ev);
  const st = status(ev);
  const c = findComp(s, l) || { s, l, n: d.header?.league?.name || l, f: "🏟️" };
  noteTeam(home.team, s, l); noteTeam(away.team, s, l);
  setChrome(null, `${home.team?.abbreviation || ""} – ${away.team?.abbreviation || ""}`);
  const showScore = st.state !== "pre";
  const hs = scoreVal(home.score), as = scoreVal(away.score);
  const key = `${hs}-${as}`, prev = lastScore.get(id);
  lastScore.set(id, key);
  const won = cpt => st.state === "post" && (cpt.winner === true || (cpt.winner === undefined && (+scoreVal(cpt.score) > +scoreVal((cpt === home ? away : home).score) || (cpt.shootoutScore ?? -1) > ((cpt === home ? away : home).shootoutScore ?? -1))));
  const scorers = cpt => { const by = new Map();
    for (const k of (d.keyEvents || []).filter(k => k.scoringPlay && String(k.team?.id) === String(cpt.team?.id))) { const a = k.participants?.[0]?.athlete; if (!a) continue;
      const t = `${k.type?.type || ""} ${k.type?.text || ""}`.toLowerCase(); const nm = lastName(a); by.set(nm, [...(by.get(nm) || []), `${k.clock?.displayValue || ""}${/own/.test(t) ? " csc" : /penalty/.test(t) ? " pen" : ""}`]); }
    return by.size ? `<div class="scorers">${[...by].map(([n, m]) => `⚽ ${esc(n)} ${esc(m.join(", "))}`).join("<br>")}</div>` : ""; };
  const teamFav = cpt => { const t = cpt.team || {}; const on = isFav("teams", t.id); return `<button class="mini-fav ${on ? "on" : ""}" data-fav="teams" data-payload="${esc(JSON.stringify({ id: String(t.id), s, l, name: t.displayName, logo: t.logo || t.logos?.[0]?.href || "", nat: isNat(t) }))}" aria-pressed="${on}" aria-label="Suivre ${esc(t.displayName)}">${on ? "★" : "☆"}</button>`; };
  const teamLink = (cpt) => `<a href="#/team/${s}/${l}/${cpt.team?.id}" style="text-decoration:none;display:grid;justify-items:center">${won(cpt) ? `<span class="winner">🏆 Gagnant</span>` : `<span class="winner ghost"></span>`}${logo(cpt.team)}<div class="tn">${esc(cpt.team?.displayName || "")} ${teamFav(cpt)}</div>${scorers(cpt)}</a>`;
  $("#mHead").innerHTML = `
    <a class="bhead press" href="#/comp/${s}/${l}"><span style="display:grid;place-items:center">${leagueBadge(c)}</span><b>${esc(c.n)}</b><span class="go">${esc(fmtLong(comp.date || Date.now()))}</span></a>
    <div class="sb">${teamLink(home)}
      <div>${showScore ? `<div class="score${prev && prev !== key ? " flash" : ""}">${esc(hs)} – ${esc(as)}</div>` : `<div class="score" style="font-size:32px">${comp.date ? fmtTime(comp.date) : ""}</div>`}${stateLabel(ev)}
        ${home.shootoutScore != null ? `<div class="faint" style="font-size:12px;margin-top:4px">T.a.b. ${home.shootoutScore}–${away.shootoutScore}</div>` : ""}</div>
      ${teamLink(away)}</div>`;
  const base = `#/match/${s}/${l}/${id}`;
  const hasStats = (d.boxscore?.teams || []).some(t => (t.statistics || []).length);
  const hasLineups = (d.rosters || []).some(r => (r.roster || []).length);
  const tabs = [["resume", "Résumé"], ...(hasStats ? [["stats", "Stats"]] : []), ...(hasLineups ? [["compos", "Compos"]] : []), ["infos", "Infos"]];
  if (!tabs.some(t => t[0] === tab)) tab = "resume";
  $("#mSeg").innerHTML = segHTML(tabs, tab, base);
  requestAnimationFrame(placeBlobs);
  bindTabs(tb => renderMatch(s, l, id, tb));
  const body = $("#mBody");
  if (tab === "resume") {
    const ke = (d.keyEvents || []).filter(k => k.type);
    body.innerHTML = ke.length ? `<div class="glass tl" style="padding:14px 10px">${ke.map(k => {
      const [ico, lbl] = evIcon(k);
      const side = k.team?.id ? (String(k.team.id) === String(home.team?.id) ? "h" : "a") : "c";
      const names = (k.participants || []).map(p => p.athlete?.displayName).filter(Boolean);
      const sub = /substitution/i.test(k.type?.type || k.type?.text || "");
      const txt = side === "c" ? `<b>${ico} ${esc(lbl)}</b>` :
        `<b>${ico} ${esc(names[0] || lbl)}</b><small>${sub && names[1] ? "Sortie : " + esc(names[1]) : (k.scoringPlay && names[1] ? "Passe : " + esc(names[1]) : esc(lbl))}</small>`;
      return `<div class="tle ${side}"><span class="min">${esc(k.clock?.displayValue || "")}</span><div class="txt">${txt}</div></div>`;
    }).join("")}</div>` : emptyBox(st.state === "pre" ? "⏳" : "📝", st.state === "pre" ? "Le match n'a pas commencé" : "Pas d'événement détaillé pour ce match", st.state === "pre" ? `Coup d'envoi ${comp.date ? fmtLong(comp.date) + " à " + fmtTime(comp.date) : ""}` : "");
  } else if (tab === "stats") {
    const [th, ta] = [home, away].map(cpt => (d.boxscore.teams || []).find(t => String(t.team?.id) === String(cpt.team?.id)) || {});
    const gs = (t, n) => (t.statistics || []).find(x => x.name === n);
    const rows = STAT_ROWS.filter(([n]) => gs(th, n) || gs(ta, n));
    const list = rows.length ? rows.map(([n, lbl, unit]) => [lbl, gs(th, n)?.displayValue ?? "0", gs(ta, n)?.displayValue ?? "0", unit]) :
      (th.statistics || []).map(x => [x.label || x.name, x.displayValue, gs(ta, x.name)?.displayValue ?? "", ""]);
    body.innerHTML = `<div class="glass" style="padding:10px 14px"><div class="row" style="justify-content:space-between;padding:6px 6px 10px">${logo(home.team)}<b>Statistiques</b>${logo(away.team)}</div>
      ${list.map(([lbl, a, b, unit]) => { const x = parseFloat(a) || 0, y = parseFloat(b) || 0, tot = x + y || 1;
        return `<div class="stat"><div class="row"><span>${esc(a)}${unit || ""}</span><span class="muted" style="font-weight:600">${esc(lbl)}</span><span>${esc(b)}${unit || ""}</span></div>
          <div class="bars"><div class="bar l"><i style="width:${(x / tot) * 100}%"></i></div><div class="bar a"><i style="width:${(y / tot) * 100}%"></i></div></div></div>`; }).join("")}</div>`;
  } else if (tab === "compos") {
    const rs = [home, away].map(cpt => (d.rosters || []).find(r => String(r.team?.id) === String(cpt.team?.id)) || { roster: [] });
    [home, away].forEach((cpt, i) => (rs[i].roster || []).forEach(p => notePlayer(p.athlete, s, l, cpt.team)));
    body.innerHTML = pitchHTML(s, l, home, away, rs, d.keyEvents || []);
  } else {
    const gi = d.gameInfo || {};
    const tv = (comp.broadcasts || []).map(b => b.media?.shortName || b.names?.join(", ")).filter(Boolean).join(", ");
    const link = (d.header?.links || []).find(x => (x.rel || []).includes("summary"))?.href || d.header?.links?.[0]?.href;
    body.innerHTML = `<div class="glass" style="padding:14px"><div class="kv">
      ${comp.date ? `<div><small>Date</small><b style="text-transform:capitalize">${esc(fmtLong(comp.date))} · ${fmtTime(comp.date)}</b></div>` : ""}
      ${gi.venue?.fullName ? `<div><small>Stade</small><b>${esc(gi.venue.fullName)}${gi.venue.address?.city ? ", " + esc(gi.venue.address.city) : ""}</b></div>` : ""}
      ${gi.attendance ? `<div><small>Affluence</small><b>${Number(gi.attendance).toLocaleString("fr-FR")}</b></div>` : ""}
      ${(gi.officials || []).length ? `<div><small>Arbitre</small><b>${esc(gi.officials[0].displayName || gi.officials[0].fullName || "")}</b></div>` : ""}
      ${tv ? `<div><small>Diffusion</small><b>${esc(tv)}</b></div>` : ""}
    </div>${link ? `<a class="btn press" style="display:inline-block;margin-top:14px" href="${esc(link)}" target="_blank" rel="noopener">Fiche complète sur ESPN</a>` : ""}</div>`;
  }
  if (st.state === "in" || (st.state === "pre" && comp.date && new Date(comp.date) - Date.now() < 3600e3)) scheduleRefresh(() => softRun(() => route(true)), REFRESH);
}

/* ====================== Terrain et compositions ====================== */
const POS_RANK = ab => { const a = String(ab || "").toUpperCase();
  if (/^G/.test(a)) return 0; if (/^(CD|CB|LB|RB|LWB|RWB|SW|D)/.test(a)) return 1; if (/^DM/.test(a)) return 2;
  if (/^AM/.test(a)) return 4; if (/^(CF|LF|RF|LW|RW|ST|S\b|F)/.test(a)) return 5; return 3; };
const POS_SIDE = ab => { const a = String(ab || "").toUpperCase(); return /^L/.test(a) ? -2 : /-L$/.test(a) ? -1 : /^R/.test(a) ? 2 : /-R$/.test(a) ? 1 : 0; };
function lineupLines(roster, formation) {
  const xi = roster.filter(p => p.starter);
  if (xi.length < 7) return null;
  const ab = p => p.position?.abbreviation;
  const sorted = [...xi].sort((a, b) => POS_RANK(ab(a)) - POS_RANK(ab(b)) || (a.formationPlace || 0) - (b.formationPlace || 0));
  let sizes = String(formation || "").split("-").map(Number).filter(n => n > 0);
  if (sizes.reduce((a, b) => a + b, 0) !== xi.length - 1) {
    const g = {};
    sorted.slice(1).forEach(p => { const k = Math.min(5, Math.max(1, POS_RANK(ab(p)))); (g[k] ||= []).push(p); });
    sizes = Object.keys(g).sort().map(k => g[k].length);
  }
  const lines = [[sorted[0]]]; let i = 1;
  for (const n of sizes) { lines.push(sorted.slice(i, i + n).sort((a, b) => POS_SIDE(ab(a)) - POS_SIDE(ab(b)))); i += n; }
  return lines;
}
function tallyEvents(keyEvents) {
  const t = {}, get = id => (t[id] ||= { g: 0, og: 0, a: 0, y: 0, r: 0, out: "", in: "" });
  for (const k of keyEvents) {
    const txt = `${k.type?.type || ""} ${k.type?.text || ""}`.toLowerCase();
    const ids = (k.participants || []).map(p => p.athlete?.id).filter(Boolean);
    if (!ids.length) continue;
    const min = k.clock?.displayValue || "";
    if (k.scoringPlay) { if (/own/.test(txt)) get(ids[0]).og++; else { get(ids[0]).g++; if (ids[1] && !/penalty/.test(txt)) get(ids[1]).a++; } }
    else if (/substitution/.test(txt)) { get(ids[0]).in = min; if (ids[1]) get(ids[1]).out = min; }
    else if (/red/.test(txt)) get(ids[0]).r++;
    else if (/yellow/.test(txt)) get(ids[0]).y++;
  }
  return t;
}
const lastName = a => a?.lastName || String(a?.shortName || a?.displayName || "").replace(/^[A-Z]\.\s*/, "").split(" ").slice(-1)[0];
function kitColors(home, away) {
  const hex = c => "#" + String(c || "777777").replace("#", "");
  const rgb = h => { const n = parseInt(h.slice(1, 7), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
  const dist = (a, b) => { const [x, y] = [rgb(a), rgb(b)]; return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
  const h = hex(home.team?.color || idx.t[home.team?.id]?.c), a1 = hex(away.team?.color || idx.t[away.team?.id]?.c), a2 = hex(away.team?.alternateColor || idx.t[away.team?.id]?.c2 || "ffffff");
  return [h, dist(h, a1) < 90 ? a2 : a1];
}
const inkOn = h => { const n = parseInt(h.slice(1, 7), 16); return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 150 ? "#0b1020" : "#fff"; };
function pitchHTML(s, l, home, away, rosters, keyEvents) {
  const tally = tallyEvents(keyEvents);
  const [cH, cA] = kitColors(home, away);
  const lines = rosters.map(r => lineupLines(r.roster || [], r.formation));
  const token = (p, x, y, col) => {
    const a = p.athlete || {}, t = tally[a.id] || {};
    const badges = (t.g ? `<i class="b-goal">⚽${t.g > 1 ? `<b>x${t.g}</b>` : ""}</i>` : "") + (t.og ? `<i class="b-goal og">⚽<b>csc</b></i>` : "") +
      (t.r ? `<i class="b-card r"></i>` : t.y ? `<i class="b-card"></i>` : "") + (t.out || p.subbedOut ? `<i class="b-sub">▼${esc(t.out)}</i>` : "") +
      (t.a ? `<i class="b-ast">A${t.a > 1 ? t.a : ""}</i>` : "");
    return `<a class="pl press" style="left:${x}%;top:${y}%" href="#/player/${s}/${l}/${a.id}" aria-label="${esc(a.displayName)}">
      <span class="shirt" style="background:radial-gradient(circle at 32% 25%,rgba(255,255,255,.38),transparent 42%),${col};color:${inkOn(col)}">${esc(p.jersey || "")}${badges}</span>
      <span class="pn">${esc(lastName(a))}</span></a>`;
  };
  const place = (ls, top, col) => {
    if (!ls) return "";
    const L = ls.length;
    return ls.map((row, k) => row.map((p, j) => {
      const xx = ((j + 1) / (row.length + 1)) * 100;
      const y = top ? 6.5 + k * (36 / (L - 1)) : 93.5 - k * (36 / (L - 1));
      return token(p, top ? 100 - xx : xx, y, col);
    }).join("")).join("");
  };
  const head = (cpt, r, col) => `<div class="pitch-head"><span class="kit" style="background:${col}"></span>${logo(cpt.team)}<b class="grow ellip">${esc(cpt.team?.shortDisplayName || cpt.team?.displayName || "")}</b>${r.formation ? `<span class="chip">${esc(r.formation)}</span>` : ""}</div>`;
  const bench = (r, cpt) => {
    const b = (r.roster || []).filter(p => !p.starter);
    if (!b.length) return "";
    return `<div class="glass" style="padding:6px"><div class="row" style="padding:10px">${logo(cpt.team)}<b class="grow ellip">Remplaçants</b></div>${b.map(p => { const t = tally[p.athlete?.id] || {};
      return `<a class="person press" href="#/player/${s}/${l}/${p.athlete?.id}"><span class="num">${esc(p.jersey || "")}</span>${face(p.athlete?.headshot?.href, p.athlete?.displayName)}<span class="grow ellip" style="font-weight:650">${esc(p.athlete?.displayName || "")}</span><span style="font-size:12px;white-space:nowrap">${t.g ? "⚽".repeat(Math.min(t.g, 3)) + " " : ""}${t.in || p.subbedIn ? `<span style="color:var(--good);font-weight:800">▲ ${esc(t.in)}</span>` : `<span class="faint">${esc(p.position?.abbreviation || "")}</span>`}</span></a>`; }).join("")}</div>`;
  };
  if (!lines[0] && !lines[1]) return emptyBox("📋", "Compositions pas encore publiées", "Elles arrivent en général environ une heure avant le coup d'envoi.");
  return `<div class="glass" style="padding:6px">
    ${head(away, rosters[1], cA)}
    <div class="pitch">
      <svg class="lines" viewBox="0 0 68 105" preserveAspectRatio="none" aria-hidden="true"><g fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".35">
        <rect x="1.5" y="1.5" width="65" height="102" rx="1"/><line x1="1.5" y1="52.5" x2="66.5" y2="52.5"/><circle cx="34" cy="52.5" r="9.15"/>
        <rect x="13.85" y="1.5" width="40.3" height="16.5"/><rect x="24.85" y="1.5" width="18.3" height="5.5"/><path d="M26.7 18 A9.15 9.15 0 0 0 41.3 18"/>
        <rect x="13.85" y="87" width="40.3" height="16.5"/><rect x="24.85" y="98" width="18.3" height="5.5"/><path d="M26.7 87 A9.15 9.15 0 0 1 41.3 87"/></g>
        <g fill="rgba(255,255,255,.6)"><circle cx="34" cy="52.5" r=".5"/><circle cx="34" cy="12.5" r=".4"/><circle cx="34" cy="92.5" r=".4"/></g></svg>
      ${place(lines[1], true, cA)}${place(lines[0], false, cH)}
    </div>
    ${head(home, rosters[0], cH)}
  </div>
  <div class="row wrap" style="gap:12px 16px;padding:12px 8px 4px;font-size:12px;color:var(--ink-3)"><span>⚽ but · x2 doublé · x3 triplé</span><span>A passe décisive</span><span><i class="b-card inline"></i> carton</span><span style="color:var(--live);font-weight:800">▼</span><span>sorti</span></div>
  <div class="pitch-list" style="margin-top:12px">${bench(rosters[0], home)}${bench(rosters[1], away)}</div>`;
}

/* ====================== Ajouter aux favoris ====================== */
const CLUB_SOURCES = ["fra.1", "eng.1", "esp.1", "ita.1", "ger.1", "por.1", "ned.1", "bel.1", "tur.1", "sco.1", "usa.1", "bra.1", "arg.1", "ksa.1", "mex.1"];
const NAT_SOURCES = ["uefa.nations", "fifa.worldq.uefa", "fifa.worldq.conmebol", "fifa.worldq.caf"];
let addQ = "";
async function teamsFrom(slugs, nat) {
  const comps = slugs.map(l => findComp("soccer", l)).filter(Boolean);
  const res = await pool(comps, 5, c => API.standings(c));
  const out = new Map();
  res.forEach((r, i) => { if (!r.ok) return; const c = comps[i];
    for (const g of flatGroups(r.v)) for (const e of g.entries) { const t = e.team; if (!t?.id || out.has(String(t.id))) continue; noteTeam(t, c.s, c.l);
      out.set(String(t.id), { id: String(t.id), n: t.displayName, a: t.abbreviation, logo: t.logos?.[0]?.href || t.logo || "", color: t.color, alternateColor: t.alternateColor, s: c.s, l: c.l, lg: c.n, nat }); } });
  for (const t of Object.values(idx.t)) if (!out.has(t.id) && isNat(t) === nat && t.n) out.set(t.id, { id: t.id, n: t.n, a: t.a, logo: t.logo, s: t.s, l: t.l, lg: findComp(t.s, t.l)?.n || "", nat });
  return [...out.values()];
}
async function renderAdd(kind) {
  const my = navId;
  setChrome("favs", "Ajouter aux favoris");
  const titles = [["club", "Clubs"], ["nation", "Sélections"], ["player", "Joueurs"], ["comp", "Compétitions"]];
  view().innerHTML = `${segHTML(titles, kind, "#/add")}
    <label class="searchbox glass" for="addq"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="addq" type="search" autocomplete="off" placeholder="${{ club: "Nom du club…", nation: "Pays…", player: "Nom du joueur…", comp: "Ligue, coupe…" }[kind]}" value="${esc(addQ)}"></label>
    <div id="addBody" style="margin-top:12px"><div class="glass" style="padding:10px">${skeleton(6, 50)}</div></div>`;
  requestAnimationFrame(placeBlobs);
  let items = [];
  const tile = x => {
    if (kind === "comp") return `<div class="tile glass press" role="link" tabindex="0" data-href="#/comp/${x.s}/${esc(x.l)}"><span class="badge">${leagueBadge(x, 30)}</span><span class="grow"><div class="t1 ellip">${esc(x.n)}</div><div class="t2 ellip">${esc(x.c)}</div></span>${starBtn("comps", keyOf(x), isFav("comps", keyOf(x)))}</div>`;
    if (kind === "player") return `<div class="tile glass press" role="link" tabindex="0" data-href="#/player/${x.s}/${esc(x.l || "x")}/${x.id}"><span class="badge round">${face(x.img, x.n, "ph-img")}</span><span class="grow"><div class="t1 ellip">${esc(x.n)}</div><div class="t2 ellip">${esc(x.sub || "")}</div></span>${starBtn("players", { id: String(x.id), s: x.s, l: x.l || "x", name: x.n, img: x.img || "", teamId: x.tid || idx.p[x.id]?.tid || "" }, isFav("players", x.id))}</div>`;
    return `<div class="tile glass press" role="link" tabindex="0" data-href="#/team/${x.s}/${esc(x.l || "auto")}/${x.id}"><span class="badge">${logo({ id: x.id, logo: x.logo, abbreviation: x.a || x.n, color: x.color, alternateColor: x.alternateColor })}</span><span class="grow"><div class="t1 ellip">${esc(x.n)}</div><div class="t2 ellip">${esc(x.lg || "")}</div></span>${starBtn("teams", { id: String(x.id), s: x.s, l: x.l, name: x.n, logo: x.logo || "", nat: kind === "nation" }, isFav("teams", x.id))}</div>`;
  };
  const draw = async () => {
    const q = addQ.trim();
    let list = q.length >= 2 ? rank(items, q, x => `${x.n} ${x.a || ""} ${x.c || ""}`, 52) : items;
    if (q.length >= 3 && kind !== "comp") {
      try {
        const rem = parseSearch(await API.search(q));
        if (!alive(my)) return;
        const extra = kind === "player" ? rem.players.map(p => ({ ...p })) : rem.teams.filter(t => isNat(t) === (kind === "nation")).map(t => ({ ...t, lg: t.sub }));
        for (const x of extra) if (!list.some(y => String(y.id) === String(x.id)) && fuzzy(q, x.n) >= 45) list.push(x);
      } catch { /* la liste locale suffit */ }
    }
    const body = $("#addBody"); if (!body) return;
    if (!list.length) { body.innerHTML = emptyBox("🔎", "Rien trouvé", kind === "player" ? "Tape le nom d'un joueur, même approximatif." : "Essaie une autre orthographe."); return; }
    const groups = {};
    for (const x of list.slice(0, 160)) (groups[q ? "Résultats" : (x.lg || x.g || "Suggestions")] ||= []).push(x);
    body.innerHTML = Object.entries(groups).map(([g, xs]) => `<section class="region"><h3>${esc(g)} · ${xs.length}</h3><div class="grid">${xs.map(tile).join("")}</div></section>`).join("");
    fillLeagueLogos().catch(() => {});
  };
  if (kind === "comp") items = CATALOG.map(c => ({ ...c, lg: c.g }));
  else if (kind === "player") items = [...favs.players.map(p => ({ id: p.id, n: p.name, img: p.img, s: p.s, l: p.l, tid: p.teamId, sub: idx.t[p.teamId]?.n || "", lg: "Suivis" })),
    ...Object.values(idx.p).filter(p => !isFav("players", p.id)).slice(0, 60).map(p => ({ id: p.id, n: p.n, img: p.img, s: p.s, l: p.l, tid: p.tid, sub: p.tn, lg: "Déjà consultés" }))];
  else items = await teamsFrom(kind === "nation" ? NAT_SOURCES : CLUB_SOURCES, kind === "nation");
  if (!alive(my)) return;
  if (!items.length && kind === "player" && !addQ) $("#addBody").innerHTML = emptyBox("👤", "Cherche un joueur", "Tape son nom au-dessus, l'orthographe n'a pas besoin d'être exacte.");
  else await draw();
  const inp = $("#addq");
  inp.addEventListener("input", debounce(() => { addQ = inp.value; draw(); }, 250));
}

/* ====================== Favoris ====================== */
function renderFavs() {
  const comps = favs.comps.map(k => { const [s, l] = k.split("/"); return findComp(s, l) || { s, l, n: l, c: "", f: "➕" }; });
  const sect = (title, items, html) => items.length ? `<div class="sec"><h2>${title}</h2><span class="chip">${items.length}</span></div><div class="grid">${items.map(html).join("")}</div>` : "";
  const empty = !comps.length && !favs.teams.length && !favs.players.length;
  view().innerHTML = `<div class="sec" style="margin-top:6px"><h2>Mes favoris</h2></div>
    <div class="addrow">${[["club", "🏟️", "Club"], ["nation", "🏳️", "Sélection"], ["player", "👤", "Joueur"], ["comp", "🏆", "Compétition"]].map(([k, i, l]) => `<a class="addbtn glass press" href="#/add/${k}"><span>${i}</span><b>＋ ${l}</b></a>`).join("")}</div>
    ${empty ? emptyBox("⭐", "Rien de suivi pour l'instant", "Ajoute un club, une sélection, un joueur ou une compétition avec les boutons ci-dessus.") : ""}
    ${sect("Joueurs", favs.players, p => `<div class="tile glass press" role="link" tabindex="0" data-href="#/player/${p.s}/${esc(p.l || "x")}/${p.id}"><span class="badge round">${face(p.img, p.name, "ph-img")}</span><span class="grow"><div class="t1 ellip">${esc(p.name)}</div><div class="t2 ellip">${esc(idx.t[p.teamId]?.n || "")}</div></span>${starBtn("players", p, true)}</div>`)}
    ${sect("Sélections", favs.teams.filter(isNat), t => `<div class="tile glass press" role="link" tabindex="0" data-href="#/team/${t.s}/${esc(t.l || "auto")}/${t.id}"><span class="badge">${logo({ id: t.id, logo: t.logo, abbreviation: idx.t[t.id]?.a || t.name })}</span><span class="grow"><div class="t1 ellip">${esc(t.name)}</div><div class="t2 ellip">Sélection nationale</div></span>${starBtn("teams", t, true)}</div>`)}
    ${sect("Clubs", favs.teams.filter(t => !isNat(t)), t => `<div class="tile glass press" role="link" tabindex="0" data-href="#/team/${t.s}/${esc(t.l || "auto")}/${t.id}"><span class="badge">${logo({ id: t.id, logo: t.logo, abbreviation: idx.t[t.id]?.a || t.name })}</span><span class="grow"><div class="t1 ellip">${esc(t.name)}</div><div class="t2 ellip">${esc(findComp(t.s, t.l)?.n || "")}</div></span>${starBtn("teams", t, true)}</div>`)}
    ${sect("Compétitions", comps, c => `<div class="tile glass press" role="link" tabindex="0" data-href="#/comp/${c.s}/${esc(c.l)}"><span class="badge">${leagueBadge(c, 30)}</span><span class="grow"><div class="t1 ellip">${esc(c.n)}</div><div class="t2 ellip">${esc(c.c)}</div></span>${starBtn("comps", keyOf(c), true)}</div>`)}
    ${!empty ? `<p class="note">Les notifications se règlent dans l'onglet Profil.</p>` : ""}`;
}

/* ====================== Recherche ====================== */
const COUNTRIES = new Set("espagne,angleterre,allemagne,italie,pays-bas,belgique,bresil,argentine,maroc,algerie,senegal,cameroun,egypte,colombie,mexique,etats-unis,japon,croatie,suisse,ecosse,pays de galles,irlande,turquie,grece,pologne,autriche,danemark,suede,norvege,coree du sud,australie,arabie saoudite,tunisie,france,england,spain,germany,italy,portugal,netherlands,belgium,brazil,argentina,uruguay,colombia,mexico,usa,united states,canada,morocco,algeria,tunisia,senegal,ivory coast,cote d'ivoire,cameroon,nigeria,ghana,egypt,japan,south korea,korea republic,australia,croatia,serbia,switzerland,denmark,sweden,norway,poland,austria,scotland,wales,ireland,turkey,türkiye,greece,ukraine,czechia,chile,peru,ecuador,paraguay,saudi arabia,qatar,iran,mali,dr congo,south africa".split(","));
let recent = store.get("tribune.recent", []);
// Recherche tolérante : accents, majuscules, espaces et fautes de frappe ignorés (mbape, kilian, real madri…)
const fold = x => norm(x).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function lev(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length; if (!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}
const squeeze = x => x.replace(/(.)\1+/g, "$1").replace(/ph/g, "f").replace(/y/g, "i").replace(/k/g, "c").replace(/w/g, "v");
function fuzzy(q, name) {
  const Q = fold(q), N = fold(name);
  if (!Q || !N) return 0;
  if (N.includes(Q)) return N.startsWith(Q) ? 100 : 95;
  const nt = N.split(" ");
  let total = 0;
  for (const t of Q.split(" ")) {
    let best = 0;
    for (const u of nt) {
      if (u.startsWith(t)) { best = Math.max(best, 92); continue; }
      const st = squeeze(t), su = squeeze(u);
      if (su.startsWith(st)) { best = Math.max(best, 88); continue; }
      const L = Math.max(st.length, su.length), whole = 1 - lev(st, su) / L;
      const pre = st.length >= 3 ? 1 - lev(st, su.slice(0, st.length)) / st.length : 0;
      best = Math.max(best, whole >= 0.62 ? whole * 85 : 0, pre >= 0.7 ? pre * 80 : 0);
    }
    if (!best) return 0;
    total += best;
  }
  const qn = squeeze(Q.replace(/ /g, "")), nn = squeeze(N.replace(/ /g, ""));
  const joined = 1 - lev(qn, nn) / Math.max(qn.length, nn.length);
  return Math.max(total / Q.split(" ").length, joined >= 0.7 ? joined * 85 : 0);
}
const rank = (arr, q, key, min = 55) => arr.map(x => [x, fuzzy(q, key(x))]).filter(([, sc]) => sc >= min).sort((a, b) => b[1] - a[1]).map(([x]) => x);
let searchQ = "";
function parseSearch(d) {
  const out = { players: [], teams: [], leagues: [] };
  const sportOf = uid => ({ "600": "soccer", "40": "basketball", "20": "football", "70": "hockey", "1": "baseball" })[(uid.match(/s:(\d+)/) || [])[1]] || "soccer";
  const items = [];
  for (const g of d?.results || d?.items || []) for (const c of g.contents || [g]) items.push({ ...c, _type: (g.type || c.type || "").toLowerCase() });
  for (const c of items) {
    const uid = c.uid || "";
    const name = c.displayName || c.name || c.title;
    if (!name) continue;
    const img = c.image?.default || c.image?.href || c.images?.[0]?.url || c.logo || "";
    const s = sportOf(uid);
    const a = uid.match(/~a:(\d+)/)?.[1], t = uid.match(/~t:(\d+)/)?.[1];
    if (a || /player|athlete/.test(c._type)) out.players.push({ id: a || c.id, n: name, img, sub: c.subtitle || c.description || "", s, l: c.defaultLeagueSlug || "x" });
    else if (t || /team/.test(c._type)) out.teams.push({ id: t || c.id, n: name, logo: img, sub: c.subtitle || c.description || "", s, l: c.defaultLeagueSlug || idx.t[t || c.id]?.l || "auto" });
  }
  out.players = out.players.filter(p => p.id); out.teams = out.teams.filter(t => t.id);
  return out;
}
function renderSearch() {
  view().innerHTML = `<div style="margin-top:6px"></div>
    <label class="searchbox glass" for="sq"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
      <input id="sq" type="search" enterkeyhint="search" placeholder="Joueur, club, ligue, sélection…" autocomplete="off" value="${esc(searchQ)}"></label>
    <div id="sres"></div>`;
  const inp = $("#sq");
  setTimeout(() => inp.focus(), 250);
  const run = debounce(q => doSearch(q), 220);
  inp.addEventListener("input", () => { searchQ = inp.value; run(searchQ); });
  inp.addEventListener("keydown", e => { if (e.key === "Enter") { inp.blur(); remember(searchQ); } });
  doSearch(searchQ);
}
function remember(q) { q = q.trim(); if (q.length < 2) return; recent = [q, ...recent.filter(x => norm(x) !== norm(q))].slice(0, 8); store.set("tribune.recent", recent); }
let searchSeq = 0;
async function doSearch(q) {
  const box = $("#sres"); if (!box) return;
  const nq = fold(q);
  if (nq.length < 2) {
    box.innerHTML = `${recent.length ? `<div class="sec"><h2>Récentes</h2><button class="chip press" data-act="clearRecent">Effacer</button></div><div class="chips">${recent.map(r => `<button class="chip press" data-q="${esc(r)}">${esc(r)}</button>`).join("")}</div>` : ""}
      <div class="sec"><h2>Suggestions</h2></div><div class="chips">${["Mbappé", "Real Madrid", "Ligue 1", "Haaland", "PSG", "Champions", "Maroc", "Yamal"].map(r => `<button class="chip press" data-q="${esc(r)}">${esc(r)}</button>`).join("")}</div>`;
    return;
  }
  const seq = ++searchSeq;
  const comps = rank(CATALOG, q, c => `${c.n} ${c.c}`).slice(0, 8);
  const lt = rank(Object.values(idx.t), q, t => `${t.n} ${t.a}`).slice(0, 12);
  const lp = rank(Object.values(idx.p), q, p => p.n).slice(0, 12);
  const draw = (remote, loading, failed) => {
    const byScore = (a, b) => fuzzy(q, b.n) - fuzzy(q, a.n);
    const teams = [...lt.map(t => ({ id: t.id, n: t.n, logo: t.logo, sub: findComp(t.s, t.l)?.n || "", s: t.s, l: t.l })), ...(remote?.teams || [])].filter((t, i, a) => a.findIndex(x => String(x.id) === String(t.id)) === i).sort(byScore);
    const players = [...lp.map(p => ({ id: p.id, n: p.n, img: p.img, sub: p.tn, s: p.s, l: p.l })), ...(remote?.players || [])].filter((p, i, a) => a.findIndex(x => String(x.id) === String(p.id)) === i).sort(byScore);
    const nat = teams.filter(t => COUNTRIES.has(norm(t.n))), clubs = teams.filter(t => !COUNTRIES.has(norm(t.n)));
    const sec = (title, arr, fn) => arr.length ? `<div class="sec"><h2>${title}</h2><span class="chip">${arr.length}</span></div><div class="grid">${arr.slice(0, 12).map(fn).join("")}</div>` : "";
    const tTile = t => `<div class="tile glass press" role="link" tabindex="0" data-href="#/team/${t.s}/${esc(t.l || "auto")}/${t.id}" data-remember="1"><span class="badge">${logo({ id: t.id, logo: t.logo, abbreviation: idx.t[t.id]?.a || t.n })}</span><span class="grow"><div class="t1 ellip">${esc(t.n)}</div><div class="t2 ellip">${esc(t.sub || "")}</div></span>${starBtn("teams", { id: String(t.id), s: t.s, l: t.l, name: t.n, logo: t.logo || "" }, isFav("teams", t.id))}</div>`;
    box.innerHTML = sec("Joueurs", players, p => `<div class="tile glass press" role="link" tabindex="0" data-href="#/player/${p.s}/${esc(p.l || "x")}/${p.id}" data-remember="1"><span class="badge round">${face(p.img, p.n, "ph-img")}</span><span class="grow"><div class="t1 ellip">${esc(p.n)}</div><div class="t2 ellip">${esc(p.sub || "")}</div></span>${starBtn("players", { id: String(p.id), s: p.s, l: p.l || "x", name: p.n, img: p.img || "", teamId: idx.p[p.id]?.tid || "" }, isFav("players", p.id))}</div>`)
      + sec("Clubs", clubs, tTile) + sec("Sélections nationales", nat, tTile)
      + sec("Compétitions", comps, c => `<div class="tile glass press" role="link" tabindex="0" data-href="#/comp/${c.s}/${esc(c.l)}" data-remember="1"><span class="badge">${leagueBadge(c, 30)}</span><span class="grow"><div class="t1 ellip">${esc(c.n)}</div><div class="t2 ellip">${esc(c.c)}</div></span>${starBtn("comps", keyOf(c), isFav("comps", keyOf(c)))}</div>`)
      + (loading ? `<div class="glass" style="padding:10px;margin-top:14px">${skeleton(2, 50)}</div>` : "")
      + (!loading && !players.length && !teams.length && !comps.length ? emptyBox("🔎", "Aucun résultat", failed ? "La recherche en ligne n'a pas répondu ; seuls les éléments déjà consultés sont proposés." : DEMO ? "En mode démo, seuls les clubs de démonstration et leurs joueurs fictifs existent. La version hébergée cherche parmi tous les joueurs réels." : "Essaie seulement le nom de famille.") : "")
      + (failed && (players.length || teams.length) ? `<p class="note">Recherche en ligne indisponible : résultats issus des pages déjà consultées.</p>` : "");
  };
  draw(null, true);
  try {
    const words = fold(q).split(" ").filter(w => w.length >= 3).sort((a, b) => b.length - a.length);
    const variants = [...new Set([q.trim(), words[0], words.join(" ").slice(0, 4)].filter(v => v && v.length >= 2))].slice(0, 3);
    const res = await Promise.allSettled(variants.map(v => API.search(v)));
    if (seq !== searchSeq) return;
    const ok = res.filter(x => x.status === "fulfilled").map(x => parseSearch(x.value));
    if (!ok.length) throw new Error("vide");
    const merged = { players: ok.flatMap(o => o.players), teams: ok.flatMap(o => o.teams) };
    merged.players = merged.players.filter(p => DEMO ? fuzzy(q, p.n) >= 55 : fuzzy(q, p.n) >= 45 || ok[0].players.includes(p));
    merged.teams = merged.teams.filter(t => DEMO ? fuzzy(q, t.n) >= 55 : fuzzy(q, t.n) >= 45 || ok[0].teams.includes(t));
    draw(merged, false);
  }
  catch { if (seq === searchSeq) draw(null, false, true); }
}

/* ====================== Profil et réglages ====================== */
const isIOS = /iP(hone|ad|od)/.test(navigator.userAgent);
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
async function pushState() {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return { ok: false, text: "Ce navigateur ne gère pas les notifications." };
  if (isIOS && !standalone) return { ok: false, text: "Sur iPhone, ajoute d'abord Tribune à l'écran d'accueil (Partager → Sur l'écran d'accueil), puis ouvre-la depuis l'icône." };
  if (Notification.permission === "denied") return { ok: false, text: "Notifications refusées. Réactive-les dans les réglages du téléphone pour Tribune." };
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && "pushManager" in reg ? await reg.pushManager.getSubscription() : null;
  if (Notification.permission === "granted" && sub && PROXY) return { ok: true, on: true, text: "Activées : tu reçois les alertes même application fermée." };
  if (Notification.permission === "granted" && !PROXY) return { ok: true, on: true, local: true, text: "Activées tant que l'application est ouverte. Pour les recevoir application fermée, héberge le serveur Tribune (voir LISEZ-MOI)." };
  return { ok: true, on: false, text: PROXY ? "Active-les pour être prévenu des buts de tes équipes et joueurs, même application fermée." : "Active-les pour être prévenu pendant que l'application est ouverte." };
}
async function renderProfile() {
  const ps = await pushState();
  const sw = (id, on, dis) => `<button class="sw" role="switch" aria-checked="${!!on}" data-set="${id}" ${dis ? "disabled" : ""}><span class="sr">${id}</span></button>`;
  view().innerHTML = `
    <div class="sec" style="margin-top:6px"><h2>Profil et réglages</h2></div>
    <div class="glass" style="padding:16px;display:grid;gap:10px">
      <div class="row"><span style="font-size:26px">🔔</span><div class="grow"><b>Notifications</b><div class="muted" style="font-size:13.5px">${esc(ps.text)}</div></div></div>
      <div class="row wrap">${ps.ok && !ps.on ? `<button class="btn primary press" data-act="enablePush">Activer les notifications</button>` : ""}${ps.on ? `<button class="btn press" data-act="testPush">Envoyer un test</button>` : ""}${ps.on && PROXY ? `<button class="btn press" data-act="disablePush">Désactiver sur cet appareil</button>` : ""}</div>
    </div>
    <div class="sec"><h2>Je veux être prévenu pour</h2></div>
    <div class="glass set">${NOTIF_TYPES.map(t => `<div class="it"><div class="grow">${esc(t.label)}${!t.available ? "<small>Non fourni par la source de données</small>" : t.serverOnly ? "<small>Uniquement avec le serveur Tribune (joueurs et clubs suivis)</small>" : ""}</div>${sw("prefs." + t.key, t.available && settings.prefs[t.key], !t.available)}</div>`).join("")}</div>
    <p class="note">S'appliquent à tes favoris : joueurs (leurs buts, cartons, entrées), clubs (tous leurs matchs), compétitions (buts, cartons rouges, début et fin des matchs). Au-delà de 5 alertes par minute, elles sont regroupées.</p>
    <div class="sec"><h2>Apparence</h2></div>
    <div class="glass set">
      <div class="it"><div class="grow">Thème</div><select class="sel" data-set="theme" aria-label="Thème"><option value="auto" ${settings.theme === "auto" ? "selected" : ""}>Automatique</option><option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Sombre</option><option value="light" ${settings.theme === "light" ? "selected" : ""}>Clair</option></select></div>
      <div class="it"><div class="grow">Opacité renforcée<small>Moins de transparence, meilleur contraste</small></div>${sw("opaque", settings.opaque)}</div>
      <div class="it"><div class="grow">Animations<small>Transitions, effets de verre et rebonds</small></div>${sw("motion", settings.motion)}</div>
    </div>
    <div class="sec"><h2>Données</h2></div>
    <div class="glass set">
      <div class="it"><div class="grow">Mode<small>${DEMO ? "Démo : matchs, joueurs et scores fictifs pour tester l'app (aucune source réelle joignable ici)" : PROXY ? "Serveur Tribune connecté : cache partagé et notifications push" : "Autonome : données lues directement chez ESPN"}</small></div><span class="chip">${DEMO ? "Démo" : PROXY ? "Serveur" : "Autonome"}</span></div>
      <div class="it"><div class="grow">Vider le cache<small>${mem.size} réponses en mémoire · ${Object.keys(idx.t).length} clubs et ${Object.keys(idx.p).length} joueurs indexés</small></div><button class="btn press" data-act="clearCache">Vider</button></div>
      <div class="it"><div class="grow">Réinitialiser mes favoris</div><button class="btn press" data-act="resetFavs">Réinitialiser</button></div>
    </div>
    <p class="note">Tes favoris et réglages restent sur cet appareil. Si tu actives les notifications avec le serveur, seuls tes favoris et tes préférences d'alerte lui sont envoyés, sans nom ni adresse e-mail.</p>`;
}
function applySettings() {
  const r = document.documentElement;
  if (settings.theme === "auto") r.removeAttribute("data-theme"); else r.dataset.theme = settings.theme;
  r.dataset.opaque = settings.opaque ? "1" : "0";
  r.dataset.motion = settings.motion ? "1" : "0";
  $('meta[name="theme-color"]').content = (settings.theme === "light" || (settings.theme === "auto" && matchMedia("(prefers-color-scheme: light)").matches)) ? "#e4ebf8" : "#070b18";
}

/* ====================== Notifications ====================== */
const b64ToU8 = b => { const s = atob((b + "=".repeat((4 - b.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/")); return Uint8Array.from(s, ch => ch.charCodeAt(0)); };
async function enablePush() {
  if (isIOS && !standalone) { toast("Ajoute d'abord Tribune à l'écran d'accueil", "Partager → Sur l'écran d'accueil, puis ouvre l'app depuis l'icône."); return; }
  const perm = await Notification.requestPermission();
  if (perm !== "granted") { toast("Notifications non autorisées", "Tu peux changer d'avis dans les réglages du téléphone."); return renderProfile(); }
  if (PROXY) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const { publicKey } = await (await fetch("/api/push/key")).json();
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) });
      await syncPush();
      toast("Notifications activées", "Tu seras prévenu même application fermée.");
    } catch (e) { toast("Abonnement impossible", e.message); }
  } else toast("Notifications activées", "Elles fonctionnent tant que l'application est ouverte.");
  renderProfile();
}
async function syncPush() {
  if (!PROXY || !("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && await reg.pushManager?.getSubscription();
  if (!sub) return;
  await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), favs, prefs: settings.prefs }) });
}
const syncPushSoon = debounce(() => syncPush().catch(() => {}), 1200);
let serverPushOn = false;

// Surveillance locale : toasts dans l'app (et notifications système si pas de serveur)
const localSnap = new Map();
async function localWatch() {
  const leagues = relevantLeagues();
  if (!leagues.length) return;
  const res = await pool(leagues, 4, c => API.scoreboard(c));
  res.forEach((r, i) => {
    if (!r.ok) return;
    const c = leagues[i];
    for (const ev of r.v.events || []) {
      if (status(ev).state === "in") liveIds.add(ev.id); else liveIds.delete(ev.id);
      for (const e of diffEvents(localSnap.get(ev.id), ev, c)) {
        if (!isRelevant(e, favs, settings.prefs)) continue;
        const href = `#/match/${c.s}/${c.l}/${e.matchId}`;
        toast(e.title, e.body, href);
        if (!serverPushOn && "Notification" in window && Notification.permission === "granted" && document.hidden)
          navigator.serviceWorker?.ready.then(reg => reg.showNotification(e.title, { body: e.body, tag: e.tag, icon: "icons/icon-192.png", badge: "icons/badge-96.png", data: { url: "/" + href } })).catch(() => {});
      }
      localSnap.set(ev.id, snapshot(ev));
    }
  });
  updateLivePill();
}

/* ====================== Interactions ====================== */
document.addEventListener("click", async e => {
  const t = e.target;
  const fav = t.closest("[data-fav]");
  if (fav) {
    e.preventDefault(); e.stopPropagation();
    const type = fav.dataset.fav, payload = JSON.parse(fav.dataset.payload);
    const on = toggleFav(type, payload);
    fav.classList.toggle("on", on); fav.setAttribute("aria-pressed", on);
    fav.textContent = fav.classList.contains("follow") ? (on ? "★ Suivi" : "☆ Suivre") : (on ? "★" : "☆");
    if (on && type === "teams" && isNat(payload)) { const f = favs.teams.find(x => String(x.id) === String(payload.id)); if (f && !f.nat) { f.nat = true; saveFavs(); } }
    fav.classList.remove("wobble"); void fav.offsetWidth; fav.classList.add("wobble");
    if (navigator.vibrate) navigator.vibrate(8);
    if (on) toast("Ajouté à tes favoris", type === "players" ? "Tu seras prévenu de ses buts selon tes réglages." : "Ses matchs apparaissent sur l'accueil.");
    if (location.hash === "#/favs" && !on) renderFavs();
    return;
  }
  const seg = t.closest("[data-seg]");
  if (seg) { history.replaceState(null, "", seg.dataset.seg); const tab = seg.dataset.seg.split("/").pop(); if (view()._tab) view()._tab(tab); else route(true); return; }
  const href = t.closest("[data-href]");
  if (href && !t.closest("a,button,input,select")) { if (href.dataset.remember) remember(searchQ); go(href.dataset.href); return; }
  const tab = t.closest(".dock [data-tab]");
  if (tab) { const blob = $("#dockBlob"); blob.classList.remove("stretch"); void blob.offsetWidth; blob.classList.add("stretch"); go(`#/${tab.dataset.tab}`); return; }
  const day = t.closest("[data-day]");
  if (day) { compDate = day.dataset.day || null; const m = location.hash.match(/^#\/comp\/([\w-]+)\/([\w.\-]+)/); if (m) { navId++; compMatches(findComp(m[1], m[2]) || { s: m[1], l: m[2] }, $("#cBody"), navId); } return; }
  const col = t.closest("[data-collapse]");
  if (col) { const k = col.dataset.collapse; const blk = col.closest(".block"); const now = !blk.classList.contains("collapsed"); blk.classList.toggle("collapsed", now); col.setAttribute("aria-expanded", !now);
    now ? collapsed.add(k) : collapsed.delete(k); store.set("tribune.collapsed", [...collapsed]); return; }
  const hd = t.closest("[data-hday]");
  if (hd) { homeDate = hd.dataset.hday === ymd(new Date()) ? null : hd.dataset.hday; $$(".hdays .day").forEach(b => b.classList.toggle("on", b === hd)); navId++; softRun(() => renderHome()); $("#homeList").style.opacity = .5; return; }
  const hf = t.closest("[data-hf]");
  if (hf) { homeFilter = hf.dataset.hf; navId++; softRun(() => renderHome()); return; }
  const lf = t.closest("[data-lf]");
  if (lf) { liveFilter = lf.dataset.lf; view()._drawLive?.(); return; }
  const q = t.closest("[data-q]");
  if (q) { searchQ = q.dataset.q; $("#sq").value = searchQ; remember(searchQ); doSearch(searchQ); return; }
  const set = t.closest("[data-set].sw");
  if (set) {
    const k = set.dataset.set, on = set.getAttribute("aria-checked") !== "true";
    set.setAttribute("aria-checked", on);
    if (k.startsWith("prefs.")) settings.prefs[k.slice(6)] = on; else settings[k] = on;
    saveSettings(); return;
  }
  const act = t.closest("[data-act]")?.dataset.act;
  if (!act) return;
  if (act === "retry") { mem.clear(); route(true); }
  if (act === "enablePush") enablePush();
  if (act === "testPush") {
    if (PROXY && serverPushOn) { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); const r = await fetch("/api/push/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub?.endpoint }) }); toast(r.ok ? "Test envoyé" : "Échec du test", r.ok ? "La notification arrive dans quelques secondes." : "Réactive les notifications."); }
    else { const reg = await navigator.serviceWorker?.ready; reg?.showNotification("Tribune", { body: "Les notifications fonctionnent.", icon: "icons/icon-192.png" }); }
  }
  if (act === "disablePush") { const reg = await navigator.serviceWorker.getRegistration(); const sub = await reg?.pushManager.getSubscription(); if (sub) { await fetch("/api/push/unsubscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); } serverPushOn = false; toast("Notifications désactivées sur cet appareil"); renderProfile(); }
  if (act === "clearCache") { mem.clear(); idx.t = {}; idx.p = {}; store.set("tribune.idx", idx); if ("caches" in window) for (const k of await caches.keys()) if (k.includes("data")) await caches.delete(k); toast("Cache vidé"); renderProfile(); }
  if (act === "resetFavs") {
    const b = t.closest("[data-act]");
    if (b.dataset.confirm) { favs = { comps: [], teams: [], players: [] }; saveFavs(); toast("Favoris réinitialisés"); renderProfile(); }
    else { b.dataset.confirm = "1"; b.textContent = "Confirmer ?"; setTimeout(() => { if (b.isConnected) { delete b.dataset.confirm; b.textContent = "Réinitialiser"; } }, 4000); }
  }
  if (act === "clearRecent") { recent = []; store.set("tribune.recent", recent); doSearch(""); }
});
document.addEventListener("change", e => { const s = e.target.closest("select[data-set]"); if (s) { settings[s.dataset.set] = s.value; saveSettings(); } });
document.addEventListener("keydown", e => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-href]")) { e.preventDefault(); go(e.target.dataset.href); } });
document.addEventListener("submit", e => {
  if (e.target.id !== "customForm") return;
  e.preventDefault();
  const s = $("#cSport").value, l = $("#cCode").value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (!l) return;
  const c = { s, l, n: $("#cName").value.trim() || l.toUpperCase(), c: "Ajoutée par toi", f: "➕", g: "Mes ajouts" };
  if (!findComp(s, l)) { CATALOG.push(c); store.set("tribune.customs", [...store.get("tribune.customs", []), c]); }
  go(`#/comp/${s}/${l}`);
});
$("#backBtn").addEventListener("click", () => { if (history.length > 1) history.back(); else go("#/home"); });
$("#searchBtn").addEventListener("click", () => go("#/search"));

// Verre réactif : reflet qui suit le doigt, pression élastique
let rafPending = false, lastPt = null;
document.addEventListener("pointermove", e => {
  lastPt = e;
  if (rafPending || !settings.motion) return;
  rafPending = true;
  requestAnimationFrame(() => {
    rafPending = false;
    const g = lastPt.target.closest?.(".glass");
    if (!g) return;
    const r = g.getBoundingClientRect();
    g.style.setProperty("--mx", `${((lastPt.clientX - r.left) / r.width) * 100}%`);
    g.style.setProperty("--my", `${((lastPt.clientY - r.top) / r.height) * 100}%`);
  });
}, { passive: true });
let pressed = null;
document.addEventListener("pointerdown", e => { pressed = e.target.closest(".press, .dock button"); pressed?.classList.add("down"); }, { passive: true });
const release = () => { pressed?.classList.remove("down"); pressed = null; };
["pointerup", "pointercancel", "pointerleave", "dragstart"].forEach(ev => document.addEventListener(ev, release, { passive: true }));
document.addEventListener("scroll", () => { $("#top").classList.toggle("compact", scrollY > 24); }, { passive: true });
addEventListener("resize", debounce(placeBlobs, 100));
document.addEventListener("visibilitychange", () => { if (!document.hidden) { localWatch().catch(() => {}); if (/^#\/(home|live)?$|^$/.test(location.hash)) route(true); } });

/* ====================== Démarrage ====================== */
(async function boot() {
  applySettings();
  if (location.protocol.startsWith("http")) {
    try { const r = await fetch("/api/health", { cache: "no-store" }); PROXY = r.ok && (await r.json()).ok === true; } catch { PROXY = false; }
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").then(async reg => {
        const sub = await reg.pushManager?.getSubscription?.();
        serverPushOn = !!(sub && PROXY);
        if (serverPushOn) syncPushSoon();
      }).catch(() => {});
    }
  }
  if (!PROXY) {
    // Source réelle joignable ? Sinon (aperçu, hors ligne), on passe en démo
    try {
      const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(HOST.site + "/apis/site/v2/sports/soccer/fra.1/scoreboard", { signal: ctl.signal });
      if (!r.ok) throw new Error();
      await r.json();
    } catch { DEMO = true; }
  }
  $("#demoBar").classList.toggle("hidden", !DEMO);
  route(true);
  setTimeout(() => localWatch().catch(() => {}), DEMO ? 1500 : 4000);
  setInterval(() => { if (!document.hidden) localWatch().catch(() => {}); }, REFRESH);
})();
