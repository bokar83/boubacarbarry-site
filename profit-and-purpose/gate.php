<?php
declare(strict_types=1);

// ---------------------------------------------------------------------------
// A password gate for this one address, independent of the /review/ gate.
//
// Same design as review/gate.php and the same reasoning behind it: every
// request under this directory is rewritten here by .htaccess, so nothing is
// served by the web server itself. The bytes never leave the machine
// unauthenticated. A CSS panel over a document that was already sent is not a
// lock, and this is not that.
//
// What is different is the key. /review/ is one shared password covering every
// working page on this domain. This address is given to one person outside the
// house, so it reads its own key file, holds its own cookie, and its password
// is not the /review/ password. Neither one opens the other.
//
// The password is NOT in this file and NOT in this repository, which is public.
// It lives as a bcrypt hash one level above public_html: outside the web root
// so no request can reach it, outside the deploy tree so neither a git pull nor
// the clean-replace deploy touches it. See _setup-gate.php for how it lands.
//
// If the key file is missing this fails CLOSED and serves nothing.
// ---------------------------------------------------------------------------

const COOKIE_NAME = 'bb_pnp';
const SESSION_DAYS = 60;
const PREFIX = '/profit-and-purpose/';

$keyFile = dirname(__DIR__, 2) . '/.pnp-gate-key.php';

function make_token(string $secret, int $exp): string
{
    return $exp . '.' . hash_hmac('sha256', 'v1|' . $exp, $secret);
}

function token_ok(string $token, string $secret): bool
{
    $parts = explode('.', $token, 2);
    if (count($parts) !== 2) {
        return false;
    }
    [$exp, $sig] = $parts;
    if ($exp === '' || !ctype_digit($exp) || (int) $exp < time()) {
        return false;
    }
    return hash_equals(hash_hmac('sha256', 'v1|' . $exp, $secret), $sig);
}

function no_store(): void
{
    header('Cache-Control: private, no-store, max-age=0');
    header('X-Robots-Tag: noindex, nofollow, noarchive, nosnippet');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: no-referrer');
}

function stop(int $code, string $message): void
{
    http_response_code($code);
    no_store();
    header('Content-Type: text/plain; charset=utf-8');
    echo $message . "\n";
    exit;
}

$uriPath = (string) parse_url($_SERVER['REQUEST_URI'] ?? PREFIX, PHP_URL_PATH);
if (strncmp($uriPath, PREFIX, strlen(PREFIX)) !== 0) {
    $uriPath = PREFIX;
}
$rel = rawurldecode(substr($uriPath, strlen(PREFIX)));

if ($rel === 'gate.php') {
    $rel     = '';
    $uriPath = PREFIX;
}

if (!is_file($keyFile)) {
    stop(503, "This page is closed. Its key file is missing, so the gate is refusing to open rather than guess.");
}

$key = require $keyFile;
if (!is_array($key) || empty($key['hash']) || empty($key['secret'])) {
    stop(503, "This page is closed. Its key file is unreadable, so the gate is refusing to open rather than guess.");
}

function safe_next(?string $candidate, string $fallback): string
{
    if ($candidate === null || $candidate === '') {
        return $fallback;
    }
    if (strncmp($candidate, PREFIX, strlen(PREFIX)) !== 0
        || strncmp($candidate, '//', 2) === 0
        || str_contains($candidate, "\n")
        || str_contains($candidate, "\r")) {
        return $fallback;
    }
    return $candidate;
}

$authed = isset($_COOKIE[COOKIE_NAME])
    && token_ok((string) $_COOKIE[COOKIE_NAME], (string) $key['secret']);

