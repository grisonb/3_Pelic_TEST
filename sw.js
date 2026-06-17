PATCH — NPF-Q400-TEST — sw.js
Version cible : v11.54 TEST

ATTENTION :
Le dépôt NPF-Q400-TEST doit repartir du fichier sw.js de production NPF-Q400 v2026.35.
Le fichier sw.js TEST actuel ne doit pas servir de base s'il contient le patch erroné "Briefing_fdf_TEST".

Fichier de base à reprendre :
grisonb/NPF-Q400 / sw.js
Version de base : v2026.35

Fichier cible :
grisonb/NPF-Q400-TEST / sw.js


============================================================
MODIFICATION 1/1 — Incrémentation Service Worker
============================================================

OÙ CHERCHER :
const SW_VERSION = 'sw-v2026-35-app-icon';

AVANT :
const SW_VERSION = 'sw-v2026-35-app-icon';

APRÈS :
const SW_VERSION = 'sw-v11-54-test-bingo';


============================================================
CONTRÔLE APRÈS MODIFICATION
============================================================

Le début de sw.js doit être :

const SW_VERSION = 'sw-v11-54-test-bingo';

const DB_NAME = 'OfflineTilesDB';
const DB_VERSION = 3;


============================================================
NOTE TECHNIQUE
============================================================

- Cette modification crée un nouveau cache :
  npf-q400-app-shell-sw-v11-54-test-bingo
- Les anciens caches npf-q400-app-shell-* seront supprimés à l'activation du Service Worker.
- Après publication GitHub Pages, utiliser le bouton "🔄 MAJ" dans NPF TEST si nécessaire.


============================================================
ROLLBACK RAPIDE
============================================================

Reprendre sw.js depuis NPF-Q400 v2026.35, ou remettre :

const SW_VERSION = 'sw-v2026-35-app-icon';
