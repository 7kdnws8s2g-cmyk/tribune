// Mode démo : répond aux mêmes requêtes que l'API ESPN avec des données FICTIVES, générées de façon déterministe.
// Utilisé uniquement quand aucune source réelle n'est joignable (aperçu, hors ligne). Les joueurs sont inventés.
// Un match « accéléré » par compétition se joue en continu (1 minute de jeu = 20 secondes) pour tester le direct et les alertes.

const DEMO_SPEED = 20000; // ms réelles par minute de jeu pour le match accéléré
const CYCLE = 40 * 60000; // un nouveau match accéléré toutes les 40 minutes

// [id, nom, abréviation, couleur, couleur 2, ville]
const LEAGUES = {
  "fra.1": [[160, "Paris SG", "PSG", "004170", "da291c", "Paris"], [176, "Marseille", "OM", "2faee0", "ffffff", "Marseille"], [167, "Lyon", "OL", "1a3d8f", "e3001b", "Lyon"], [175, "Lens", "RCL", "e8b200", "c4161c", "Lens"], [174, "Monaco", "ASM", "e2001a", "ffffff", "Monaco"], [166, "Lille", "LOSC", "e01e13", "1d2d5c", "Lille"], [2502, "Nice", "OGCN", "c8102e", "111111", "Nice"], [3243, "Rennes", "SRFC", "e13327", "111111", "Rennes"]],
  "eng.1": [[359, "Arsenal", "ARS", "ef0107", "ffffff", "Londres"], [364, "Liverpool", "LIV", "c8102e", "00b2a9", "Liverpool"], [382, "Manchester City", "MCI", "6cabdd", "1c2c5b", "Manchester"], [363, "Chelsea", "CHE", "034694", "ffffff", "Londres"], [360, "Manchester United", "MUN", "da291c", "fbe122", "Manchester"], [367, "Tottenham", "TOT", "132257", "ffffff", "Londres"], [361, "Newcastle", "NEW", "241f20", "ffffff", "Newcastle"], [362, "Aston Villa", "AVL", "670e36", "95bfe5", "Birmingham"]],
  "esp.1": [[86, "Real Madrid", "RMA", "febe10", "00529f", "Madrid"], [83, "Barcelone", "BAR", "a50044", "004d98", "Barcelone"], [1068, "Atlético Madrid", "ATM", "cb3524", "272e61", "Madrid"], [93, "Athletic Bilbao", "ATH", "ee2523", "ffffff", "Bilbao"], [102, "Villarreal", "VIL", "ffe667", "005187", "Villarreal"], [244, "Real Betis", "BET", "0bb363", "ffffff", "Séville"], [243, "Séville FC", "SEV", "d4021d", "ffffff", "Séville"], [89, "Real Sociedad", "RSO", "0067b1", "ffffff", "Saint-Sébastien"]],
  "ita.1": [[110, "Inter", "INT", "010e80", "000000", "Milan"], [103, "AC Milan", "MIL", "fb090b", "000000", "Milan"], [111, "Juventus", "JUV", "111111", "ffffff", "Turin"], [114, "Naples", "NAP", "12a0d7", "ffffff", "Naples"], [104, "AS Rome", "ROM", "8e1f2f", "f0bc42", "Rome"], [105, "Atalanta", "ATA", "1e71b8", "000000", "Bergame"], [112, "Lazio", "LAZ", "87d8f7", "ffffff", "Rome"], [107, "Bologne", "BOL", "1a2f48", "a21c26", "Bologne"]],
  "ger.1": [[132, "Bayern Munich", "BAY", "dc052d", "0066b2", "Munich"], [124, "Dortmund", "BVB", "fde100", "000000", "Dortmund"], [131, "Leverkusen", "B04", "e32221", "000000", "Leverkusen"], [11420, "RB Leipzig", "RBL", "dd0741", "001f47", "Leipzig"], [134, "Stuttgart", "VFB", "e32219", "ffffff", "Stuttgart"], [125, "Francfort", "SGE", "e1000f", "000000", "Francfort"]],
};
LEAGUES["uefa.nations"] = [[9001, "France", "FRA", "002395", "ed2939", "Paris"], [9002, "Espagne", "ESP", "c60b1e", "ffc400", "Madrid"], [9003, "Angleterre", "ENG", "ffffff", "cf081f", "Londres"], [9004, "Portugal", "POR", "006600", "ff0000", "Lisbonne"], [9005, "Allemagne", "GER", "ffffff", "000000", "Berlin"], [9006, "Italie", "ITA", "0066cc", "ffffff", "Rome"], [9007, "Pays-Bas", "NED", "ff6600", "ffffff", "Amsterdam"], [9008, "Belgique", "BEL", "e30613", "000000", "Bruxelles"]];
LEAGUES["fifa.worldq.caf"] = [[9011, "Maroc", "MAR", "c1272d", "006233", "Rabat"], [9012, "Algérie", "ALG", "006633", "ffffff", "Alger"], [9013, "Sénégal", "SEN", "00853f", "fdef42", "Dakar"], [9014, "Côte d'Ivoire", "CIV", "f77f00", "009e60", "Abidjan"], [9015, "Tunisie", "TUN", "e70013", "ffffff", "Tunis"], [9016, "Égypte", "EGY", "ce1126", "ffffff", "Le Caire"]];
LEAGUES["fifa.worldq.conmebol"] = [[9021, "Brésil", "BRA", "ffdf00", "009c3b", "Rio"], [9022, "Argentine", "ARG", "75aadb", "ffffff", "Buenos Aires"], [9023, "Uruguay", "URU", "5cbfeb", "ffffff", "Montevideo"], [9024, "Colombie", "COL", "fcd116", "003893", "Bogota"]];
LEAGUES["uefa.champions"] = [LEAGUES["fra.1"][0], LEAGUES["esp.1"][0], LEAGUES["eng.1"][2], LEAGUES["ger.1"][0], LEAGUES["ita.1"][0], LEAGUES["eng.1"][0], LEAGUES["esp.1"][1], LEAGUES["eng.1"][1]];
const LEAGUE_NAMES = { "uefa.nations": "Ligue des nations", "fifa.worldq.caf": "Qualifs Mondial · Afrique", "fifa.worldq.conmebol": "Qualifs Mondial · Amérique du Sud", "fra.1": "Ligue 1", "eng.1": "Premier League", "esp.1": "LaLiga", "ita.1": "Serie A", "ger.1": "Bundesliga", "uefa.champions": "Ligue des champions" };
const TEAM = new Map();
for (const [l, ts] of Object.entries(LEAGUES)) for (const t of ts) if (!TEAM.has(t[0]) || l !== "uefa.champions") TEAM.set(t[0], { id: t[0], n: t[1], a: t[2], c: t[3], c2: t[4], city: t[5], l: TEAM.get(t[0])?.l || l });

