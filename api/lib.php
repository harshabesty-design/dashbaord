<?php
// Shared helpers: database, JSON responses, secrets, lead/message ingestion.
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');

const COLLECTIONS = ['settings', 'leads', 'messages', 'patients', 'appointments', 'followups', 'doctors',
    'departments', 'staff', 'beds', 'admissions', 'invoices', 'campaigns'];

function out(array $data, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => true] + $data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function fail(string $msg, int $code = 400): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode(['ok' => false, 'error' => $msg]);
    exit;
}

function cfg(): array
{
    static $c = null;
    if ($c === null) {
        $f = __DIR__ . '/config.php';
        if (!is_file($f)) {
            fail('Backend not configured. Copy api/config.sample.php to api/config.php and enter your database details.', 503);
        }
        $c = require $f;
    }
    return $c;
}

function db(): PDO
{
    static $p = null;
    if ($p === null) {
        $c = cfg();
        try {
            $dsn = $c['dsn'] ?? "mysql:host={$c['db_host']};dbname={$c['db_name']};charset=utf8mb4";
            $p = new PDO($dsn, $c['db_user'] ?? null, $c['db_pass'] ?? null, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            ]);
            $p->exec('CREATE TABLE IF NOT EXISTS records (col VARCHAR(40) NOT NULL, id VARCHAR(80) NOT NULL, data LONGTEXT NOT NULL, updated_at BIGINT NOT NULL, deleted SMALLINT NOT NULL DEFAULT 0, PRIMARY KEY (col, id))');
            $p->exec('CREATE TABLE IF NOT EXISTS users (id VARCHAR(40) NOT NULL PRIMARY KEY, username VARCHAR(60) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL, role VARCHAR(30) NOT NULL, pass VARCHAR(255) NOT NULL, active SMALLINT NOT NULL DEFAULT 1)');
            $p->exec('CREATE TABLE IF NOT EXISTS secrets (k VARCHAR(80) NOT NULL PRIMARY KEY, v TEXT)');
        } catch (PDOException $e) {
            error_log('HMS DB error: ' . $e->getMessage());
            fail('Database connection failed. Check api/config.php.', 503);
        }
    }
    return $p;
}

function now_ms(): int
{
    return (int) round(microtime(true) * 1000);
}

function iso_now(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

function clean_id(string $s): string
{
    return substr(preg_replace('/[^A-Za-z0-9_\-]/', '_', $s), 0, 80);
}

function new_id(): string
{
    return bin2hex(random_bytes(8));
}

/* ---------- secrets (integration keys, never sent to the browser in full) ---------- */

function secret(string $k): string
{
    $s = db()->prepare('SELECT v FROM secrets WHERE k = ?');
    $s->execute([$k]);
    $v = $s->fetchColumn();
    return $v === false ? '' : (string) $v;
}

function set_secret(string $k, string $v): void
{
    db()->prepare('REPLACE INTO secrets (k, v) VALUES (?, ?)')->execute([$k, $v]);
}

/** Returns a secret, generating a random one the first time it is needed. */
function auto_secret(string $k): string
{
    $v = secret($k);
    if ($v === '') {
        $v = bin2hex(random_bytes(16));
        set_secret($k, $v);
    }
    return $v;
}

/* ---------- records ---------- */

function rec_get(string $col, string $id): ?array
{
    $s = db()->prepare('SELECT data FROM records WHERE col = ? AND id = ? AND deleted = 0');
    $s->execute([$col, $id]);
    $d = $s->fetchColumn();
    return $d === false ? null : json_decode((string) $d, true);
}

function rec_exists(string $col, string $id): bool
{
    $s = db()->prepare('SELECT 1 FROM records WHERE col = ? AND id = ?');
    $s->execute([$col, $id]);
    return (bool) $s->fetchColumn();
}

function rec_save(string $col, array $doc): void
{
    db()->prepare('REPLACE INTO records (col, id, data, updated_at, deleted) VALUES (?, ?, ?, ?, 0)')
        ->execute([$col, $doc['id'], json_encode($doc, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), now_ms()]);
}

/* ---------- HTTP ---------- */

function http_json(string $url, ?array $post = null, array $headers = []): ?array
{
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15, CURLOPT_CONNECTTIMEOUT => 8]);
    if ($post !== null) {
        $headers[] = 'Content-Type: application/json';
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($post));
    }
    if ($headers) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    }
    $res = curl_exec($ch);
    curl_close($ch);
    if ($res === false) {
        return null;
    }
    $j = json_decode((string) $res, true);
    return is_array($j) ? $j : null;
}

function graph(string $path, array $params = []): ?array
{
    $params['access_token'] = secret('meta_page_token');
    return http_json('https://graph.facebook.com/v21.0/' . ltrim($path, '/') . '?' . http_build_query($params));
}

/* ---------- lead + inbox ingestion (used by webhooks) ---------- */

function phone10(string $s): string
{
    return substr(preg_replace('/\D/', '', $s), -10);
}

