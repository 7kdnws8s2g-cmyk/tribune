import test from "node:test";
import assert from "node:assert/strict";
import { snapshot, diffEvents, isRelevant, DEFAULT_PREFS } from "../public/detect.js";

const team = (id, n) => ({ id: String(id), displayName: n, shortDisplayName: n });
const ev = (o = {}) => ({
  id: "1", date: "2026-11-01T20:00Z",
  status: { type: { state: o.state || "in", name: o.name || "STATUS_FIRST_HALF" } },
  competitions: [{ competitors: [
    { homeAway: "home", score: String(o.hs ?? 0), team: team(10, "PSG") },
    { homeAway: "away", score: String(o.as ?? 0), team: team(20, "OM") }],
    details: o.details || [] }],
});
const L = { s: "soccer", l: "fra.1", n: "Ligue 1" };
const goal = { scoringPlay: true, type: { id: "70", text: "Goal" }, clock: { value: 1380, displayValue: "23'" }, team: { id: "10" }, athletesInvolved: [{ id: "99", displayName: "Ousmane Dembélé", shortName: "O. Dembélé" }] };

test("premier passage : aucune notification", () => assert.deepEqual(diffEvents(undefined, ev(), L), []));

test("coup d'envoi puis but avec buteur", () => {
  const s0 = snapshot(ev({ state: "pre", name: "STATUS_SCHEDULED" }));
  assert.equal(diffEvents(s0, ev(), L)[0].kind, "start");
  const s1 = snapshot(ev());
  const out = diffEvents(s1, ev({ hs: 1, details: [goal] }), L);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, "goal");
  assert.match(out[0].body, /O\. Dembélé 23' · PSG 1-0 OM/);
  assert.deepEqual(out[0].playerIds, ["99"]);
});

test("buteur connu au passage suivant : même étiquette, réservé aux suiveurs du joueur", () => {
  const s1 = snapshot(ev({ hs: 1 }));
  const out = diffEvents(s1, ev({ hs: 1, details: [goal] }), L);
  assert.equal(out[0].scorerOnly, true);
  assert.equal(out[0].tag, "goal-1-1-0");
  assert.equal(isRelevant(out[0], { teams: [{ id: "10" }] }, DEFAULT_PREFS), false);
  assert.equal(isRelevant(out[0], { players: [{ id: "99" }] }, DEFAULT_PREFS), true);
});

test("but refusé, carton rouge, mi-temps et fin", () => {
  const red = { type: { id: "93", text: "Red Card" }, redCard: true, clock: { displayValue: "40'" }, team: { id: "20" }, athletesInvolved: [{ id: "5", displayName: "X" }] };
  const kinds = diffEvents(snapshot(ev({ hs: 1 })), ev({ hs: 0, details: [red], name: "STATUS_HALFTIME" }), L).map(e => e.kind);
  assert.deepEqual(kinds.sort(), ["ht", "red", "var"]);
  const ft = diffEvents(snapshot(ev({ name: "STATUS_SECOND_HALF" })), ev({ state: "post", name: "STATUS_FULL_TIME" }), L);
  assert.equal(ft[0].kind, "ft");
});

test("préférences : le carton jaune est coupé par défaut", () => {
  const e = { kind: "yellow", teamIds: ["10"], playerIds: [] };
  assert.equal(isRelevant(e, { teams: [{ id: "10" }] }, DEFAULT_PREFS), false);
  assert.equal(isRelevant(e, { teams: [{ id: "10" }] }, { ...DEFAULT_PREFS, yellow: true }), true);
});
