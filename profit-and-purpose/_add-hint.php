<?php
/**
 * One-shot: add (or update) the 'hint' field on the EXISTING
 * /profit-and-purpose/ gate key file, without touching its hash or signing
 * secret. Same install shape as _setup-gate.php (VPS-only, POST-only,
 * reachable only via a temporary .htaccess exemption), but this one never
 * rotates the password -- it merges a single new field into whatever is
 * already there and refuses to run if the key file does not already exist.
 *
 * Install (from the VPS, `ssh root@72.60.209.109`). The -4 matters: over IPv6
 * the host sees the VPS as a different address and the check below denies it.
 *
 *   curl -4 -s -X POST \
 *     --data-urlencode 'hint=<THE HINT TEXT, never the password>' \
 *     https://boubacarbarry.com/profit-and-purpose/_add-hint.php
 *
 * Runbook: uncomment the RewriteRule exemption for this file in
 * profit-and-purpose/.htaccess, deploy, run the curl above, then comment the
 * exemption back out and deploy again.
 */

declare(strict_types=1);

const ADD_HINT_ALLOWED_IP = '72.60.209.109';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
if ($remote !== ADD_HINT_ALLOWED_IP) {
    http_response_code(403);
    echo "denied\n";
    exit;
}

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    http_response_code(405);
    echo "POST only\n";
    exit;
}

$keyPath = dirname(__DIR__, 2) . '/.pnp-gate-key.php';

if (!is_file($keyPath)) {
    http_response_code(409);
    echo "no existing key file at {$keyPath}; nothing to add a hint to\n";
    exit;
}

/** @var mixed $existing */
$existing = require $keyPath;
if (!is_array($existing) || empty($existing['hash']) || empty($existing['secret'])) {
    http_response_code(500);
    echo "existing key file is unreadable or missing hash/secret; refusing to touch it\n";
    exit;
}

$hint = trim((string) ($_POST['hint'] ?? ''));
if ($hint === '') {
    http_response_code(400);
    echo "hint must not be empty\n";
    exit;
}

$updated = $existing;
$updated['hint'] = $hint;

$body = "<?php\n"
      . "// /profit-and-purpose/ gate key. Written by gate.php's installer + _add-hint.php. Never commit this.\n"
      . "return " . var_export($updated, true) . ";\n";

if (@file_put_contents($keyPath, $body, LOCK_EX) === false) {
    http_response_code(500);
    echo "could not write key file\n";
    exit;
}
@chmod($keyPath, 0600);

echo "hint updated\n";
echo "key_file={$keyPath}\n";
echo "hash and secret unchanged -- no live session was invalidated\n";
