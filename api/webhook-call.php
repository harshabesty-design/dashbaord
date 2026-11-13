<?php
// Incoming-call webhook for a cloud telephony / IVR provider (Exotel, MyOperator, Knowlarity, Tata Smartflo ...).
// URL to enter at the provider:  https://YOUR-DOMAIN/api/webhook-call.php?key=YOUR_KEY
// Every call to the office number becomes a lead with source "Phone call".
declare(strict_types=1);
require __DIR__ . '/lib.php';

$key = secret('hook_key');
if ($key === '' || !hash_equals($key, (string) ($_GET['key'] ?? ''))) {
    http_response_code(403);
    exit('Forbidden');
}
$json = json_decode((string) file_get_contents('php://input'), true);
$p = array_change_key_case(array_merge($_GET, $_POST, is_array($json) ? $json : []), CASE_LOWER);

$pick = function (array $names) use ($p): string {
    foreach ($names as $n) {
        if (isset($p[$n]) && is_scalar($p[$n]) && (string) $p[$n] !== '') {
            return (string) $p[$n];
        }
    }
    return '';
};
$from = $pick(['callfrom', 'from', 'caller', 'caller_id', 'caller_number', 'caller_id_number', 'customer_number', 'customer_no', 'callerid', 'mobile', 'phone']);
$digits = preg_replace('/\D/', '', $from);
if (strlen($digits) < 8) {
    http_response_code(400);
    exit('Caller number missing');
}
$status = $pick(['status', 'callstatus', 'call_status', 'dialcallstatus', 'call_type', 'event']);
$rec = $pick(['recordingurl', 'recording_url', 'recording']);
$note = 'Incoming call' . ($status !== '' ? " ($status)" : '') . ($rec !== '' ? " – recording: $rec" : '');

upsert_lead(['name' => $pick(['name', 'caller_name']) ?: 'Caller ' . substr($digits, -10), 'phone' => substr($digits, -10), 'source' => 'Phone call', 'text' => $note]);
echo 'OK';
