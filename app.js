/* ============================================================
   Mes Devis & Factures — logique de l'application
   100% local (localStorage), hors-ligne, PWA.
   Cible : auto-entrepreneur (sans TVA).
   ============================================================ */

'use strict';

/* ----------------------------------------------------------------
   1) STOCKAGE LOCAL
   ---------------------------------------------------------------- */
const K_SET = 'fact_settings';
const K_CLI = 'fact_clients';
const K_DOC = 'fact_docs';

const DEFAULT_SETTINGS = {
  nom: '',
  adresse: '',
  cp: '',
  ville: '',
  siret: '',
  tel: '',
  email: '',
  iban: '',
  bic: '',
  mentionTva: 'TVA non applicable, art. 293 B du CGI',
  mentionsComp: '',
  penalites: "En cas de retard de paiement : pénalité égale à 3 fois le taux d'intérêt légal + indemnité forfaitaire de 40 € pour frais de recouvrement.",
  validiteDevis: 30,
  delaiPaiement: 30,
  prefDevis: 'D',
  prefFacture: 'F',
  seqDevis: 1,
  seqFacture: 1,
  logo: ''
};

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error('Lecture stockage échouée', key, e);
    return fallback;
  }
}
function save(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    alert("Impossible d'enregistrer : la mémoire de la tablette est peut-être pleine.");
    console.error(e);
  }
}

let settings = Object.assign({}, DEFAULT_SETTINGS, load(K_SET, {}));
let clients = load(K_CLI, []);
let docs = load(K_DOC, []);

function saveSettings() { save(K_SET, settings); }
function saveClients() { save(K_CLI, clients); }
function saveDocs() { save(K_DOC, docs); }

/* ----------------------------------------------------------------
   2) OUTILS
   ---------------------------------------------------------------- */
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

const fmtEur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
function euros(n) { return fmtEur.format(Number(n) || 0); }
// Variante pour le PDF : les polices standard de jsPDF ne savent pas afficher
// l'espace insécable étroite (U+202F) ni l'insécable (U+00A0) utilisées par
// Intl ; on les remplace par une espace normale.
function eurosPdf(n) { return euros(n).replace(/[  ]/g, ' '); }

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}
function dateFr(iso) {
  if (!iso) return '';
  const [y, m, j] = iso.split('-');
  return `${j}/${m}/${y}`;
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function docTotal(d) {
  return (d.lignes || []).reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.pu) || 0), 0);
}

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function entrepriseConfiguree() {
  return settings.nom && settings.siret && settings.adresse;
}

/* ----------------------------------------------------------------
   3) NAVIGATION / RENDU
   ---------------------------------------------------------------- */
const screenEl = document.getElementById('screen');
const titleEl = document.getElementById('topbar-title');
const backBtn = document.getElementById('btn-back');
const tabbar = document.getElementById('tabbar');

let current = 'accueil';
let editDoc = null;     // document en cours d'édition
let editClient = null;  // client en cours d'édition

const SCREENS = {
  accueil: { title: 'Mes Devis & Factures', tab: 'accueil', render: renderAccueil },
  documents: { title: 'Documents', tab: 'documents', render: renderDocuments },
  clients: { title: 'Clients', tab: 'clients', render: renderClients },
  reglages: { title: 'Réglages', tab: 'reglages', render: renderReglages },
  editeur: { title: 'Document', tab: 'documents', render: renderEditeur, back: true },
  client: { title: 'Client', tab: 'clients', render: renderClientForm, back: true }
};

function go(name) {
  current = name;
  const s = SCREENS[name];
  titleEl.textContent = s.title;
  backBtn.style.display = s.back ? '' : 'none';
  [...tabbar.querySelectorAll('button')].forEach(b =>
    b.classList.toggle('active', b.dataset.screen === s.tab));
  window.scrollTo(0, 0);
  s.render();
}

tabbar.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (b) go(b.dataset.screen);
});
backBtn.addEventListener('click', () => {
  go(current === 'editeur' ? 'documents' : 'clients');
});

/* ----------------------------------------------------------------
   4) ÉCRAN ACCUEIL
   ---------------------------------------------------------------- */
