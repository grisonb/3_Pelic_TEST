PATCH — Briefing_fdf_TEST — sw.js
Version cible : 3.7 TEST BINGO

Objectif :
Incrémenter le cache du Service Worker pour forcer la prise en compte de la nouvelle version sur iPad/PC/PWA.

Fichier concerné :
sw.js

============================================================
MODIFICATION 1/1 — Nom du cache
============================================================

OÙ CHERCHER :
const CACHE_NAME = 'briefing-fdf-test-v3.6-lfbn-niort';

AVANT :
const CACHE_NAME = 'briefing-fdf-test-v3.6-lfbn-niort';

APRÈS :
const CACHE_NAME = 'briefing-fdf-test-v3.7-bingo-font';


============================================================
NOTE TECHNIQUE
============================================================

- Cette modification force la création d'un nouveau cache.
- À l'activation, l'ancien cache sera supprimé par la logique existante :
  caches.delete(key)
- Après publication GitHub Pages, utiliser "Forcer MAJ" sur l'iPad si nécessaire.


============================================================
ROLLBACK RAPIDE
============================================================

Remettre :
const CACHE_NAME = 'briefing-fdf-test-v3.6-lfbn-niort';