// Générateur pseudo-aléatoire déterministe
function rng(seed) { let h = 2166136261; for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 1e6) / 1e6; }; }
const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

const FIRST = ["Lucas", "Noah", "Adam", "Yanis", "Hugo", "Ilyes", "Mathis", "Rayan", "Enzo", "Sami", "Théo", "Nolan", "Karim", "Mehdi", "Léo", "Axel", "Diego", "Marco", "Jonas", "Kenji", "Mateo", "Elias", "Bilal", "Tiago", "Omar", "Victor", "Liam", "Nils", "Ismaël", "Joao"];
const LAST = ["Moreau", "Benali", "Okafor", "Silva", "Kovač", "Lindqvist", "Diallo", "Ferreira", "Rossi", "Müller", "Haddad", "Petit", "Mendy", "Costa", "Novak", "Traoré", "Garnier", "Ibáñez", "Keller", "Bakayoko", "Santos", "Laurent", "Ndiaye", "Romano", "Fofana", "Dubois", "Ortega", "Varga", "Camara", "Lemaire"];
const NATS = ["France", "Espagne", "Brésil", "Portugal", "Sénégal", "Maroc", "Allemagne", "Italie", "Argentine", "Côte d'Ivoire", "Pays-Bas", "Belgique", "Algérie", "Croatie", "Japon"];
const POS = [["G", "Goalkeeper", 2], ["D", "Defender", 6], ["M", "Midfielder", 5], ["F", "Forward", 5]];