function renderAccueil() {
  const recents = [...docs].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 5);
  let html = '';

  if (!entrepriseConfiguree()) {
    html += `<div class="card" style="border-left:6px solid var(--bleu-clair)">
      <strong>Bienvenue 👋</strong>
      <p>Avant de créer un premier devis, renseignez vos informations (nom, SIRET, adresse).
      Elles apparaîtront automatiquement sur tous vos documents.</p>
      <button class="btn btn-primary btn-bloc" data-act="go-reglages">⚙️ Renseigner mes informations</button>
    </div>`;
  }

  html += `<div class="tiles">
    <button class="tile" data-act="new-devis"><span class="ico">📝</span>Nouveau devis</button>
    <button class="tile vert" data-act="new-facture"><span class="ico">🧾</span>Nouvelle facture</button>
  </div>`;

  const nbDevis = docs.filter(d => d.type === 'devis').length;
  const nbFact = docs.filter(d => d.type === 'facture').length;
  const enAttente = docs.filter(d => d.type === 'facture' && d.statut !== 'paye')
    .reduce((s, d) => s + docTotal(d), 0);
  html += `<div class="card" style="display:flex;justify-content:space-around;text-align:center;flex-wrap:wrap;gap:14px">
    <div><div style="font-size:30px;font-weight:800;color:var(--bleu)">${nbDevis}</div><div class="li-sous">Devis</div></div>
    <div><div style="font-size:30px;font-weight:800;color:var(--vert)">${nbFact}</div><div class="li-sous">Factures</div></div>
    <div><div style="font-size:24px;font-weight:800;color:#9a6a12">${euros(enAttente)}</div><div class="li-sous">À encaisser</div></div>
  </div>`;

  html += `<h2 class="section">Documents récents</h2>`;
  html += recents.length
    ? recents.map(docLigneHTML).join('')
    : `<div class="vide"><span class="ico">📄</span>Aucun document pour l'instant.</div>`;

  screenEl.innerHTML = html;

  screenEl.querySelector('[data-act="go-reglages"]')?.addEventListener('click', () => go('reglages'));
  screenEl.querySelector('[data-act="new-devis"]').addEventListener('click', () => nouveauDoc('devis'));
  screenEl.querySelector('[data-act="new-facture"]').addEventListener('click', () => nouveauDoc('facture'));
  bindDocLignes();
}

/* ----------------------------------------------------------------
   5) ÉCRAN DOCUMENTS (liste)
   ---------------------------------------------------------------- */
let docFiltre = 'tous';
let docRecherche = '';

function docLigneHTML(d) {
  const badge = d.type === 'devis'
    ? '<span class="badge badge-devis">Devis</span>'
    : '<span class="badge badge-facture">Facture</span>';
  let statut = '';
  if (d.type === 'facture') {
    statut = d.statut === 'paye'
      ? '<span class="badge badge-paye">Payée</span>'
      : '<span class="badge badge-attente">À encaisser</span>';
  }
  return `<div class="list-item" data-doc="${d.id}">
    <div class="grow">
      <div class="li-titre">${badge} ${esc(d.numero)}</div>
      <div class="li-sous">${esc(d.clientNom || 'Sans client')} · ${dateFr(d.date)} ${statut}</div>
    </div>
    <div class="li-montant">${euros(docTotal(d))}</div>
  </div>`;
}
function bindDocLignes() {
  screenEl.querySelectorAll('[data-doc]').forEach(el =>
    el.addEventListener('click', () => ouvrirDoc(el.dataset.doc)));
}

function renderDocListe() {
  let liste = [...docs];
  if (docFiltre !== 'tous') liste = liste.filter(d => d.type === docFiltre);
  if (docRecherche) {
    const q = docRecherche.toLowerCase();
    liste = liste.filter(d =>
      (d.numero || '').toLowerCase().includes(q) ||
      (d.clientNom || '').toLowerCase().includes(q));
  }
  liste.sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.updatedAt || '').localeCompare(a.updatedAt || ''));

  const wrap = screenEl.querySelector('#doc-liste');
  wrap.innerHTML = liste.length
    ? liste.map(docLigneHTML).join('')
    : `<div class="vide"><span class="ico">📄</span>Aucun document.</div>`;
  bindDocLignes();
}

function renderDocuments() {
  const onglet = (val, lab) =>
    `<button class="btn ${docFiltre === val ? 'btn-primary' : ''}" data-filtre="${val}" style="flex:1">${lab}</button>`;

  screenEl.innerHTML = `<div class="actions-bar" style="margin-bottom:14px">
    ${onglet('tous', 'Tous')}${onglet('devis', 'Devis')}${onglet('facture', 'Factures')}
  </div>
  <div class="search"><input id="rech" type="search" placeholder="🔎 Rechercher (n° ou client)" value="${esc(docRecherche)}"></div>
  <div id="doc-liste"></div>`;

  screenEl.querySelectorAll('[data-filtre]').forEach(b =>
    b.addEventListener('click', () => {
      docFiltre = b.dataset.filtre;
      screenEl.querySelectorAll('[data-filtre]').forEach(x =>
        x.classList.toggle('btn-primary', x.dataset.filtre === docFiltre));
      renderDocListe();
    }));
  const rech = screenEl.querySelector('#rech');
  rech.addEventListener('input', () => { docRecherche = rech.value; renderDocListe(); });
  renderDocListe();
}

/* ----------------------------------------------------------------
   6) CRÉATION / OUVERTURE DE DOCUMENT
   ---------------------------------------------------------------- */
