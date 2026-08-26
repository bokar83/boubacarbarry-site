<?php
/**
 * One-shot installer for the Continue? gate key. Same shape as the installer
 * that set up /review/ on 2026-08-04.
 *
 * This file is normally UNREACHABLE: .htaccess rewrites every request to
 * gate.php, and the rule that exempts this path is commented out. The runbook
 * has you uncomment it, deploy, run this once from the VPS, then comment it out
 * and deploy again.
 *
 * Three things stop the public repo from being a way to claim the gate first:
 *   1. it refuses if a key already exists,
 *   2. it only answers the VPS address,
 *   3. it is not routed at all unless the .htaccess exemption is uncommented.
 *
 * Install (from the VPS, `ssh root@72.60.209.109`). The -4 matters: over IPv6
 * the host sees the VPS as a different address and the check below denies it.
 *
 *   curl -4 -s -X POST \
 *     -d 'pw=<THE-PASSPHRASE-FROM-HIS-PASSWORD-MANAGER>' \
 *     -d 'api_base=https://<project-ref>.supabase.co/functions/v1' \
 *     https://boubacarbarry.com/continue/_setup-gate.php
 *
 * The passphrase is never written to this file, never committed, and never
 * logged. It exists in his password manager and, as a bcrypt hash only, in the
 * key file this script writes above the document root.
 */

declare(strict_types=1);

const DOJO_INSTALLER_ALLOWED_IP = '72.60.209.109';

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

$remote = (string) ($_SERVER['REMOTE_ADDR'] ?? '');
if ($remote !== DOJO_INSTALLER_ALLOWED_IP) {
    http_response_code(403);
    echo "denied\n";
    exit;
}

// Anchored on __DIR__, exactly as gate.php is, so the installer and the gate
// can never disagree about where the key lives. __DIR__ is public_html/continue,
// so dirname(__DIR__, 2) is the parent of public_html: unreachable over HTTP,
// and untouched by the Hostinger clean-replace deploy.
$keyPath = dirname(__DIR__, 2) . '/.continue-gate-key.php';

// Overwriting is possible but never accidental. An installer that silently
// rotates the key is an installer that can lock him out of his own tool, so the
// caller has to say `rotate=1` and mean it. Without that it still refuses, which
// is the behaviour the first install relies on.
//
// A rotation replaces BOTH halves of the key: the passphrase hash and the
// signing secret. That is deliberate and it has a consequence worth knowing
// before pressing it -- every live session cookie and every API token stops
// verifying at once, and the new DOJO_SESSION_SECRET printed below has to reach
// the Supabase secret store or every Edge Function call starts failing.
$rotate = ($_POST['rotate'] ?? '') === '1';
if (file_exists($keyPath) && !$rotate) {
    http_response_code(409);
    echo "key already exists; refusing to overwrite\n";
    echo "to rotate deliberately, POST again with -d 'rotate=1'\n";
    echo "note: rotating invalidates every live session AND changes\n";
    echo "DOJO_SESSION_SECRET, which must then be updated on Supabase\n";
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo "POST only\n";
    exit;
}

$pw      = (string) ($_POST['pw'] ?? '');
$apiBase = (string) ($_POST['api_base'] ?? '');

// Sixteen, not eight. The per-IP throttle can be evaded by rotating IPv6
// addresses, so the real floor on an offline or lightly-throttled attack is
// bcrypt cost 12, around 250ms per guess. Eight characters is a reachable
// target at that rate; sixteen is not.
if (strlen($pw) < 16) {
    http_response_code(400);
    echo "passphrase too short: 16 characters minimum\n";
    exit;
}
if (!preg_match('~^https://[a-z0-9.-]+\.supabase\.co/functions/v1$~', $apiBase)) {
    http_response_code(400);
    echo "api_base must look like https://<ref>.supabase.co/functions/v1\n";
    exit;
}

$hash = password_hash($pw, PASSWORD_BCRYPT, ['cost' => 12]);
if (!is_string($hash) || $hash === '') {
    http_response_code(500);
    echo "hash failed\n";
    exit;
}

// 64 hex characters. The Edge Functions verify against the same value, so this
// is the one string that has to be copied by hand into the Supabase secret.
$secret = bin2hex(random_bytes(32));

$body = "<?php\n"
      . "// Continue? gate key. Written by _setup-gate.php. Never commit this.\n"
      . "return " . var_export([
            'hash'     => $hash,
            'secret'   => $secret,
            'api_base' => $apiBase,
        ], true) . ";\n";

if (@file_put_contents($keyPath, $body, LOCK_EX) === false) {
    http_response_code(500);
    echo "could not write key file\n";
    exit;
}
@chmod($keyPath, 0600);

echo "installed\n";
echo "key_file={$keyPath}\n";
// The secret is printed exactly once, here, over TLS, to a caller that already
// proved it is the VPS. It has to reach the Supabase secret store somehow and
// this is the only moment it exists outside the file.
echo "DOJO_SESSION_SECRET={$secret}\n";
echo "\nnext: set that secret on the Supabase project, then re-comment the\n";
echo "_setup-gate.php rule in .htaccess and deploy again.\n";
