// deploy-static-hostinger.mjs -- deploy boubacarbarry.com via the Hostinger MCP
// (hosting_deployStaticWebsite). Use this when the GitHub->Hostinger webhook does
// not apply pushes (observed 2026-06-16: webhook returned 200 but deployed nothing).
//
// Run ON THE VPS (token + network live there):
//   cd /root/agentsHQ/output/websites/boubacarbarry-site
//   git fetch origin -q && git reset --hard origin/main
//   TS=$(date +%Y%m%d_%H%M%S)
//   git archive --prefix=deploy/ --format=zip -o /tmp/bbsite_$TS.zip HEAD
//   export API_TOKEN=$(grep ^HOSTINGER_API_TOKEN= /root/agentsHQ/.env | cut -d= -f2-)
//   node scripts/deploy-static-hostinger.mjs boubacarbarry.com /tmp/bbsite_$TS.zip
//
// Deploy is a CLEAN REPLACE of public_html -- the archive must be the COMPLETE site
// (git archive of the full tracked tree, wrapped in deploy/ which Hostinger strips).
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

const srv = spawn("npx", ["-y", "hostinger-api-mcp@latest"], { env: { ...process.env }, stdio: ["pipe", "pipe", "inherit"] });
const rl = readline.createInterface({ input: srv.stdout });
const send = (o) => srv.stdin.write(JSON.stringify(o) + "\n");
let done = false;

rl.on("line", (line) => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  if (m.id === 1) {
    send({ jsonrpc: "2.0", method: "notifications/initialized" });
    send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "hosting_deployStaticWebsite", arguments: { domain, archivePath, removeArchive: false } } });
  } else if (m.id === 2) {
    console.log("RESULT:", JSON.stringify(m.result || m.error));
    done = true;
    srv.kill();
    process.exit(m.error ? 1 : 0);
  }
});

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "deploy-cli", version: "1.0.0" } } });
setTimeout(() => { if (!done) { console.error("TIMEOUT"); srv.kill(); process.exit(2); } }, 240000);