function nouveauDoc(type) {
  if (!entrepriseConfiguree()) {
    toast('Renseignez d’abord vos informations dans Réglages.');
    go('reglages');
    return;
  }
  const date = todayISO();
  editDoc = {
    id: uid(),
    _nouveau: true,
    type,
    numero: '',
    date,
    clientId: '',
    clientNom: '', clientAdresse: '', clientCp: '', clientVille: '', clientEmail: '',
    lignes: [{ designation: '', qty: 1, pu: 0 }],
    notes: '',
    statut: type === 'facture' ? 'attente' : 'brouillon',
    validite: type === 'devis' ? addDaysISO(date, settings.validiteDevis) : '',
    echeance: type === 'facture' ? addDaysISO(date, settings.delaiPaiement) : ''
  };
  go('editeur');
}

function ouvrirDoc(id) {
  const d = docs.find(x => x.id === id);
  if (!d) return;
  editDoc = JSON.parse(JSON.stringify(d));
  editDoc._nouveau = false;
  go('editeur');
}

function attribuerNumero(type) {
  const an = new Date().getFullYear();
  if (type === 'devis') {
    const n = `${settings.prefDevis}${an}-${String(settings.seqDevis).padStart(4, '0')}`;
    settings.seqDevis++;
    saveSettings();
    return n;
  }
  const n = `${settings.prefFacture}${an}-${String(settings.seqFacture).padStart(4, '0')}`;
  settings.seqFacture++;
  saveSettings();
  return n;
}

/* ----------------------------------------------------------------
   7) ÉDITEUR DE DOCUMENT
   ---------------------------------------------------------------- */
