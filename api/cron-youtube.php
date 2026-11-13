<?php
// Optional Hostinger cron job (every 15 min) to pull new YouTube comments even when nobody has the dashboard open:
//   wget -q -O /dev/null "https://YOUR-DOMAIN/api/cron-youtube.php?key=YOUR_KEY"
declare(strict_types=1);
require __DIR__ . '/lib.php';

$key = secret('hook_key');
if ($key === '' || !hash_equals($key, (string) ($_GET['key'] ?? ''))) {
    http_response_code(403);
    exit('Forbidden');
}
echo 'Synced ' . yt_sync() . ' comments';
