# Plateforme de Jeux Interactifs — Design Apple tvOS

Plateforme web multijoueur en temps réel inspirée d'Unboared avec une interface TV cinématographique inspirée d'Apple tvOS, des smartphones utilisés comme manettes tactiles sans installation, et une console d'animation dédiée.

## Architecture & Interfaces

- **Interface TV (`/tv`)** : Catalogue tvOS plein écran, navigation clavier/télécommande/souris, lobby QR code, écran de jeu live et podium.
- **Interface Joueur (`/play/[code]`)** : Connexion rapide par QR code ou code court, choix d'avatar et pseudo, manette adaptée au jeu en cours, reconnexion automatique.
- **Interface Animateur (`/admin`)** : Création de partie, contrôle d'état (lancer, pause, reprendre, suivant, terminer), affichage/masquage du QR code, modération et historique.

## Installation & Configuration

1. Installer les dépendances :
   ```bash
   npm install 