function renderEditeur() {
  const d = editDoc;
  const estDevis = d.type === 'devis';
  titleEl.textContent = (estDevis ? 'Devis ' : 'Facture ') + (d.numero || '(nouveau)');

  const optionsClients = clients.map(c =>
    `<option value="${c.id}" ${c.id === d.clientId ? 'selected' : ''}>${esc(c.nom)}</option>`).join('');

  let html = `
  <label class="field">
    <span class="lab">Client</span>
    <select id="f-client">
      <option value="">— Choisir un client —</option>
      ${optionsClients}
      <option value="__new">➕ Nouveau client…</option>
    </select>
  </label>
  <div id="client-resume" class="hint"></div>

  <div class="row2">
    <label class="field"><span class="lab">Date</span><input type="date" id="f-date" value="${d.date}"></label>
    ${estDevis
      ? `<label class="field"><span class="lab">Valable jusqu'au</span><input type="date" id="f-validite" value="${d.validite}"></label>`
      : `<label class="field"><span class="lab">À payer avant le</span><input type="date" id="f-echeance" value="${d.echeance}"></label>`}
  </div>

  <h2 class="section">Prestations / produits</h2>
  <div id="lignes"></div>
  <button class="btn btn-bloc" id="btn-add-ligne" style="margin-bottom:10px">➕ Ajouter une ligne</button>

  <div class="totaux">Total : <span id="grand-total">${euros(docTotal(d))}</span></div>
  <div class="note-legale">${esc(settings.mentionTva)} — pas de TVA (auto-entrepreneur).</div>

  <label class="field"><span class="lab">Note (optionnel, affichée sur le document)</span>
    <textarea id="f-notes" placeholder="Ex : conditions, détails…">${esc(d.notes)}</textarea>
  </label>`;

  if (!estDevis) {
    html += `<label class="field"><span class="lab">Statut</span>
      <select id="f-statut">
        <option value="attente" ${d.statut !== 'paye' ? 'selected' : ''}>À encaisser</option>
        <option value="paye" ${d.statut === 'paye' ? 'selected' : ''}>Payée</option>
      </select></label>`;
  }

  html += `<div class="actions-bar" style="margin-top:8px">
    <button class="btn btn-primary" id="btn-save">💾 Enregistrer</button>
    <button class="btn" id="btn-pdf">📄 Aperçu PDF</button>
    <button class="btn btn-vert" id="btn-mail">✉️ Envoyer</button>
  </div>
  <div class="actions-bar" style="margin-top:12px">`;
  if (estDevis) {
    html += `<button class="btn" id="btn-convert">➡️ Transformer en facture</button>`;
  }
  html += `<button class="btn" id="btn-dup">📑 Dupliquer</button>
    <button class="btn btn-danger" id="btn-del">🗑️ Supprimer</button>
  </div>`;

  screenEl.innerHTML = html;

  renderLignes();
  majClientResume();

  // Client
  screenEl.querySelector('#f-client').addEventListener('change', e => {
    const v = e.target.value;
    if (v === '__new') { editClient = null; go('client'); return; }
    d.clientId = v;
    const c = clients.find(x => x.id === v);
    if (c) { d.clientNom = c.nom; d.clientAdresse = c.adresse; d.clientCp = c.cp; d.clientVille = c.ville; d.clientEmail = c.email; }
    else { d.clientNom = d.clientAdresse = d.clientCp = d.clientVille = d.clientEmail = ''; }
    majClientResume();
  });

  // Dates / champs simples
  screenEl.querySelector('#f-date').addEventListener('change', e => { d.date = e.target.value; });
  screenEl.querySelector('#f-validite')?.addEventListener('change', e => { d.validite = e.target.value; });
  screenEl.querySelector('#f-echeance')?.addEventListener('change', e => { d.echeance = e.target.value; });
  screenEl.querySelector('#f-notes').addEventListener('input', e => { d.notes = e.target.value; });
  screenEl.querySelector('#f-statut')?.addEventListener('change', e => { d.statut = e.target.value; });

  screenEl.querySelector('#btn-add-ligne').addEventListener('click', () => {
    d.lignes.push({ designation: '', qty: 1, pu: 0 });
    renderLignes();
  });

  screenEl.querySelector('#btn-save').addEventListener('click', () => { sauverDoc(); });
  screenEl.querySelector('#btn-pdf').addEventListener('click', () => { if (sauverDoc(true)) apercuPdf(editDoc); });
  screenEl.querySelector('#btn-mail').addEventListener('click', () => { if (sauverDoc(true)) envoyerDoc(editDoc); });
  screenEl.querySelector('#btn-convert')?.addEventListener('click', convertirEnFacture);
  screenEl.querySelector('#btn-dup').addEventListener('click', dupliquerDoc);
  screenEl.querySelector('#btn-del').addEventListener('click', supprimerDoc);
}

function majClientResume() {
  const el = screenEl.querySelector('#client-resume');
  if (!el) return;
  const d = editDoc;
  el.textContent = d.clientNom
    ? [d.clientAdresse, [d.clientCp, d.clientVille].filter(Boolean).join(' '), d.clientEmail].filter(Boolean).join(' · ')
    : 'Aucun client sélectionné.';
}

function renderLignes() {
  const wrap = screenEl.querySelector('#lignes');
  const d = editDoc;
  wrap.innerHTML = d.lignes.map((l, i) => `
    <div class="ligne" data-i="${i}">
      <label class="field" style="margin-bottom:10px">
        <span class="lab">Désignation</span>
        <input data-f="designation" data-i="${i}" value="${esc(l.designation)}" placeholder="Ex : Pose de carrelage">
      </label>
      <div class="ligne-bas">
        <div><span class="lab">Quantité</span>
          <input data-f="qty" data-i="${i}" type="number" inputmode="decimal" step="any" min="0" value="${l.qty}"></div>
        <div><span class="lab">Prix unit. (€)</span>
          <input data-f="pu" data-i="${i}" type="number" inputmode="decimal" step="any" min="0" value="${l.pu}"></div>
        <button class="suppr" data-suppr="${i}" title="Supprimer la ligne">✕</button>
      </div>
      <div class="ligne-total">Sous-total : <span data-st="${i}">${euros((Number(l.qty) || 0) * (Number(l.pu) || 0))}</span></div>
    </div>`).join('');

  wrap.querySelectorAll('input[data-f]').forEach(inp => {
    inp.addEventListener('input', () => {
      const i = +inp.dataset.i, f = inp.dataset.f;
      d.lignes[i][f] = (f === 'designation') ? inp.value : parseFloat(inp.value.replace(',', '.')) || 0;
      const l = d.lignes[i];
      wrap.querySelector(`[data-st="${i}"]`).textContent = euros((Number(l.qty) || 0) * (Number(l.pu) || 0));
      screenEl.querySelector('#grand-total').textContent = euros(docTotal(d));
    });
  });
  wrap.querySelectorAll('[data-suppr]').forEach(b => {
    b.addEventListener('click', () => {
      const i = +b.dataset.suppr;
      if (d.lignes.length === 1) { d.lignes[0] = { designation: '', qty: 1, pu: 0 }; }
      else { d.lignes.splice(i, 1); }
      renderLignes();
      screenEl.querySelector('#grand-total').textContent = euros(docTotal(d));
    });
  });
}

function sauverDoc(silencieux) {
  const d = editDoc;
  if (!d.clientNom) { toast('Choisissez un client.'); return false; }
  if (!d.lignes.some(l => l.designation && (Number(l.qty) * Number(l.pu)) >= 0 && l.designation.trim())) {
    toast('Ajoutez au moins une ligne avec une désignation.'); return false;
  }
  const now = new Date().toISOString();
  if (d._nouveau) {
    d.numero = attribuerNumero(d.type);
    d.createdAt = now;
    d._nouveau = false;
  }
  d.updatedAt = now;
  const clean = JSON.parse(JSON.stringify(d));
  delete clean._nouveau;
  const idx = docs.findIndex(x => x.id === d.id);
  if (idx >= 0) docs[idx] = clean; else docs.push(clean);
  saveDocs();
  titleEl.textContent = (d.type === 'devis' ? 'Devis ' : 'Facture ') + d.numero;
  if (!silencieux) toast('Enregistré ✓');
  return true;
}

function dupliquerDoc() {
  sauverDoc(true);
  const copie = JSON.parse(JSON.stringify(editDoc));
  copie.id = uid();
  copie._nouveau = true;
  copie.numero = '';
  copie.date = todayISO();
  copie.statut = copie.type === 'facture' ? 'attente' : 'brouillon';
  if (copie.type === 'devis') copie.validite = addDaysISO(copie.date, settings.validiteDevis);
  else copie.echeance = addDaysISO(copie.date, settings.delaiPaiement);
  editDoc = copie;
  toast('Copie créée — enregistrez pour valider.');
  go('editeur');
}

function convertirEnFacture() {
  sauverDoc(true);
  const f = JSON.parse(JSON.stringify(editDoc));
  f.id = uid();
  f._nouveau = true;
  f.type = 'facture';
  f.numero = '';
  f.date = todayISO();
  f.statut = 'attente';
  f.echeance = addDaysISO(f.date, settings.delaiPaiement);
  f.convertedFrom = editDoc.numero;
  delete f.validite;
  editDoc = f;
  toast('Facture créée depuis le devis — enregistrez.');
  go('editeur');
}

function supprimerDoc() {
  const d = editDoc;
  const msg = d.type === 'facture'
    ? `Supprimer la facture ${d.numero} ?\n\nAttention : une facture émise doit normalement être conservée (numérotation continue).`
    : `Supprimer le devis ${d.numero} ?`;
  if (!confirm(msg)) return;
  docs = docs.filter(x => x.id !== d.id);
  saveDocs();
  toast('Supprimé.');
  go('documents');
}

/* ----------------------------------------------------------------
   8) CLIENTS
   ---------------------------------------------------------------- */
function renderClients() {
  let html = `<button class="btn btn-primary btn-bloc btn-lg" id="btn-new-cli" style="margin-bottom:18px">➕ Nouveau client</button>`;
  if (!clients.length) {
    html += `<div class="vide"><span class="ico">👥</span>Aucun client enregistré.</div>`;
  } else {
    html += [...clients].sort((a, b) => a.nom.localeCompare(b.nom)).map(c => `
      <div class="list-item" data-cli="${c.id}">
        <div class="grow">
          <div class="li-titre">${esc(c.nom)}</div>
          <div class="li-sous">${esc([c.cp, c.ville].filter(Boolean).join(' '))}${c.tel ? ' · ' + esc(c.tel) : ''}</div>
        </div>
        <div>›</div>
      </div>`).join('');
  }
  screenEl.innerHTML = html;
  screenEl.querySelector('#btn-new-cli').addEventListener('click', () => { editClient = null; go('client'); });
  screenEl.querySelectorAll('[data-cli]').forEach(el =>
    el.addEventListener('click', () => { editClient = clients.find(c => c.id === el.dataset.cli); go('client'); }));
}

function renderClientForm() {
  const c = editClient || { nom: '', adresse: '', cp: '', ville: '', email: '', tel: '', siret: '' };
  titleEl.textContent = editClient ? 'Modifier le client' : 'Nouveau client';
  screenEl.innerHTML = `
    <label class="field"><span class="lab">Nom / Société *</span><input id="c-nom" value="${esc(c.nom)}"></label>
    <label class="field"><span class="lab">Adresse</span><input id="c-adresse" value="${esc(c.adresse)}"></label>
    <div class="row2">
      <label class="field"><span class="lab">Code postal</span><input id="c-cp" inputmode="numeric" value="${esc(c.cp)}"></label>
      <label class="field"><span class="lab">Ville</span><input id="c-ville" value="${esc(c.ville)}"></label>
    </div>
    <label class="field"><span class="lab">Email</span><input id="c-email" type="email" value="${esc(c.email)}"></label>
    <label class="field"><span class="lab">Téléphone</span><input id="c-tel" type="tel" value="${esc(c.tel)}"></label>
    <label class="field"><span class="lab">SIRET (si professionnel)</span><input id="c-siret" inputmode="numeric" value="${esc(c.siret || '')}"></label>
    <div class="actions-bar" style="margin-top:8px">
      <button class="btn btn-primary" id="c-save">💾 Enregistrer</button>
      ${editClient ? '<button class="btn btn-danger" id="c-del">🗑️ Supprimer</button>' : ''}
    </div>`;

  screenEl.querySelector('#c-save').addEventListener('click', () => {
    const nom = screenEl.querySelector('#c-nom').value.trim();
    if (!nom) { toast('Le nom est obligatoire.'); return; }
    const data = {
      nom,
      adresse: screenEl.querySelector('#c-adresse').value.trim(),
      cp: screenEl.querySelector('#c-cp').value.trim(),
      ville: screenEl.querySelector('#c-ville').value.trim(),
      email: screenEl.querySelector('#c-email').value.trim(),
      tel: screenEl.querySelector('#c-tel').value.trim(),
      siret: screenEl.querySelector('#c-siret').value.trim()
    };
    if (editClient) { Object.assign(editClient, data); }
    else { data.id = uid(); clients.push(data); }
    saveClients();
    toast('Client enregistré ✓');
    go('clients');
  });
  screenEl.querySelector('#c-del')?.addEventListener('click', () => {
    if (!confirm(`Supprimer le client ${editClient.nom} ?`)) return;
    clients = clients.filter(x => x.id !== editClient.id);
    saveClients();
    toast('Client supprimé.');
    go('clients');
  });
}

/* ----------------------------------------------------------------
   9) RÉGLAGES
   ---------------------------------------------------------------- */
function renderReglages() {
  const s = settings;
  screenEl.innerHTML = `
    <h2 class="section">Mon entreprise</h2>
    <div class="grid2">
      <label class="field"><span class="lab">Nom / Nom commercial *</span><input id="s-nom" value="${esc(s.nom)}"></label>
      <label class="field"><span class="lab">SIRET *</span><input id="s-siret" inputmode="numeric" value="${esc(s.siret)}"></label>
      <label class="field"><span class="lab">Adresse *</span><input id="s-adresse" value="${esc(s.adresse)}"></label>
      <label class="field"><span class="lab">Téléphone</span><input id="s-tel" type="tel" value="${esc(s.tel)}"></label>
      <label class="field"><span class="lab">Code postal</span><input id="s-cp" inputmode="numeric" value="${esc(s.cp)}"></label>
      <label class="field"><span class="lab">Ville</span><input id="s-ville" value="${esc(s.ville)}"></label>
      <label class="field"><span class="lab">Email</span><input id="s-email" type="email" value="${esc(s.email)}"></label>
      <label class="field"><span class="lab">IBAN (pour paiement, optionnel)</span><input id="s-iban" value="${esc(s.iban)}"></label>
    </div>

    <label class="field"><span class="lab">Logo (optionnel)</span><input id="s-logo" type="file" accept="image/*"></label>
    <div id="logo-apercu">${s.logo ? `<img src="${s.logo}" style="max-height:70px;border-radius:8px"> <button class="btn btn-danger" id="s-logo-del" style="min-height:42px">Retirer</button>` : ''}</div>

    <h2 class="section">Mentions sur les documents</h2>
    <label class="field"><span class="lab">Mention TVA</span><input id="s-tva" value="${esc(s.mentionTva)}"></label>
    <label class="field"><span class="lab">Mentions complémentaires (assurance, RCS/RM…)</span><textarea id="s-comp">${esc(s.mentionsComp)}</textarea></label>
    <label class="field"><span class="lab">Pénalités de retard (factures)</span><textarea id="s-pen">${esc(s.penalites)}</textarea></label>

    <h2 class="section">Numérotation & délais</h2>
    <div class="grid2">
      <label class="field"><span class="lab">Préfixe devis</span><input id="s-pd" value="${esc(s.prefDevis)}"></label>
      <label class="field"><span class="lab">Prochain n° devis</span><input id="s-sd" type="number" min="1" value="${s.seqDevis}"></label>
      <label class="field"><span class="lab">Préfixe facture</span><input id="s-pf" value="${esc(s.prefFacture)}"></label>
      <label class="field"><span class="lab">Prochain n° facture</span><input id="s-sf" type="number" min="1" value="${s.seqFacture}"></label>
      <label class="field"><span class="lab">Validité devis (jours)</span><input id="s-vd" type="number" min="1" value="${s.validiteDevis}"></label>
      <label class="field"><span class="lab">Délai paiement facture (jours)</span><input id="s-dp" type="number" min="0" value="${s.delaiPaiement}"></label>
    </div>

    <button class="btn btn-primary btn-bloc btn-lg" id="s-save" style="margin-top:8px">💾 Enregistrer les réglages</button>

    <h2 class="section">Sauvegarde des données</h2>
    <div class="note-legale">Vos données sont stockées <strong>uniquement sur cette tablette</strong>. Exportez régulièrement une sauvegarde (ex : une fois par mois) pour ne rien perdre.</div>
    <div id="stockage-info" class="hint">Vérification du stockage…</div>
    <div class="actions-bar">
      <button class="btn btn-vert" id="s-export">⬇️ Exporter une sauvegarde</button>
      <label class="btn" style="cursor:pointer">⬆️ Restaurer<input id="s-import" type="file" accept="application/json,.json" hidden></label>
    </div>`;

  // logo
  screenEl.querySelector('#s-logo').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { settings.logo = reader.result; saveSettings(); renderReglages(); toast('Logo ajouté.'); };
    reader.readAsDataURL(file);
  });
  screenEl.querySelector('#s-logo-del')?.addEventListener('click', () => { settings.logo = ''; saveSettings(); renderReglages(); });

  screenEl.querySelector('#s-save').addEventListener('click', () => {
    const g = id => screenEl.querySelector(id).value;
    Object.assign(settings, {
      nom: g('#s-nom').trim(), siret: g('#s-siret').trim(), adresse: g('#s-adresse').trim(),
      tel: g('#s-tel').trim(), cp: g('#s-cp').trim(), ville: g('#s-ville').trim(),
      email: g('#s-email').trim(), iban: g('#s-iban').trim(),
      mentionTva: g('#s-tva').trim(), mentionsComp: g('#s-comp').trim(), penalites: g('#s-pen').trim(),
      prefDevis: g('#s-pd').trim() || 'D', prefFacture: g('#s-pf').trim() || 'F',
      seqDevis: Math.max(1, parseInt(g('#s-sd')) || 1), seqFacture: Math.max(1, parseInt(g('#s-sf')) || 1),
      validiteDevis: Math.max(1, parseInt(g('#s-vd')) || 30), delaiPaiement: Math.max(0, parseInt(g('#s-dp')) || 30)
    });
    saveSettings();
    toast('Réglages enregistrés ✓');
  });

  screenEl.querySelector('#s-export').addEventListener('click', exporterSauvegarde);
  screenEl.querySelector('#s-import').addEventListener('change', importerSauvegarde);

  // État du stockage (persistant ou non + espace utilisé)
  majInfoStockage();
}

async function majInfoStockage() {
  const el = screenEl.querySelector('#stockage-info');
  if (!el) return;
  const nbDocs = docs.length, nbCli = clients.length;
  let persist = null, utilise = '';
  try {
    if (navigator.storage) {
      if (navigator.storage.persisted) persist = await navigator.storage.persisted();
      if (!persist && navigator.storage.persist) persist = await navigator.storage.persist();
      if (navigator.storage.estimate) {
        const est = await navigator.storage.estimate();
        if (est && est.usage != null) utilise = ` · ${Math.max(1, Math.round(est.usage / 1024))} Ko utilisés`;
      }
    }
  } catch (e) {}
  const etat = persist === true
    ? '🔒 Stockage <strong>persistant</strong> (le navigateur s’engage à ne pas effacer)'
    : persist === false
      ? '⚠️ Stockage <strong>non garanti</strong> par le navigateur — sauvegardez régulièrement'
      : 'Stockage local';
  el.innerHTML = `${etat}.<br>${nbDocs} document(s), ${nbCli} client(s) enregistré(s) sur cette tablette${utilise}.`;
}

function exporterSauvegarde() {
  const data = { _app: 'mes-devis-factures', version: 1, date: new Date().toISOString(), settings, clients, docs };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `sauvegarde-factures-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Sauvegarde exportée.');
}

