# Horaires de prière — widget iPhone (Scripting)

Widget d'horaires de prière au style Apple, pour l'app Scripting sur iPhone.

- Petit et moyen widget, et écran verrouillé (ligne, rond, rectangle)
- Mosquée de Mantes-la-Jolie par défaut, jusqu'à 5 mosquées Mawaqit
- Horaires de Jumu'a (publiés par la mosquée ou personnels)
- Styles Système, Ciel et Flou (Flou : widgets « Fond flou » de Scripting Pro)
- Horaires gardés en mémoire (3 mois) : le widget ne va jamais sur Internet
- Dans les réglages : « Mes widgets », tous les widgets à l'heure choisie avec un curseur, et « Comment lire les widgets »

## Installer (une seule fois)

1. Dans Scripting : **⋯ → Importer un script distant**, coller le lien de ce dépôt.
2. Ouvrir le script une fois : il télécharge les horaires. Choisir sa mosquée et son style.
3. Réglages du script : activer la **mise à jour automatique** (intervalle de vérification), et l'interrupteur général de mise à jour automatique de Scripting.
4. Ajouter le widget sur l'écran d'accueil (Scripting → choisir « Horaires de prière »).
5. Raccourcis → Automatisation → **Chaque jour à 3:00** → « Exécuter le script » Scripting « Horaires de prière », sans demander. Les horaires restent ainsi à jour.

Les mises à jour du code arrivent ensuite toutes seules depuis ce dépôt.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `widget.tsx` | Le widget (aucun accès à Internet) |
| `index.tsx` | Les réglages : mosquées, Jumu'a, style ; télécharge les horaires |
| `intent.tsx` | Mise à jour de nuit, lancée par l'automatisation Raccourcis |
| `script.json` | Nom, icône et version du script pour Scripting |

Version 1.0 (iOS) — 15 novembre 2026.