const xiOf = tid => { const sq = squad(tid); return [sq[0], ...sq.filter(p => p.position.abbreviation === "D").slice(0, 4), ...sq.filter(p => p.position.abbreviation === "M").slice(0, 3), ...sq.filter(p => p.position.abbreviation === "F").slice(0, 3)]; };
const squadCache = new Map();
function squad(tid) {
  if (squadCache.has(tid)) return squadCache.get(tid);
  const r = rng("squad" + tid); const out = []; let n = 0; const used = new Set();
  for (const [ab, name, count] of POS) for (let i = 0; i < count; i++) {
    let full; do { full = `${pick(r, FIRST)} ${pick(r, LAST)}`; } while (used.has(full)); used.add(full);
    const jersey = ab === "G" ? [1, 16, 30][i] : ab === "D" ? [2, 3, 4, 5, 15, 22][i] : ab === "M" ? [6, 8, 10, 14, 18][i] : [7, 9, 11, 19, 21][i];
    out.push({ id: String(tid * 100 + n++), displayName: full, jersey: String(jersey), position: { abbreviation: ab, name, displayName: name },
      age: 18 + Math.floor(r() * 16), citizenship: tid >= 9000 || r() < 0.45 ? TEAM_NAT(tid) : pick(r, NATS), displayHeight: `1,${70 + Math.floor(r() * 25)} m`, teamId: tid });
  }
  squadCache.set(tid, out); return out;
}
const TEAM_NAT = tid => tid >= 9000 ? TEAM.get(tid).n : ({ "fra.1": "France", "eng.1": "Angleterre", "esp.1": "Espagne", "ita.1": "Italie", "ger.1": "Allemagne" })[TEAM.get(tid)?.l] || "France";
const teamObj = t => ({ id: String(t.id), displayName: t.n, shortDisplayName: t.n, abbreviation: t.a, color: t.c, alternateColor: t.c2, name: t.n });
const playerById = id => { const tid = Math.floor(Number(id) / 100); return TEAM.has(tid) ? squad(tid).find(p => p.id === String(id)) : null; };

