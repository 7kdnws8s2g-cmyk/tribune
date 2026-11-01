# Tribune : le football mondial en direct

Application web installable sur iPhone (et Android) : scores en direct, classements, fiches joueurs, clubs, compétitions, favoris, recherche et **notifications push même application fermée**. Design Liquid Glass.

Aucune dépendance à installer : il suffit de Node.js 18 ou plus récent.

## Lancer sur ton ordinateur

```bash
npm start
```

Puis ouvre http://localhost:3000. Pour vérifier que tout marche : `npm test` (8 tests, dont un test de bout en bout des notifications).

## Mettre en ligne (nécessaire pour les notifications sur iPhone)

Les notifications push exigent une adresse en **https** et un serveur qui tourne en continu. Le plus simple : **Render**.

1. Mets ce dossier sur GitHub (nouveau dépôt, envoie tous les fichiers).
2. Génère tes clés de notification une fois pour toutes :
   ```bash
   node -e "import('./server/webpush.js').then(m => console.log(m.generateVAPIDKeys()))"
   ```
3. Sur render.com : **New → Blueprint**, choisis ton dépôt. Le fichier `render.yaml` configure tout.
4. Renseigne `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (étape 2) et ton adresse dans `VAPID_SUBJECT`.
5. Render te donne une adresse `https://tribune-xxxx.onrender.com`.

Important : une offre gratuite qui « s'endort » après inactivité arrête aussi la surveillance des matchs, donc les notifications. Prends une offre toujours active (le `render.yaml` demande l'offre *starter* avec un disque pour garder les abonnements). Tout hébergeur Node convient (Railway, Fly.io, un VPS).

## Installer sur iPhone

1. Ouvre l'adresse dans **Safari**.
2. Partager → **Sur l'écran d'accueil**.
3. Ouvre Tribune **depuis l'icône** (obligatoire pour les notifications, iOS 16.4 minimum).
4. Onglet **Profil → Activer les notifications**, puis « Envoyer un test ».

## Comment ça marche

```
public/            l'application (aucune étape de compilation)
  index.html       coquille, barre d'onglets
  styles.css       design Liquid Glass (thèmes clair/sombre, opacité renforcée)
  app.js           les 6 onglets, pages match / club / joueur / compétition
  detect.js        détection des événements (but, VAR, cartons, mi-temps…) partagée avec le serveur
  catalog.js       90 compétitions (hommes, femmes, coupes, sélections)
  sw.js            hors ligne + réception des notifications
server/
  index.js         serveur HTTP : relais ESPN avec cache, abonnements, surveillance des matchs (toutes les 5 s)
  webpush.js       notifications push standard (VAPID + chiffrement aes128gcm), sans bibliothèque
test/              tests automatiques
```

- **Données** : API publique d'ESPN, relayée et mise en cache par le serveur. Aucune clé requise. Sans serveur (fichier ouvert directement, ou hébergement statique), l'app interroge ESPN directement et les notifications ne marchent que pendant qu'elle est ouverte.
- **Notifications** : le serveur compare chaque tableau de scores au précédent, repère l'événement, trouve les appareils concernés par leurs favoris et préférences, puis envoie. Anti-spam : 5 alertes par minute maximum, regroupées au-delà.
- **Vie privée** : favoris et réglages restent sur l'appareil. Le serveur ne reçoit que l'abonnement push, les favoris et les préférences d'alerte, sans nom ni e-mail.

## Ce que la source gratuite ne fournit pas

Rien n'est inventé : ces informations ne s'affichent pas faute de source. Les fiches le signalent.

- Joueurs : buts de la tête, sur coup franc, pied gauche ou droit, doublés et triplés, palmarès, valeur marchande, historique complet de carrière.
- Clubs : palmarès, historique, transferts, blessés et suspendus.
- Notifications : blessures, transferts officiels, records (désactivées dans le menu).

Pour les obtenir, il faut un fournisseur payant (par exemple Sportmonks ou API-Football). Le module `server/index.js` est prévu pour ajouter une seconde source : un relais `/espn/...` existe déjà sur ce modèle.

L'API d'ESPN n'est pas officielle : elle peut changer sans préavis. Le classement des buteurs et la recherche en ligne dépendent de points d'accès moins stables ; l'app bascule alors sur ce qu'elle a déjà consulté.
