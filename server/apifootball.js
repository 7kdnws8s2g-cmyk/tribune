// Source API-Football (api-sports.io), traduite au format que l'application utilise déjà.
// Activée dès que la variable APIFOOTBALL_KEY est renseignée. La clé reste sur le serveur, jamais dans l'app.
// Quota : un seul appel « matchs en direct » partagé toutes les 20 s, le reste est mis en cache.

const BASE = process.env.APIFOOTBALL_BASE || "https://v3.football.api-sports.io";
const KEY = process.env.APIFOOTBALL_KEY || "";
export const enabled = () => !!KEY;

// Codes de l'app → identifiants API-Football
export const LEAGUE_IDS = {
  "fifa.world": 1, "uefa.champions": 2, "uefa.europa": 3, "uefa.euro": 4, "uefa.nations": 5, "caf.nations": 6, "afc.asian.cup": 7,
  "conmebol.america": 9, "fifa.friendly": 10, "conmebol.sudamericana": 11, "caf.champions": 12, "conmebol.libertadores": 13, "fifa.cwc": 15,
  "concacaf.champions": 16, "afc.champions": 17, "concacaf.gold": 22, "fifa.worldq.caf": 29, "fifa.worldq.uefa": 32, "fifa.worldq.conmebol": 34,
  "uefa.europa.conf": 848, "fifa.wwc": 8, "uefa.wchampions": 525, "uefa.weuro": 416,
  "fra.1": 61, "fra.2": 62, "fra.3": 63, "fra.coupe_de_france": 66, "fra.w.1": 64,
  "eng.1": 39, "eng.2": 40, "eng.3": 41, "eng.4": 42, "eng.fa": 45, "eng.league_cup": 48, "eng.w.1": 44,
  "esp.1": 140, "esp.2": 141, "esp.copa_del_rey": 143, "esp.w.1": 142,
  "ita.1": 135, "ita.2": 136, "ita.coppa_italia": 137, "ger.1": 78, "ger.2": 79, "ger.dfb_pokal": 81,
  "por.1": 94, "ned.1": 88, "bel.1": 144, "sco.1": 179, "tur.1": 203, "sui.1": 207, "aut.1": 218, "gre.1": 197, "den.1": 119,
  "nor.1": 103, "swe.1": 113, "rus.1": 235, "irl.1": 357, "cyp.1": 318,
  "usa.1": 253, "usa.nwsl": 254, "mex.1": 262, "bra.1": 71, "bra.2": 72, "arg.1": 128, "col.1": 239, "chi.1": 265, "uru.1": 268,
  "per.1": 281, "ecu.1": 242, "par.1": 250, "crc.1": 162,
  "ksa.1": 307, "jpn.1": 98, "kor.1": 292, "chn.1": 169, "aus.1": 188, "ind.1": 323, "rsa.1": 288, "uae.1": 301, "egy.1": 233,
  "mar.1": 200, "tun.1": 202, "alg.1": 186, "nga.1": 399,
};
const SLUG_OF = Object.fromEntries(Object.entries(LEAGUE_IDS).map(([k, v]) => [v, k]));

/* ---------- Appels et cache ---------- */
const cache = new Map();
export const quota = { remaining: null, limit: null, lastError: "" };
async function af(path, ttl) {
  const hit = cache.get(path);
  if (hit && Date.now() - hit.t < ttl) return hit.v;
  const r = await fetch(BASE + path, { headers: { "x-apisports-key": KEY, Accept: "application/json" } });
  const rem = r.headers.get("x-ratelimit-requests-remaining"), lim = r.headers.get("x-ratelimit-requests-limit");
  if (rem !== null) quota.remaining = Number(rem);
  if (lim !== null) quota.limit = Number(lim);
  if (!r.ok) { if (hit) return hit.v; throw new Error(`API-Football ${r.status}`); }
  const j = await r.json();
  const errs = j.errors && (Array.isArray(j.errors) ? j.errors : Object.values(j.errors));
  if (errs && errs.length) { quota.lastError = String(errs[0]); if (hit) return hit.v; throw new Error(`API-Football : ${errs[0]}`); }
  cache.set(path, { t: Date.now(), v: j.response });
  if (cache.size > 4000) for (const k of [...cache.keys()].slice(0, 800)) cache.delete(k);
  return j.response;
}
const H = 3600e3;
async function season(lid) {
  const r = await af(`/leagues?id=${lid}&current=true`, 12 * H);
  return r?.[0]?.seasons?.find(s => s.current)?.year ?? r?.[0]?.seasons?.at(-1)?.year ?? new Date().getFullYear();
}
async function liveMap() {
  const r = await af("/fixtures?live=all", 20e3).catch(() => []);
  return new Map((r || []).map(f => [f.fixture.id, f]));
}