/* ---------- Matchs ---------- */
function phase(kick, msPerMin, now = Date.now()) {
  const e = (now - kick) / msPerMin;
  if (e < 0) return { state: "pre", name: "STATUS_SCHEDULED", min: 0 };
  if (e < 45) return { state: "in", name: "STATUS_FIRST_HALF", min: Math.floor(e) + 1 };
  if (e < 60) return { state: "in", name: "STATUS_HALFTIME", min: 45 };
  if (e < 105) return { state: "in", name: "STATUS_SECOND_HALF", min: Math.min(90, Math.floor(e - 15) + 1) };
  return { state: "post", name: "STATUS_FULL_TIME", min: 90 };
}
function planEvents(id, home, away) {
  const r = rng("ev" + id); const evs = [];
  for (const [side, t] of [["h", home], ["a", away]]) {
    const n = Math.floor(r() * 3.2);
    const sq = xiOf(t.id).filter(p => p.position.abbreviation !== "G");
    for (let i = 0; i < n; i++) {
      const sc = sq[Math.floor(r() ** 1.6 * sq.length)] , as = pick(r, sq.filter(p => p !== sc));
      evs.push({ kind: r() < 0.12 ? "pen" : "goal", min: 3 + Math.floor(r() * 86), side, t, p: sc, a: as });
    }
    if (r() < 0.8) evs.push({ kind: "yellow", min: 10 + Math.floor(r() * 78), side, t, p: pick(r, sq) });
    if (r() < 0.12) evs.push({ kind: "red", min: 30 + Math.floor(r() * 58), side, t, p: pick(r, sq) });
  }
  return evs.sort((x, y) => x.min - y.min);
}
const registry = new Map();
function makeMatch(id, l, home, away, kick, msPerMin) {
  const ph = phase(kick, msPerMin);
  const plan = planEvents(id, home, away);
  const done = plan.filter(e => ph.state === "post" || (ph.state === "in" && e.min <= ph.min));
  const hs = done.filter(e => (e.kind === "goal" || e.kind === "pen") && e.side === "h").length;
  const as = done.filter(e => (e.kind === "goal" || e.kind === "pen") && e.side === "a").length;
  const detail = ph.state === "in" ? (ph.name === "STATUS_HALFTIME" ? "Mi-temps" : `${ph.min}'`) : ph.state === "post" ? "FT" : "";
  const m = { id: String(id), l, home, away, kick, msPerMin, ph, done, hs, as };
  registry.set(String(id), m);
  return {
    id: String(id), date: new Date(kick).toISOString(), name: `${home.n} - ${away.n}`,
    status: { type: { state: ph.state, name: ph.name, shortDetail: detail, completed: ph.state === "post" }, displayClock: `${ph.min}'` },
    competitions: [{
      date: new Date(kick).toISOString(), league: { slug: l },
      competitors: [
        { homeAway: "home", score: String(hs), team: teamObj(home), winner: ph.state === "post" && hs > as },
        { homeAway: "away", score: String(as), team: teamObj(away), winner: ph.state === "post" && as > hs }],
      details: done.map(e => ({
        type: { id: e.kind, text: e.kind === "pen" ? "Penalty - Scored" : e.kind === "goal" ? "Goal" : e.kind === "red" ? "Red Card" : "Yellow Card" },
        clock: { value: e.min * 60, displayValue: `${e.min}'` }, team: { id: String(e.t.id) },
        scoringPlay: e.kind === "goal" || e.kind === "pen", penaltyKick: e.kind === "pen", redCard: e.kind === "red", yellowCard: e.kind === "yellow",
        athletesInvolved: [{ id: e.p.id, displayName: e.p.displayName, shortName: e.p.displayName }],
      })),
      venue: { fullName: `Stade de ${home.city}`, address: { city: home.city } },
    }],
  };
}
const dayNum = d => Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 864e5);
function pairings(l, dn) {
  const ts = LEAGUES[l].map(t => TEAM.get(t[0]));
  const r = rng(l + dn); const arr = [...ts];
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  const out = []; for (let i = 0; i + 1 < arr.length; i += 2) out.push([arr[i], arr[i + 1]]);
  return out;
}
const LKEYS = Object.keys(LEAGUES);
function scoreboard(l, dates) {
  if (!LEAGUES[l]) return { events: [], leagues: [{ name: l }] };
  const now = new Date();
  const day = dates ? new Date(+dates.slice(0, 4), +dates.slice(4, 6) - 1, +dates.slice(6, 8), 12) : now;
  const dn = dayNum(day), li = LKEYS.indexOf(l) + 1;
  const pairs = pairings(l, dn);
  const at = h => { const d = new Date(day); d.setHours(Math.floor(h), (h % 1) * 60, 0, 0); return d.getTime(); };
  const slots = [13, 17, 21];
  const events = pairs.map(([h, a], i) => {
    const today = dn === dayNum(now);
    if (i === 0 && today) {
      const kick = Math.floor((Date.now() - li * 4 * 60000) / CYCLE) * CYCLE + li * 4 * 60000; // décalé par compétition
      return makeMatch(`${li}${dn}${Math.floor(kick / CYCLE) % 1000}9`, l, h, a, kick, DEMO_SPEED);
    }
    return makeMatch(`${li}${dn}${i}`, l, h, a, at(slots[(i + (today ? 0 : 1)) % slots.length] + (i > 2 ? 1.5 : 0)), 60000);
  });
  return { events, week: { number: 10 + (dn % 20) }, leagues: [{ name: LEAGUE_NAMES[l] }] };
}
function findMatch(id, l) {
  if (!registry.has(String(id)) && LEAGUES[l]) scoreboard(l);
  if (!registry.has(String(id))) for (const k of LKEYS) { scoreboard(k); if (registry.has(String(id))) break; }
  const m = registry.get(String(id));
  return m ? (scoreboard(m.l, ymdOf(new Date(m.kick))), registry.get(String(id))) : null;
}
const ymdOf = d => d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");

