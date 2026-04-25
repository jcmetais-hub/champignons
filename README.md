# Coins Champignons

Application web installable pour enregistrer des POI de cueillette avec :

- coordonnées GPS ;
- commune récupérée automatiquement lors de la localisation ;
- photo ;
- date ;
- commentaire ;
- mémo vocal ;
- catégorie de champignon : cèpe, girolle, morille ou autre ;
- sauvegarde locale dans le navigateur ;
- export/import JSON ;
- partage d'un POI par la feuille de partage iOS, avec Mail possible ;
- création de compte et connexion via Supabase ;
- bouton d'itinéraire vers Google Maps.

## Lancer en local

Depuis ce dossier :

```powershell
node server.js
```

Puis ouvrir :

```text
http://127.0.0.1:4173
```

## Utilisation sur iPhone

iOS autorise le GPS, la caméra, le micro et l'installation sur l'écran d'accueil uniquement dans un contexte sécurisé. Pour l'utiliser dehors sur iPhone, il faut donc publier ces fichiers sur une adresse HTTPS, par exemple GitHub Pages, Netlify, Vercel ou un petit serveur personnel avec certificat.

Une fois l'adresse ouverte dans Safari :

1. Appuyer sur le bouton de partage.
2. Choisir "Sur l'écran d'accueil".
3. Ouvrir l'app depuis l'icône créée.

Les données restent stockées localement dans Safari sur l'iPhone. Utiliser le bouton d'export pour faire une sauvegarde JSON.

## Envoyer un POI par mail

Dans "Mes coins", utiliser le bouton "Partager" du POI. Sur iPhone, la feuille de partage permet de choisir Mail et d'envoyer un fichier JSON du point.

Le destinataire peut ensuite utiliser le bouton d'import dans son application pour récupérer le POI, avec la catégorie, la photo et le mémo vocal si présents.

## Commune automatique

Quand la position GPS est capturée, l'application tente de retrouver la commune à partir des coordonnées. Cette recherche nécessite une connexion réseau. Si la commune n'est pas trouvée, le champ reste modifiable manuellement.

## Activer les comptes

Créer un projet Supabase, puis ouvrir `supabase-config.js` et renseigner :

```js
export const SUPABASE_URL = "https://votre-projet.supabase.co";
export const SUPABASE_ANON_KEY = "votre-cle-publique-anon";
```

Ensuite, héberger l'application en HTTPS. L'onglet "Compte" permettra de créer un compte, se connecter et se déconnecter.

## Créer la base Supabase

Dans Supabase :

1. Ouvrir le projet.
2. Aller dans "SQL Editor".
3. Créer une nouvelle requête.
4. Coller le contenu de `supabase-schema.sql`.
5. Exécuter la requête.

Le script crée :

- la table `pois` ;
- la table `poi_shares` pour le partage entre comptes ;
- les règles de sécurité RLS ;
- les buckets privés `poi-photos` et `poi-audio`.

L'application sait maintenant utiliser ces tables quand `supabase-config.js` est renseigné :

- création de compte et connexion ;
- synchronisation manuelle depuis l'onglet "Compte" ;
- envoi automatique des nouveaux POI connectés ;
- upload des photos dans `poi-photos` ;
- upload des mémos vocaux dans `poi-audio` ;
- récupération des POI cloud au démarrage et après connexion.

## Fichiers

- `index.html` : structure de l'application.
- `styles.css` : interface responsive mobile.
- `app.js` : GPS, photo, audio, catégories, compte, sauvegarde IndexedDB, partage, export/import, liens Google Maps.
- `supabase-config.js` : configuration Supabase.
- `supabase-schema.sql` : création des tables, règles de sécurité et espaces de stockage Supabase.
- `manifest.webmanifest` et `sw.js` : installation PWA et cache hors ligne.
- `server.js` : mini serveur local de test.