/* ---------- Traductions ---------- */
const LIVE = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const DONE = new Set(["FT", "AET", "PEN", "CANC", "ABD", "AWD", "WO"]);
const NAMES = { "1H": "STATUS_FIRST_HALF", HT: "STATUS_HALFTIME", "2H": "STATUS_SECOND_HALF", ET: "STATUS_EXTRA_TIME", BT: "STATUS_HALFTIME_ET",
  P: "STATUS_SHOOTOUT", SUSP: "STATUS_SUSPENDED", INT: "STATUS_SUSPENDED", FT: "STATUS_FULL_TIME", AET: "STATUS_FINAL_AET", PEN: "STATUS_FINAL_PEN",
  PST: "STATUS_POSTPONED", CANC: "STATUS_CANCELED", ABD: "STATUS_ABANDONED", AWD: "STATUS_FINAL", WO: "STATUS_FINAL", TBD: "STATUS_SCHEDULED", NS: "STATUS_SCHEDULED" };
function status(f) {
  const s = f.fixture?.status || {};
  const state = LIVE.has(s.short) ? "in" : DONE.has(s.short) ? "post" : "pre";
  const clock = s.elapsed != null ? `${s.elapsed}'${s.extra ? "+" + s.extra : ""}` : "";
  const detail = state === "in" ? (s.short === "HT" ? "HT" : s.short === "P" ? "T.a.b." : clock) : state === "post" ? s.short : "";
  return { type: { state, name: NAMES[s.short] || "STATUS_SCHEDULED", shortDetail: detail, completed: state === "post" }, displayClock: clock };
}
const abbr = t => t.code || String(t.name || "?").replace(/[^A-Za-zÀ-ÿ ]/g, "").split(" ").filter(Boolean).map(w => w[0]).join("").slice(0, 3).toUpperCase() || String(t.name).slice(0, 3).toUpperCase();
const teamObj = (t, colors) => t && ({ id: String(t.id), displayName: t.name, shortDisplayName: t.name, name: t.name, abbreviation: abbr(t), logo: t.logo, logos: t.logo ? [{ href: t.logo }] : [],
  ...(colors?.primary ? { color: colors.primary, alternateColor: colors.border || colors.number } : {}) });
const clock = e => ({ value: (e.time?.elapsed || 0) * 60 + (e.time?.extra || 0), displayValue: `${e.time?.elapsed ?? ""}'${e.time?.extra ? "+" + e.time.extra : ""}` });
const person = p => p && p.id ? { id: String(p.id), displayName: p.name, shortName: p.name, headshot: { href: `https://media.api-sports.io/football/players/${p.id}.png` } } : null;
function detailOf(e) {
  const d = String(e.detail || ""), t = String(e.type || "");
  const base = { clock: clock(e), team: { id: String(e.team?.id || "") }, athletesInvolved: [person(e.player), person(e.assist)].filter(Boolean) };
  if (t === "Goal" && /missed/i.test(d)) return { ...base, type: { id: "pm", text: "Penalty - Missed" } };
  if (t === "Goal") return { ...base, scoringPlay: true, penaltyKick: /penalty/i.test(d), ownGoal: /own/i.test(d), type: { id: "g", text: /own/i.test(d) ? "Own Goal" : /penalty/i.test(d) ? "Penalty - Scored" : "Goal" } };
  if (t === "Card") return /red|second/i.test(d) ? { ...base, redCard: true, type: { id: "rc", text: "Red Card" } } : { ...base, yellowCard: true, type: { id: "yc", text: "Yellow Card" } };
  return null;
}
function toEvent(f, colors = {}) {
  const st = status(f);
  const g = f.goals || {}, pen = f.score?.penalty || {};
  const comp = (side) => ({ homeAway: side, score: g[side] == null ? "" : String(g[side]), team: teamObj(f.teams[side], colors[f.teams[side]?.id]),
    winner: f.teams[side]?.winner === true, ...(pen[side] != null ? { shootoutScore: pen[side] } : {}) });
  return {
    id: String(f.fixture.id), date: f.fixture.date, name: `${f.teams.home.name} - ${f.teams.away.name}`, status: st,
    competitions: [{ date: f.fixture.date, status: st, league: { slug: SLUG_OF[f.league?.id] || "" }, competitors: [comp("home"), comp("away")],
      details: (f.events || []).map(detailOf).filter(Boolean), venue: { fullName: f.fixture.venue?.name, address: { city: f.fixture.venue?.city } } }],
  };
}
const leagueMeta = l => l ? [{ name: l.name, logos: l.logo ? [{ href: l.logo, rel: ["full", "default"] }] : [] }] : [];