function summary(l, id) {
  const m0 = findMatch(id, l);
  if (!m0) return { code: 404 };
  const m = m0, ev = makeMatch(m.id, m.l, m.home, m.away, m.kick, m.msPerMin);
  const r = rng("sum" + m.id), f = m.ph.state === "pre" ? 0 : Math.min(1, m.ph.min / 90);
  const keyEvents = [];
  if (m.ph.state !== "pre") keyEvents.push({ id: "k0", type: { type: "kickoff", text: "Kickoff" }, clock: { displayValue: "1'" } });
  for (const e of m.done) keyEvents.push({
    id: `e${e.min}${e.p.id}`, type: { type: e.kind === "pen" ? "penalty---scored" : e.kind === "goal" ? "goal" : e.kind === "red" ? "red-card" : "yellow-card", text: e.kind === "pen" ? "Penalty - Scored" : e.kind === "goal" ? "Goal" : e.kind === "red" ? "Red Card" : "Yellow Card" },
    scoringPlay: e.kind === "goal" || e.kind === "pen", clock: { displayValue: `${e.min}'` }, team: { id: String(e.t.id) },
    participants: [{ athlete: { id: e.p.id, displayName: e.p.displayName } }, ...((e.kind === "goal") ? [{ athlete: { id: e.a.id, displayName: e.a.displayName } }] : [])],
  });
  const subsAt = [62, 71, 80];
  const rosters = [m.home, m.away].map(t => {
    const sq = squad(t.id);
    const xi = xiOf(t.id);
    const bench = sq.filter(p => !xi.includes(p)).slice(0, 7);
    const DET = ["G", "RB", "CD-R", "CD-L", "LB", "CM-R", "DM", "CM-L", "RF", "CF", "LF"];
    return { team: teamObj(t), homeAway: t === m.home ? "home" : "away", formation: "4-3-3", roster: [...xi.map((p, k) => ({ starter: true, jersey: p.jersey, athlete: p, position: { ...p.position, abbreviation: DET[k] || p.position.abbreviation }, formationPlace: k + 1 })), ...bench.map(p => ({ starter: false, jersey: p.jersey, athlete: p, position: p.position }))] };
  });
  if (m.ph.state !== "pre") for (const [i, minute] of subsAt.entries()) {
    if (m.ph.state === "in" && m.ph.min < minute) continue;
    const side = i % 2 ? 1 : 0, ro = rosters[side];
    const off = ro.roster.filter(p => p.starter && p.position.abbreviation !== "G")[8 - i], on = ro.roster.filter(p => !p.starter)[i + 1];
    if (!off || !on) continue;
    off.subbedOut = true; on.subbedIn = true;
    keyEvents.push({ id: `s${minute}`, type: { type: "substitution", text: "Substitution" }, clock: { displayValue: `${minute}'` }, team: { id: ro.team.id }, participants: [{ athlete: on.athlete }, { athlete: off.athlete }] });
  }
  if (m.ph.state === "post" || m.ph.name === "STATUS_SECOND_HALF" || m.ph.name === "STATUS_HALFTIME") keyEvents.push({ id: "ht", type: { type: "halftime", text: "Halftime" }, clock: { displayValue: "45'" } });
  if (m.ph.state === "post") keyEvents.push({ id: "ft", type: { type: "end-regular-time", text: "Full Time" }, clock: { displayValue: "90'" } });
  const order = k => parseInt(k.clock.displayValue) + (k.type.type === "halftime" ? 0.5 : 0);
  keyEvents.sort((a, b) => order(a) - order(b));
  const poss = 40 + Math.floor(r() * 21);
  const st = (base) => String(Math.round(base * f));
  const stats = (mine, sh) => [
    { name: "possessionPct", displayValue: String(mine ? poss : 100 - poss) },
    { name: "totalShots", displayValue: st(6 + r() * 12 + sh * 2) }, { name: "shotsOnTarget", displayValue: st(2 + r() * 5 + sh) },
    { name: "wonCorners", displayValue: st(1 + r() * 8) }, { name: "foulsCommitted", displayValue: st(6 + r() * 9) },
    { name: "offsides", displayValue: st(r() * 4) }, { name: "saves", displayValue: st(1 + r() * 5) }];
  return {
    header: { league: { name: LEAGUE_NAMES[m.l] }, competitions: [{ ...ev.competitions[0], status: ev.status, date: ev.date }], links: [] },
    keyEvents, boxscore: { teams: [{ team: teamObj(m.home), statistics: stats(true, m.hs) }, { team: teamObj(m.away), statistics: stats(false, m.as) }] },
    rosters: m.ph.state === "pre" && m.kick - Date.now() > 3600e3 ? [] : rosters,
    gameInfo: { venue: { fullName: `Stade de ${m.home.city}`, address: { city: m.home.city } }, attendance: m.ph.state === "pre" ? 0 : 20000 + Math.floor(r() * 50000), officials: [{ displayName: `${pick(r, FIRST)} ${pick(r, LAST)}` }] },
  };
}