$error = '';

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST' && isset($_POST['gate_password'])) {
    usleep(400000);

    if (password_verify((string) $_POST['gate_password'], (string) $key['hash'])) {
        $exp = time() + (SESSION_DAYS * 86400);
        setcookie(COOKIE_NAME, make_token((string) $key['secret'], $exp), [
            'expires'  => $exp,
            'path'     => PREFIX,
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        no_store();
        header('Location: ' . safe_next($_POST['next'] ?? null, $uriPath), true, 303);
        exit;
    }

    $error  = 'That did not match. Tap the eye to check what you typed.';
    $authed = false;
}

if (!$authed) {
    render_form($uriPath, $error);
    exit;
}

// ---------------------------------------------------------------------------
// Authenticated. Resolve to a real file under this directory. Hostile until
// proven otherwise.
// ---------------------------------------------------------------------------

if (str_contains($rel, "\0")) {
    stop(400, 'Bad request.');
}

foreach (explode('/', $rel) as $segment) {
    if ($segment === '') {
        continue;
    }
    if ($segment === '.' || $segment === '..' || $segment[0] === '.') {
        stop(403, 'Not available.');
    }
}

$base     = (string) realpath(__DIR__);
$absolute = __DIR__ . '/' . $rel;

if (is_dir($absolute)) {
    if (!str_ends_with($uriPath, '/')) {
        no_store();
        header('Location: ' . $uriPath . '/', true, 301);
        exit;
    }
    $absolute = rtrim($absolute, '/') . '/index.html';
} elseif ($rel === '' || str_ends_with($rel, '/')) {
    $absolute = rtrim($absolute, '/') . '/index.html';
}

$real = realpath($absolute);

if ($real === false
    || !is_file($real)
    || strncmp($real, $base . DIRECTORY_SEPARATOR, strlen($base) + 1) !== 0) {
    stop(404, 'Not found.');
}

if (strtolower((string) pathinfo($real, PATHINFO_EXTENSION)) === 'php') {
    stop(403, 'Not available.');
}

$types = [
    'html' => 'text/html; charset=utf-8',
    'css'  => 'text/css; charset=utf-8',
    'js'   => 'text/javascript; charset=utf-8',
    'svg'  => 'image/svg+xml',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'webp' => 'image/webp',
    'ico'  => 'image/x-icon',
    'pdf'  => 'application/pdf',
    'txt'  => 'text/plain; charset=utf-8',
    'woff2'=> 'font/woff2',
];
$ext = strtolower((string) pathinfo($real, PATHINFO_EXTENSION));

no_store();
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));

while (ob_get_level() > 0) {
    ob_end_clean();
}
readfile($real);
exit;


// ---------------------------------------------------------------------------
// The form. One field, no username, and an eye, because the failure this is
// most likely to hit is a mistype on a phone, not an attacker.
// ---------------------------------------------------------------------------

function render_form(string $next, string $error): void
{
    http_response_code(401);
    no_store();
    header('Content-Type: text/html; charset=utf-8');
    $nextAttr  = htmlspecialchars($next, ENT_QUOTES, 'UTF-8');
    $errorHtml = htmlspecialchars($error, ENT_QUOTES, 'UTF-8');
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
<title>Private page</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
/* The same ledger stock and the same red pencil as the page behind it. This
   screen is the first thing the reader sees, so it cannot be a different
   house from the one it opens onto. */
:root{
  --paper:#EDEFE8; --ink:#191D16; --mute:#5A6154; --line:#CBD0C2;
  --field:#F7F8F4; --accent:#A61B2B; --err:#8A2418;
  --errbg:#FBEAE6; --errline:#E2B7AE; --errink:#8A2418;
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    --paper:#12160F; --ink:#E6EADD; --mute:#9AA491; --line:#2E362A;
    --field:#1A1F17; --accent:#F0736B;
    --errbg:#2A1614; --errline:#5C2A26; --errink:#F2B5AE;
  }
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  font-family:ui-serif,Georgia,'Times New Roman',serif;
  background:var(--paper); color:var(--ink);
  line-height:1.55; font-size:17px; -webkit-font-smoothing:antialiased;
  display:flex; align-items:center; justify-content:center; padding:24px;
}
main{width:100%; max-width:392px}
.mark{
  font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  font-size:11px; font-weight:600; letter-spacing:.14em; text-transform:uppercase;
  color:var(--mute); margin-bottom:20px;
}
h1{font-size:29px; font-weight:600; line-height:1.2; letter-spacing:-.012em; margin-bottom:10px}
.sub{color:var(--mute); font-size:16px; margin-bottom:26px}
label{
  display:block;
  font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase;
  color:var(--mute); margin-bottom:8px;
}
.field{position:relative; display:flex; align-items:center}
input[type=password],input[type=text]{
  width:100%; height:54px; padding:0 54px 0 15px;
  background:var(--field); border:1px solid var(--line); border-radius:2px;
  color:var(--ink);
  font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  font-size:17px;
}
/* The field is autofocused, so its focus state is the first thing the reader
   sees. A red border there reads as "you got it wrong" before anyone has typed
   anything. The ink border says attention, the faint red ring keeps the accent. */