/* ---------- Pages ---------- */
async function scoreboard(slug, dates) {
  const lid = LEAGUE_IDS[slug];
  if (!lid) return null;
  const s = await season(lid);
  const today = new Date().toISOString().slice(0, 10);
  let list, round = "";
  if (dates) {
    const d = `${dates.slice(0, 4)}-${dates.slice(4, 6)}-${dates.slice(6, 8)}`;
    list = await af(`/fixtures?league=${lid}&season=${s}&date=${d}&timezone=Europe/Paris`, d === today ? 60e3 : 6 * H);
  } else {
    const rounds = await af(`/fixtures/rounds?league=${lid}&season=${s}&current=true`, 30 * 60e3).catch(() => []);
    round = rounds?.[0] || "";
    list = round ? await af(`/fixtures?league=${lid}&season=${s}&round=${encodeURIComponent(round)}&timezone=Europe/Paris`, 60e3)
      : await af(`/fixtures?league=${lid}&season=${s}&date=${today}&timezone=Europe/Paris`, 60e3);
  }
  // Superpose les données en direct (score, minute, buteurs) partagées par tous les écrans
  const needsLive = (list || []).some(f => LIVE.has(f.fixture.status.short) || (f.fixture.status.short === "NS" && Math.abs(Date.parse(f.fixture.date) - Date.now()) < 15 * 60e3));
  const live = needsLive ? await liveMap() : new Map();
  const events = (list || []).map(f => toEvent(live.get(f.fixture.id) || f));
  const num = String(round).match(/(\d+)\s*$/)?.[1];
  return { events, leagues: leagueMeta(list?.[0]?.league || { name: slug }), ...(num ? { week: { number: Number(num) } } : {}) };
}
const STAT = { "Ball Possession": "possessionPct", "Total Shots": "totalShots", "Shots on Goal": "shotsOnTarget", "Corner Kicks": "wonCorners", Fouls: "foulsCommitted",
  Offsides: "offsides", "Goalkeeper Saves": "saves", "Yellow Cards": "yellowCards", "Red Cards": "redCards", "Passes accurate": "accuratePasses", "Passes %": "passPct" };
