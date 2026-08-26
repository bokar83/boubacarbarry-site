<?php
/**
 * Continue? -- server-side passphrase gate for boubacarbarry.com/continue/.
 *
 * DEPLOYED AS A PATH, NOT A SUBDOMAIN, and that is deliberate. The two gates
 * already live on this domain (/review/ and /profit-and-purpose/) are paths on
 * boubacarbarry.com, deployed by the same git-push-to-Hostinger pipeline that
 * carries the rest of the site. A subdomain would need a DNS record created by
 * hand in a control panel before a single byte could ship, and would buy
 * nothing this gate does not already have. So the key file, the cookie path and
 * the served root are all scoped to THIS DIRECTORY rather than to a document
 * root, which is the only structural difference from the subdomain draft.
 *
 * Same mechanism as the two gates already live on this domain (/review/ and
 * /profit-and-purpose/), pointed at its own key file so no two gates ever share
 * a secret. See memory/reference_review_password_gate_2026_08_04.md.
 *
 * The whole subdomain is rewritten to this file by .htaccess, so the web server
 * serves nothing in this tree directly. An unauthenticated request gets a login
 * form and no content, including for the Pyodide payload under vendor/.
 *
 * TWO tokens are minted, deliberately, and they are not interchangeable:
 *
 *   - the SESSION cookie, HttpOnly, five days, signed over "s1|<exp>". It is
 *     what keeps him logged in. JavaScript can never read it.
 *   - the API token, sixty minutes, signed over "v1|<exp>", injected into the
 *     served HTML as window.DOJO_TOKEN. It is what the page presents to the
 *     Supabase Edge Functions.
 *
 * The two signatures cover different prefixes, so a stolen cookie cannot be
 * replayed as an API token and a leaked page token cannot extend a session.
 * The page token is short-lived precisely because it is the one that is visible
 * to script and therefore the one an XSS could take.
 *
 * Fails CLOSED. Missing or malformed key file means 503 for everything, never
 * an open door.
 */

declare(strict_types=1);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

// The user-visible name, defined ONCE. The app shell carries the same name in
// index.html; if that changes, change it here in the same commit. A login page
// branded differently from the page it opens reads as the wrong site.
const DOJO_NAME            = 'Continue?';

/**
 * The one URL path this gate owns. Every absolute reference below is built from
 * this, so moving the directory means changing this line and the RewriteBase in
 * .htaccess, and nothing else.
 */
const DOJO_PREFIX          = '/continue/';

const DOJO_COOKIE          = 'continue_session';
const DOJO_SESSION_SECONDS = 5 * 24 * 60 * 60;  // five days, matching the pnp gate
const DOJO_API_SECONDS     = 60 * 60;           // one hour
const DOJO_MAX_ATTEMPTS    = 8;                 // per IP (or IPv6 /64), per window
const DOJO_GLOBAL_MAX_ATTEMPTS = 40;            // across ALL addresses, per window
const DOJO_LOCKOUT_SECONDS = 900;               // fifteen minutes

/**
 * The directory this gate serves. Everything it will ever hand out lives inside
 * it, and nothing outside it is reachable through this file.
 */
function dojo_doc_root(): string
{
    return __DIR__;
}

/**
 * The key file lives one level ABOVE public_html for two reasons: no HTTP
 * request can reach it, and the Hostinger clean-replace deploy wipes everything
 * inside public_html but never touches its parent.
 *
 * __DIR__ is public_html/continue, so dirname(__DIR__, 2) is the parent of
 * public_html. Same anchor the /profit-and-purpose/ gate uses, and it is
 * anchored on __DIR__ rather than DOCUMENT_ROOT on purpose: DOCUMENT_ROOT is
 * whatever the server says it is, while __DIR__ is where this file actually
 * sits.
 */
function dojo_key_path(): string
{
    return dirname(__DIR__, 2) . '/.continue-gate-key.php';
}

function dojo_state_path(): string
{
    return dirname(__DIR__, 2) . '/.continue-gate-attempts.json';
}

/** The Supabase Functions base URL. Not a secret: the token is what authorises. */
function dojo_api_base(): string
{
    $key = dojo_load_key();
    return (string) ($key['api_base'] ?? '');
}

// ---------------------------------------------------------------------------
// Key material
// ---------------------------------------------------------------------------