function importerSauvegarde(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data.settings || !Array.isArray(data.docs)) throw new Error('format');
      if (!confirm('Restaurer cette sauvegarde ? Cela remplacera toutes les données actuelles de la tablette.')) return;
      settings = Object.assign({}, DEFAULT_SETTINGS, data.settings);
      clients = data.clients || [];
      docs = data.docs || [];
      saveSettings(); saveClients(); saveDocs();
      toast('Sauvegarde restaurée ✓');
      go('accueil');
    } catch (err) {
      alert('Fichier de sauvegarde invalide.');
    }
  };
  reader.readAsText(file);
}

/* ----------------------------------------------------------------
   10) GÉNÉRATION PDF (jsPDF + autoTable)
   ---------------------------------------------------------------- */
function construirePdf(d) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();
  const M = 15;
  const estDevis = d.type === 'devis';
  let y = M;

  // Logo
  if (settings.logo) {
    try { doc.addImage(settings.logo, 'PNG', M, y, 30, 30); } catch (e) {}
  }

  // Bloc émetteur (gauche)
  const xEmet = settings.logo ? M + 35 : M;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(settings.nom || '', xEmet, y + 6);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const emet = [settings.adresse, [settings.cp, settings.ville].filter(Boolean).join(' '),
    settings.tel ? 'Tél : ' + settings.tel : '', settings.email].filter(Boolean);
  doc.text(emet, xEmet, y + 12);

  // Titre document (droite)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
  doc.setTextColor(14, 58, 95);
  doc.text(estDevis ? 'DEVIS' : 'FACTURE', W - M, y + 8, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
  doc.text(`N° ${d.numero}`, W - M, y + 16, { align: 'right' });
  doc.text(`Date : ${dateFr(d.date)}`, W - M, y + 22, { align: 'right' });
  if (estDevis && d.validite) doc.text(`Valable jusqu'au ${dateFr(d.validite)}`, W - M, y + 28, { align: 'right' });
  if (!estDevis && d.echeance) doc.text(`Échéance : ${dateFr(d.echeance)}`, W - M, y + 28, { align: 'right' });

  y += 40;

  // Bloc client (cadre à droite)
  doc.setDrawColor(205, 215, 223);
  doc.setFillColor(246, 249, 251);
  const boxW = 85, boxX = W - M - boxW;
  const clientArr = [d.clientNom, d.clientAdresse, [d.clientCp, d.clientVille].filter(Boolean).join(' ')]
    .filter(Boolean);
  const boxH = 10 + clientArr.length * 5;
  doc.roundedRect(boxX, y, boxW, boxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.setTextColor(91, 107, 120);
  doc.text('ADRESSÉ À', boxX + 4, y + 6);
  doc.setTextColor(0, 0, 0); doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.text(clientArr, boxX + 4, y + 12);

  y += boxH + 8;

  // Tableau des lignes
  const body = (d.lignes || []).filter(l => l.designation && l.designation.trim()).map(l => {
    const tot = (Number(l.qty) || 0) * (Number(l.pu) || 0);
    return [l.designation, String(l.qty).replace('.', ','), eurosPdf(l.pu), eurosPdf(tot)];
  });

  doc.autoTable({
    startY: y,
    head: [['Désignation', 'Qté', 'Prix unit.', 'Total']],
    body,
    margin: { left: M, right: M },
    styles: { fontSize: 10, cellPadding: 3 },
    headStyles: { fillColor: [14, 58, 95], halign: 'left' },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'center', cellWidth: 18 },
      2: { halign: 'right', cellWidth: 30 },
      3: { halign: 'right', cellWidth: 32 }
    }
  });

  let yEnd = doc.lastAutoTable.finalY + 6;

  // Total
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
  doc.text(`TOTAL : ${eurosPdf(docTotal(d))}`, W - M, yEnd, { align: 'right' });
  yEnd += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
  doc.setTextColor(91, 107, 120);
  doc.text(settings.mentionTva || '', W - M, yEnd, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  yEnd += 10;

  // Note libre
  if (d.notes) {
    doc.setFontSize(10);
    const noteLines = doc.splitTextToSize(d.notes, W - 2 * M);
    doc.text(noteLines, M, yEnd);
    yEnd += noteLines.length * 5 + 4;
  }

  // IBAN (facture)
  if (!estDevis && settings.iban) {
    doc.setFontSize(9);
    doc.text(`Règlement par virement — IBAN : ${settings.iban}${settings.bic ? ' / BIC : ' + settings.bic : ''}`, M, yEnd);
    yEnd += 6;
  }

  // Devis : bon pour accord
  if (estDevis) {
    yEnd += 4;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text('Bon pour accord (date et signature) :', M, yEnd);
    doc.setDrawColor(150);
    doc.rect(M, yEnd + 3, 80, 22);
    yEnd += 30;
    doc.setFont('helvetica', 'normal');
  }

  // Pied de page légal
  const footer = [
    `${settings.nom} — SIRET : ${settings.siret}`,
    settings.mentionsComp,
    !estDevis ? settings.penalites : ''
  ].filter(Boolean).join('\n');
  doc.setFontSize(8);
  doc.setTextColor(120);
  const pageH = doc.internal.pageSize.getHeight();
  const fLines = doc.splitTextToSize(footer, W - 2 * M);
  doc.text(fLines, M, pageH - 12);

  return doc;
}