async function summary(id) {
  const f = (await af(`/fixtures?id=${id}&timezone=Europe/Paris`, 20e3))?.[0];
  if (!f) return { code: 404 };
  const st = status(f);
  if (st.type.state === "post") cache.set(`/fixtures?id=${id}&timezone=Europe/Paris`, { t: Date.now() + 6 * H, v: [f] }); // match fini : gardé longtemps
  const colors = Object.fromEntries((f.lineups || []).map(l => [l.team.id, l.team.colors?.player]));
  const ev = toEvent(f, colors);
  const subs = {};
  const keyEvents = (f.events || []).map((e, i) => {
    const t = String(e.type || ""), d = String(e.detail || "");
    const base = { id: `e${i}`, clock: clock(e), team: { id: String(e.team?.id || "") } };
    if (t === "Goal" && !/missed/i.test(d)) return { ...base, scoringPlay: true, type: { type: /own/i.test(d) ? "own-goal" : /penalty/i.test(d) ? "penalty---scored" : "goal", text: /own/i.test(d) ? "Own Goal" : /penalty/i.test(d) ? "Penalty - Scored" : "Goal" },
      participants: [person(e.player), person(e.assist)].filter(Boolean).map(a => ({ athlete: a })) };
    if (t === "Goal") return { ...base, type: { type: "penalty-missed", text: "Penalty - Missed" }, participants: [{ athlete: person(e.player) }] };
    if (t === "Card") return { ...base, type: /red|second/i.test(d) ? { type: "red-card", text: "Red Card" } : { type: "yellow-card", text: "Yellow Card" }, participants: [{ athlete: person(e.player) }] };
    if (/subst/i.test(t)) { // API-Football : player = joueur qui sort, assist = joueur qui entre
      if (e.player?.id) subs[e.player.id] = "out"; if (e.assist?.id) subs[e.assist.id] = "in";
      return { ...base, type: { type: "substitution", text: "Substitution" }, participants: [person(e.assist), person(e.player)].filter(Boolean).map(a => ({ athlete: a })) };
    }
    if (/var/i.test(t)) return { ...base, type: { type: "var", text: `VAR : ${d}` }, participants: e.player?.id ? [{ athlete: person(e.player) }] : [] };
    return null;
  }).filter(Boolean);
  const short = f.fixture.status.short;
  if (st.type.state !== "pre") keyEvents.unshift({ id: "ko", type: { type: "kickoff", text: "Kickoff" }, clock: { displayValue: "1'" } });
  if (["2H", "ET", "BT", "P", "FT", "AET", "PEN"].includes(short) || short === "HT") {
    const at = keyEvents.findIndex(k => k.clock.value > 45 * 60 + 59);
    keyEvents.splice(at < 0 ? keyEvents.length : at, 0, { id: "ht", type: { type: "halftime", text: "Halftime" }, clock: { displayValue: "45'", value: 2760 } });
  }
  if (st.type.state === "post") keyEvents.push({ id: "ft", type: { type: "end-regular-time", text: "Full Time" }, clock: { displayValue: `${f.fixture.status.elapsed || 90}'` } });
  const roster = (p, starter) => ({ starter, jersey: String(p.player.number ?? ""), athlete: person(p.player), position: { abbreviation: p.player.pos || "" }, grid: p.player.grid || null,
    ...(subs[p.player.id] === "out" ? { subbedOut: true } : {}), ...(subs[p.player.id] === "in" ? { subbedIn: true } : {}) });
  return {
    header: { league: { name: f.league?.name, logo: f.league?.logo }, competitions: [{ ...ev.competitions[0], date: f.fixture.date, status: st }], links: [] },
    keyEvents,
    boxscore: { teams: (f.statistics || []).map(s => ({ team: teamObj(s.team), statistics: (s.statistics || []).filter(x => STAT[x.type]).map(x => ({ name: STAT[x.type], label: x.type, displayValue: String(x.value ?? 0).replace("%", "") })) })) },
    rosters: (f.lineups || []).map(l => ({ team: teamObj(l.team, l.team.colors?.player), formation: l.formation, coach: l.coach?.name,
      roster: [...(l.startXI || []).map(p => roster(p, true)), ...(l.substitutes || []).map(p => roster(p, false))] })),
    gameInfo: { venue: { fullName: f.fixture.venue?.name, address: { city: f.fixture.venue?.city } }, officials: f.fixture.referee ? [{ displayName: f.fixture.referee.split(",")[0] }] : [] },
    leagues: leagueMeta(f.league),
  };
}
const zone = d => { const s = String(d || "").toLowerCase(); return /champions league/.test(s) ? "#2f7fe0" : /europa league/.test(s) ? "#f08c00" : /conference/.test(s) ? "#13a86b" : /relegation/.test(s) ? "#d6334d" : /promotion|play.?off|qualification/.test(s) ? "#8b6cf0" : ""; };
const zoneFr = d => String(d).replace(/^Promotion - /i, "").replace(/\(.*?\)/g, "").replace(/Relegation/i, "Relégation").replace(/Champions League/i, "Ligue des champions").replace(/Europa League/i, "Ligue Europa").replace(/Conference League/i, "Ligue Conférence").trim();
async function standings(slug) {
  const lid = LEAGUE_IDS[slug]; if (!lid) return null;
  const s = await season(lid);
  const r = await af(`/standings?league=${lid}&season=${s}`, 30 * 60e3);
  const groups = r?.[0]?.league?.standings || [];
  const st = (n, v) => ({ name: n, displayValue: String(v ?? "") });
  return { leagues: leagueMeta(r?.[0]?.league), children: groups.map(rows => ({ name: rows[0]?.group || r?.[0]?.league?.name, standings: { entries: rows.map(x => ({
    team: teamObj(x.team), note: zone(x.description) ? { color: zone(x.description), description: zoneFr(x.description) } : undefined,
    stats: [st("rank", x.rank), st("gamesPlayed", x.all?.played), st("wins", x.all?.win), st("ties", x.all?.draw), st("losses", x.all?.lose),
      st("pointsFor", x.all?.goals?.for), st("pointsAgainst", x.all?.goals?.against), st("pointDifferential", (x.goalsDiff > 0 ? "+" : "") + x.goalsDiff), st("points", x.points)] })) } })) };
}
async function leaders(slug) {
  const lid = LEAGUE_IDS[slug]; if (!lid) return null;
  const s = await season(lid);
  const [g, a] = await Promise.all([af(`/players/topscorers?league=${lid}&season=${s}`, 6 * H), af(`/players/topassists?league=${lid}&season=${s}`, 6 * H).catch(() => [])]);
  const map = (arr, key) => (arr || []).slice(0, 15).map(x => ({ value: x.statistics?.[0]?.goals?.[key] || 0, displayValue: String(x.statistics?.[0]?.goals?.[key] || 0),
    athlete: { id: String(x.player.id), displayName: x.player.name, headshot: { href: x.player.photo }, team: teamObj(x.statistics?.[0]?.team) } }));
  return { stats: [{ name: "goals", displayName: "Buteurs", leaders: map(g, "total") }, { name: "assists", displayName: "Passeurs", leaders: map(a, "assists") }] };
}
async function team(id) {
  const r = (await af(`/teams?id=${id}`, 24 * H))?.[0];
  if (!r) return { code: 404 };
  const lg = await af(`/leagues?team=${id}&current=true`, 24 * H).catch(() => []);
  const main = (lg || []).find(x => x.league.type === "League" && SLUG_OF[x.league.id]) || (lg || []).find(x => SLUG_OF[x.league.id]);
  return { team: { ...teamObj(r.team), location: r.team.country, founded: r.team.founded, national: r.team.national, defaultLeagueSlug: main ? SLUG_OF[main.league.id] : "",
    franchise: { venue: { fullName: r.venue?.name, address: { city: r.venue?.city }, capacity: r.venue?.capacity } } } };
}
const POS = { Goalkeeper: "G", Defender: "D", Midfielder: "M", Attacker: "F" };
async function roster(id) {
  const [sq, co] = await Promise.all([af(`/players/squads?team=${id}`, 12 * H), af(`/coachs?team=${id}`, 24 * H).catch(() => [])]);
  const coach = (co || []).find(c => (c.career || []).some(k => String(k.team?.id) === String(id) && !k.end)) || co?.[0];
  return { athletes: (sq?.[0]?.players || []).map(p => ({ id: String(p.id), displayName: p.name, jersey: p.number == null ? "" : String(p.number), age: p.age,
    position: { abbreviation: POS[p.position] || "", name: p.position, displayName: p.position }, headshot: { href: p.photo } })),
    coach: coach ? [{ firstName: coach.firstname || "", lastName: coach.lastname || coach.name || "" }] : [] };
}
async function schedule(id) {
  const [last, next] = await Promise.all([af(`/fixtures?team=${id}&last=12&timezone=Europe/Paris`, 10 * 60e3), af(`/fixtures?team=${id}&next=6&timezone=Europe/Paris`, 10 * 60e3)]);
  return { events: [...(last || []), ...(next || [])].map(f => toEvent(f)) };
}
async function playerSeasons(id) {
  const ys = await af(`/players/seasons?player=${id}`, 24 * H).catch(() => []);
  return [...(ys || [])].sort((a, b) => b - a);
}
async function playerYear(id, y) { return (await af(`/players?id=${id}&season=${y}`, y >= new Date().getFullYear() - 1 ? 6 * H : 7 * 24 * H))?.[0]; }
async function athlete(id) {
  const ys = await playerSeasons(id);
  let p = null;
  for (const y of ys.slice(0, 2)) { p = await playerYear(id, y); if (p) break; }
  if (!p) p = (await af(`/players/profiles?player=${id}`, 24 * H).catch(() => []))?.[0];
  if (!p) return { code: 404 };
  const pl = p.player, stats = p.statistics || [];
  const club = stats.find(s => s.team && !s.team.national && (s.games?.appearences || s.games?.lineups)) || stats.find(s => s.team) || {};
  return { athlete: { id: String(pl.id), displayName: pl.name, firstName: pl.firstname, lastName: pl.lastname, age: pl.age, dateOfBirth: pl.birth?.date,
    displayBirthPlace: [pl.birth?.place, pl.birth?.country].filter(Boolean).join(", "), citizenship: pl.nationality, displayHeight: pl.height, displayWeight: pl.weight,
    headshot: { href: pl.photo }, position: { displayName: club.games?.position || pl.position || "" }, jersey: club.games?.number != null ? String(club.games.number) : (pl.number != null ? String(pl.number) : ""),
    team: teamObj(club.team) } };
}
async function athleteStats(id) {
  const ys = (await playerSeasons(id)).slice(0, 10);
  const per = await Promise.all(ys.map(y => playerYear(id, y).catch(() => null)));
  const teams = {};
  const rows = [];
  per.forEach((p, i) => { for (const s of p?.statistics || []) {
    if (!s.team) continue;
    const apps = s.games?.appearences ?? 0;
    if (!apps && !s.goals?.total) continue;
    teams[s.team.id] = { displayName: s.team.name };
    const y = ys[i];
    rows.push({ season: { displayName: `${y}-${String((y + 1) % 100).padStart(2, "0")}`, year: y }, teamId: String(s.team.id), league: { name: s.league?.name },
      stats: [apps, s.goals?.total ?? 0, s.goals?.assists ?? 0, s.games?.minutes ?? 0, s.cards?.yellow ?? 0, (s.cards?.red ?? 0) + (s.cards?.yellowred ?? 0), s.penalty?.scored ?? 0].map(v => String(v ?? 0)) });
  } });
  rows.sort((a, b) => a.season.year - b.season.year);
  const tot = rows.reduce((acc, r) => r.stats.map((v, i) => (acc[i] || 0) + Number(v)), []);
  const trophies = await af(`/trophies?player=${id}`, 24 * H).catch(() => []);
  return { categories: rows.length ? [{ displayName: "Carrière par saison et compétition", labels: ["MJ", "B", "PD", "Min", "CJ", "CR", "Pen"],
    names: ["appearances", "totalGoals", "goalAssists", "minutes", "yellowCards", "redCards", "penaltyGoals"], statistics: rows, totals: tot.map(String) }] : [],
    teams, trophies: (trophies || []).map(t => ({ league: t.league, country: t.country, season: t.season, place: t.place })) };
}
async function search(q) {
  const words = String(q).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9 ]/g, " ").split(" ").filter(w => w.length >= 3).sort((a, b) => b.length - a.length);
  const term = words[0] || String(q).trim();
  if (term.length < 3) return { results: [] };
  const [teams, players] = await Promise.all([
    af(`/teams?search=${encodeURIComponent(term)}`, 24 * H).catch(() => []),
    af(`/players/profiles?search=${encodeURIComponent(term)}`, 24 * H).catch(() => []),
  ]);
  return { results: [
    { type: "player", contents: (players || []).slice(0, 20).map(x => ({ uid: `s:600~a:${x.player.id}`, displayName: x.player.name, subtitle: [x.player.position, x.player.nationality].filter(Boolean).join(" · "), image: { default: x.player.photo } })) },
    { type: "team", contents: (teams || []).slice(0, 20).map(x => ({ uid: `s:600~t:${x.team.id}`, displayName: x.team.name, subtitle: x.team.national ? "Sélection nationale" : x.team.country, image: { default: x.team.logo }, national: x.team.national })) },
  ] };
}