/* ---------- Classements, clubs, joueurs ---------- */
function table(l) {
  const ts = (LEAGUES[l] || []).map(t => TEAM.get(t[0]));
  const rows = ts.map(t => { const r = rng("tab" + l + t.id); const w = 2 + Math.floor(r() * 9), d = Math.floor(r() * 4), lo = Math.floor(r() * 6); const gf = w * 2 + d + Math.floor(r() * 5), ga = lo * 2 + d + Math.floor(r() * 4); return { t, w, d, lo, gf, ga, p: w * 3 + d }; })
    .sort((a, b) => b.p - a.p || (b.gf - b.ga) - (a.gf - a.ga));
  return rows;
}
function standings(l) {
  const rows = table(l);
  if (!rows.length) return { children: [] };
  const zones = l === "uefa.champions" ? [] : [[0, 3, "#2f7fe0", "Ligue des champions"], [3, 4, "#f08c00", "Ligue Europa"], [rows.length - 2, rows.length, "#d6334d", "Relégation"]];
  return { children: [{ name: LEAGUE_NAMES[l], standings: { entries: rows.map((x, i) => {
    const z = zones.find(([a, b]) => i >= a && i < b);
    return { team: teamObj(x.t), note: z ? { color: z[2], description: z[3] } : undefined, stats: [
      { name: "rank", displayValue: String(i + 1) }, { name: "gamesPlayed", displayValue: String(x.w + x.d + x.lo) }, { name: "wins", displayValue: String(x.w) },
      { name: "ties", displayValue: String(x.d) }, { name: "losses", displayValue: String(x.lo) }, { name: "pointsFor", displayValue: String(x.gf) },
      { name: "pointsAgainst", displayValue: String(x.ga) }, { name: "pointDifferential", displayValue: (x.gf - x.ga > 0 ? "+" : "") + (x.gf - x.ga) }, { name: "points", displayValue: String(x.p) }] };
  }) } }] };
}
function seasons(p) {
  const r = rng("career" + p.id); const ab = p.position.abbreviation;
  const g = ab === "F" ? 14 : ab === "M" ? 6 : ab === "D" ? 2 : 0, a = ab === "F" ? 6 : ab === "M" ? 7 : ab === "D" ? 2 : 0;
  const n = Math.min(6, Math.max(2, p.age - 18));
  return Array.from({ length: n }, (_, i) => { const y = 2026 - n + i; const apps = 12 + Math.floor(r() * 24) - (i === n - 1 ? 18 : 0); return { y, apps: Math.max(3, apps), goals: Math.floor(g * (0.4 + r()) * (i === n - 1 ? 0.4 : 1)), assists: Math.floor(a * (0.3 + r()) * (i === n - 1 ? 0.4 : 1)), yc: Math.floor(r() * 7) }; });
}
function athlete(id) {
  const p = playerById(id); if (!p) return { code: 404 };
  const t = TEAM.get(p.teamId); const r = rng("bio" + id);
  const born = new Date(2026 - p.age, Math.floor(r() * 12), 1 + Math.floor(r() * 27));
  return { athlete: { ...p, firstName: p.displayName.split(" ")[0], lastName: p.displayName.split(" ").slice(1).join(" "), dateOfBirth: born.toISOString(),
    displayBirthPlace: `${pick(r, ["Paris", "Lyon", "Dakar", "Lisbonne", "Madrid", "Casablanca", "São Paulo", "Abidjan", "Milan", "Munich"])}`, displayWeight: `${65 + Math.floor(r() * 20)} kg`,
    foot: pick(r, ["Droit", "Droit", "Gauche"]), team: teamObj(t) } };
}
function athleteStats(id) {
  const p = playerById(id); if (!p) return { code: 404 };
  const ss = seasons(p);
  return { categories: [{ displayName: "Championnat", labels: ["MJ", "B", "PD", "CJ"], names: ["appearances", "totalGoals", "goalAssists", "yellowCards"],
    statistics: ss.map(s => ({ season: { displayName: `${s.y}-${String(s.y + 1).slice(2)}` }, teamId: String(p.teamId), stats: [s.apps, s.goals, s.assists, s.yc].map(String) })),
    totals: [ss.reduce((a, s) => a + s.apps, 0), ss.reduce((a, s) => a + s.goals, 0), ss.reduce((a, s) => a + s.assists, 0), ss.reduce((a, s) => a + s.yc, 0)].map(String) }],
    teams: { [p.teamId]: { displayName: TEAM.get(p.teamId).n } } };
}
function leaders(l) {
  const all = (LEAGUES[l] || []).flatMap(t => squad(t[0]).map(p => ({ p, s: seasons(p).at(-1) })));
  const top = key => all.filter(x => x.s[key] > 0).sort((a, b) => b.s[key] - a.s[key]).slice(0, 10)
    .map(x => ({ displayValue: String(x.s[key]), value: x.s[key], athlete: { id: x.p.id, displayName: x.p.displayName, team: teamObj(TEAM.get(x.p.teamId)) } }));
  return { stats: [{ name: "goals", displayName: "Buteurs", leaders: top("goals") }, { name: "assists", displayName: "Passeurs", leaders: top("assists") }] };
}
function team(id) {
  const t = TEAM.get(Number(id)); if (!t) return { code: 404 };
  const rows = table(t.l); const i = rows.findIndex(x => x.t.id === t.id);
  return { team: { ...teamObj(t), location: t.city, standingSummary: i >= 0 ? `${i + 1}${i ? "e" : "er"} en ${LEAGUE_NAMES[t.l]}` : "", franchise: { venue: { fullName: `Stade de ${t.city}`, address: { city: t.city } } },
    record: { items: i >= 0 ? [{ description: "Bilan", summary: `${rows[i].w}V ${rows[i].d}N ${rows[i].lo}D` }] : [] } } };
}
function roster(id) {
  const t = TEAM.get(Number(id)); if (!t) return { code: 404 };
  const r = rng("coach" + id);
  return { athletes: squad(t.id), coach: [{ firstName: pick(r, FIRST), lastName: pick(r, LAST) }] };
}
function schedule(id) {
  const t = TEAM.get(Number(id)); if (!t) return { code: 404 };
  const events = [];
  const now = new Date();
  for (let k = -12; k <= 8 && events.length < 14; k++) {
    const d = new Date(now); d.setDate(now.getDate() + k);
    for (const e of scoreboard(t.l, ymdOf(d)).events) if (e.competitions[0].competitors.some(c => c.team.id === String(t.id))) events.push(e);
  }
  return { events };
}
function search(q) {
  const n = s => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const nq = n(q);
  const teams = [...TEAM.values()].map(t => ({ uid: `s:600~t:${t.id}`, displayName: t.n, subtitle: LEAGUE_NAMES[t.l], defaultLeagueSlug: t.l }));
  const players = [...TEAM.values()].flatMap(t => squad(t.id).map(p => ({ p, t })))
    .map(({ p, t }) => ({ uid: `s:600~a:${p.id}`, displayName: p.displayName, subtitle: t.n, defaultLeagueSlug: t.l }));
  return { results: [{ type: "player", contents: players }, { type: "team", contents: teams }] };
}
function news(l) {
  const ts = (LEAGUES[l] || []).map(t => TEAM.get(t[0]));
  if (!ts.length) return { articles: [] };
  return { articles: ts.slice(0, 6).map((t, i) => ({ headline: `[Démo] ${t.n} : article d'exemple n°${i + 1}`, description: "Texte fictif pour tester l'affichage des actualités. La version en ligne affiche les vrais articles ESPN.", published: new Date(Date.now() - i * 5 * 3600e3).toISOString(), links: { web: { href: "#" } } })) };
}

