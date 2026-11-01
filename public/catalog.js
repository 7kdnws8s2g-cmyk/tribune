// Catalogue des compétitions (codes ESPN). Partagé par l'application et le serveur.
// s = sport ESPN, l = code de la ligue, n = nom affiché, c = pays ou zone, f = drapeau, g = région, w = féminin
const R = [];
const add = (g, list) => list.forEach(([s, l, n, c, f, w]) => R.push({ s, l, n, c, f, g, w: !!w }));

add("Coupes internationales", [
  ["soccer","fifa.world","Coupe du monde","FIFA","🌍"],
  ["soccer","uefa.champions","Ligue des champions","UEFA","⭐"],
  ["soccer","uefa.europa","Ligue Europa","UEFA","🟠"],
  ["soccer","uefa.europa.conf","Ligue Conférence","UEFA","🟢"],
  ["soccer","uefa.nations","Ligue des nations","UEFA","🏳️"],
  ["soccer","uefa.euro","Euro","UEFA","🇪🇺"],
  ["soccer","fifa.worldq.uefa","Qualifs Mondial · Europe","UEFA","🎟️"],
  ["soccer","fifa.worldq.conmebol","Qualifs Mondial · Amérique du Sud","CONMEBOL","🎟️"],
  ["soccer","fifa.worldq.caf","Qualifs Mondial · Afrique","CAF","🎟️"],
  ["soccer","fifa.cwc","Coupe du monde des clubs","FIFA","🏆"],
  ["soccer","conmebol.libertadores","Copa Libertadores","CONMEBOL","🏆"],
  ["soccer","conmebol.sudamericana","Copa Sudamericana","CONMEBOL","🥈"],
  ["soccer","conmebol.america","Copa América","CONMEBOL","🌎"],
  ["soccer","concacaf.champions","Ligue des champions CONCACAF","CONCACAF","🌎"],
  ["soccer","concacaf.gold","Gold Cup","CONCACAF","🌎"],
  ["soccer","caf.nations","Coupe d'Afrique des nations","CAF","🌍"],
  ["soccer","caf.champions","Ligue des champions CAF","CAF","🌍"],
  ["soccer","afc.champions","Ligue des champions AFC","AFC","🌏"],
  ["soccer","afc.asian.cup","Coupe d'Asie","AFC","🌏"],
  ["soccer","fifa.friendly","Matchs amicaux internationaux","FIFA","🤝"],
]);
add("Football féminin", [
  ["soccer","fifa.wwc","Coupe du monde féminine","FIFA","🌍",1],
  ["soccer","uefa.wchampions","Ligue des champions féminine","UEFA","⭐",1],
  ["soccer","uefa.weuro","Euro féminin","UEFA","🇪🇺",1],
  ["soccer","fra.w.1","Arkema Première Ligue","France","🇫🇷",1],
  ["soccer","eng.w.1","Women's Super League","Angleterre","🏴󠁧󠁢󠁥󠁮󠁧󠁿",1],
  ["soccer","esp.w.1","Liga F","Espagne","🇪🇸",1],
  ["soccer","usa.nwsl","NWSL","États-Unis","🇺🇸",1],
]);
add("France", [
  ["soccer","fra.1","Ligue 1","France","🇫🇷"],
  ["soccer","fra.2","Ligue 2","France","🇫🇷"],
  ["soccer","fra.3","National","France","🇫🇷"],
  ["soccer","fra.coupe_de_france","Coupe de France","France","🇫🇷"],
]);
add("Europe", [
  ["soccer","eng.1","Premier League","Angleterre","🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
  ["soccer","eng.2","Championship","Angleterre","🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
  ["soccer","eng.3","League One","Angleterre","🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
  ["soccer","eng.4","League Two","Angleterre","🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
  ["soccer","eng.fa","FA Cup","Angleterre","🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
  ["soccer","eng.league_cup","Carabao Cup","Angleterre","🏴󠁧󠁢󠁥󠁮󠁧󠁿"],
  ["soccer","esp.1","LaLiga","Espagne","🇪🇸"],
  ["soccer","esp.2","LaLiga 2","Espagne","🇪🇸"],
  ["soccer","esp.copa_del_rey","Copa del Rey","Espagne","🇪🇸"],
  ["soccer","ita.1","Serie A","Italie","🇮🇹"],
  ["soccer","ita.2","Serie B","Italie","🇮🇹"],
  ["soccer","ita.coppa_italia","Coppa Italia","Italie","🇮🇹"],
  ["soccer","ger.1","Bundesliga","Allemagne","🇩🇪"],
  ["soccer","ger.2","2. Bundesliga","Allemagne","🇩🇪"],
  ["soccer","ger.dfb_pokal","DFB-Pokal","Allemagne","🇩🇪"],
  ["soccer","por.1","Liga Portugal","Portugal","🇵🇹"],
  ["soccer","ned.1","Eredivisie","Pays-Bas","🇳🇱"],
  ["soccer","bel.1","Pro League","Belgique","🇧🇪"],
  ["soccer","sco.1","Premiership","Écosse","🏴󠁧󠁢󠁳󠁣󠁴󠁿"],
  ["soccer","tur.1","Süper Lig","Turquie","🇹🇷"],
  ["soccer","sui.1","Super League","Suisse","🇨🇭"],
  ["soccer","aut.1","Bundesliga","Autriche","🇦🇹"],
  ["soccer","gre.1","Super League","Grèce","🇬🇷"],
  ["soccer","den.1","Superliga","Danemark","🇩🇰"],
  ["soccer","nor.1","Eliteserien","Norvège","🇳🇴"],
  ["soccer","swe.1","Allsvenskan","Suède","🇸🇪"],
  ["soccer","rus.1","Premier League","Russie","🇷🇺"],
  ["soccer","irl.1","Premier Division","Irlande","🇮🇪"],
  ["soccer","cyp.1","First Division","Chypre","🇨🇾"],
]);
add("Amériques", [
  ["soccer","usa.1","MLS","États-Unis","🇺🇸"],
  ["soccer","mex.1","Liga MX","Mexique","🇲🇽"],
  ["soccer","bra.1","Brasileirão","Brésil","🇧🇷"],
  ["soccer","bra.2","Série B","Brésil","🇧🇷"],
  ["soccer","arg.1","Liga Profesional","Argentine","🇦🇷"],
  ["soccer","col.1","Primera A","Colombie","🇨🇴"],
  ["soccer","chi.1","Primera División","Chili","🇨🇱"],
  ["soccer","uru.1","Primera División","Uruguay","🇺🇾"],
  ["soccer","per.1","Liga 1","Pérou","🇵🇪"],
  ["soccer","ecu.1","LigaPro","Équateur","🇪🇨"],
  ["soccer","par.1","Primera División","Paraguay","🇵🇾"],
  ["soccer","crc.1","Primera División","Costa Rica","🇨🇷"],
]);
add("Asie, Afrique & Océanie", [
  ["soccer","ksa.1","Saudi Pro League","Arabie saoudite","🇸🇦"],
  ["soccer","jpn.1","J1 League","Japon","🇯🇵"],
  ["soccer","kor.1","K League 1","Corée du Sud","🇰🇷"],
  ["soccer","chn.1","Super League","Chine","🇨🇳"],
  ["soccer","aus.1","A-League","Australie","🇦🇺"],
  ["soccer","ind.1","Indian Super League","Inde","🇮🇳"],
  ["soccer","rsa.1","Premiership","Afrique du Sud","🇿🇦"],
  ["soccer","uae.1","Pro League","Émirats","🇦🇪"],
  ["soccer","egy.1","Premier League","Égypte","🇪🇬"],
  ["soccer","mar.1","Botola Pro","Maroc","🇲🇦"],
  ["soccer","tun.1","Ligue 1","Tunisie","🇹🇳"],
  ["soccer","alg.1","Ligue 1","Algérie","🇩🇿"],
  ["soccer","nga.1","NPFL","Nigeria","🇳🇬"],
]);
add("Autres sports", [
  ["basketball","nba","NBA","Basket · États-Unis","🏀"],
  ["basketball","wnba","WNBA","Basket · États-Unis","🏀",1],
  ["football","nfl","NFL","Football US","🏈"],
  ["hockey","nhl","NHL","Hockey","🏒"],
  ["baseball","mlb","MLB","Baseball","⚾"],
]);

export const CATALOG = R;
export const keyOf = c => `${c.s}/${c.l}`;
export const findComp = (s, l) => R.find(c => c.s === s && c.l === l);

// Compétitions interrogées par l'onglet Live (les plus suivies, pour limiter le nombre d'appels)
export const LIVE_LEAGUES = [
  "fra.1","fra.2","eng.1","eng.2","esp.1","ita.1","ger.1","por.1","ned.1","bel.1","tur.1","sco.1",
  "uefa.champions","uefa.europa","uefa.europa.conf","uefa.nations","fifa.world","fifa.worldq.uefa","fifa.friendly",
  "usa.1","mex.1","bra.1","arg.1","ksa.1","jpn.1","conmebol.libertadores","caf.nations","fra.coupe_de_france",
  "eng.fa","eng.league_cup","esp.copa_del_rey","ita.coppa_italia","ger.dfb_pokal","uefa.wchampions","fra.w.1","eng.w.1",
].map(l => R.find(c => c.l === l)).filter(Boolean);
