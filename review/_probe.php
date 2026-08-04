<?php
// Temporary capability probe. Answers one question the docs cannot: does this
// host execute PHP under /review/, or hand back the file as text? Everything
// about the password gate depends on that answer, because a gate that rewrites
// pages into a PHP handler on a host with no PHP would serve the handler's own
// source. Deleted once the answer is recorded.
header('Content-Type: text/plain');
echo "PHP_EXECUTES=yes\n";
echo "VERSION=" . PHP_VERSION . "\n";
echo "password_hash=" . (function_exists('password_hash') ? 'yes' : 'no') . "\n";
echo "hash_hmac=" . (function_exists('hash_hmac') ? 'yes' : 'no') . "\n";
echo "hash_equals=" . (function_exists('hash_equals') ? 'yes' : 'no') . "\n";
echo "getenv_test=" . (getenv('REVIEW_GATE_PROBE') ?: 'unset') . "\n";