/** @return array{hash:string,secret:string,api_base:string}|null */
function dojo_load_key(): ?array
{
    static $cached = null;
    static $tried  = false;
    if ($tried) {
        return $cached;
    }
    $tried = true;

    $path = dojo_key_path();

    // HIGH-2 guard, kept from the subdomain draft and re-pointed at the layout
    // this actually ships in. The key file must never land somewhere an HTTP
    // request can reach. Rather than assume the directory maths above is right
    // on whatever Hostinger hands us, check the result directly: if the key
    // file's directory turns out to sit INSIDE the live document root, refuse.
    // A 503 he notices in a minute beats a bcrypt hash and a signing secret
    // quietly published on the public site.
    $docRoot = realpath((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''));
    $keyDir  = realpath(dirname($path));
    if ($docRoot !== false && $keyDir !== false
        && strncmp($keyDir . DIRECTORY_SEPARATOR, $docRoot . DIRECTORY_SEPARATOR, strlen($docRoot) + 1) === 0) {
        error_log('continue gate: key directory ' . $keyDir . ' is inside the document root; refusing');
        return null;
    }

    if (!is_readable($path)) {
        return null;
    }
    /** @psalm-suppress UnresolvableInclude */
    $data = @include $path;
    if (!is_array($data)) {
        return null;
    }
    $hash   = (string) ($data['hash'] ?? '');
    $secret = (string) ($data['secret'] ?? '');
    // A short signing secret is a broken signing secret. Refuse rather than
    // silently accepting a weak one, because nothing downstream would notice.
    if ($hash === '' || strlen($secret) < 32) {
        return null;
    }
    $cached = [
        'hash'     => $hash,
        'secret'   => $secret,
        'api_base' => (string) ($data['api_base'] ?? ''),
    ];
    return $cached;
}

// ---------------------------------------------------------------------------
// Token minting and verification
// ---------------------------------------------------------------------------

function dojo_mint(string $prefix, int $ttl): string
{
    $key = dojo_load_key();
    if ($key === null) {
        return '';
    }
    $exp = time() + $ttl;
    $sig = hash_hmac('sha256', $prefix . '|' . $exp, $key['secret']);
    return $exp . '.' . $sig;
}

function dojo_verify(string $prefix, string $token): bool
{
    $key = dojo_load_key();
    if ($key === null || $token === '') {
        return false;
    }
    $parts = explode('.', $token);
    if (count($parts) !== 2) {
        return false;
    }
    [$exp, $sig] = $parts;
    if (!preg_match('/^\d+$/D', $exp)) {
        return false;
    }
    if ((int) $exp < time()) {
        return false;
    }
    $expected = hash_hmac('sha256', $prefix . '|' . $exp, $key['secret']);
    // hash_equals is the constant-time compare. A plain === here would leak the
    // signature one byte at a time to anyone patient enough to measure.
    return hash_equals($expected, strtolower($sig));
}

function dojo_is_authed(): bool
{
    return dojo_verify('s1', (string) ($_COOKIE[DOJO_COOKIE] ?? ''));
}

