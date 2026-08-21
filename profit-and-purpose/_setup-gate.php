<?php
declare(strict_types=1);

// ---------------------------------------------------------------------------
// One-time installer for this page's gate key. Removed the moment it has run.
//
// Same shape as the one that installed the /review/ key, pointed at a
// different file so the two gates never share a secret. This repository is
// public, so the password cannot be committed, in plaintext or as a hash: a
// hash of a short password sitting in a public repo is a short password anyone
// can recover offline.
//
// So the password arrives once, over HTTPS, as a POST body, and what lands on
// disk is a bcrypt hash plus a random signing secret, in a file one directory
// ABOVE public_html. That location matters twice: nothing under the web root
// can reach it, and the deploy replaces the whole of public_html, which would
// wipe anything stored inside it.
//
// Two locks, because a public repo means a stranger can watch this file land
// and try to claim the gate first:
//   1. It refuses any request whose source address is not the VPS.
//   2. It refuses outright if a key file already exists, so it can only ever
//      win a race, never overwrite the result of one.
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

if (file_exists($keyFile)) {
    http_response_code(409);
    echo "ALREADY_CONFIGURED path=" . $keyFile . "\n";
    exit;
}

$pw = (string) ($_POST['pw'] ?? '');
if ($pw === '') {
    http_response_code(400);
    echo "NEED_PW\n";
    exit;
}

$dir = dirname($keyFile);
if (!is_dir($dir) || !is_writable($dir)) {
    http_response_code(500);
    echo "NOT_WRITABLE dir=" . $dir . "\n";
    exit;
}

$payload = "<?php return [\n"
    . "    'hash'   => " . var_export(password_hash($pw, PASSWORD_DEFAULT), true) . ",\n"
    . "    'secret' => " . var_export(bin2hex(random_bytes(32)), true) . ",\n"
    . "];\n";

if (file_put_contents($keyFile, $payload, LOCK_EX) === false) {
    http_response_code(500);
    echo "WRITE_FAILED path=" . $keyFile . "\n";
    exit;
}
@chmod($keyFile, 0600);

echo "OK path=" . $keyFile . " bytes=" . strlen($payload) . "\n";
