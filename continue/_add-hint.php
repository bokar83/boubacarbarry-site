<?php
/**
 * One-shot: add (or update) the 'hint' field on the EXISTING Continue gate
 * key file (shared by python.boubacarbarry.com and continue.boubacarbarry.com),
 * without touching its hash, HMAC signing secret, or api_base. Same install
 * shape as _setup-gate.php (VPS-only, POST-only, reachable only via a
 * temporary .htaccess exemption), but this one never rotates anything -- it
 * merges a single new field into whatever is already there and refuses to run
 * if the key file does not already exist.
 *
 * Rotating the Continue key invalidates every live session AND breaks the
 * Supabase Edge Functions until DOJO_SESSION_SECRET is re-synced (see
 * memory/reference_password_hint_register.md, the 2026-08-26 resync entry).
 * This script exists specifically so a hint can be added WITHOUT that blast
 * radius.
 *
 * Install (from the VPS, `ssh root@72.60.209.109`). The -4 matters: over IPv6
 * the host sees the VPS as a different address and the check below denies it.
 *
 *   curl -4 -s -X POST \
 *     --data-urlencode 'hint=<THE HINT TEXT, never the passphrase>' \
 *     https://python.boubacarbarry.com/_add-hint.php
 *
 * Runbook: uncomment the RewriteRule + <Files> exemption for this file in
 * continue/.htaccess, deploy, run the curl above, then comment both back out
 * and deploy again.
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

// Same anchor gate.php uses: __DIR__ is public_html/continue, so
// dirname(__DIR__, 2) is the parent of public_html.
$keyPath = dirname(__DIR__, 2) . '/.continue-gate-key.php';

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
      . "// Continue gate key. Written by _setup-gate.php + _add-hint.php. Never commit this.\n"
      . "return " . var_export($updated, true) . ";\n";

if (@file_put_contents($keyPath, $body, LOCK_EX) === false) {
    http_response_code(500);
    echo "could not write key file\n";
    exit;
}
@chmod($keyPath, 0600);

echo "hint updated\n";
echo "key_file={$keyPath}\n";
echo "hash, secret and api_base unchanged -- no live session was invalidated\n";
echo "and DOJO_SESSION_SECRET in Supabase Vault did NOT need to change\n";
