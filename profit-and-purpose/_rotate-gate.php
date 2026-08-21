<?php
declare(strict_types=1);

// ---------------------------------------------------------------------------
// One-time key ROTATION for this gate. Removed the moment it has run.
//
// _setup-gate.php deliberately refuses to overwrite an existing key, so that a
// stranger who catches it live can never claim a gate that is already set. That
// lock is correct and this file does not remove it. Rotation gets its own
// script with a STRICTER condition instead of a weaker one:
//
//   1. The caller must be the VPS, same as the installer.
//   2. The caller must also prove it holds the CURRENT password.
//
// So rotating requires both the right source address and the existing secret,
// which is a higher bar than installing was. A blind overwrite endpoint would
// have been the easy version and would have turned a deploy of this repo, which
// is public, into a way to seize the gate from the VPS's own address.
//
// The signing secret is regenerated too, not carried over, which invalidates
// every session cookie issued under the old password. That is the point: after
// this runs, the old password opens nothing, including for anyone who already
// unlocked with it.
// ---------------------------------------------------------------------------

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: private, no-store');

const ALLOWED_SOURCE = '72.60.209.109';

$keyFile = dirname(__DIR__, 2) . '/.pnp-gate-key.php';
$seen    = (string) ($_SERVER['REMOTE_ADDR'] ?? '');

if ($seen !== ALLOWED_SOURCE) {
    http_response_code(403);
    echo "DENIED seen=" . $seen . "\n";
    exit;
}

if (!file_exists($keyFile)) {
    http_response_code(409);
    echo "NO_KEY_TO_ROTATE path=" . $keyFile . " (use _setup-gate.php instead)\n";
    exit;
}

$current = (string) ($_POST['current'] ?? '');
$next    = (string) ($_POST['next'] ?? '');

if ($current === '' || $next === '') {
    http_response_code(400);
    echo "NEED_CURRENT_AND_NEXT\n";
    exit;
}

$key = require $keyFile;
if (!is_array($key) || empty($key['hash'])) {
    http_response_code(500);
    echo "KEY_UNREADABLE\n";
    exit;
}

usleep(400000);
if (!password_verify($current, (string) $key['hash'])) {
    http_response_code(403);
    echo "CURRENT_PASSWORD_WRONG\n";
    exit;
}

$payload = "<?php return [\n"
    . "    'hash'   => " . var_export(password_hash($next, PASSWORD_DEFAULT), true) . ",\n"
    . "    'secret' => " . var_export(bin2hex(random_bytes(32)), true) . ",\n"
    . "];\n";

if (file_put_contents($keyFile, $payload, LOCK_EX) === false) {
    http_response_code(500);
    echo "WRITE_FAILED path=" . $keyFile . "\n";
    exit;
}
@chmod($keyFile, 0600);

echo "ROTATED path=" . $keyFile . " bytes=" . strlen($payload) . " (signing secret regenerated, all old sessions invalidated)\n";
