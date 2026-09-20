// deploy-static-hostinger.mjs -- deploy boubacarbarry.com via the Hostinger MCP
// (hosting_deployStaticWebsite). Use this when the GitHub->Hostinger webhook does
// not apply pushes (observed 2026-06-16: webhook returned 200 but deployed nothing).
//
// STEP 0 (MANDATORY, NEVER SKIP): regenerate the review hub from the current review/
// directory BEFORE building the archive, or the live /review/ index ships stale. The
// rebuild self-populates new pages, auto-archives aged ones, and verifies card counts.
// On a machine WITH PowerShell:
//   pwsh ./scripts/rebuild-review-index.ps1
//   git add review/ && git commit -m "review: rebuild index" || true  # no-op if clean
//   git push origin main
// On a machine WITHOUT PowerShell (e.g. the VPS): do the rebuild + commit from a
// PowerShell host first (laptop), push, THEN run the archive below against origin/main.
// The CI sync-check (.github/workflows/review-sync.yml) is the backstop: it fails the
// push if the committed index is out of sync, so a skipped rebuild cannot ship stale.
//
// Run ON THE VPS (token + network live there):
//   cd /root/agentsHQ/output/websites/boubacarbarry-site
//   git fetch origin -q && git reset --hard origin/main   # picks up the STEP 0 rebuild commit
//   TS=$(date +%Y%m%d_%H%M%S)
//   git archive --prefix=deploy/ --format=zip -o /tmp/bbsite_$TS.zip HEAD
//   export API_TOKEN=$(grep ^HOSTINGER_API_TOKEN= /root/agentsHQ/.env | cut -d= -f2-)
//   node scripts/deploy-static-hostinger.mjs boubacarbarry.com /tmp/bbsite_$TS.zip
//
// Deploy is a CLEAN REPLACE of public_html -- the archive must be the COMPLETE site
// (git archive of the full tracked tree, wrapped in deploy/ which Hostinger strips).
// NEVER deploy a partial archive: it WIPES the live site.
// After deploy, verify from the VPS: every page 200 + /review/ card count == manifest.
import { spawn } from "node:child_process";
import readline from "node:readline";

const [, , domain, archivePath] = process.argv;
if (!domain || !archivePath) {
  console.error("usage: node deploy-static-hostinger.mjs <domain> <archivePath.zip>");
  process.exit(2);
}
if (!process.env.API_TOKEN) {
  console.error("API_TOKEN env var required (Hostinger API token).");
  process.exit(2);
}

// 2026-09-20 (SYS: bbsite-autodeploy false-negative fix). Root cause of a run
// of "deploy FAILED" alerts that turned out to be false: the child MCP
// process (`npx hostinger-api-mcp`) can legitimately take longer than the
// old 240s timeout to finish the TUS archive upload + trigger a deploy on a
// slow Hostinger tick. When that happened, this script's own timeout fired
// FIRST, called srv.kill(), and the child then threw an uncaught EPIPE while
// still trying to write to its now-closed stdin/stdout pipe -- crashing the
// whole node process with a non-zero exit even though the log line
// immediately above the crash read "Successfully triggered deployment for
// boubacarbarry.com". The deploy had already succeeded; only this wrapper's
// bookkeeping (and the alert it fired) was wrong. Confirmed on the VPS host
// log (/var/log/boubacarbarry_autodeploy.log) and by curling the live site
// for content that only exists in the commit the "failed" run was deploying.
//
// Two independent fixes, both scoped to this file (the deploy logic itself
// -- domain, archivePath, removeArchive -- is unchanged):
//   1. The timeout is raised 240s -> 480s. A full-site TUS upload is I/O
//      bound on Hostinger's side, not agentsHQ's; doubling the budget trades
//      a slower failure report for far fewer false negatives.
//   2. `srv` now has an 'error' listener. Node treats an unhandled 'error'
//      event on a stream as fatal-and-uncaught by design; catching it here
//      turns a crash into an ordinary, already-decided exit instead. It
//      cannot mask a REAL failure: `done` is only ever set true after the
//      MCP server's own tools/call response (id===2) has been read and
//      printed, so an error before that point still exits non-zero exactly
//      as it did before -- this only stops a POST-completion pipe error from
//      overriding a result this script already saw and reported.
let done = false;
let exitCode = null;

const srv = spawn("npx", ["-y", "hostinger-api-mcp@latest"], { env: { ...process.env }, stdio: ["pipe", "pipe", "inherit"] });

srv.on("error", (err) => {
  // Fires for spawn failures AND for a write to an already-closed pipe
  // (EPIPE). If we already decided an exit code from a real MCP response,
  // that decision stands -- this handler only prevents an UNCAUGHT crash
  // from clobbering it. If we have NOT decided yet, this genuinely is a
  // failure (the child died before answering) and exits non-zero.
  console.error("MCP child process error:", err && err.message ? err.message : err);
  if (exitCode === null) exitCode = 1;
  process.exit(exitCode);
});

const rl = readline.createInterface({ input: srv.stdout });
const send = (o) => {
  try {
    srv.stdin.write(JSON.stringify(o) + "\n");
  } catch (err) {
    // A write after the pipe is gone must not crash the process (see the
    // 'error' handler above for the matching async case) -- log and let the
    // existing flow (timeout or the 'error' listener) decide the exit code.
    console.error("MCP stdin write failed:", err && err.message ? err.message : err);
  }
};

rl.on("line", (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.id === 1) {
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "hosting_deployStaticWebsite", arguments: { domain, archivePath, removeArchive: false } } });
  } else if (m.id === 2) {
    console.log("RESULT:", JSON.stringify(m.result || m.error));
    done = true;
    exitCode = m.error ? 1 : 0;
    srv.kill();
    process.exit(exitCode);
  }
});

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "deploy-cli", version: "1.0.0" } } });
setTimeout(() => {
  if (!done) {
    console.error("TIMEOUT");
    exitCode = 2;
    srv.kill();
    process.exit(exitCode);
  }
}, 480000);
