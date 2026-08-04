<?php
declare(strict_types=1);

// ---------------------------------------------------------------------------
// The password gate for /review/.
//
// What was here before was a <div class="gate"> hidden with CSS and dismissed
// by adding a class to <body>. That hides the page from a visitor, not from
// anyone who reads the response: a plain request returned the whole document,
// password panel and all. The only thing protecting this area was that the
// addresses were hard to guess.
//
// This file replaces that. Every request under /review/ is rewritten here by
// .htaccess. Nothing under this directory is served by the web server itself
// any more, so there is no longer a way to read a page without holding a valid
// session. The bytes never leave the machine unauthenticated.
//
// The password itself is NOT in this file and NOT in this repository, which is
// public. It lives as a bcrypt hash in a file one level above public_html:
// outside the web root so no request can reach it, outside the deploy tree so
// neither a git pull nor the clean-replace API deploy touches it. See
// _setup-gate.php for how it gets there.
//
// If that key file is missing the gate fails CLOSED and serves nothing. A gate
// that opens when its lock goes missing is not a gate.
// ---------------------------------------------------------------------------

const COOKIE_NAME   = 'bb_review';
const SESSION_DAYS  = 30;
const REVIEW_PREFIX = '/review/';

$keyFile = dirname(__DIR__, 2) . '/.review-gate-key.php';

// ---------------------------------------------------------------------------
// Session token. The cookie carries its own expiry plus an HMAC over it, so a
// forged or edited cookie fails the signature check. The signing secret sits
// beside the password hash, above the web root.
// ---------------------------------------------------------------------------

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

// Return type is void rather than never so this still parses on PHP 8.0, which
// some Hostinger plans still default to.
function stop(int $code, string $message): void
{
    http_response_code($code);
    no_store();
    header('Content-Type: text/plain; charset=utf-8');
    echo $message . "\n";
    exit;
}

// ---------------------------------------------------------------------------
// The request path, taken from REQUEST_URI rather than a rewrite capture so
// the decoding is done once, here, by code that then validates it.
// ---------------------------------------------------------------------------

$uriPath = (string) parse_url($_SERVER['REQUEST_URI'] ?? REVIEW_PREFIX, PHP_URL_PATH);
if (strncmp($uriPath, REVIEW_PREFIX, strlen(REVIEW_PREFIX)) !== 0) {
    $uriPath = REVIEW_PREFIX;
}
$rel = rawurldecode(substr($uriPath, strlen(REVIEW_PREFIX)));

// A direct hit on the gate is a request for the section front door.
if ($rel === 'gate.php') {
    $rel     = '';
    $uriPath = REVIEW_PREFIX;
}

if (!is_file($keyFile)) {
    stop(503, "This area is closed. Its key file is missing, so the gate is refusing to open rather than guess.");
}

/** @var array{hash:string,secret:string} $key */
$key = require $keyFile;
if (!is_array($key) || empty($key['hash']) || empty($key['secret'])) {
    stop(503, "This area is closed. Its key file is unreadable, so the gate is refusing to open rather than guess.");
}

// ---------------------------------------------------------------------------
// Where to land after a successful unlock. Only paths inside /review/ are
// accepted, so the form cannot be pointed at another site.
// ---------------------------------------------------------------------------