/** Finds a recent lead from the same phone number or the same social account. */
function find_lead(string $phone, string $extId): ?array
{
    $cut = now_ms() - 30 * 86400 * 1000;
    $s = db()->prepare("SELECT data FROM records WHERE col = 'leads' AND deleted = 0 AND updated_at > ? ORDER BY updated_at DESC LIMIT 3000");
    $s->execute([$cut]);
    $p = $phone !== '' ? phone10($phone) : '';
    while (($row = $s->fetchColumn()) !== false) {
        $d = json_decode((string) $row, true);
        if (!is_array($d)) {
            continue;
        }
        if ($p !== '' && strlen($p) >= 8 && phone10((string) ($d['phone'] ?? '')) === $p) {
            return $d;
        }
        if ($extId !== '' && ($d['extId'] ?? '') === $extId) {
            return $d;
        }
    }
    return null;
}

/**
 * Creates (or refreshes) a lead. Returns the lead id.
 * $f: name, phone, source, campaign, extId, text, id (optional fixed id), email
 */
function upsert_lead(array $f): string
{
    $phone = (string) ($f['phone'] ?? '');
    $extId = (string) ($f['extId'] ?? '');
    $text = trim((string) ($f['text'] ?? ''));
    $lead = !empty($f['id']) ? rec_get('leads', $f['id']) : null;
    if (!$lead) {
        $lead = find_lead($phone, $extId);
    }
    if ($lead) {
        if ($text !== '') {
            $lead['lastMessage'] = mb_substr($text, 0, 500);
        }
        if (($lead['phone'] ?? '') === '' && $phone !== '') {
            $lead['phone'] = $phone;
        }
        $lead['lastActivityAt'] = iso_now();
        $lead['updatedAt'] = iso_now();
        rec_save('leads', $lead);
        return $lead['id'];
    }
    $lead = [
        'id' => !empty($f['id']) ? $f['id'] : new_id(),
        'name' => trim((string) ($f['name'] ?? '')) ?: 'Unknown',
        'phone' => $phone,
        'email' => (string) ($f['email'] ?? ''),
        'source' => (string) ($f['source'] ?? 'Other'),
        'campaign' => (string) ($f['campaign'] ?? ''),
        'status' => 'New',
        'notes' => '',
        'lastMessage' => mb_substr($text, 0, 500),
        'extId' => $extId,
        'auto' => true,
        'createdAt' => iso_now(),
        'updatedAt' => iso_now(),
    ];
    rec_save('leads', $lead);
    return $lead['id'];
}

/** Stores a comment / message in the inbox and makes sure a lead exists for the sender. */
function ingest(string $platform, string $kind, string $name, string $extId, string $phone, string $text, string $msgId, string $ref = ''): void
{
    $id = clean_id($platform . '_' . $msgId);
    if ($msgId === '' || rec_exists('messages', $id)) {
        return; // already processed (webhooks are retried)
    }
    $sources = [
        'facebook_comment' => 'Facebook comment', 'facebook_message' => 'Facebook message',
        'instagram_comment' => 'Instagram comment', 'instagram_message' => 'Instagram message',
        'whatsapp_message' => 'WhatsApp', 'youtube_comment' => 'YouTube comment',
    ];
    $leadId = upsert_lead([
        'name' => $name, 'phone' => $phone, 'text' => $text,
        'extId' => $extId !== '' ? $platform . ':' . $extId : '',
        'source' => $sources[$platform . '_' . $kind] ?? 'Other',
    ]);
    rec_save('messages', [
        'id' => $id, 'platform' => $platform, 'kind' => $kind, 'from' => $name ?: 'Unknown', 'phone' => $phone,
        'text' => mb_substr($text, 0, 4000), 'ref' => $ref, 'leadId' => $leadId, 'read' => false,
        'createdAt' => iso_now(), 'updatedAt' => iso_now(),
    ]);
}

/** Pulls the newest comments on the channel's videos. Returns number of comments seen. */
function yt_sync(): int
{
    $key = secret('yt_api_key');
    $ch = secret('yt_channel_id');
    if ($key === '' || $ch === '') {
        return 0;
    }
    $j = http_json('https://www.googleapis.com/youtube/v3/commentThreads?' . http_build_query([
        'part' => 'snippet', 'allThreadsRelatedToChannelId' => $ch, 'maxResults' => 50, 'order' => 'time', 'key' => $key,
    ]));
    $n = 0;
    foreach (($j['items'] ?? []) as $it) {
        $sn = $it['snippet']['topLevelComment']['snippet'] ?? null;
        if (!$sn) {
            continue;
        }
        $author = (string) ($sn['authorChannelId']['value'] ?? '');
        if ($author === $ch) {
            continue; // the hospital's own comment
        }
        ingest('youtube', 'comment', (string) ($sn['authorDisplayName'] ?? ''), $author, '',
            (string) ($sn['textOriginal'] ?? $sn['textDisplay'] ?? ''), (string) $it['id'],
            'https://www.youtube.com/watch?v=' . ($sn['videoId'] ?? '') . '&lc=' . $it['id']);
        $n++;
    }
    return $n;
}
