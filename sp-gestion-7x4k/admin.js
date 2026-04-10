/* ============================================
   SYLVIA PELLEGRINI — Admin
   ============================================ */

// Mot de passe d'accès (modifiable facilement)
const ADMIN_PASSWORD = 'sylvia2024';

// Clé de session partagée avec save.php pour empêcher les POST non autorisés
const ADMIN_TOKEN = 'sp-admin-7x4k-2024';

// Endpoint de sauvegarde côté serveur
const SAVE_ENDPOINT = 'save.php';

// Chemin vers le JSON des événements (servi par Apache)
const EVENTS_URL = '../events.json';

const LS_KEY = 'sp_admin_session';

const MONTHS_FR = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
];

let state = {
    events: [],
    comment: null // préserve le _comment du JSON
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
    showToast._t = setTimeout(() => { toast.hidden = true; }, 4000);
}

// ---------- Auth ----------
function isLoggedIn() {
    try { return localStorage.getItem(LS_KEY) === ADMIN_TOKEN; }
    catch (e) { return false; }
}

function login(password) {
    if (password !== ADMIN_PASSWORD) return false;
    try { localStorage.setItem(LS_KEY, ADMIN_TOKEN); } catch (e) {}
    return true;
}

function logout() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
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
let confirmCallback = null;
function openConfirm(message, callback) {
    $('#confirmMessage').textContent = message;
    confirmCallback = callback;
    $('#confirmModal').hidden = false;
}
function closeConfirm() {
    $('#confirmModal').hidden = true;
    confirmCallback = null;
}

// ---------- Save to server ----------
async function saveAll() {
    const payload = {
        token: ADMIN_TOKEN,
        data: {
            _comment: state.comment || '',
            events: state.events
        }
    };
    const res = await fetch(SAVE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({ ok: false, error: 'Réponse invalide' }));
    if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Erreur serveur');
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

async function handleDelete(index) {
    const ev = state.events[index];
    openConfirm(`Supprimer définitivement « ${ev.titre || 'cet événement'} » ?`, async () => {
        const backup = JSON.parse(JSON.stringify(state.events));
        state.events.splice(index, 1);
        try {
            await saveAll();
            renderEvents();
            showToast('Événement supprimé ✓');
        } catch (err) {
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

    // Modal close buttons
    $$('[data-close]').forEach(el => el.addEventListener('click', closeModal));
    $$('[data-close-confirm]').forEach(el => el.addEventListener('click', closeConfirm));

    // Confirm OK
    $('#confirmOkBtn').addEventListener('click', () => {
        const cb = confirmCallback;
        closeConfirm();
        if (typeof cb === 'function') cb();
    });

    // Escape closes modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (!$('#eventModal').hidden) closeModal();
            if (!$('#confirmModal').hidden) closeConfirm();
        }
    });

    // Delegation : boutons sur les cartes événements
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