input:focus{outline:none; border-color:var(--ink); box-shadow:0 0 0 3px rgba(166,27,43,.13)}
.eye{
  position:absolute; right:6px; width:44px; height:44px;
  display:flex; align-items:center; justify-content:center;
  background:none; border:0; border-radius:2px; cursor:pointer; color:var(--mute);
}
.eye:hover{color:var(--ink)}
.eye:focus-visible{outline:2px solid var(--accent); outline-offset:1px}
.eye svg{width:21px;height:21px;display:block}
.eye .off{display:none}
.eye[aria-pressed=true] .on{display:none}
.eye[aria-pressed=true] .off{display:block}
button.go{
  width:100%; height:52px; margin-top:18px; cursor:pointer;
  background:var(--ink); border:0; border-radius:2px; color:var(--paper);
  font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  font-weight:600; font-size:16px;
}
button.go:hover{background:#000}
button.go:focus-visible{outline:2px solid var(--accent); outline-offset:2px}
.err{
  margin-top:16px; padding:11px 13px; border-radius:2px; font-size:15px;
  background:var(--errbg); border:1px solid var(--errline); color:var(--errink);
  font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
}
.err + button.go{margin-top:12px}
.foot{
  margin-top:26px; padding-top:16px; border-top:1px solid var(--line);
  font-size:14px; color:var(--mute);
}
@media (max-width:400px){ body{padding:18px} h1{font-size:25px} }
</style>
</head>
<body>
<main>
  <p class="mark">boubacarbarry.com</p>
  <h1>This one is not public.</h1>
  <p class="sub">It was built for one reader. The password came with the link.</p>

  <form method="post" action="<?= $nextAttr ?>" autocomplete="on">
    <input type="hidden" name="next" value="<?= $nextAttr ?>">
    <label for="pw">Password</label>
    <div class="field">
      <input id="pw" name="gate_password" type="password" autocomplete="current-password"
             autofocus autocapitalize="off" autocorrect="off" spellcheck="false" required>
      <button type="button" class="eye" id="eye" aria-pressed="false" aria-controls="pw"
              aria-label="Show password" title="Show password">
        <svg class="on" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M1.6 12S5.5 4.9 12 4.9 22.4 12 22.4 12 18.5 19.1 12 19.1 1.6 12 1.6 12Z"/>
          <circle cx="12" cy="12" r="3.1"/>
        </svg>
        <svg class="off" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9.9 5.1A9.6 9.6 0 0 1 12 4.9c6.5 0 10.4 7.1 10.4 7.1a18 18 0 0 1-3.3 4.2M6.3 6.4A18 18 0 0 0 1.6 12S5.5 19.1 12 19.1a9.5 9.5 0 0 0 4-.85"/>
          <path d="M10 10a2.8 2.8 0 0 0 4 4"/>
          <path d="M2.5 2.5l19 19"/>
        </svg>
      </button>
    </div>

    <?php if ($errorHtml !== ''): ?>
      <p class="err" role="alert"><?= $errorHtml ?></p>
    <?php endif; ?>

    <button class="go" type="submit">Open it</button>
  </form>

  <p class="foot">One unlock lasts 60 days on this browser.</p>
</main>

<script>
(function () {
  var eye = document.getElementById('eye');
  var pw  = document.getElementById('pw');
  eye.addEventListener('click', function () {
    var showing = eye.getAttribute('aria-pressed') === 'true';
    var at = pw.selectionStart;
    pw.type = showing ? 'password' : 'text';
    eye.setAttribute('aria-pressed', showing ? 'false' : 'true');
    var label = showing ? 'Show password' : 'Hide password';
    eye.setAttribute('aria-label', label);
    eye.setAttribute('title', label);
    pw.focus();
    try { pw.setSelectionRange(at, at); } catch (e) {}
  });
})();
</script>
</body>
</html>
    <?php
}
