/**
 * review-save-client.js -- shared retry-with-backoff fetch wrapper for
 * boubacarbarry.com/review/ DB-backed decision + checklist pages.
 *
 * WHY THIS EXISTS (SYS-426, filed 2026-07-31, root-caused + fixed same day):
 * every one of these pages' save/toggle/note calls hits the orchestrator API
 * (agentshq.boubacarbarry.com/api/orc/...), and that container restarts on
 * every Gate auto-merge deploy (scripts/gate-deploy-watchdog.sh in the
 * agentsHQ repo runs `docker compose restart orchestrator` on essentially
 * every merge, not just ones that touch orchestrator code). Measured live
 * on the VPS the day this was built: shutdown-to-fully-ready spans ~29s
 * (17:55:10.95 shutdown start -> 17:55:40.17 "Application startup
 * complete", docker logs orc-crewai, 2026-07-31), and merges land often
 * enough that 13 restarts in 6h / 7 in 3h were observed in one session.
 * A request landing in that window fails at the network layer -- fetch()
 * rejects with a generic TypeError ("Failed to fetch"), not an HTTP
 * error -- and is retryable: the exact same request, moments later
 * against a live container, succeeds.
 *
 * An HTTP response, even an error one (4xx/5xx), means the server was
 * reachable and answered -- that is returned as-is, UNRETRIED, for the
 * caller to handle. Only a network-layer rejection (connection refused,
 * connection reset mid-request, timeout) is retried here.
 *
 * Backoff is sized to the MEASURED restart window, not a guess: 7 retries
 * after the first attempt, delays 500ms/1s/2s/4s/8s/8s/8s (sum ~31.5s),
 * comfortably covering the ~29s worst case observed above with margin.
 * A page cannot know in advance whether it is mid-restart, so it always
 * tries the fast path first and only pays the long tail if that path is
 * actually failing.
 *
 * This does not make a restart free -- it makes a save survive one. It is
 * a client-side mitigation layered on top of whatever server-side fix (if
 * any) ships later; it is not a substitute for reducing restart frequency
 * or blast radius, which is shared production infrastructure (the Gate /
 * VPS deploy path) and out of scope for a static-site change.
 *
 * USAGE:
 *   <script src="/review/shared/review-save-client.js"></script>
 *   ReviewSaveClient.fetchWithRetry(url, opts, onRetry)
 *     .then(function(res){ ... })
 *     .catch(function(err){ ... }); // only reached after all retries exhausted
 *
 * onRetry (optional): function(attemptNumber, attemptsRemaining) called
 * immediately before each retry's sleep, so the caller can show a
 * "retrying..." state distinct from a final SAVE FAILED banner. Never
 * allowed to throw back into the retry loop -- a UI bug in the callback
 * must not turn into a lost save.
 */
(function (global) {
  'use strict';

  // 7 retries after the first attempt; sum of delays ~31.5s, sized to the
  // measured ~29s worst-case orchestrator restart window (see header).
  var DELAYS_MS = [500, 1000, 2000, 4000, 8000, 8000, 8000];

  function fetchWithRetry(url, opts, onRetry) {
    function attempt(remaining) {
      return fetch(url, opts).catch(function (err) {
        if (remaining <= 0) throw err;
        var idx = DELAYS_MS.length - remaining;
        if (typeof onRetry === 'function') {
          try { onRetry(idx + 1, remaining); } catch (e) { /* never let a UI callback break the retry loop */ }
        }
        var delay = DELAYS_MS[idx];
        return new Promise(function (resolve) { setTimeout(resolve, delay); })
          .then(function () { return attempt(remaining - 1); });
      });
    }
    return attempt(DELAYS_MS.length);
  }

  global.ReviewSaveClient = { fetchWithRetry: fetchWithRetry };
})(window);
