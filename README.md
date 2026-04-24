# Coins Champignons

Application web installable pour enregistrer des POI de cueillette avec :

- coordonnées GPS ;
- photo ;
- date ;
- commentaire ;
- mémo vocal ;
- sauvegarde locale dans le navigateur ;
- export/import JSON ;
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

## Fichiers

- `index.html` : structure de l'application.
- `styles.css` : interface responsive mobile.
- `app.js` : GPS, photo, audio, sauvegarde IndexedDB, export/import, liens Google Maps.
- `manifest.webmanifest` et `sw.js` : installation PWA et cache hors ligne.
- `server.js` : mini serveur local de test.
