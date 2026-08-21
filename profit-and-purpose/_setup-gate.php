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
// 2026-08-21 rotation note: restored from history to change the password, not
// to install it for the first time. A key file already exists on disk. The
// original first-install lock refused outright whenever a key was already
// present, which is correct for a first install (a public repo means a
// stranger can watch this file land and try to claim the gate before its
// owner does) but wrong for a deliberate rotation, where the caller IS the
// owner and a refusal would just leave the old password live. The source-IP
// lock below is the one that actually matters here and is unchanged: only
// the VPS may ever reach this file. Given that, an existing key is now
// overwritten rather than refused -- same effect as the documented manual
// procedure (delete the old key file, then let the installer write a fresh
// one), done in one step instead of two. Removed again the moment it has run.
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

$existed = file_exists($keyFile);
if ($existed && !@unlink($keyFile)) {
    http_response_code(500);
    echo "ROTATE_UNLINK_FAILED path=" . $keyFile . "\n";
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

echo "OK rotated=" . ($existed ? '1' : '0') . " path=" . $keyFile . " bytes=" . strlen($payload) . "\n";
