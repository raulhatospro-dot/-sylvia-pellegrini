/* ============================================
   SYLVIA PELLEGRINI — Admin (Netlify)
   ============================================ */

/* ============================================================
   CONFIGURATION
   ------------------------------------------------------------
   Mot de passe admin — doit correspondre à la variable
   ADMIN_PASSWORD définie sur Netlify (ou à la valeur par défaut
   DEFAULT_ADMIN_PASSWORD dans netlify/functions/save-events.js).
   ============================================================ */
const ADMIN_PASSWORD = 'sylvia2024';

// Endpoint Netlify Function qui écrit events.json dans le repo GitHub
const SAVE_ENDPOINT = '/.netlify/functions/save-events';

// URL publique du fichier events.json (servi par Netlify)
const EVENTS_URL = '../events.json';

const LS_KEY = 'sp_admin_session';

const MONTHS_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

let state = {
    events: [],
    comment: null, // préserve le _comment du JSON
    password: null // gardé en mémoire pour les appels à la function
};

// ---------- Utils ----------
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

const escapeHtml = (str) => String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function formatDate(dateStr) {
    if (!dateStr) return { day: '??', month: '', year: '' };
    const [y, m, d] = dateStr.split('-');
    return {
        day:   d || '??',
        month: MONTHS_FR[parseInt(m, 10) - 1] || '',
        year:  y || ''
    };
}

function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showToast(message, type = 'success') {
    const toast = $('#toast');
    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, 4500);
}

// ---------- Auth ----------
function isLoggedIn() {
    try {
        const stored = localStorage.getItem(LS_KEY);
        return stored === ADMIN_PASSWORD;
    } catch (e) { return false; }
}

function login(password) {
    if (password !== ADMIN_PASSWORD) return false;
    try { localStorage.setItem(LS_KEY, password); } catch (e) {}
    state.password = password;
    return true;
}

function logout() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    state.password = null;
    showLogin();
}

function showLogin() {
    $('#loginScreen').hidden = false;
    $('#dashboard').hidden = true;
    $('#password').value = '';
    $('#loginError').textContent = '';
    setTimeout(() => $('#password').focus(), 50);
}

function showDashboard() {
    $('#loginScreen').hidden = true;
    $('#dashboard').hidden = false;
    // Récupère le password depuis localStorage pour les prochains saves
    try { state.password = localStorage.getItem(LS_KEY); } catch (e) {}
    loadEvents();
}

