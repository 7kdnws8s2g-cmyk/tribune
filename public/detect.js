// Détection des événements de match à partir de deux états successifs d'un tableau de scores ESPN.
// Module partagé : importé par l'application (notifications in-app) et par le serveur (push).

export const NOTIF_TYPES = [
  { key: "start",         label: "Début du match",              available: true },
  { key: "goal",          label: "But marqué (buteur, passeur, score)", available: true },
  { key: "penalty",       label: "Penalty marqué",              available: true },
  { key: "penaltyMissed", label: "Penalty raté ou arrêté",      available: true },
  { key: "red",           label: "Carton rouge",                available: true },
  { key: "yellow",        label: "Carton jaune",                available: true },
  { key: "var",           label: "VAR et but refusé",           available: true },
  { key: "ht",            label: "Mi-temps",                    available: true },
  { key: "et",            label: "Prolongations",               available: true },
  { key: "pens",          label: "Séance de tirs au but",       available: true },
  { key: "ft",            label: "Fin du match",                available: true },
  { key: "lineup",        label: "Composition officielle",      available: true, serverOnly: true },
  { key: "sub",           label: "Remplacement d'un joueur suivi", available: true, serverOnly: true },
  { key: "injury",        label: "Blessure",                    available: false },
  { key: "transfer",      label: "Transfert officiel",          available: false },
  { key: "news",          label: "Records et actualités importantes", available: false },
];

export const DEFAULT_PREFS = Object.fromEntries(
  NOTIF_TYPES.map(t => [t.key, t.available && !["yellow", "sub"].includes(t.key)])
);

export const scoreVal = s => (s && typeof s === "object") ? (s.displayValue ?? s.value ?? "") : (s ?? "");

export function sides(ev) {
  const comp = ev?.competitions?.[0] || {};
  const cs = comp.competitors || [];
  const home = cs.find(c => c.homeAway === "home") || cs[0] || {};
  const away = cs.find(c => c.homeAway === "away") || cs[1] || {};
  return { comp, home, away };
}

const detailKey = d =>
  [d.type?.id || d.type?.text || "", d.clock?.value ?? d.clock?.displayValue ?? "", d.team?.id || "",
   (d.athletesInvolved || []).map(a => a.id).join(".")].join("|");

export function snapshot(ev) {
  const { comp, home, away } = sides(ev);
  const st = ev.status || comp.status || {};
  const t = st.type || {};
  return {
    id: String(ev.id),
    state: t.state || "pre",
    name: t.name || "",
    hs: Number(scoreVal(home.score)) || 0,
    as: Number(scoreVal(away.score)) || 0,
    hId: String(home.team?.id || ""),
    aId: String(away.team?.id || ""),
    details: (comp.details || []).map(detailKey),
  };
}

const teamName = c => c?.team?.shortDisplayName || c?.team?.displayName || "?";
const who = d => (d.athletesInvolved || []).map(a => a.shortName || a.displayName).filter(Boolean)[0] || "";

/**
 * Compare l'état précédent (snapshot) à l'événement ESPN actuel.
 * Retourne une liste d'événements { kind, matchId, teamIds, playerIds, title, body, tag }.
 * Si prev est absent (premier passage), ne retourne rien : on évite une avalanche au démarrage.
 */
