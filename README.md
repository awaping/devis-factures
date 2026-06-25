# Mes Devis & Factures

Petite application **web installable (PWA)** pour créer des **devis** et **factures**
d'auto-entrepreneur, pensée pour une **tablette Android** et un usage simple
(gros boutons, grande police, fort contraste).

- ✅ Fonctionne **100 % hors-ligne** une fois installée
- ✅ Données stockées **uniquement sur la tablette** (rien n'est envoyé sur internet)
- ✅ Devis + factures, **export PDF**, **envoi par email**, **base de clients**
- ✅ Mention auto-entrepreneur « TVA non applicable, art. 293 B du CGI »

## Fichiers

```
index.html          page principale
styles.css          mise en forme (UI senior / tablette)
app.js              toute la logique
sw.js               service worker (mode hors-ligne)
manifest.webmanifest  description de l'appli (PWA)
icon.svg            icône
vendor/             librairie PDF (jsPDF) embarquée localement
```

## Tester sur l'ordinateur (Windows)

Un PWA a besoin d'un petit serveur (le double-clic sur `index.html` ne suffit pas
pour le mode hors-ligne). Dans ce dossier :

```bash
python -m http.server 8765
```

Puis ouvrir <http://localhost:8765> dans Chrome.

## Installer sur la tablette Android

Le mode hors-ligne (service worker) exige une adresse **https**. Le plus simple :
héberger gratuitement ces fichiers, puis « Ajouter à l'écran d'accueil ».

1. **Héberger** (au choix, gratuit) :
   - **Netlify Drop** — aller sur <https://app.netlify.com/drop> et **glisser le dossier
     `facturation`** dans la page. On obtient une adresse `https://...netlify.app`.
   - ou GitHub Pages / Cloudflare Pages / Vercel.
2. **Sur la tablette**, ouvrir cette adresse dans **Chrome**.
3. Menu **⋮ → « Ajouter à l'écran d'accueil »** (ou « Installer l'application »).
4. L'icône apparaît comme une vraie appli ; elle fonctionne ensuite **sans connexion**.

> Les données (clients, devis, factures) restent dans la tablette, dans le navigateur.
> Elles ne « partent » pas sur le serveur : l'hébergement ne sert qu'à livrer l'appli.

## Première utilisation

1. Onglet **Réglages** → renseigner **nom, SIRET, adresse** (obligatoires) + IBAN, logo… puis **Enregistrer**.
2. Onglet **Clients** → ajouter ses clients (réutilisables).
3. **Accueil** → « Nouveau devis » / « Nouvelle facture ».
4. Sur un document : **Aperçu PDF**, **Envoyer** (partage Android → Gmail…), **Transformer en facture** (depuis un devis), **Dupliquer**.

## ⚠️ Sauvegarde importante

Les données vivent dans le navigateur de la tablette. Si on vide les données de
Chrome ou si la tablette est réinitialisée, **tout est perdu**.
→ Régulièrement (ex. 1×/mois) : **Réglages → Exporter une sauvegarde** (fichier `.json`
à garder ailleurs : email, clé USB, Drive). Pour récupérer : **Restaurer**.

## Conformité (auto-entrepreneur)

L'appli inclut : numérotation séquentielle des factures, date, identité émetteur
(nom + SIRET), client, désignation/quantité/prix, total, mention « TVA non applicable,
art. 293 B du CGI », échéance et pénalités de retard sur factures, validité + « Bon
pour accord » sur devis. Le champ **Mentions complémentaires** (Réglages) permet
d'ajouter ce qui dépend du métier (assurance décennale, RCS/RM, etc.).
Ceci n'est pas un conseil juridique : vérifier les mentions propres à l'activité.
