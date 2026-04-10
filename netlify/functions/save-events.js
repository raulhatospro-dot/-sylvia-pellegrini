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

   La Function est disponible à :
     POST /.netlify/functions/save-events   → sauvegarde les événements
     GET  /.netlify/functions/save-events   → mode diagnostic (vérifie env + token)

   MODE DIAGNOSTIC
   ---------------
   Appeler la function en GET (simple visite URL dans le navigateur) pour
   obtenir un rapport complet :
     - Présence des variables d'environnement
     - Validité du token GitHub (/user → whoami)
     - Accès au repo (/repos/{owner}/{repo})
     - Lecture du fichier events.json (/contents/events.json)
   Aucun secret n'est jamais retourné, uniquement des indicateurs (ok/ko).

   LOGS
   ----
   Tous les logs apparaissent dans Netlify → Functions → save-events → Logs.
   Chaque requête reçoit un req_id unique pour tracer l'exécution bout en bout.
   ============================================================================ */

const DEFAULT_ADMIN_PASSWORD = 'sylvia2024';
const EVENTS_FILE_PATH = 'events.json';
const GITHUB_BRANCH = 'main';

const jsonHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

// ---------- Helpers de log ----------
function makeReqId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
}

function log(reqId, step, data = {}) {
    // Ne jamais logguer les valeurs brutes des secrets
    const safe = { ...data };
    if ('token' in safe)    safe.token    = maskSecret(safe.token);
    if ('password' in safe) safe.password = '***';
    console.log(`[save-events][${reqId}] ${step}`, JSON.stringify(safe));
}

function logError(reqId, step, err) {
    console.error(`[save-events][${reqId}] ERROR ${step}:`, err && err.message ? err.message : err);
    if (err && err.stack) console.error(err.stack);
}

// Masque un secret en ne gardant que quelques caractères pour le diagnostic
function maskSecret(value) {
    if (!value || typeof value !== 'string') return '(absent)';
    if (value.length <= 8) return '***(len=' + value.length + ')';
    return value.slice(0, 4) + '...' + value.slice(-2) + '(len=' + value.length + ')';
}

function respond(reqId, statusCode, body) {
    log(reqId, 'response', { statusCode, ok: body.ok === true });
    return {
        statusCode,
        headers: jsonHeaders,
        body: JSON.stringify(body)
    };
}