export function diffEvents(prev, ev, league) {
  if (!prev) return [];
  const cur = snapshot(ev);
  const { comp, home, away } = sides(ev);
  const out = [];
  const lgName = league?.n ? ` · ${league.n}` : "";
  const score = `${teamName(home)} ${cur.hs}-${cur.as} ${teamName(away)}`;
  const base = { matchId: cur.id, teamIds: [cur.hId, cur.aId], playerIds: [], league: league?.l || "", sport: league?.s || "soccer" };
  const push = (kind, title, body, extra = {}) =>
    out.push({ ...base, kind, title, body, tag: `${kind}-${cur.id}`, ...extra });

  const prevKeys = new Set(prev.details);
  const fresh = (comp.details || []).filter(d => !prevKeys.has(detailKey(d)));

  if (prev.state === "pre" && cur.state === "in") push("start", "Coup d'envoi", `${teamName(home)} – ${teamName(away)}${lgName}`);

  // Buts : déclenchés par la hausse du score, enrichis par le détail s'il est déjà là
  const goalsHome = cur.hs - prev.hs, goalsAway = cur.as - prev.as;
  const scoringFresh = fresh.filter(d => d.scoringPlay);
  for (const [n, side] of [[goalsHome, home], [goalsAway, away]]) {
    if (n <= 0) continue;
    const d = scoringFresh.find(x => String(x.team?.id) === String(side.team?.id)) || scoringFresh[0];
    const scorer = d ? who(d) : "";
    const min = d?.clock?.displayValue ? ` ${d.clock.displayValue}` : "";
    const pen = d && (d.penaltyKick || /penalty/i.test(d.type?.text || ""));
    const og = d && (d.ownGoal || /own goal/i.test(d.type?.text || ""));
    const label = og ? " (csc)" : pen ? " (pen.)" : "";
    push(pen ? "penalty" : "goal",
      `⚽ BUT pour ${teamName(side)} !`,
      `${scorer ? scorer + label + min + " · " : ""}${score}${lgName}`,
      { playerIds: d ? (d.athletesInvolved || []).map(a => String(a.id)) : [], tag: `goal-${cur.id}-${cur.hs}-${cur.as}`, also: pen ? ["goal"] : [], clock: d?.clock?.displayValue || "" });
    if (d) prevKeys.add(detailKey(d));
  }
  // Buteur connu plus tard (détail arrivé après le score) : met à jour la même notification
  for (const d of scoringFresh) {
    if (prevKeys.has(detailKey(d)) || goalsHome > 0 || goalsAway > 0) continue;
    const side = String(d.team?.id) === cur.hId ? home : away;
    push("goal", `⚽ But de ${who(d) || teamName(side)}`, `${d.clock?.displayValue || ""} · ${score}${lgName}`,
      { playerIds: (d.athletesInvolved || []).map(a => String(a.id)), tag: `goal-${cur.id}-${cur.hs}-${cur.as}`, scorerOnly: true });
  }
  // But refusé : le score baisse
  if (cur.hs < prev.hs || cur.as < prev.as) push("var", "🖥️ But refusé (VAR)", `Score corrigé : ${score}${lgName}`);

  for (const d of fresh) {
    if (d.scoringPlay) continue;
    const t = d.type?.text || "";
    const side = String(d.team?.id) === cur.hId ? home : away;
    const ids = (d.athletesInvolved || []).map(a => String(a.id));
    const min = d.clock?.displayValue || "";
    if (/penalty/i.test(t) && /(miss|save)/i.test(t)) push("penaltyMissed", "❌ Penalty manqué", `${who(d) || teamName(side)} ${min} · ${score}`, { playerIds: ids, tag: `pm-${cur.id}-${min}` });
    else if (d.redCard || /red card/i.test(t)) push("red", "🟥 Carton rouge", `${who(d) || ""} (${teamName(side)}) ${min} · ${score}`, { playerIds: ids, tag: `red-${cur.id}-${min}` });
    else if (d.yellowCard || /yellow card/i.test(t)) push("yellow", "🟨 Carton jaune", `${who(d) || ""} (${teamName(side)}) ${min}`, { playerIds: ids, tag: `yc-${cur.id}-${min}-${ids[0] || ""}` });
  }

  const became = re => re.test(cur.name) && !re.test(prev.name);
  if (became(/HALFTIME/i)) push("ht", "⏸️ Mi-temps", `${score}${lgName}`);
  if (became(/EXTRA|OVERTIME/i)) push("et", "⏱️ Prolongations", `${score}${lgName}`);
  if (became(/SHOOTOUT|PENALT/i)) push("pens", "🎯 Tirs au but", `${score}${lgName}`);
  if (prev.state !== "post" && cur.state === "post" && !/POSTPONED|CANCEL/i.test(cur.name)) push("ft", "🏁 Fin du match", `${score}${lgName}`);
  return out;
}

/** Un événement concerne-t-il cet utilisateur ? favs = { comps:[ "soccer/fra.1" ], teams:[{id}], players:[{id}] } */
export function isRelevant(e, favs, prefs) {
  const kinds = [e.kind, ...(e.also || [])];
  if (!kinds.some(k => prefs?.[k])) return false;
  const players = (favs.players || []).map(p => String(p.id));
  const byPlayer = e.playerIds?.some(id => players.includes(id));
  if (e.scorerOnly) return byPlayer;
  if (byPlayer) return true;
  const teams = (favs.teams || []).map(t => String(t.id));
  if (e.teamIds?.some(id => teams.includes(id))) return true;
  if ((favs.comps || []).includes(`${e.sport}/${e.league}`)) return ["goal", "penalty", "red", "var", "ft", "start", "pens"].includes(e.kind);
  return false;
}
