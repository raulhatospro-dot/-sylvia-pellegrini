/* ============================================================================
   SAVE-EVENTS — Netlify Function
   ============================================================================
   Écrit le fichier events.json directement dans le repo GitHub via l'API
   Contents de GitHub. Appelé depuis l'interface admin (sp-gestion-7x4k).

   VARIABLES D'ENVIRONNEMENT À CONFIGURER SUR NETLIFY
   --------------------------------------------------
   Dans Netlify : Site settings → Environment variables → Add a variable

     GITHUB_TOKEN     Personal Access Token GitHub avec le scope "Contents:
                      Read and write" sur le repo. Créer un token :
                      https://github.com/settings/tokens?type=beta
                      (Fine-grained personal access token, restreint au repo)

     GITHUB_OWNER     Le propriétaire du repo (ex : "raulhatospro-dot")

     GITHUB_REPO      Le nom du repo (ex : "-sylvia-pellegrini")

     ADMIN_PASSWORD   (optionnel) Mot de passe admin côté serveur. Si non
                      défini, la valeur par défaut "sylvia2024" est utilisée.
                      FORTEMENT recommandé de le définir sur Netlify et de
                      mettre à jour la constante ADMIN_PASSWORD dans admin.js
                      pour qu'elles correspondent.

   La Function est automatiquement disponible à l'URL :
     /.netlify/functions/save-events
   ============================================================================ */

// Mot de passe par défaut si la variable d'env ADMIN_PASSWORD n'est pas définie
const DEFAULT_ADMIN_PASSWORD = 'sylvia2024';

// Chemin du fichier events.json dans le repo GitHub
const EVENTS_FILE_PATH = 'events.json';

// Nom de la branche cible
const GITHUB_BRANCH = 'main';

const jsonHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

const respond = (statusCode, body) => ({
    statusCode,
    headers: jsonHeaders,
    body: JSON.stringify(body)
});

exports.handler = async (event) => {
    // Preflight CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: jsonHeaders, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return respond(405, { ok: false, error: 'Méthode non autorisée' });
    }

    // --- Parse JSON body ---
    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch (err) {
        return respond(400, { ok: false, error: 'JSON invalide' });
    }

    // --- Auth ---
    const expectedPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
    if (!payload.password || payload.password !== expectedPassword) {
        return respond(401, { ok: false, error: 'Mot de passe invalide' });
    }

    // --- Validation des données ---
    if (!payload.data || typeof payload.data !== 'object') {
        return respond(400, { ok: false, error: 'Données manquantes' });
    }
    if (!Array.isArray(payload.data.events)) {
        return respond(400, { ok: false, error: 'Liste d\'événements invalide' });
    }

    // Nettoyage minimal et validation de chaque événement
    const allowedStatuts = ['upcoming', 'past'];
    const cleanEvents = [];
    for (const ev of payload.data.events) {
        if (!ev || typeof ev !== 'object') continue;
        const date   = String(ev.date   || '').trim();
        const titre  = String(ev.titre  || '').trim();
        const lieu   = String(ev.lieu   || '').trim();
        const heure  = String(ev.heure  || '').trim();
        const type   = String(ev.type   || '').trim();
        const lien   = String(ev.lien   || '').trim();
        let statut   = String(ev.statut || 'upcoming').trim();
        if (!titre || !date) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (!allowedStatuts.includes(statut)) statut = 'upcoming';
        cleanEvents.push({ date, titre, lieu, heure, type, lien, statut });
    }

    const cleanData = {
        _comment: typeof payload.data._comment === 'string' ? payload.data._comment : '',
        events: cleanEvents
    };

    // --- Variables d'environnement GitHub ---
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo  = process.env.GITHUB_REPO;

    if (!token || !owner || !repo) {
        return respond(500, {
            ok: false,
            error: 'Variables GitHub manquantes sur Netlify (GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO)'
        });
    }

    const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/${EVENTS_FILE_PATH}`;
    const ghHeaders = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'sylvia-pellegrini-admin',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    try {
        // 1) Récupérer la version courante pour obtenir le SHA
        const getRes = await fetch(`${apiBase}?ref=${GITHUB_BRANCH}`, { headers: ghHeaders });

        let currentSha = null;
        if (getRes.status === 200) {
            const current = await getRes.json();
            currentSha = current.sha || null;
        } else if (getRes.status !== 404) {
            const err = await getRes.json().catch(() => ({}));
            return respond(getRes.status, {
                ok: false,
                error: `GitHub GET: ${err.message || getRes.status}`
            });
        }
        // Si 404 : le fichier n'existe pas encore, on le crée sans SHA

        // 2) Encoder le nouveau contenu en base64 (API GitHub)
        const newContent = JSON.stringify(cleanData, null, 4) + '\n';
        const contentB64 = Buffer.from(newContent, 'utf-8').toString('base64');

        // 3) PUT pour créer ou mettre à jour le fichier
        const body = {
            message: `Mise à jour events.json via admin (${cleanEvents.length} événements)`,
            content: contentB64,
            branch: GITHUB_BRANCH,
            committer: {
                name: 'Admin Sylvia Pellegrini',
                email: 'admin@sylvia-pellegrini.local'
            }
        };
        if (currentSha) body.sha = currentSha;

        const putRes = await fetch(apiBase, {
            method: 'PUT',
            headers: { ...ghHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        if (!putRes.ok) {
            const err = await putRes.json().catch(() => ({}));
            return respond(putRes.status, {
                ok: false,
                error: `GitHub PUT: ${err.message || putRes.status}`
            });
        }

        const result = await putRes.json();
        return respond(200, {
            ok: true,
            count: cleanEvents.length,
            commit: result.commit ? result.commit.sha : null
        });

    } catch (err) {
        return respond(500, { ok: false, error: err.message || 'Erreur réseau' });
    }
};
