<?php
// Temporary capability probe. Answers the questions the docs cannot, all of
// which the password gate's design depends on:
//   1. Does this host execute PHP under /review/, or hand the file back as text?
//   2. Is there a directory ABOVE public_html that PHP can write to? That is
//      where the password has to live, because the repo is public and the
//      Hostinger API deploy path does a clean replace of public_html.
//   3. What source IP does the host see for a request from the VPS? The one-time
//      key installer is locked to that IP, which is what stops a stranger
//      watching the public repo from claiming the gate before we do.
// Deleted once the answers are recorded.
header('Content-Type: text/plain');

$docroot = $_SERVER['DOCUMENT_ROOT'] ?? '';
$above   = $docroot !== '' ? dirname($docroot) : '';

echo "PHP_EXECUTES=yes\n";
echo "VERSION=" . PHP_VERSION . "\n";
echo "password_hash=" . (function_exists('password_hash') ? 'yes' : 'no') . "\n";
echo "hash_hmac=" . (function_exists('hash_hmac') ? 'yes' : 'no') . "\n";
echo "random_bytes=" . (function_exists('random_bytes') ? 'yes' : 'no') . "\n";
echo "DOCUMENT_ROOT=" . $docroot . "\n";
echo "ABOVE_DOCROOT=" . $above . "\n";
echo "ABOVE_IS_DIR=" . ($above !== '' && is_dir($above) ? 'yes' : 'no') . "\n";
echo "ABOVE_WRITABLE=" . ($above !== '' && is_writable($above) ? 'yes' : 'no') . "\n";
echo "REMOTE_ADDR=" . ($_SERVER['REMOTE_ADDR'] ?? 'none') . "\n";
echo "X_FORWARDED_FOR=" . ($_SERVER['HTTP_X_FORWARDED_FOR'] ?? 'none') . "\n";
echo "HTTPS=" . ($_SERVER['HTTPS'] ?? 'none') . "\n";