/** Point d'entrée : chemin d'API ESPN → réponse fictive (ou { code: 404 }). */
export function demoRespond(path) {
  const [p, qs = ""] = path.split("?");
  const q = new URLSearchParams(qs);
  let m;
  if ((m = p.match(/\/sports\/[\w-]+\/([\w.\-]+)\/scoreboard$/))) return scoreboard(m[1], q.get("dates"));
  if ((m = p.match(/\/apis\/v2\/sports\/[\w-]+\/([\w.\-]+)\/standings$/))) return standings(m[1]);
  if ((m = p.match(/\/sports\/[\w-]+\/([\w.\-]+)\/summary$/))) return summary(m[1], q.get("event"));
  if ((m = p.match(/\/teams\/(\d+)\/roster$/))) return roster(m[1]);
  if ((m = p.match(/\/teams\/(\d+)\/schedule$/))) return schedule(m[1]);
  if ((m = p.match(/\/teams\/(\d+)$/))) return team(m[1]);
  if ((m = p.match(/\/athletes\/(\d+)\/stats$/))) return athleteStats(m[1]);
  if ((m = p.match(/\/athletes\/(\d+)$/))) return athlete(m[1]);
  if ((m = p.match(/\/sports\/[\w-]+\/([\w.\-]+)\/statistics$/))) return leaders(m[1]);
  if ((m = p.match(/\/sports\/[\w-]+\/([\w.\-]+)\/news$/))) return news(m[1]);
  if (/\/search/.test(p)) return search(q.get("query") || "");
  return { code: 404 };
}
