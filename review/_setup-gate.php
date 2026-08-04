<?php
declare(strict_types=1);

// ---------------------------------------------------------------------------
// One-time installer for the /review/ gate key. Deleted the moment it has run.
//
// This exists to solve one problem: this repository is public, so the password
// cannot be committed, in plaintext or as a hash. An eight character hash sitting
// in a public repo is an eight character password anyone can recover offline.
//
// So the password arrives once, over HTTPS, as a POST body, and what gets
// written to disk is a bcrypt hash plus a random signing secret, in a file one
// directory ABOVE public_html. That location matters twice over: nothing under
// the web root can reach it, and the Hostinger API deploy path replaces the
// whole of public_html, which would wipe anything stored inside it.
//
// Two locks, because a public repo means a stranger can watch this file land
// and try to claim the gate before we do:
//   1. It refuses any request whose source address is not the VPS.
//   2. It refuses outright if a key file already exists, so it can only ever
//      win a race, never overwrite the result of one.
// ---------------------------------------------------------------------------

header('Content-Type: text/plain; charset=utf-8');
header('Cache-Control: private, no-store');

const ALLOWED_SOURCE = '72.60.209.109';

$keyFile = dirname(__DIR__, 2) . '/.review-gate-key.php';
$seen    = (string) ($_SERVER['REMOTE_ADDR'] ?? '');

if ($seen !== ALLOWED_SOURCE) {
    http_response_code(403);
    // Echoing the address it saw is not a leak, and it is the only way to tell
    // a proxied source apart from a genuinely wrong one.
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