// ---------- Load events ----------
async function loadEvents() {
    const container = $('#eventsGroups');
    container.innerHTML = '<p class="loading-msg">Chargement des événements...</p>';
    try {
        const res = await fetch(EVENTS_URL + '?t=' + Date.now(), { cache: 'no-cache' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        state.events = Array.isArray(data.events) ? data.events : [];
        state.comment = data._comment || null;
        renderEvents();
    } catch (err) {
        console.error(err);
        container.innerHTML = '<p class="empty-msg">Erreur de chargement des événements.</p>';
    }
}

// ---------- Render ----------
function renderEvents() {
    const container = $('#eventsGroups');
    const upcoming = state.events
        .map((ev, i) => ({ ev, i }))
        .filter(x => x.ev.statut === 'upcoming')
        .sort((a, b) => (a.ev.date || '').localeCompare(b.ev.date || ''));
    const past = state.events
        .map((ev, i) => ({ ev, i }))
        .filter(x => x.ev.statut === 'past')
        .sort((a, b) => (b.ev.date || '').localeCompare(a.ev.date || ''));

    $('#eventsCount').textContent =
        `${state.events.length} événement${state.events.length > 1 ? 's' : ''} — ` +
        `${upcoming.length} à venir · ${past.length} passé${past.length > 1 ? 's' : ''}`;

    if (state.events.length === 0) {
        container.innerHTML = '<p class="empty-msg">Aucun événement pour le moment.<br>Cliquez sur « Ajouter un événement » pour commencer.</p>';
        return;
    }

    let html = '';
    if (upcoming.length > 0) {
        html += '<h4 class="group-title">À venir</h4>';
        upcoming.forEach(x => { html += renderCard(x.ev, x.i); });
    }
    if (past.length > 0) {
        html += '<h4 class="group-title">Archives — passés</h4>';
        past.forEach(x => { html += renderCard(x.ev, x.i); });
    }
    container.innerHTML = html;
}

function renderCard(ev, index) {
    const isPast = ev.statut === 'past';
    const d = formatDate(ev.date);
    const tag = escapeHtml(capitalize(ev.type || ''));
    const meta = [];
    if (ev.lieu)  meta.push(escapeHtml(ev.lieu));
    if (ev.heure) meta.push(escapeHtml(ev.heure));

    return `
        <article class="event-card${isPast ? ' past' : ''}">
            <div class="ev-date">
                <span class="ev-day">${escapeHtml(d.day)}</span>
                <span class="ev-month">${escapeHtml(d.month)}</span>
                <span class="ev-year">${escapeHtml(d.year)}</span>
            </div>
            <div class="ev-body">
                ${tag ? `<span class="ev-tag">${tag}</span>` : ''}
                <h3>${escapeHtml(ev.titre || '(sans titre)')}</h3>
                <div class="ev-meta">${meta.join(' · ')}</div>
            </div>
            <div class="ev-actions">
                <button type="button" class="btn btn-ghost btn-sm" data-action="edit" data-index="${index}">Modifier</button>
                ${!isPast ? `<button type="button" class="btn btn-ghost btn-sm" data-action="archive" data-index="${index}">Archiver</button>` : ''}
                <button type="button" class="btn btn-danger btn-sm" data-action="delete" data-index="${index}">Supprimer</button>
            </div>
        </article>
    `;
}

// ---------- Modal (form) ----------
function openModal(index = null) {
    const modal = $('#eventModal');
    const form  = $('#eventForm');
    form.reset();
    $('#eventIndex').value = index === null ? '' : String(index);
    $('#modalTitle').textContent = index === null ? 'Ajouter un événement' : 'Modifier l\'événement';

    if (index !== null && state.events[index]) {
        const ev = state.events[index];
        $('#evTitre').value  = ev.titre  || '';
        $('#evDate').value   = ev.date   || '';
        $('#evHeure').value  = ev.heure  || '';
        $('#evLieu').value   = ev.lieu   || '';
        $('#evType').value   = ev.type   || 'concert';
        $('#evStatut').value = ev.statut || 'upcoming';
        $('#evLien').value   = ev.lien   || '';
    }

    modal.hidden = false;
    setTimeout(() => $('#evTitre').focus(), 50);
}

function closeModal() { $('#eventModal').hidden = true; }

// ---------- Confirm Modal ----------
// Pattern simple : une variable pendingAction stocke la fonction à exécuter
// si l'utilisateur clique sur Confirmer. Rien de plus, rien d'asynchrone.
//   - showConfirm(msg, action) → stocke action et affiche la modale
//   - clic Confirmer            → exécute pendingAction() puis la remet à null
//   - clic Annuler / Escape     → remet pendingAction à null sans l'exécuter
let pendingAction = null;

function showConfirm(message, action) {
    console.log('[admin] showConfirm called — message:', message, 'action typeof:', typeof action);
    pendingAction = action;
    $('#confirmMessage').textContent = message;
    $('#confirmModal').hidden = false;
    console.log('[admin] showConfirm: pendingAction stored, typeof:', typeof pendingAction);
}

// ---------- Save to Netlify Function ----------
async function saveAll() {
    const payload = {
        events: state.events,
        token: state.password || ADMIN_PASSWORD
    };

    // DEBUG : trace la requête envoyée (le token est masqué)
    console.log('[admin] saveAll → POST', SAVE_ENDPOINT, {
        eventsCount: payload.events.length,
        tokenMasked: payload.token ? payload.token.slice(0, 2) + '***' : '(absent)'
    });

    let res, json;
    try {
        res = await fetch(SAVE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        console.log('[admin] saveAll ← response', {
            status: res.status,
            ok: res.ok
        });
    } catch (err) {
        console.error('[admin] saveAll fetch FAILED:', err);
        throw new Error('Réseau : ' + (err.message || 'impossible de joindre le serveur'));
    }

    try {
        json = await res.json();
    } catch (err) {
        console.error('[admin] saveAll response not JSON:', err);
        throw new Error('Réponse invalide du serveur');
    }

    console.log('[admin] saveAll body:', json);

    if (!res.ok || !json.ok) {
        throw new Error(json.error || ('Erreur serveur HTTP ' + res.status));
    }
    return json;
}

// ---------- Actions ----------
async function handleSaveEvent(e) {
    e.preventDefault();
    const indexVal = $('#eventIndex').value;
    const newEv = {
        date:   $('#evDate').value,
        titre:  $('#evTitre').value.trim(),
        lieu:   $('#evLieu').value.trim(),
        heure:  $('#evHeure').value.trim(),
        type:   $('#evType').value,
        lien:   $('#evLien').value.trim(),
        statut: $('#evStatut').value
    };

    if (!newEv.titre || !newEv.date || !newEv.lieu) {
        showToast('Merci de remplir les champs obligatoires.', 'error');
        return;
    }

    const btn = $('#saveEventBtn');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Sauvegarde...';

    // Modification locale optimiste
    const backup = JSON.parse(JSON.stringify(state.events));
    if (indexVal === '') {
        state.events.push(newEv);
    } else {
        state.events[parseInt(indexVal, 10)] = newEv;
    }

    try {
        await saveAll();
        closeModal();
        renderEvents();
        showToast(indexVal === '' ? 'Événement ajouté ✓' : 'Événement modifié ✓');
    } catch (err) {
        state.events = backup;
        showToast('Erreur : ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}

async function handleArchive(index) {
    const backup = JSON.parse(JSON.stringify(state.events));
    state.events[index].statut = 'past';
    try {
        await saveAll();
        renderEvents();
        showToast('Événement archivé ✓');
    } catch (err) {
        state.events = backup;
        showToast('Erreur : ' + err.message, 'error');
    }
}

function handleDelete(index) {
    const ev = state.events[index];
    console.log('[admin] handleDelete start — index:', index, 'titre:', ev && ev.titre);

    showConfirm(`Supprimer définitivement « ${ev.titre || 'cet événement'} » ?`, async () => {
        console.log('[admin] handleDelete action running — index:', index);
        const backup = JSON.parse(JSON.stringify(state.events));
        state.events.splice(index, 1);
        try {
            console.log('[admin] handleDelete → saveAll, remaining:', state.events.length);
            await saveAll();
            renderEvents();
            showToast('Événement supprimé ✓');
            console.log('[admin] handleDelete success');
        } catch (err) {
            console.error('[admin] handleDelete failed, restoring backup:', err);
            state.events = backup;
            showToast('Erreur : ' + err.message, 'error');
        }
    });
}

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {

    // Login form
    $('#loginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const pwd = $('#password').value;
        if (login(pwd)) {
            showDashboard();
        } else {
            $('#loginError').textContent = 'Mot de passe incorrect.';
            $('#password').select();
        }
    });

    // Logout
    $('#logoutBtn').addEventListener('click', logout);

    // Add event
    $('#addEventBtn').addEventListener('click', () => openModal(null));

    // Event form
    $('#eventForm').addEventListener('submit', handleSaveEvent);

    // Boutons fermant la modale d'édition d'événement
    $$('[data-close]').forEach(el => el.addEventListener('click', closeModal));

    // ========== Modale de confirmation — pattern pendingAction ==========
    const confirmOkBtn     = $('#confirmOkBtn');
    const confirmCancelBtn = $('#confirmCancelBtn');
    const confirmModalEl   = $('#confirmModal');
    const confirmBackdrop  = confirmModalEl ? confirmModalEl.querySelector('.modal-backdrop') : null;

    console.log('[admin] init: confirmOkBtn =', confirmOkBtn);
    console.log('[admin] init: confirmCancelBtn =', confirmCancelBtn);

    if (!confirmOkBtn)     console.error('[admin] init: #confirmOkBtn introuvable !');
    if (!confirmCancelBtn) console.error('[admin] init: #confirmCancelBtn introuvable !');

    // Bouton Confirmer : stopPropagation pour empêcher tout re-bubbling, puis
    // exécute pendingAction() si présent.
    if (confirmOkBtn) {
        confirmOkBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('[admin] #confirmOkBtn CLICK — pendingAction typeof:', typeof pendingAction);
            if (pendingAction) {
                console.log('[admin] → exécution de pendingAction');
                const action = pendingAction;
                pendingAction = null;
                try { action(); }
                catch (err) { console.error('[admin] pendingAction threw:', err); }
            } else {
                console.warn('[admin] #confirmOkBtn: aucune pendingAction');
            }
            confirmModalEl.hidden = true;
        });
        console.log('[admin] init: listener attaché sur #confirmOkBtn');
    }

    // Bouton Annuler : stopPropagation + reset pendingAction
    if (confirmCancelBtn) {
        confirmCancelBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            console.log('[admin] #confirmCancelBtn CLICK — cancelling pendingAction');
            pendingAction = null;
            confirmModalEl.hidden = true;
        });
        console.log('[admin] init: listener attaché sur #confirmCancelBtn');
    }

    // Clic sur le backdrop = annulation (avec stopPropagation)
    if (confirmBackdrop) {
        confirmBackdrop.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log('[admin] confirm backdrop CLICK — cancelling pendingAction');
            pendingAction = null;
            confirmModalEl.hidden = true;
        });
    }

    // Escape = annulation
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (!$('#eventModal').hidden) closeModal();
        if (confirmModalEl && !confirmModalEl.hidden) {
            console.log('[admin] Escape on confirm modal — cancelling pendingAction');
            pendingAction = null;
            confirmModalEl.hidden = true;
        }
    });

    // Delegation : boutons sur les cartes événements
    console.log('[admin] eventsGroups element:', $('#eventsGroups'));
    $('#eventsGroups').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        const index = parseInt(btn.dataset.index, 10);
        if (Number.isNaN(index)) return;
        if (action === 'edit')    openModal(index);
        if (action === 'archive') handleArchive(index);
        if (action === 'delete')  handleDelete(index);
    });

    // Bootstrap
    if (isLoggedIn()) showDashboard();
    else showLogin();
});