function safe_next(?string $candidate, string $fallback): string
{
    if ($candidate === null || $candidate === '') {
        return $fallback;
    }
    // A protocol-relative "//evil.example" is still an absolute URL.
    if (strncmp($candidate, REVIEW_PREFIX, strlen(REVIEW_PREFIX)) !== 0
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
    // bcrypt is already slow on purpose; this widens the floor a little so a
    // script guessing against the form gets a worse rate than the network.
    usleep(400000);

    if (password_verify((string) $_POST['gate_password'], (string) $key['hash'])) {
        $exp = time() + (SESSION_DAYS * 86400);
        setcookie(COOKIE_NAME, make_token((string) $key['secret'], $exp), [
            'expires'  => $exp,
            'path'     => REVIEW_PREFIX,
            'secure'   => true,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        no_store();
        header('Location: ' . safe_next($_POST['next'] ?? null, $uriPath), true, 303);
        exit;
    }

    $error  = 'That password did not match. Check it with the eye, then try again.';
    $authed = false;
}

if (!$authed) {
    render_form($uriPath, $error);
    exit;
}

// ---------------------------------------------------------------------------
// Authenticated. Resolve the request to a real file under this directory and
// hand it over. Everything below assumes the path is hostile until proven
// otherwise.
// ---------------------------------------------------------------------------

if (str_contains($rel, "\0")) {
    stop(400, 'Bad request.');
}

foreach (explode('/', $rel) as $segment) {
    if ($segment === '' ) {
        continue;
    }
    if ($segment === '.' || $segment === '..') {
        stop(403, 'Not available.');
    }
    // Keeps the existing denial of .review-manifest.json and any other dotfile
    // in force. Those are blocked directly by .htaccess; without this line the
    // gate would become a way around that.
    if ($segment[0] === '.') {
        stop(403, 'Not available.');
    }
}

$base     = (string) realpath(__DIR__);
$absolute = __DIR__ . '/' . $rel;

if (is_dir($absolute)) {
    // A directory served in place breaks every relative link inside it, which
    // is the trailing-slash trap this site has already been bitten by. Send the
    // browser to the slashed address first and let it ask again.
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

// Never hand back source. gate.php and the setup script both live here.
if (strtolower((string) pathinfo($real, PATHINFO_EXTENSION)) === 'php') {
    stop(403, 'Not available.');
}

$types = [
    'html' => 'text/html; charset=utf-8',
    'htm'  => 'text/html; charset=utf-8',
    'css'  => 'text/css; charset=utf-8',
    'js'   => 'text/javascript; charset=utf-8',
    'json' => 'application/json',
    'svg'  => 'image/svg+xml',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif'  => 'image/gif',
    'webp' => 'image/webp',
    'avif' => 'image/avif',
    'ico'  => 'image/x-icon',
    'pdf'  => 'application/pdf',
    'txt'  => 'text/plain; charset=utf-8',
    'csv'  => 'text/csv; charset=utf-8',
    'xml'  => 'application/xml',
    'woff' => 'font/woff',
    'woff2'=> 'font/woff2',
    'mp4'  => 'video/mp4',
    'webm' => 'video/webm',
    'zip'  => 'application/zip',
];
$ext = strtolower((string) pathinfo($real, PATHINFO_EXTENSION));

no_store();
header('Content-Type: ' . ($types[$ext] ?? 'application/octet-stream'));
readfile($real);
exit;


// ---------------------------------------------------------------------------
// The form. One field, no username, and an eye that shows what was typed,
// because the failure this is most likely to hit is a mistype, not an attacker.
// ---------------------------------------------------------------------------

function render_form(string $next, string $error): void
{
    http_response_code($error === '' ? 401 : 401);
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
<title>Locked &middot; boubacarbarry.com</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Spectral:wght@400;600&family=Public+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#05121F; --panel:#0A2035; --line:#173A57; --line-soft:#12304A;
  --ink:#EAF3F8; --ink-mute:#93AFC4; --ink-faint:#6C8BA3;
  --cyan:#00B7C2; --cyan-hi:#5BE9F0; --orange:#FF7A00; --red:#FF6B6B;
  --f-display:'Spectral',Georgia,serif;
  --f-body:'Public Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --f-mono:'JetBrains Mono',ui-monospace,Menlo,Consolas,monospace;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{
  font-family:var(--f-body); background:var(--bg); color:var(--ink);
  line-height:1.6; font-size:16px; -webkit-font-smoothing:antialiased;
  display:flex; align-items:center; justify-content:center;
  padding:24px; position:relative; overflow-x:hidden;
}
/* The measured grid the rest of the house uses. Drafting paper, not decoration. */
body::before{
  content:""; position:fixed; inset:0; pointer-events:none; z-index:0;
  background-image:
    linear-gradient(rgba(23,58,87,.30) 1px, transparent 1px),
    linear-gradient(90deg, rgba(23,58,87,.30) 1px, transparent 1px);
  background-size:64px 64px;
  mask-image:radial-gradient(ellipse 70% 60% at 50% 40%, #000 20%, transparent 80%);
  -webkit-mask-image:radial-gradient(ellipse 70% 60% at 50% 40%, #000 20%, transparent 80%);
}
.card{
  position:relative; z-index:1; width:100%; max-width:420px;
  background:var(--panel); border:1px solid var(--line); border-radius:4px;
  padding:36px 32px 32px;
}
/* Corner ticks: the registration marks on a drawing sheet. */
.card::before,.card::after{
  content:""; position:absolute; width:14px; height:14px; pointer-events:none;
}
.card::before{top:-1px;left:-1px;border-top:2px solid var(--cyan);border-left:2px solid var(--cyan)}
.card::after{bottom:-1px;right:-1px;border-bottom:2px solid var(--cyan);border-right:2px solid var(--cyan)}
.k{
  font-family:var(--f-mono); font-size:11px; letter-spacing:.16em;
  text-transform:uppercase; color:var(--cyan); margin-bottom:14px;
}
h1{font-family:var(--f-display); font-weight:600; font-size:27px; line-height:1.25; margin-bottom:10px}
.sub{color:var(--ink-mute); font-size:14.5px; margin-bottom:26px}
label{
  display:block; font-family:var(--f-mono); font-size:11px; letter-spacing:.12em;
  text-transform:uppercase; color:var(--ink-faint); margin-bottom:8px;
}
.field{position:relative; display:flex; align-items:center}
input[type=password],input[type=text]{
  width:100%; height:52px; padding:0 52px 0 15px;
  background:#061a2c; border:1px solid var(--line); border-radius:3px;
  color:var(--ink); font-family:var(--f-mono); font-size:16px; letter-spacing:.04em;
}
input:focus{outline:none; border-color:var(--cyan); box-shadow:0 0 0 3px rgba(0,183,194,.16)}
.eye{
  position:absolute; right:5px; width:44px; height:44px;
  display:flex; align-items:center; justify-content:center;
  background:none; border:0; border-radius:3px; cursor:pointer; color:var(--ink-faint);
}
.eye:hover{color:var(--cyan-hi)}
.eye:focus-visible{outline:2px solid var(--cyan); outline-offset:1px}
.eye svg{width:21px;height:21px;display:block}
.eye .off{display:none}
.eye[aria-pressed=true]{color:var(--cyan)}
.eye[aria-pressed=true] .on{display:none}
.eye[aria-pressed=true] .off{display:block}
button.go{
  width:100%; height:50px; margin-top:18px; cursor:pointer;
  background:var(--cyan); border:0; border-radius:3px; color:#04121d;
  font-family:var(--f-body); font-weight:600; font-size:15px; letter-spacing:.02em;
}
button.go:hover{background:var(--cyan-hi)}
button.go:focus-visible{outline:2px solid var(--cyan-hi); outline-offset:2px}
.err{
  margin-top:16px; padding:11px 13px; border-radius:3px; font-size:14px;
  background:rgba(255,107,107,.10); border:1px solid rgba(255,107,107,.42); color:#FFC9C9;
}
.foot{
  margin-top:26px; padding-top:16px; border-top:1px solid var(--line-soft);
  font-size:12.5px; color:var(--ink-faint);
}
@media (max-width:400px){
  body{padding:16px}
  .card{padding:28px 20px 24px}
  h1{font-size:23px}
}
</style>
</head>
<body>
<main class="card">
  <p class="k">Private &middot; boubacarbarry.com</p>
  <h1>This one is not public.</h1>
  <p class="sub">Working pages live behind this. Enter the password to read them.</p>

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

    <button class="go" type="submit">Unlock</button>
  </form>

  <?php if ($errorHtml !== ''): ?>
    <p class="err" role="alert"><?= $errorHtml ?></p>
  <?php endif; ?>

  <p class="foot">One unlock covers everything under this address for 30 days on this browser.</p>
</main>

<script>
(function () {
  var eye = document.getElementById('eye');
  var pw  = document.getElementById('pw');
  eye.addEventListener('click', function () {
    var showing = eye.getAttribute('aria-pressed') === 'true';
    // Moving the caret back to the end keeps typing where the eye found it.
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