function nomFichier(d) {
  return `${d.type === 'devis' ? 'Devis' : 'Facture'}_${(d.numero || '').replace(/[^\w-]/g, '')}.pdf`;
}

function apercuPdf(d) {
  try {
    const doc = construirePdf(d);
    const url = doc.output('bloburl');
    window.open(url, '_blank');
  } catch (e) {
    console.error(e); alert('Erreur lors de la création du PDF.');
  }
}

async function envoyerDoc(d) {
  let doc;
  try { doc = construirePdf(d); } catch (e) { console.error(e); alert('Erreur PDF.'); return; }
  const filename = nomFichier(d);
  const blob = doc.output('blob');
  const file = new File([blob], filename, { type: 'application/pdf' });
  const sujet = `${d.type === 'devis' ? 'Devis' : 'Facture'} ${d.numero} — ${settings.nom}`;
  const corps = `Bonjour,\n\nVeuillez trouver ci-joint votre ${d.type === 'devis' ? 'devis' : 'facture'} ${d.numero}.\n\nCordialement,\n${settings.nom}`;

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: sujet, text: corps });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // utilisateur a annulé
    }
  }
  // Repli : télécharger le PDF + ouvrir l'email (à joindre manuellement)
  doc.save(filename);
  const mail = `mailto:${encodeURIComponent(d.clientEmail || '')}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps + '\n\n(PDF téléchargé : pensez à le joindre)')}`;
  window.location.href = mail;
  toast('PDF téléchargé — joignez-le à l’email.');
}

/* ----------------------------------------------------------------
   11) DÉMARRAGE
   ---------------------------------------------------------------- */
// Demande au navigateur de conserver durablement les données (anti-éviction
// quand la tablette manque d'espace). Sans effet néfaste si refusé.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persisted().then(deja => { if (!deja) navigator.storage.persist(); }).catch(() => {});
}

go('accueil');

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW non enregistré', e));
  });
}
