<?php
/**
 * SYLVIA PELLEGRINI — Sauvegarde des événements
 * ---------------------------------------------
 * Reçoit un payload JSON { token, data } et écrit dans events.json.
 * Le token doit correspondre à celui défini dans admin.js.
 */

// Vérification que PHP fonctionne — si vous voyez ce commentaire dans le
// navigateur au lieu d'une réponse JSON, c'est que PHP n'est pas actif sur
// le serveur. Dans ce cas, installez PHP :
//   sudo apt install php libapache2-mod-php
//   sudo systemctl restart apache2

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// Jeton partagé avec admin.js — doit être identique à la constante ADMIN_TOKEN
const ADMIN_TOKEN = 'sp-admin-7x4k-2024';

// Chemin vers le fichier events.json (dossier parent)
$eventsFile = realpath(__DIR__ . '/..') . '/events.json';

function respond($ok, $data = [], $httpCode = 200) {
    http_response_code($httpCode);
    echo json_encode(array_merge(['ok' => $ok], $data), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// --- Méthode ---
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(false, ['error' => 'Méthode non autorisée'], 405);
}

// --- Lecture du body JSON ---
$raw = file_get_contents('php://input');
if (!$raw) {
    respond(false, ['error' => 'Corps de requête vide'], 400);
}

$payload = json_decode($raw, true);
if (!is_array($payload)) {
    respond(false, ['error' => 'JSON invalide'], 400);
}

// --- Auth ---
$token = isset($payload['token']) ? (string) $payload['token'] : '';
if (!hash_equals(ADMIN_TOKEN, $token)) {
    respond(false, ['error' => 'Jeton invalide'], 401);
}

// --- Validation structure ---
if (!isset($payload['data']) || !is_array($payload['data'])) {
    respond(false, ['error' => 'Données manquantes'], 400);
}
$data = $payload['data'];

if (!isset($data['events']) || !is_array($data['events'])) {
    respond(false, ['error' => 'Liste d\'événements invalide'], 400);
}

// --- Validation de chaque événement ---
$allowedStatuts = ['upcoming', 'past'];
$clean = ['_comment' => isset($data['_comment']) ? (string) $data['_comment'] : '', 'events' => []];

foreach ($data['events'] as $ev) {
    if (!is_array($ev)) continue;
    $date   = isset($ev['date'])   ? trim((string) $ev['date'])   : '';
    $titre  = isset($ev['titre'])  ? trim((string) $ev['titre'])  : '';
    $lieu   = isset($ev['lieu'])   ? trim((string) $ev['lieu'])   : '';
    $heure  = isset($ev['heure'])  ? trim((string) $ev['heure'])  : '';
    $type   = isset($ev['type'])   ? trim((string) $ev['type'])   : '';
    $lien   = isset($ev['lien'])   ? trim((string) $ev['lien'])   : '';
    $statut = isset($ev['statut']) ? trim((string) $ev['statut']) : 'upcoming';

    if ($titre === '' || $date === '') continue;
    if (!in_array($statut, $allowedStatuts, true)) $statut = 'upcoming';
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date))  continue;

    $clean['events'][] = [
        'date'   => $date,
        'titre'  => $titre,
        'lieu'   => $lieu,
        'heure'  => $heure,
        'type'   => $type,
        'lien'   => $lien,
        'statut' => $statut,
    ];
}

// --- Vérification fichier ---
if (!$eventsFile) {
    respond(false, ['error' => 'Fichier events.json introuvable'], 500);
}
if (file_exists($eventsFile) && !is_writable($eventsFile)) {
    respond(false, ['error' => 'Fichier events.json non accessible en écriture (chmod/chown www-data requis)'], 500);
}

// --- Backup avant écriture ---
if (file_exists($eventsFile)) {
    @copy($eventsFile, $eventsFile . '.bak');
}

// --- Écriture atomique ---
$json = json_encode($clean, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
if ($json === false) {
    respond(false, ['error' => 'Encodage JSON échoué'], 500);
}

$tmp = $eventsFile . '.tmp';
if (file_put_contents($tmp, $json, LOCK_EX) === false) {
    respond(false, ['error' => 'Écriture impossible (permissions ?)'], 500);
}
if (!rename($tmp, $eventsFile)) {
    @unlink($tmp);
    respond(false, ['error' => 'Impossible de finaliser l\'écriture'], 500);
}

respond(true, ['count' => count($clean['events'])]);