function dojo_set_cookie(string $token, int $ttl): void
{
    setcookie(DOJO_COOKIE, $token, [
        'expires'  => time() + $ttl,
        // Scoped to this directory, not to the whole domain. The rest of
        // boubacarbarry.com is a different site with its own gates, and none of
        // them should ever be handed this cookie.
        'path'     => DOJO_PREFIX,
        'secure'   => true,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

// ---------------------------------------------------------------------------
// Login throttling
// ---------------------------------------------------------------------------

/**
 * Per-IP failed-attempt throttle. Deliberately a flat file: this gate serves one
 * person, and a dependency on anything else is a dependency that can be down at
 * the moment the gate is most needed. If the file cannot be written the gate
 * still works, it just stops throttling, which is the correct tradeoff for a
 * personal tool where locking the owner out is the worse failure.
 */
function dojo_attempts(): array
{
    $raw = @file_get_contents(dojo_state_path());
    $data = $raw === false ? [] : json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function dojo_client_ip(): string
{
    // Confirmed 2026-08-04 on this host: no proxy in front, REMOTE_ADDR is the
    // true client address and X-Forwarded-For is absent. Trusting a forwarded
    // header here would let a caller reset its own throttle by lying.
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? 'unknown');
    // Key IPv6 on the /64, not the full address. A single allocation hands an
    // attacker on the order of 1.8e19 distinct addresses, so a per-address
    // counter is not a rate limit, it is a formality.
    if (strpos($ip, ':') !== false) {
        $parts = explode(':', $ip);
        $ip = implode(':', array_slice($parts, 0, 4)) . '::/64';
    }
    return $ip;
}

/**
 * A global failure counter alongside the per-IP one. For a tool with exactly
 * one legitimate user this costs nothing and closes the address-rotation hole
 * that a per-IP limit structurally cannot: rotating addresses does not rotate
 * this counter.
 */
function dojo_global_locked_out(): bool
{
    $all = dojo_attempts();
    $g = $all['__global__'] ?? null;
    return is_array($g) && (int) ($g['until'] ?? 0) > time();
}

function dojo_locked_out(): bool
{
    $all = dojo_attempts();
    $rec = $all[dojo_client_ip()] ?? null;
    if (!is_array($rec)) {
        return false;
    }
    if ((int) ($rec['until'] ?? 0) > time()) {
        return true;
    }
    return dojo_global_locked_out();
}

function dojo_record_failure(): void
{
    $all = dojo_attempts();
    $ip  = dojo_client_ip();
    $now = time();
    $rec = $all[$ip] ?? ['count' => 0, 'first' => $now, 'until' => 0];
    if ($now - (int) ($rec['first'] ?? $now) > DOJO_LOCKOUT_SECONDS) {
        $rec = ['count' => 0, 'first' => $now, 'until' => 0];
    }
    $rec['count'] = (int) $rec['count'] + 1;
    if ($rec['count'] >= DOJO_MAX_ATTEMPTS) {
        $rec['until'] = $now + DOJO_LOCKOUT_SECONDS;
    }
    $all[$ip] = $rec;

    // The global counter, same window, a looser threshold.
    $g = $all['__global__'] ?? ['count' => 0, 'first' => $now, 'until' => 0];
    if ($now - (int) ($g['first'] ?? $now) > DOJO_LOCKOUT_SECONDS) {
        $g = ['count' => 0, 'first' => $now, 'until' => 0];
    }
    $g['count'] = (int) $g['count'] + 1;
    if ($g['count'] >= DOJO_GLOBAL_MAX_ATTEMPTS) {
        $g['until'] = $now + DOJO_LOCKOUT_SECONDS;
    }
    $all['__global__'] = $g;

    // Prune so the file cannot grow without bound from drive-by bot traffic.
    foreach ($all as $k => $v) {
        if ($now - (int) ($v['first'] ?? 0) > 86400) {
            unset($all[$k]);
        }
    }
    @file_put_contents(dojo_state_path(), json_encode($all), LOCK_EX);
}

function dojo_clear_failures(): void
{
    $all = dojo_attempts();
    unset($all[dojo_client_ip()]);
    // The global counter is deliberately NOT cleared here. One success must not
    // wipe the evidence of a spray happening at the same time.
    @file_put_contents(dojo_state_path(), json_encode($all), LOCK_EX);
}

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

/** Per-response nonce, so the one inline boot script needs no unsafe-inline. */
function dojo_nonce(): string
{
    static $n = null;
    if ($n === null) {
        $n = base64_encode(random_bytes(16));
    }
    return $n;
}

function dojo_security_headers(): void
{
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: DENY');
    header('Referrer-Policy: no-referrer');
    header('Cache-Control: no-store, private');
    // Scoped to this host only. includeSubDomains here would bind the parent
    // domain as well, which is not this gate's decision to make.
    header('Strict-Transport-Security: max-age=31536000');
    // window.DOJO_TOKEN is script-readable by design, so an XSS anywhere in the
    // app would be a token theft. The nonce means the injected boot block is
    // the only inline script that can run. wasm-unsafe-eval is what Pyodide
    // needs in order to exist at all.
    header(
        "Content-Security-Policy: default-src 'self'; "
        . "script-src 'self' 'wasm-unsafe-eval' 'nonce-" . dojo_nonce() . "'; "
        . "connect-src 'self' https://*.supabase.co; "
        . "style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
        . "base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    );
}

function dojo_503(): void
{
    dojo_security_headers();
    http_response_code(503);
    header('Content-Type: text/html; charset=utf-8');
    // Never name the missing key file. That tells an unauthenticated caller
    // exactly which lever is loose.
    echo '<!doctype html><meta charset="utf-8"><title>Unavailable</title>'
       . '<body style="font:16px system-ui;background:#12141a;color:#e6e8ee;padding:3rem">'
       . '<p>Not available right now.</p></body>';
    exit;
}

function dojo_login(string $notice = ''): void
{
    dojo_security_headers();
    http_response_code($notice === '' ? 401 : 401);
    header('Content-Type: text/html; charset=utf-8');
    $name = DOJO_NAME;
    $msg = $notice === '' ? '' : '<p class="notice">' . htmlspecialchars($notice, ENT_QUOTES, 'UTF-8') . '</p>';
    echo <<<HTML
<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>{$name}</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;
       background:#0f1116;color:#e6e8ee;
       font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;padding:1.5rem}
  form{width:100%;max-width:22rem}
  h1{font-size:1.15rem;font-weight:600;margin:0 0 .25rem}
  p.sub{margin:0 0 1.5rem;color:#8d93a3;font-size:.9rem}
  .row{position:relative}
  input{width:100%;padding:.8rem 2.75rem .8rem .9rem;border-radius:.5rem;
        border:1px solid #2a2f3d;background:#171a22;color:#e6e8ee;font-size:1rem}
  input:focus{outline:2px solid #FF6B35;outline-offset:1px;border-color:#FF6B35}
  button.eye{position:absolute;right:.35rem;top:50%;transform:translateY(-50%);
             background:none;border:0;color:#8d93a3;cursor:pointer;padding:.5rem;font-size:.8rem}
  button.go{width:100%;margin-top:.75rem;padding:.8rem;border:0;border-radius:.5rem;
            background:#FF6B35;color:#fff;font-size:1rem;font-weight:600;cursor:pointer}
  button.go:hover{background:#E05520}
  .notice{margin:0 0 1rem;padding:.7rem .9rem;border-radius:.5rem;
          background:#3a1d22;border:1px solid #6b2b34;color:#ffb4bd;font-size:.9rem}
</style>
</head><body>
<form method="post" autocomplete="off">
  <h1>{$name}</h1>
  <p class="sub">Enter your passphrase.</p>
  {$msg}
  <div class="row">
    <input id="pw" type="password" name="gate_password" autocomplete="current-password"
           autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus>
    <button class="eye" type="button" id="toggle" aria-label="Show passphrase">show</button>
  </div>
  <button class="go" type="submit">Enter</button>
</form>
<script>
  document.getElementById('toggle').addEventListener('click', function () {
    var i = document.getElementById('pw');
    var on = i.type === 'password';
    i.type = on ? 'text' : 'password';
    this.textContent = on ? 'hide' : 'show';
  });
</script>
</body></html>
HTML;
    exit;
}

// ---------------------------------------------------------------------------
// Static serving, once authenticated
// ---------------------------------------------------------------------------

/** The complete set of extensions this app legitimately serves. */
function dojo_type_map(): array
{
    return [
        'html' => 'text/html; charset=utf-8',
        'js'   => 'text/javascript; charset=utf-8',
        'mjs'  => 'text/javascript; charset=utf-8',
        'css'  => 'text/css; charset=utf-8',
        'json' => 'application/json; charset=utf-8',
        'wasm' => 'application/wasm',
        'zip'  => 'application/zip',
        'whl'  => 'application/zip',
        'svg'  => 'image/svg+xml',
        'png'  => 'image/png',
        'ico'  => 'image/x-icon',
        'woff2'=> 'font/woff2',
        'map'  => 'application/json; charset=utf-8',
        'ttf'  => 'font/ttf',
        'txt'  => 'text/plain; charset=utf-8',
    ];
}

function dojo_content_type(string $path): string
{
    $ext = strtolower((string) pathinfo($path, PATHINFO_EXTENSION));
    return dojo_type_map()[$ext] ?? 'application/octet-stream';
}

function dojo_serve(string $requested): void
{
    $root = realpath(dojo_doc_root());
    if ($root === false) {
        dojo_503();
    }

    // The request arrives as /continue/<something>. Strip the prefix this gate
    // owns before resolving against its own directory, or /continue/app.js
    // would be looked up as continue/continue/app.js and fall through to the
    // SPA shell for every asset.
    $rel = (string) (parse_url($requested, PHP_URL_PATH) ?: '/');
    if (strncmp($rel, DOJO_PREFIX, strlen(DOJO_PREFIX)) === 0) {
        $rel = substr($rel, strlen(DOJO_PREFIX));
    }
    $rel = ltrim($rel, '/');
    if ($rel === '') {
        $rel = 'index.html';
    }
    // Reject traversal and NUL injection before touching the filesystem. The
    // realpath containment check below is the real defence; this is the cheap
    // one that keeps obviously hostile paths out of the log in the first place.
    if (strpos($rel, "\0") !== false || strpos($rel, '..') !== false) {
        http_response_code(400);
        dojo_security_headers();
        exit;
    }

    $full = realpath($root . '/' . $rel);
    if ($full === false && substr($rel, -1) !== '/') {
        // Unknown path inside a single-page app: fall back to the shell.
        $full = realpath($root . '/index.html');
        $rel  = 'index.html';
    }
    if ($full !== false && is_dir($full)) {
        $full = realpath($full . '/index.html');
    }
    if ($full === false) {
        http_response_code(404);
        dojo_security_headers();
        echo 'Not found.';
        exit;
    }

    // Containment: the resolved real path must sit inside the document root.
    // This is what stops a symlink or a clever encoding from reaching the key
    // file one directory up.
    if (strncmp($full, $root . DIRECTORY_SEPARATOR, strlen($root) + 1) !== 0) {
        http_response_code(403);
        dojo_security_headers();
        exit;
    }

    // Never serve this gate, its installer, or any dotfile, whatever the path
    // resolution decided.
    $base = basename($full);
    if ($base === '' || $base[0] === '.') {
        http_response_code(403);
        dojo_security_headers();
        exit;
    }

    // An ALLOWLIST, not a denylist. The previous version blocked `.php` and
    // missed .phtml, .php5, .inc, .bak and .old. Nothing in the tree carries
    // those extensions today, which is precisely why the gap would have gone
    // unnoticed until someone dropped a gate.php.bak beside it. The type map is
    // already the definitive list of what this app serves, so it IS the gate.
    $ext = strtolower((string) pathinfo($full, PATHINFO_EXTENSION));
    if (!isset(dojo_type_map()[$ext])) {
        http_response_code(403);
        dojo_security_headers();
        exit;
    }

    dojo_security_headers();
    $type = dojo_content_type($full);
    header('Content-Type: ' . $type);

    if (substr($base, -5) === '.html') {
        // Inject the short-lived API token and the endpoint base into the shell.
        // Injection rather than a cookie because the page has to hand this value
        // to a cross-origin API, which a cookie cannot do.
        $html  = (string) file_get_contents($full);
        $token = dojo_mint('v1', DOJO_API_SECONDS);
        $boot  = '<script nonce="' . htmlspecialchars(dojo_nonce(), ENT_QUOTES, 'UTF-8') . '">window.DOJO_TOKEN='
               . json_encode($token, JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
               . ';window.DOJO_API='
               . json_encode(rtrim(dojo_api_base(), '/'), JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT)
               . ';</script>';
        if (strpos($html, '</head>') !== false) {
            $html = preg_replace('~</head>~i', $boot . '</head>', $html, 1);
        } else {
            $html = $boot . $html;
        }
        header('Content-Length: ' . strlen((string) $html));
        echo $html;
        exit;
    }

    // Everything else streams byte for byte. The Pyodide payload is large and
    // immutable per version, so it gets a long private cache lifetime; it is
    // still gated, it just does not get re-fetched on every page load.
    if (strpos($rel, 'vendor/') === 0) {
        header('Cache-Control: private, max-age=31536000, immutable');
    }
    header('Content-Length: ' . (string) filesize($full));
    readfile($full);
    exit;
}

// ---------------------------------------------------------------------------
// Request handling
// ---------------------------------------------------------------------------

// Under the CLI SAPI this file is being included by the test harness, which
// exercises the functions above directly. The gate itself only ever runs under
// a web SAPI, so there is no path where this check disables a live gate.
if (PHP_SAPI === 'cli') {
    return;
}

// Every asset in index.html is a RELATIVE url (vendor/..., app.js), and Pyodide
// is handed a relative indexURL too. At /continue those resolve against the
// domain root and every one of them 404s; at /continue/ they resolve
// correctly. Apache's own trailing-slash redirect cannot be relied on here
// because .htaccess rewrites the path into this file first, so make it explicit.
$reqPath = (string) (parse_url((string) ($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH) ?: '/');
if ($reqPath === rtrim(DOJO_PREFIX, '/')) {
    dojo_security_headers();
    header('Location: ' . DOJO_PREFIX, true, 301);
    exit;
}

$key = dojo_load_key();
if ($key === null) {
    dojo_503();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['gate_password'])) {
    if (dojo_locked_out()) {
        dojo_login('Too many attempts. Try again in a few minutes.');
    }
    $supplied = (string) $_POST['gate_password'];
    if (password_verify($supplied, $key['hash'])) {
        dojo_clear_failures();
        dojo_set_cookie(dojo_mint('s1', DOJO_SESSION_SECONDS), DOJO_SESSION_SECONDS);
        // Redirect after POST so a refresh does not re-submit the passphrase,
        // and so the passphrase never sits in a resubmitted request body.
        dojo_security_headers();
        header('Location: ' . DOJO_PREFIX, true, 303);
        exit;
    }
    dojo_record_failure();
    // Same message and same timing whether the passphrase was wrong or the
    // account was throttled a moment ago. Nothing here confirms a near miss.
    dojo_login('That passphrase is not right.');
}

if (!dojo_is_authed()) {
    dojo_login();
}

dojo_serve((string) ($_SERVER['REQUEST_URI'] ?? '/'));
