<?php
// Dashboard API (login, data sync, users, integration settings).
declare(strict_types=1);
require __DIR__ . '/lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST' || ($_SERVER['HTTP_X_REQUESTED_WITH'] ?? '') !== 'hms') {
    fail('Bad request', 400);
}
$https = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
session_name('hmssid');
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'secure' => $https, 'path' => '/']);
session_start();

$a = (string) ($_GET['a'] ?? '');
$in = json_decode((string) file_get_contents('php://input'), true);
$in = is_array($in) ? $in : [];
$me = $_SESSION['user'] ?? null;

function need_login(): array
{
    global $me;
    if (!$me) {
        fail('Please log in', 401);
    }
    return $me;
}
function need_admin(): void
{
    if ((need_login()['role'] ?? '') !== 'Admin') {
        fail('Only an Admin can do this', 403);
    }
}
function user_count(): int
{
    return (int) db()->query('SELECT COUNT(*) FROM users')->fetchColumn();
}
function check_password(string $p): void
{
    if (strlen($p) < 8) {
        fail('Password must be at least 8 characters');
    }
}

switch ($a) {
    case 'status':
        out(['setup' => user_count() === 0, 'user' => $me]);

    case 'setup': // create the very first admin account
        if (user_count() > 0) {
            fail('Already set up', 403);
        }
        $u = strtolower(trim((string) ($in['username'] ?? '')));
        $n = trim((string) ($in['name'] ?? ''));
        $p = (string) ($in['password'] ?? '');
        if (!preg_match('/^[a-z0-9._-]{3,40}$/', $u) || $n === '') {
            fail('Enter a name and a username (3+ letters/numbers)');
        }
        check_password($p);
        $id = new_id();
        db()->prepare('INSERT INTO users (id, username, name, role, pass, active) VALUES (?,?,?,?,?,1)')
            ->execute([$id, $u, $n, 'Admin', password_hash($p, PASSWORD_DEFAULT)]);
        session_regenerate_id(true);
        $_SESSION['user'] = ['id' => $id, 'username' => $u, 'name' => $n, 'role' => 'Admin'];
        out(['user' => $_SESSION['user']]);

    case 'login':
        $ipKey = 'fail_' . md5((string) ($_SERVER['REMOTE_ADDR'] ?? ''));
        [$cnt, $ts] = array_map('intval', explode('|', secret($ipKey) ?: '0|0'));
        if (time() - $ts > 900) {
            $cnt = 0;
        }
        if ($cnt >= 8) {
            fail('Too many failed attempts. Try again in 15 minutes.', 429);
        }
        $s = db()->prepare('SELECT * FROM users WHERE username = ? AND active = 1');
        $s->execute([strtolower(trim((string) ($in['username'] ?? '')))]);
        $u = $s->fetch();
        if (!$u || !password_verify((string) ($in['password'] ?? ''), $u['pass'])) {
            set_secret($ipKey, ($cnt + 1) . '|' . time());
            usleep(500000);
            fail('Wrong username or password', 401);
        }
        set_secret($ipKey, '0|0');
        session_regenerate_id(true);
        $_SESSION['user'] = ['id' => $u['id'], 'username' => $u['username'], 'name' => $u['name'], 'role' => $u['role']];
        out(['user' => $_SESSION['user']]);

    case 'logout':
        $_SESSION = [];
        session_destroy();
        out([]);

    case 'load':
        need_login();
        $since = (int) ($in['since'] ?? 0);
        $now = now_ms();
        $s = db()->prepare('SELECT col, id, data, deleted FROM records WHERE updated_at >= ?' . ($since ? '' : ' AND deleted = 0'));
        $s->execute([$since]);
        $rows = [];
        $gone = [];
        foreach ($s as $r) {
            if ($r['deleted']) {
                $gone[] = [$r['col'], $r['id']];
            } else {
                $rows[] = [$r['col'], json_decode($r['data'], true)];
            }
        }
        out(['now' => $now, 'rows' => $rows, 'gone' => $gone]);

    case 'save':
        need_login();
        $col = (string) ($in['col'] ?? '');
        $doc = $in['doc'] ?? null;
        if (!in_array($col, COLLECTIONS, true) || !is_array($doc) || empty($doc['id']) || !is_string($doc['id'])
            || $doc['id'] !== clean_id($doc['id'])) {
            fail('Invalid record');
        }
        if ($col === 'settings') {
            need_admin();
        }
        rec_save($col, $doc);
        out([]);

    case 'delete':
        need_login();
        $col = (string) ($in['col'] ?? '');
        if (!in_array($col, COLLECTIONS, true) || $col === 'settings') {
            fail('Invalid record');
        }
        db()->prepare('UPDATE records SET deleted = 1, data = ?, updated_at = ? WHERE col = ? AND id = ?')
            ->execute(['{}', now_ms(), $col, (string) ($in['id'] ?? '')]);
        out([]);

    case 'users':
        need_admin();
        out(['users' => db()->query('SELECT id, username, name, role, active FROM users ORDER BY name')->fetchAll()]);

    case 'user_save':
        need_admin();
        $id = (string) ($in['id'] ?? '');
        $u = strtolower(trim((string) ($in['username'] ?? '')));
        $n = trim((string) ($in['name'] ?? ''));
        $role = (string) ($in['role'] ?? '');
        $active = !empty($in['active']) ? 1 : 0;
        $p = (string) ($in['password'] ?? '');
        if (!preg_match('/^[a-z0-9._-]{3,40}$/', $u) || $n === '' || !in_array($role, ['Admin', 'Receptionist', 'Doctor', 'Accounts'], true)) {
            fail('Enter name, username (3+ letters/numbers) and role');
        }
        $s = db()->prepare('SELECT id FROM users WHERE username = ? AND id <> ?');
        $s->execute([$u, $id]);
        if ($s->fetchColumn()) {
            fail('That username is already taken');
        }
        if ($id === '') {
            check_password($p);
            db()->prepare('INSERT INTO users (id, username, name, role, pass, active) VALUES (?,?,?,?,?,?)')
                ->execute([new_id(), $u, $n, $role, password_hash($p, PASSWORD_DEFAULT), $active]);
        } else {
            if ($id === $me['id'] && ($role !== 'Admin' || !$active)) {
                fail('You cannot remove your own admin access');
            }
            db()->prepare('UPDATE users SET username = ?, name = ?, role = ?, active = ? WHERE id = ?')->execute([$u, $n, $role, $active, $id]);
            if ($p !== '') {
                check_password($p);
                db()->prepare('UPDATE users SET pass = ? WHERE id = ?')->execute([password_hash($p, PASSWORD_DEFAULT), $id]);
            }
        }
        out([]);

    case 'user_delete':
        need_admin();
        if (($in['id'] ?? '') === $me['id']) {
            fail('You cannot delete your own account');
        }
        db()->prepare('DELETE FROM users WHERE id = ?')->execute([(string) ($in['id'] ?? '')]);
        out([]);

    case 'password': // change own password
        need_login();
        $s = db()->prepare('SELECT pass FROM users WHERE id = ?');
        $s->execute([$me['id']]);
        if (!password_verify((string) ($in['old'] ?? ''), (string) $s->fetchColumn())) {
            fail('Current password is wrong');
        }
        check_password((string) ($in['new'] ?? ''));
        db()->prepare('UPDATE users SET pass = ? WHERE id = ?')->execute([password_hash((string) $in['new'], PASSWORD_DEFAULT), $me['id']]);
        out([]);

    case 'secrets_get':
        need_admin();
        $vals = ['meta_verify_token' => auto_secret('meta_verify_token'), 'hook_key' => auto_secret('hook_key')];
        foreach (['meta_page_id', 'wa_phone_id', 'yt_channel_id'] as $k) {
            $vals[$k] = secret($k);
        }
        $set = [];
        foreach (['meta_app_secret', 'meta_page_token', 'wa_token', 'yt_api_key'] as $k) {
            $set[$k] = secret($k) !== '';
        }
        out(['values' => $vals, 'set' => $set]);

    case 'secrets_save':
        need_admin();
        $allowed = ['meta_page_id', 'wa_phone_id', 'yt_channel_id', 'meta_app_secret', 'meta_page_token', 'wa_token', 'yt_api_key'];
        foreach (($in['values'] ?? []) as $k => $v) {
            if (in_array($k, $allowed, true) && is_string($v)) {
                set_secret($k, trim($v));
            }
        }
        out([]);

    case 'yt_sync':
        need_login();
        out(['count' => yt_sync()]);

    case 'wa_send': // send a WhatsApp text through the Cloud API (works inside the 24h reply window)
        need_login();
        $token = secret('wa_token');
        $pid = secret('wa_phone_id');
        if ($token === '' || $pid === '') {
            fail('WhatsApp Cloud API is not connected');
        }
        $to = preg_replace('/\D/', '', (string) ($in['to'] ?? ''));
        $text = trim((string) ($in['text'] ?? ''));
        if (strlen($to) < 10 || $text === '') {
            fail('Phone number and message are required');
        }
        $r = http_json("https://graph.facebook.com/v21.0/$pid/messages",
            ['messaging_product' => 'whatsapp', 'to' => $to, 'type' => 'text', 'text' => ['body' => $text]],
            ['Authorization: Bearer ' . $token]);
        if (!$r || isset($r['error'])) {
            fail('WhatsApp did not accept the message: ' . ($r['error']['message'] ?? 'no response'));
        }
        out([]);
}
fail('Unknown action', 404);