// ---------- Handler ----------
exports.handler = async (event) => {
    const reqId = makeReqId();
    const startTime = Date.now();

    log(reqId, 'request.received', {
        method: event.httpMethod,
        path: event.path,
        bodyLength: event.body ? event.body.length : 0,
        userAgent: event.headers && event.headers['user-agent']
    });

    // Preflight CORS
    if (event.httpMethod === 'OPTIONS') {
        log(reqId, 'cors.preflight');
        return { statusCode: 204, headers: jsonHeaders, body: '' };
    }

    // ---------- Mode DIAGNOSTIC (GET) ----------
    if (event.httpMethod === 'GET') {
        log(reqId, 'diagnostic.start');
        const diagnostic = await runDiagnostic(reqId);
        log(reqId, 'diagnostic.done', {
            duration_ms: Date.now() - startTime,
            all_ok: diagnostic.all_ok
        });
        return respond(reqId, diagnostic.all_ok ? 200 : 500, diagnostic);
    }

    if (event.httpMethod !== 'POST') {
        log(reqId, 'method.rejected', { method: event.httpMethod });
        return respond(reqId, 405, { ok: false, error: 'Méthode non autorisée' });
    }

    // ---------- Parse JSON body ----------
    let payload;
    try {
        payload = JSON.parse(event.body || '{}');
    } catch (err) {
        logError(reqId, 'body.parse', err);
        return respond(reqId, 400, { ok: false, error: 'JSON invalide' });
    }

    // ---------- Extraction tolérante du format ----------
    // Accepte deux formats :
    //   Nouveau : { events: [...], token: "..." }
    //   Ancien  : { password: "...", data: { events: [...], _comment: "..." } }
    const receivedToken = payload.token || payload.password || null;
    const receivedEvents = Array.isArray(payload.events)
        ? payload.events
        : (payload.data && Array.isArray(payload.data.events) ? payload.data.events : null);
    const receivedComment = (payload.data && typeof payload.data._comment === 'string')
        ? payload.data._comment
        : null;

    log(reqId, 'body.parsed', {
        hasToken: !!receivedToken,
        hasEvents: receivedEvents !== null,
        eventsCount: receivedEvents ? receivedEvents.length : 0,
        format: payload.token !== undefined ? 'new' : (payload.password !== undefined ? 'legacy' : 'unknown')
    });

    // ---------- Auth ----------
    const expectedPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
    const usingDefaultPassword = !process.env.ADMIN_PASSWORD;
    log(reqId, 'auth.check', {
        received: !!receivedToken,
        passwordSource: usingDefaultPassword ? 'default (fallback)' : 'env:ADMIN_PASSWORD'
    });
    if (!receivedToken || receivedToken !== expectedPassword) {
        log(reqId, 'auth.failed');
        return respond(reqId, 401, { ok: false, error: 'Mot de passe invalide' });
    }
    log(reqId, 'auth.ok');

    // ---------- Validation des données ----------
    if (receivedEvents === null) {
        log(reqId, 'data.events.invalid');
        return respond(reqId, 400, { ok: false, error: 'Liste d\'événements manquante ou invalide' });
    }

    // Nettoyage et validation de chaque événement
    const allowedStatuts = ['upcoming', 'past'];
    const cleanEvents = [];
    let skipped = 0;
    for (const ev of receivedEvents) {
        if (!ev || typeof ev !== 'object') { skipped++; continue; }
        const date   = String(ev.date   || '').trim();
        const titre  = String(ev.titre  || '').trim();
        const lieu   = String(ev.lieu   || '').trim();
        const heure  = String(ev.heure  || '').trim();
        const type   = String(ev.type   || '').trim();
        const lien   = String(ev.lien   || '').trim();
        let statut   = String(ev.statut || 'upcoming').trim();
        if (!titre || !date) { skipped++; continue; }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
        if (!allowedStatuts.includes(statut)) statut = 'upcoming';
        cleanEvents.push({ date, titre, lieu, heure, type, lien, statut });
    }
    log(reqId, 'data.validated', { kept: cleanEvents.length, skipped });

    // _comment : sera soit celui du payload, soit récupéré depuis le fichier
    // existant (pour ne jamais perdre les instructions destinées à Sylvia)
    let preservedComment = receivedComment !== null ? receivedComment : '';

    // ---------- Variables d'environnement GitHub ----------
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo  = process.env.GITHUB_REPO;

    log(reqId, 'env.check', {
        GITHUB_TOKEN: token ? maskSecret(token) : '(MANQUANT)',
        GITHUB_OWNER: owner || '(MANQUANT)',
        GITHUB_REPO:  repo  || '(MANQUANT)',
        ADMIN_PASSWORD_set: !!process.env.ADMIN_PASSWORD
    });

    if (!token || !owner || !repo) {
        const missing = [];
        if (!token) missing.push('GITHUB_TOKEN');
        if (!owner) missing.push('GITHUB_OWNER');
        if (!repo)  missing.push('GITHUB_REPO');
        log(reqId, 'env.missing', { missing });
        return respond(reqId, 500, {
            ok: false,
            error: 'Variables GitHub manquantes sur Netlify : ' + missing.join(', ')
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
        // 1) GET pour récupérer le SHA actuel
        const getUrl = `${apiBase}?ref=${GITHUB_BRANCH}`;
        log(reqId, 'github.get.start', { url: getUrl });
        const getRes = await fetch(getUrl, { headers: ghHeaders });
        log(reqId, 'github.get.response', {
            status: getRes.status,
            rateLimit: getRes.headers.get('x-ratelimit-remaining'),
            rateLimitReset: getRes.headers.get('x-ratelimit-reset')
        });

        let currentSha = null;
        if (getRes.status === 200) {
            const current = await getRes.json();
            currentSha = current.sha || null;
            log(reqId, 'github.get.sha', { sha: currentSha ? currentSha.slice(0, 7) : null });

            // Si le payload n'a pas fourni de _comment, on extrait celui du
            // fichier actuel pour le préserver
            if (receivedComment === null && current.content) {
                try {
                    const decoded = Buffer.from(current.content, 'base64').toString('utf-8');
                    const parsed = JSON.parse(decoded);
                    if (typeof parsed._comment === 'string') {
                        preservedComment = parsed._comment;
                        log(reqId, 'comment.preserved', { length: preservedComment.length });
                    }
                } catch (e) {
                    log(reqId, 'comment.decode_failed', { reason: e.message });
                }
            }
        } else if (getRes.status === 404) {
            log(reqId, 'github.get.not_found', { info: 'Fichier absent, sera créé' });
        } else {
            const err = await getRes.json().catch(() => ({}));
            logError(reqId, 'github.get.failed', { status: getRes.status, message: err.message });
            return respond(reqId, getRes.status, {
                ok: false,
                error: `GitHub GET ${getRes.status}: ${err.message || 'erreur inconnue'}`,
                github_status: getRes.status,
                github_docs: err.documentation_url || null
            });
        }

        // 2) Construire le nouveau contenu (en préservant le _comment)
        const cleanData = {
            _comment: preservedComment,
            events: cleanEvents
        };
        const newContent = JSON.stringify(cleanData, null, 4) + '\n';
        const contentB64 = Buffer.from(newContent, 'utf-8').toString('base64');
        log(reqId, 'content.encoded', { rawBytes: newContent.length, base64Chars: contentB64.length });

        // 3) PUT pour écrire
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

        log(reqId, 'github.put.start', {
            url: apiBase,
            hasSha: !!currentSha,
            commitMessage: body.message
        });
        const putRes = await fetch(apiBase, {
            method: 'PUT',
            headers: { ...ghHeaders, 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        log(reqId, 'github.put.response', {
            status: putRes.status,
            rateLimit: putRes.headers.get('x-ratelimit-remaining')
        });

        if (!putRes.ok) {
            const err = await putRes.json().catch(() => ({}));
            logError(reqId, 'github.put.failed', {
                status: putRes.status,
                message: err.message,
                errors: err.errors
            });
            return respond(reqId, putRes.status, {
                ok: false,
                error: `GitHub PUT ${putRes.status}: ${err.message || 'erreur inconnue'}`,
                github_status: putRes.status,
                github_errors: err.errors || null,
                github_docs: err.documentation_url || null
            });
        }

        const result = await putRes.json();
        const commitSha = result.commit && result.commit.sha ? result.commit.sha : null;
        log(reqId, 'save.success', {
            count: cleanEvents.length,
            commit: commitSha ? commitSha.slice(0, 7) : null,
            duration_ms: Date.now() - startTime
        });
        return respond(reqId, 200, {
            ok: true,
            count: cleanEvents.length,
            commit: commitSha
        });

    } catch (err) {
        logError(reqId, 'unexpected', err);
        return respond(reqId, 500, {
            ok: false,
            error: err.message || 'Erreur réseau',
            type: err.name || 'Error'
        });
    }
};

/* ============================================================================
   runDiagnostic — Teste la configuration sans rien écrire
   ============================================================================
   Vérifie :
     1. Présence de GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, ADMIN_PASSWORD
     2. Validité du token via /user (whoami GitHub)
     3. Accès au repo via /repos/{owner}/{repo}
     4. Lecture du fichier events.json via /contents/events.json

   Aucun secret n'est retourné. Seules des méta-infos safe sont renvoyées.
   ============================================================================ */
async function runDiagnostic(reqId) {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo  = process.env.GITHUB_REPO;
    const hasPassword = !!process.env.ADMIN_PASSWORD;

    const result = {
        ok: true,
        all_ok: true,
        timestamp: new Date().toISOString(),
        env: {
            GITHUB_TOKEN: token ? {
                present: true,
                masked: maskSecret(token),
                kind: detectTokenKind(token)
            } : { present: false },
            GITHUB_OWNER: owner || null,
            GITHUB_REPO:  repo  || null,
            ADMIN_PASSWORD: {
                present: hasPassword,
                using_fallback: !hasPassword
            }
        },
        checks: {}
    };

    // Check 1 : env vars
    if (!token || !owner || !repo) {
        result.checks.env_vars = {
            ok: false,
            error: 'Variables d\'environnement manquantes'
        };
        result.all_ok = false;
        log(reqId, 'diag.env.missing', { token: !!token, owner: !!owner, repo: !!repo });
        return result;
    }
    result.checks.env_vars = { ok: true };
    log(reqId, 'diag.env.ok');

    const ghHeaders = {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'sylvia-pellegrini-admin-diag',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    // Check 2 : token valide → /user
    try {
        log(reqId, 'diag.user.start');
        const userRes = await fetch('https://api.github.com/user', { headers: ghHeaders });
        const userJson = await userRes.json().catch(() => ({}));
        if (userRes.ok) {
            result.checks.token_valid = {
                ok: true,
                authenticated_as: userJson.login || null,
                account_type: userJson.type || null
            };
            log(reqId, 'diag.user.ok', { login: userJson.login });
        } else {
            result.checks.token_valid = {
                ok: false,
                status: userRes.status,
                error: userJson.message || 'Token invalide'
            };
            result.all_ok = false;
            log(reqId, 'diag.user.failed', { status: userRes.status });
        }
    } catch (err) {
        result.checks.token_valid = { ok: false, error: err.message };
        result.all_ok = false;
        logError(reqId, 'diag.user', err);
    }

    // Check 3 : accès au repo → /repos/{owner}/{repo}
    try {
        log(reqId, 'diag.repo.start');
        const repoRes = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers: ghHeaders });
        const repoJson = await repoRes.json().catch(() => ({}));
        if (repoRes.ok) {
            result.checks.repo_access = {
                ok: true,
                full_name: repoJson.full_name,
                private: repoJson.private,
                default_branch: repoJson.default_branch,
                permissions: repoJson.permissions || null
            };
            log(reqId, 'diag.repo.ok', {
                full_name: repoJson.full_name,
                can_push: repoJson.permissions && repoJson.permissions.push
            });
        } else {
            result.checks.repo_access = {
                ok: false,
                status: repoRes.status,
                error: repoJson.message || 'Accès refusé'
            };
            result.all_ok = false;
            log(reqId, 'diag.repo.failed', { status: repoRes.status, message: repoJson.message });
        }
    } catch (err) {
        result.checks.repo_access = { ok: false, error: err.message };
        result.all_ok = false;
        logError(reqId, 'diag.repo', err);
    }

    // Check 4 : lecture de events.json
    try {
        log(reqId, 'diag.file.start');
        const fileRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${EVENTS_FILE_PATH}?ref=${GITHUB_BRANCH}`,
            { headers: ghHeaders }
        );
        if (fileRes.ok) {
            const fileJson = await fileRes.json();
            result.checks.events_file = {
                ok: true,
                path: fileJson.path,
                size_bytes: fileJson.size,
                sha: fileJson.sha ? fileJson.sha.slice(0, 7) : null
            };
            log(reqId, 'diag.file.ok', { size: fileJson.size });
        } else if (fileRes.status === 404) {
            result.checks.events_file = {
                ok: true,
                note: 'Fichier absent — sera créé lors de la première sauvegarde'
            };
            log(reqId, 'diag.file.not_found');
        } else {
            const errJson = await fileRes.json().catch(() => ({}));
            result.checks.events_file = {
                ok: false,
                status: fileRes.status,
                error: errJson.message || 'Lecture impossible'
            };
            result.all_ok = false;
            log(reqId, 'diag.file.failed', { status: fileRes.status });
        }
    } catch (err) {
        result.checks.events_file = { ok: false, error: err.message };
        result.all_ok = false;
        logError(reqId, 'diag.file', err);
    }

    return result;
}

// Détecte grossièrement le type de token GitHub à partir de son préfixe
function detectTokenKind(token) {
    if (!token) return 'unknown';
    if (token.startsWith('ghp_'))    return 'classic personal access token';
    if (token.startsWith('github_pat_')) return 'fine-grained personal access token';
    if (token.startsWith('ghs_'))    return 'server-to-server (app)';
    if (token.startsWith('gho_'))    return 'oauth';
    if (token.startsWith('ghu_'))    return 'user-to-server';
    return 'unknown format';
}
