<?php
// Meta webhook: Facebook lead ads, Facebook/Instagram comments + messages, WhatsApp messages.
// Callback URL to enter in the Meta app:  https://YOUR-DOMAIN/api/webhook-meta.php
declare(strict_types=1);
require __DIR__ . '/lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'GET') { // verification handshake
    $token = secret('meta_verify_token');
    if (($_GET['hub_mode'] ?? '') === 'subscribe' && $token !== '' && hash_equals($token, (string) ($_GET['hub_verify_token'] ?? ''))) {
        header('Content-Type: text/plain');
        echo (string) ($_GET['hub_challenge'] ?? '');
        exit;
    }
    http_response_code(403);
    exit('Forbidden');
}

$raw = (string) file_get_contents('php://input');
$appSecret = secret('meta_app_secret');
$sig = (string) ($_SERVER['HTTP_X_HUB_SIGNATURE_256'] ?? '');
if ($appSecret === '' || !hash_equals('sha256=' . hash_hmac('sha256', $raw, $appSecret), $sig)) {
    http_response_code(403); // unsigned or forged request
    exit('Forbidden');
}
$body = json_decode($raw, true);
$object = (string) ($body['object'] ?? '');
$pageId = secret('meta_page_id');

function profile_name(string $id, string $fallback): string
{
    $p = graph($id, ['fields' => 'name']);
    return (string) ($p['name'] ?? $p['username'] ?? $fallback);
}

try {
    foreach (($body['entry'] ?? []) as $entry) {
        $ownId = (string) ($entry['id'] ?? '');

        if ($object === 'whatsapp_business_account') {
            foreach (($entry['changes'] ?? []) as $ch) {
                $v = $ch['value'] ?? [];
                $names = [];
                foreach (($v['contacts'] ?? []) as $c) {
                    $names[$c['wa_id'] ?? ''] = $c['profile']['name'] ?? '';
                }
                foreach (($v['messages'] ?? []) as $m) {
                    $from = (string) ($m['from'] ?? '');
                    $text = (string) ($m['text']['body'] ?? $m['button']['text'] ?? ('[' . ($m['type'] ?? 'message') . ']'));
                    ingest('whatsapp', 'message', (string) ($names[$from] ?? ''), $from, $from, $text, (string) ($m['id'] ?? ''));
                }
            }
            continue;
        }

        $platform = $object === 'instagram' ? 'instagram' : 'facebook';

        foreach (($entry['messaging'] ?? []) as $m) { // Messenger / Instagram DMs
            $sender = (string) ($m['sender']['id'] ?? '');
            if (!empty($m['message']['is_echo']) || $sender === '' || $sender === $ownId || !isset($m['message'])) {
                continue;
            }
            $text = (string) ($m['message']['text'] ?? '[attachment]');
            ingest($platform, 'message', profile_name($sender, ucfirst($platform) . ' user'), $sender, '', $text, (string) ($m['message']['mid'] ?? ''));
        }

        foreach (($entry['changes'] ?? []) as $ch) {
            $field = (string) ($ch['field'] ?? '');
            $v = $ch['value'] ?? [];

            if ($field === 'leadgen') { // Meta lead ad form submitted
                $lid = (string) ($v['leadgen_id'] ?? '');
                if ($lid === '') {
                    continue;
                }
                $lead = graph($lid, ['fields' => 'field_data,created_time,ad_name,campaign_name,platform']) ?? [];
                $f = [];
                foreach (($lead['field_data'] ?? []) as $fd) {
                    $f[strtolower((string) $fd['name'])] = (string) ($fd['values'][0] ?? '');
                }
                $name = $f['full_name'] ?? trim(($f['first_name'] ?? '') . ' ' . ($f['last_name'] ?? ''));
                if (!$f) { // details could not be fetched: keep the lead visible instead of losing it
                    $name = 'Meta lead ' . $lid;
                    $f['note'] = 'Lead details could not be fetched - check the Page access token in Integrations';
                }
                $phone = $f['phone_number'] ?? $f['phone'] ?? '';
                $extra = [];
                foreach ($f as $k => $val) {
                    if (!in_array($k, ['full_name', 'first_name', 'last_name', 'phone_number', 'phone', 'email'], true)) {
                        $extra[] = "$k: $val";
                    }
                }
                upsert_lead([
                    'id' => clean_id('meta_' . $lid), 'name' => $name, 'phone' => $phone, 'email' => $f['email'] ?? '',
                    'source' => ($lead['platform'] ?? '') === 'ig' ? 'Meta Ads – Instagram' : 'Meta Ads – Facebook',
                    'campaign' => (string) ($lead['campaign_name'] ?? $lead['ad_name'] ?? ''),
                    'text' => implode('; ', $extra),
                ]);
            } elseif ($field === 'feed' && ($v['item'] ?? '') === 'comment' && ($v['verb'] ?? '') === 'add') { // Facebook comment
                $from = (string) ($v['from']['id'] ?? '');
                if ($from === $ownId || ($pageId !== '' && $from === $pageId)) {
                    continue;
                }
                ingest('facebook', 'comment', (string) ($v['from']['name'] ?? 'Facebook user'), $from, '',
                    (string) ($v['message'] ?? ''), (string) ($v['comment_id'] ?? ''), 'https://www.facebook.com/' . ($v['post_id'] ?? ''));
            } elseif ($field === 'comments' && $object === 'instagram') { // Instagram comment
                $from = (string) ($v['from']['id'] ?? '');
                if ($from === $ownId) {
                    continue;
                }
                ingest('instagram', 'comment', (string) ($v['from']['username'] ?? 'Instagram user'), $from, '',
                    (string) ($v['text'] ?? ''), (string) ($v['id'] ?? ''));
            }
        }
    }
} catch (Throwable $e) {
    error_log('HMS meta webhook: ' . $e->getMessage());
}
http_response_code(200);
echo 'EVENT_RECEIVED';