/** Traduit un chemin de l'app (format ESPN) ; renvoie null si la page n'est pas gérée ici (actus, autres sports). */
export async function handle(path) {
  if (!KEY) return null;
  const [p, qs = ""] = path.split("?");
  const q = new URLSearchParams(qs);
  let m;
  if (/\/search/.test(p)) return search(q.get("query") || "");
  if (!/\/sports\/soccer\//.test(p)) return null;
  if ((m = p.match(/\/soccer\/([\w.\-]+)\/scoreboard$/))) return scoreboard(m[1], q.get("dates"));
  if ((m = p.match(/\/soccer\/([\w.\-]+)\/standings$/))) return standings(m[1]);
  if ((m = p.match(/\/soccer\/[\w.\-]+\/summary$/))) return summary(q.get("event"));
  if ((m = p.match(/\/teams\/(\d+)\/roster$/))) return roster(m[1]);
  if ((m = p.match(/\/teams\/(\d+)\/schedule$/))) return schedule(m[1]);
  if ((m = p.match(/\/teams\/(\d+)$/))) return team(m[1]);
  if ((m = p.match(/\/athletes\/(\d+)\/stats$/))) return athleteStats(m[1]);
  if ((m = p.match(/\/athletes\/(\d+)$/))) return athlete(m[1]);
  if ((m = p.match(/\/soccer\/([\w.\-]+)\/statistics$/))) return leaders(m[1]);
  return null; // actualités : on garde ESPN
}
