/* ===========================================================================
   SHARED YEAR-PAGE MONEY MAP -- renderer
   ---------------------------------------------------------------------------
   ONE component, every 12-week cycle. `/review/money-map-y1/index.html` is a
   short shell that loads this file and calls `MoneyMapYearPage.init({...})`
   with that cycle's board id, write token and anchor fallbacks. A new cycle
   page (y2, y3, ...) is that shell with two strings changed -- it cannot ship
   missing the action list, because it does not draw the action list, this does.

   WHY IT EXISTS (2026-08-31, day one of the Year One sprint)
   ----------------------------------------------------------
   Year One's page was hand-built with counters and a notes box and never got
   the live action list Year Zero always had. The data was fine -- hundreds of
   dated rows sat in the store the whole time -- but the page had nothing that
   read them, so opening it on the first morning of the sprint showed zero work
   to do. A hand-copied page is a page someone has to remember to finish. A
   shared component is not.

   WHAT IT DRAWS, top to bottom, in the order he asked for
   ------------------------------------------------------
     1. TRACKER      week, days left, collected vs target, required run rate,
                     the 12-week bar, the conversation counter, the anchor.
                     Its counters ride on the SUMMARY, so with every section
                     shut the tracker is still readable at the top -- which is
                     the whole point of the collapse.
     2. #1 RIGHT NOW a TILE, not a page. One clamped line collapsed; the
                     reasoning is one tap in. It used to open at full height
                     and push everything else below the fold.
     3. WORK TO DO   the ranked list, general lanes.
     4. REVENUE      the ranked list, money-generating lanes, at the bottom.
     5. NOTES + REF  his own timestamped notes and the anchor rows. Shut by
                     default; it is reference, not work.

   WHERE THE RANKING COMES FROM -- and why none of it is computed here
   -------------------------------------------------------------------
   The order is NOT re-derived in JavaScript. It is read from the `cos-worklist`
   row, which `scripts/publish_money_map_worklist.py` writes from
   `orchestrator/cos_office/ranking.py` -- the same ranker the 08:31 brief and
   the on-demand answer use. A second ranker in the browser would drift from
   the one he actually reads, which is the failure `priority_keys.py` was
   written to avoid. This file renders an order; it never decides one.

   HONESTY RULES BAKED IN (a signal that lies is worse than a crash)
   -----------------------------------------------------------------
     * A failed READ renders a red banner, never an empty list. "Nothing to do"
       and "I could not look" must never be the same picture.
     * A worklist whose own date is not today renders an amber banner naming
       the date it IS from. A stale ranking is usable; a stale ranking passing
       for a fresh one is not.
     * A missing worklist row says exactly which command publishes it.
     * A row with no first move says so and names the marker that would fix it.
       It never invents an instruction.
   =========================================================================== */

(function (root) {
  'use strict';

  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MOS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var WEEK_MS = 604800000;
  var PAGE_SIZE = 20;          // how many tiles render before "show all"
  var TABLE = 'y0_money_map_state';
  var UPSERT_RPC = 'y0_upsert';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function el(id) { return document.getElementById(id); }
  function dkey(d) {
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  // Denver-local YYYY-MM-DD, independent of the viewing device's own
  // timezone -- the same convention the /today-actions API's denver_date
  // field carries server-side. Used to decide whether a done-<key> write
  // timestamp counts as "today" for the live counter.
  var DENVER_FMT = (function () {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }); }
    catch (e) { return null; }
  })();
  function denverDateStr(d) {
    if (DENVER_FMT) { try { return DENVER_FMT.format(d); } catch (e) {} }
    return dkey(d); // fallback: device-local date if Intl/timezone data is unavailable
  }
  function parseDate(s, fallback) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : fallback;
  }

  function init(cfg) {
    cfg = cfg || {};
    var BOARD = cfg.boardId;
    var TOKEN = cfg.boardToken;
    var CONV_TARGET = cfg.convTarget || 5;
    var ASK_TARGET = cfg.askTarget || 5;     // a target to aim at, NEVER a gate
    var DAY_STRIP_DAYS = 14;                 // how far back the day-by-day strip looks
    var LSK = 'mm-' + BOARD + '-';
    var FALLBACK = cfg.fallback || {};
    var YEAR_START = parseDate(FALLBACK.startDate, new Date());
    var YEAR_END = parseDate(FALLBACK.endDate, new Date());
    var GOAL_TARGET = Number(FALLBACK.goalTarget) || 0;

    var state = {};
    var stateTs = {};
    var remoteOk = false;
    var readError = null;
    var expanded = {};          // section key -> showing all rows
    var sb = null;

    // ---- PER-ITEM CONTROLS (2026-08-31) ---------------------------------
    // Ported verbatim in behaviour from the Year Zero page, which has carried
    // these four controls since the weekend of 2026-08-28..30 and had them
    // ratified in decision D-20260830-06. They live HERE, in the shared
    // component, so y1 and every later cycle get them without anyone
    // remembering to copy a page: the exact failure that cost a working
    // morning on day one of the Year One sprint.
    //
    //   Done      -> done-<key> = '1' | '0'   in the same board KV store
    //   Reschedule-> push-<key>  = JSON { v, from, to, reason, ts, by }
    //                REQUIRES a real future date. His words: "I can only skip
    //                if I add a note with a new due date."
    //   Archive   -> archive-<key> = JSON { v, ts, reason, by }
    //                No date. Optional reason. Reversible via a tombstone.
    //   Notes     -> the content-review-decisions notes store, append-only,
    //                NOT gated behind skip or archive. A note on a live row is
    //                a first-class thing he can write any day.
    //
    // Every write is followed by a READ-BACK before anything on screen says
    // "saved". A 200 is a claim, not proof, and a silent failure on a board he
    // actually runs his day off is worse than no feature at all.
    var NOTES_API = cfg.notesApi || 'https://agentshq.boubacarbarry.com/api/orc/content-review-decisions';
    var NOTES_SLUG = cfg.notesSlug || ('money-map-' + BOARD);
    var NOTES = {};             // item key -> [ { note_text, created_at }, ... ]
    var NOTES_OPEN = {};        // item key -> true while its notes panel is open
    // REVIEW comes off the SAME /state read as NOTES (one fetch, no new call)
    // -- the 061 endpoint already returns {ok, items, notes} and only the
    // notes half was read before this build. item key -> {decision,
    // item_label, edited_text, facets} for a row registered on this page.
    var REVIEW = {};
    var REVIEW_EDIT_OPEN = {};  // item key -> true while its edit widget is open
    var REVIEW_SHOW_ORIG = {};  // item key -> true while showing the original+diff
    var notesLoaded = false;
    var notesReadError = null;
    var registered = {};        // item keys already self-registered with the notes store
    var itemOpen = {};          // item key -> its <details> tile is expanded
    var formOpen = {};          // item key -> 'push' | 'archive' | null

    function doneKey(k) { return 'done-' + k; }
    function pushKey(k) { return 'push-' + k; }
    function archiveKey(k) { return 'archive-' + k; }

    function isDone(k) { return state[doneKey(k)] === '1'; }

    // A JSON marker row, tolerant of a row that is not JSON at all and of the
    // { del: 1 } tombstone an undo writes. Nothing is ever deleted from this
    // store, so "not set" and "explicitly undone" both have to read as absent.
    function markerOf(rowKey) {
      var raw = state[rowKey];
      if (!raw) return null;
      var o = null;
      try { o = JSON.parse(raw); } catch (e) { return null; }
      if (!o || typeof o !== 'object' || o.del) return null;
      return o;
    }
    function pushOf(k) {
      var o = markerOf(pushKey(k));
      return (o && o.to) ? o : null;
    }
    function archiveOf(k) { return markerOf(archiveKey(k)); }

    // ---- DECIDED vs UNDECIDED (2026-08-31, requirement 6) -----------------
    // A row he has ACTED on -- ticked, moved, or archived -- must look
    // different from one nobody has touched. Before this, only done and
    // archived dulled; three rows moved to September sat at full brightness
    // at the top of the list, which is the opposite of what a reschedule is
    // for. Decided is any of the three dispositions the board supports.
    function isDecided(k) { return isDone(k) || !!pushOf(k) || !!archiveOf(k); }

    // ---- EFFECTIVE DUE DATE (2026-08-31, requirement 8) -------------------
    // A rescheduled row is due on its NEW date, not its original one. This
    // page has no date-sectioned display, so "moves under its new date"
    // becomes: it stops competing for today. A row whose effective date is in
    // the future sorts to the BOTTOM of its tier, dulls, and can never be the
    // #1. It is never hidden -- nothing on this board is ever hidden.
    // `push.to` wins when a reschedule marker exists; otherwise the row's own
    // published by_date stands.
    function effectiveDue(item) {
      var p = pushOf(String(item.key));
      if (p && p.to) return p.to;
      return item.by_date || null;
    }
    // TODAY is the DENVER date, never the viewer's. `dkey(new Date())` reads
    // the device clock, so a phone an hour past midnight MT would have called
    // a row due today "future" and, after 2026-09-01, removed it from the day
    // entirely. The day strip already computes the Denver date; this uses the
    // same function rather than a second notion of today.
    function todayStr() { return denverDateStr(new Date()); }
    function isFutureDated(item) {
      var d = effectiveDue(item);
      return !!d && d > todayStr();
    }

    // ---- MOVED TO A LATER DAY (2026-09-01) --------------------------------
    // R8 (2026-08-31) kept a row moved to September inside today's tier and
    // merely sank and dimmed it. On 2026-09-01 the Should tier held exactly
    // three rows and all three were stamped MOVED TO SEP 8 / 9 / 24, so the
    // sink was invisible and the tier read as three things to do today.
    // Boubacar, verbatim: "there are a lot of items that have new dates added
    // to them but that have not moved." Moved means moved IN TIME. So a
    // rescheduled row now leaves today's tier and renders under its own date
    // in its own section. It is still on the page, still carries all four
    // controls, and is still one tap away -- nothing on this board is hidden.
    //
    // Deliberately NARROWER than isFutureDated: this fires ONLY when a real
    // `push-` marker exists. A row that merely carries a future by_date and
    // was never rescheduled by anyone stays where the ranker put it. His
    // complaint was about the MOVED TO stamp, and quietly relocating rows
    // nobody rescheduled would be a bigger change than the one he asked for.
    function scheduledLater(item) {
      var p = pushOf(String(item.key));
      if (!p || !p.to) return null;
      return p.to > todayStr() ? p.to : null;
    }

    // ---- ACT MARKER (2026-08-31, money-map-actionable-items) --------------
    // `act-<key>` carries the owner + resource state + resource content for
    // an item -- see docs/prds/money-map-actionable-items/PRD.md S8.1. The
    // publisher (`scripts/publish_money_map_worklist.py`) reads this SAME row
    // server-side to classify owner; the template's copy below reads it again
    // client-side so a fresh approve/edit shows immediately without waiting
    // for the next publish run (ranking/classification stay server-only --
    // this is a live read of the same marker, never a second classifier).
    function actKey(k) { return 'act-' + k; }
    function actOf(k) { return markerOf(actKey(k)); }

    function noteClock(iso) {
      try {
        return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      } catch (e) { return String(iso).slice(0, 16).replace('T', ' '); }
    }
    function prettyDate(ds) {
      var p = String(ds || '').split('-');
      if (p.length !== 3) return String(ds || '');
      var d = new Date(+p[0], +p[1] - 1, +p[2]);
      return DAYS[d.getDay()] + ' ' + MOS[d.getMonth()] + ' ' + d.getDate();
    }

    try {
      sb = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnon, {
        realtime: { params: { eventsPerSecond: 5 } }
      });
    } catch (e) { sb = null; }

    // ---- fold memory: what he shuts stays shut on the next load -----------
    function foldGet(id) { try { return localStorage.getItem(LSK + 'fold-' + id); } catch (e) { return null; } }
    function foldSet(id, open) { try { localStorage.setItem(LSK + 'fold-' + id, open ? '1' : '0'); } catch (e) {} }

    // -------------------------------------------------------------------
    // Shell
    // -------------------------------------------------------------------
    function shell() {
      var host = el('mmy-root');
      if (!host) return;
      host.innerHTML =
        '<div class="mm-wrap">' +
          '<nav class="mm-nav" id="mmNav">' +
            '<span class="mm-nav-brand">' + esc(cfg.cycleLabel || BOARD) + ' money map</span>' +
            '<button class="mm-nav-btn mm-burger" id="mmBurger" aria-expanded="false">Menu</button>' +
            '<button class="mm-nav-btn" id="mmCollapseAll">Collapse all</button>' +
            '<button class="mm-nav-btn" id="mmExpandAll">Expand all</button>' +
            '<div class="mm-nav-links">' +
              '<a href="#sec-tracker">Tracker</a>' +
              '<a href="#sec-hero">#1 now</a>' +
              '<a href="#sec-must">Must</a>' +
              '<a href="#sec-should">Should</a>' +
              '<a href="#sec-could">Could</a>' +
              '<a href="#sec-later">Later</a>' +
              '<a href="#sec-notes">Notes</a>' +
            '</div>' +
          '</nav>' +

          '<header class="mm-head">' +
            '<span class="mm-tag">' + esc(cfg.title || 'Money Map') + '</span>' +
            '<h1>' + esc(cfg.title || 'Money Map') + '</h1>' +
            '<p class="mm-sub">' + (cfg.tagline || '') + '</p>' +
            '<div id="mmSync" class="mm-sync offline"><span class="dot"></span><span id="mmSyncText">Connecting</span></div>' +
          '</header>' +

          '<div class="mm-banner" id="mmBanner" hidden></div>' +

          '<details class="mm-sec" id="sec-tracker" open>' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">Tracker</span>' +
              '<div class="mm-track-pills" id="mmPills"></div></summary>' +
            '<div class="mm-sec-body" id="mmTrackerBody"></div>' +
          '</details>' +

          '<details class="mm-sec hero" id="sec-hero" open>' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-hero-badge">#1 right now</span>' +
              '<span class="mm-sec-meta" id="mmHeroMeta"></span>' +
              '<span class="mm-hero-line" id="mmHeroLine">Reading the board&hellip;</span></summary>' +
            '<div class="mm-sec-body"><div class="mm-hero-why" id="mmHeroWhy"></div><div id="mmHeroRes"></div>' +
              '<div id="mmHeroCtl"></div></div>' +
          '</details>' +

          // THREE sections, in his order: MUST, then SHOULD, then COULD.
          // They replace the old "Work to do" / "Revenue items" split, which
          // buried a MUST under sixty general rows and made the tier a chip
          // instead of the spine. Revenue keeps its identity as a chip on the
          // row, inside whichever tier it earned.
          '<details class="mm-sec tier-MUST" id="sec-must" open>' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">Must</span>' +
              '<span class="mm-sec-meta" id="mmMustMeta">&hellip;</span></summary>' +
            '<div class="mm-sec-body">' +
              '<p class="mm-lede">A hard clock or a promise to a named person. Inside the tier: a booked meeting first, then setting one up, then sends and calls, then comments, then your own posts, then everything else.</p>' +
              '<div id="mmMustList"></div></div>' +
          '</details>' +

          '<details class="mm-sec tier-SHOULD" id="sec-should" open>' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">Should</span>' +
              '<span class="mm-sec-meta" id="mmShouldMeta">&hellip;</span></summary>' +
            '<div class="mm-sec-body">' +
              '<p class="mm-lede">Real work with real value, no hard clock on it today.</p>' +
              '<div id="mmShouldList"></div></div>' +
          '</details>' +

          '<details class="mm-sec tier-COULD" id="sec-could">' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">Could</span>' +
              '<span class="mm-sec-meta" id="mmCouldMeta">&hellip;</span></summary>' +
            '<div class="mm-sec-body">' +
              '<p class="mm-lede">Everything else that is still live. Shut by default so it stops competing with the two above it.</p>' +
              '<div id="mmCouldList"></div></div>' +
          '</details>' +

          // MOVED TO A LATER DAY (2026-09-01). Named for what it holds -- a day
          // that is not today -- and its meta carries the next real date, so
          // the section says a date rather than the word "later" alone. Shut
          // by default: these are deliberately not today's work.
          '<details class="mm-sec" id="sec-later">' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">On a later day</span>' +
              '<span class="mm-sec-meta" id="mmLaterMeta">&hellip;</span></summary>' +
            '<div class="mm-sec-body">' +
              '<p class="mm-lede">Rows that carry a new date. They are off today on purpose and every control still works here, so a row you want back today can be rescheduled straight from this list.</p>' +
              '<div id="mmLaterList"></div></div>' +
          '</details>' +

          '<div id="mmAgentDrawer"></div>' +

          '<details class="mm-sec" id="sec-notes">' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">Notes and reference</span>' +
              '<span class="mm-sec-meta" id="mmNotesMeta"></span></summary>' +
            '<div class="mm-sec-body">' +
              '<p class="mm-lede">Appendable and timestamped. Your reasoning at the time is data too.</p>' +
              '<textarea class="mm-notes" id="mmNotes" placeholder="Type a note. It saves when you click away."></textarea>' +
              '<div class="mm-notes-saved" id="mmNotesSaved">Not yet saved.</div>' +
              '<p class="mm-lede" style="margin-top:1rem;">Anchor rows, for anything else that reads this board.</p>' +
              '<div class="mm-code" id="mmAnchor"><button class="mm-copy" id="mmAnchorCopy" type="button">Copy</button></div>' +
            '</div>' +
          '</details>' +

          '<footer class="mm-foot">' + (cfg.footer || '') + '</footer>' +
        '</div>' +
        '<button id="mmTop" aria-label="Back to top">&uarr;</button>';

      el('mmTrackerBody').innerHTML =
        '<div class="mm-grid" style="margin-top:0.8rem;">' +
          '<div class="mm-stat"><div class="mm-stat-label">Week</div><div class="mm-stat-value" id="mmWeek">&mdash;</div><div class="mm-stat-sub" id="mmWeekSub"></div></div>' +
          '<div class="mm-stat"><div class="mm-stat-label">Days left</div><div class="mm-stat-value" id="mmDaysLeft">&mdash;</div><div class="mm-stat-sub" id="mmEndSub"></div></div>' +
          '<div class="mm-stat"><div class="mm-stat-label">Collected</div><div class="mm-stat-value" id="mmCollected">&mdash;</div><div class="mm-stat-sub" id="mmTargetSub"></div></div>' +
          '<div class="mm-stat"><div class="mm-stat-label">Required run rate</div><div class="mm-stat-value" id="mmRunRate">&mdash;</div><div class="mm-stat-sub">per week to land it</div></div>' +
          '<div class="mm-stat"><div class="mm-stat-label">Done today</div><div class="mm-stat-value" id="mmDoneToday">&mdash;</div><div class="mm-stat-sub">items checked off today</div></div>' +
        '</div>' +
        '<div class="mm-wk12"><div class="mm-wk12-track" id="mmWk12"></div><div class="mm-wk12-cap" id="mmWk12Cap">&nbsp;</div></div>' +
        '<div class="mm-conv-row">' +
          '<button class="mm-num-btn" id="mmConvMinus" aria-label="one fewer conversation">&minus;</button>' +
          '<div class="mm-conv-count" id="mmConv">0</div>' +
          '<button class="mm-num-btn" id="mmConvPlus" aria-label="one more conversation">+</button>' +
          '<div class="mm-conv-target">conversations today, of ' + CONV_TARGET + '</div>' +
        '</div>' +
        // ---- ASKS (2026-08-31, requirement 4) ---------------------------
        // An ASK is any time he asks someone for something: a meeting, a
        // purchase, an introduction, anything. It reuses Year Zero's EXACT
        // key shape, `ask-YYYY-MM-DD`, in this same shared table scoped by
        // board -- one counter design across every cycle, not a second one.
        // There is NO LOCK. The hard five-asks gate was killed on 2026-08-20
        // because it produced zero asks for weeks and took the build work
        // down with it. This counts and shows a streak; it never blocks.
        '<div class="mm-conv-row">' +
          '<button class="mm-num-btn" id="mmAskMinus" aria-label="one fewer ask">&minus;</button>' +
          '<div class="mm-conv-count" id="mmAsk">0</div>' +
          '<button class="mm-num-btn" id="mmAskPlus" aria-label="one more ask">+</button>' +
          '<div class="mm-conv-target">asks today, of ' + ASK_TARGET + ' &middot; <span id="mmAskStreak"></span></div>' +
        '</div>' +
        // ---- DAY BY DAY (2026-08-31, requirement 5) ---------------------
        '<div class="mm-days" id="mmDays"></div>' +
        '<div style="margin-top:0.8rem;">' +
          '<label class="mm-stat-label" for="mmCollectedInput">Update collected revenue ($)</label>' +
          '<input class="mm-input" type="text" id="mmCollectedInput" inputmode="numeric" placeholder="0">' +
        '</div>' +
        (cfg.archiveNote ? '<p class="mm-lede" style="margin-top:0.9rem;">' + cfg.archiveNote + '</p>' : '');

      wire();
    }

    // -------------------------------------------------------------------
    // Banners + sync pill
    // -------------------------------------------------------------------
    function setSync(kind, label) {
      var p = el('mmSync');
      if (!p) return;
      p.className = 'mm-sync ' + kind;
      el('mmSyncText').textContent = label;
    }
    function banner(html, warn) {
      var b = el('mmBanner');
      if (!b) return;
      b.innerHTML = html;
      b.className = 'mm-banner' + (warn ? ' warn' : '');
      b.hidden = false;
    }
    function clearBanner() { var b = el('mmBanner'); if (b) b.hidden = true; }

    // -------------------------------------------------------------------
    // DAY BY DAY (2026-08-31, requirement 5)
    // -------------------------------------------------------------------
    // Four numbers for EVERY day, not just today: planned, done, moved,
    // archived. Every one of them is DERIVED from rows already in this store.
    // No new table, no migration, no second write path -- which also means
    // no way for these numbers to drift from the markers they describe.
    //
    // Two honest limits, printed on the panel rather than hidden, because a
    // number nobody can reproduce must never pass for an exact one:
    //   * the store keeps ONE row per key, so a row ticked Monday, unticked
    //     Tuesday and re-ticked Wednesday counts once, on Wednesday.
    //   * a row rescheduled twice keeps only its latest marker, so it counts
    //     once, on the later day.
    //
    // The one thing that is NOT a limit, and was nearly built as one: these
    // counts include ONLY markers whose `by` says `boubacar`. Agent sweeps
    // write reschedules in bulk -- one lane moved 99 rows in a single pass --
    // and folding those into his day would tell him he moved a hundred things
    // he never touched. His day is his own writes.
    function askKey(ds) { return 'ask-' + ds; }
    function getAsk(ds) { var n = parseInt(state[askKey(ds)], 10); return isNaN(n) ? 0 : n; }
    function isHis(marker) { return !!marker && String(marker.by || '') === 'boubacar'; }

    function dayCounts() {
      var out = {};   // 'YYYY-MM-DD' -> {planned, done, moved, archived}
      function bucket(d) {
        if (!d) return null;
        if (!out[d]) out[d] = { planned: 0, done: 0, moved: 0, archived: 0 };
        return out[d];
      }
      for (var key in state) {
        if (!Object.prototype.hasOwnProperty.call(state, key)) continue;

        if (key.slice(0, 5) === 'done-' && state[key] === '1') {
          var ts = stateTs[key];
          if (ts) {
            var td = new Date(ts);
            if (!isNaN(td.getTime())) { var bd = bucket(denverDateStr(td)); if (bd) bd.done++; }
          }
          continue;
        }
        if (key.slice(0, 5) === 'push-') {
          var pm = markerOf(key);
          if (!pm) continue;
          // MOVED counts on the day HE moved it; PLANNED counts on the day he
          // moved it TO. A machine sweep still sets the plan (the row really
          // is due then) but never counts as a move he made.
          if (isHis(pm) && pm.ts) {
            var pd = new Date(pm.ts);
            if (!isNaN(pd.getTime())) { var bp = bucket(denverDateStr(pd)); if (bp) bp.moved++; }
          }
          if (pm.to) { var bt = bucket(pm.to); if (bt) bt.planned++; }
          continue;
        }
        if (key.slice(0, 8) === 'archive-') {
          var am = markerOf(key);
          if (!am || !isHis(am) || !am.ts) continue;
          var ad = new Date(am.ts);
          if (!isNaN(ad.getTime())) { var ba = bucket(denverDateStr(ad)); if (ba) ba.archived++; }
          continue;
        }
        // A row that carries its OWN due date and has never been rescheduled
        // is planned on that date. Only 14 of the board's item rows do today;
        // almost every plan on this board comes from a push- marker instead.
        if (/^(status-|kpi-|debt-)/.test(key) && !markerOf(pushKey(key))) {
          var m = /\b(?:BY|DUE)\s+(\d{4}-\d{2}-\d{2})/i.exec(String(state[key] || ''));
          if (m) { var bo = bucket(m[1]); if (bo) bo.planned++; }
        }
      }
      return out;
    }

    function renderDays() {
      var host = el('mmDays');
      if (!host) return;
      var counts = dayCounts();
      var now = new Date();
      var cells = '';
      for (var i = DAY_STRIP_DAYS - 1; i >= 0; i--) {
        var d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        var ds = dkey(d);
        var c = counts[ds] || { planned: 0, done: 0, moved: 0, archived: 0 };
        var isToday = (i === 0);
        var asks = getAsk(ds);
        // Every day in the window gets its real numbers, including days
        // before this cycle opened. An earlier draft blanked those out on the
        // reasoning that "the board did not exist yet" -- but the ROWS did.
        // They were carried across from the previous cycle, and the work he
        // did on them is real work he did. Blanking it would have hidden his
        // own history behind a bookkeeping boundary.
        cells +=
          '<div class="mm-day' + (isToday ? ' today' : '') + '"' +
            ' title="' + esc(prettyDate(ds)) + '">' +
            '<div class="mm-day-lbl">' + DAYS[d.getDay()].charAt(0) + '<span>' + d.getDate() + '</span></div>' +
            '<div class="mm-day-nums">' +
              '<span class="p" title="planned">' + c.planned + '</span>' +
              '<span class="d" title="done">' + c.done + '</span>' +
              '<span class="m" title="moved">' + c.moved + '</span>' +
              '<span class="a" title="archived">' + c.archived + '</span>' +
              '<span class="k" title="asks">' + asks + '</span>' +
            '</div>' +
          '</div>';
      }
      host.innerHTML =
        '<div class="mm-days-head">Day by day' +
          '<span class="mm-days-key">' +
            '<b class="p">planned</b><b class="d">done</b><b class="m">moved</b><b class="a">archived</b><b class="k">asks</b>' +
          '</span></div>' +
        '<div class="mm-days-strip">' + cells + '</div>' +
        '<div class="mm-days-note" id="mmDaysNote">Counted straight off the board, nothing kept in a second place. ' +
        'Moved and archived count only what YOU did, never an agent sweep. ' +
        'The store keeps one marker per row, so a row moved twice counts once, on the later day, ' +
        'and a row ticked, unticked and re-ticked counts on the last day you touched it.</div>';

      // On a phone the strip is wider than the screen and scrolls inside its
      // own box. Left alone it opens on the OLDEST day, so the one cell that
      // matters -- today -- starts off screen. Park it at the right end.
      var strip = host.querySelector('.mm-days-strip');
      if (strip) { try { strip.scrollLeft = strip.scrollWidth; } catch (e) {} }
    }

    // -------------------------------------------------------------------
    // Tracker
    // -------------------------------------------------------------------
    function renderTracker() {
      var start = parseDate(state['year-start-date'], YEAR_START);
      var end = parseDate(state['year-end-date'], YEAR_END);
      var now = new Date();
      var wk = Math.floor((now - start) / WEEK_MS) + 1;
      var wkClamped = Math.min(12, Math.max(1, wk));
      var daysLeft = Math.ceil((end - now) / 86400000);

      var target = parseFloat(state['kpi-revenue-goal-target']) || GOAL_TARGET;
      var collected = parseFloat(state['collected-revenue']) || 0;
      var convN = parseInt(state['conv-count-' + dkey(now)], 10);
      if (isNaN(convN)) convN = 0;

      // Live "done today" tally -- every done-<key> row currently checked
      // whose write timestamp falls on today in Denver. No new write path:
      // this reads state (the '1'/'0' value) and stateTs (the row's
      // updated_at, populated on hydrate/realtime, or set optimistically the
      // moment he ticks the box -- see the change handler below).
      var todayStr = denverDateStr(now);
      var doneToday = 0;
      for (var dk in state) {
        if (dk.slice(0, 5) !== 'done-') continue;
        if (state[dk] !== '1') continue;
        var ts = stateTs[dk];
        if (!ts) continue;
        var tsDate = new Date(ts);
        if (isNaN(tsDate.getTime())) continue;
        if (denverDateStr(tsDate) === todayStr) doneToday++;
      }

      if (el('mmWeek')) el('mmWeek').textContent = wk < 1 ? 'not started' : (wk > 12 ? '12 (closed)' : String(wkClamped));
      if (el('mmWeekSub')) el('mmWeekSub').textContent = 'of 12, started ' + DAYS[start.getDay()] + ' ' + MOS[start.getMonth()] + ' ' + start.getDate();
      if (el('mmDaysLeft')) el('mmDaysLeft').textContent = daysLeft < 0 ? 'ended' : String(daysLeft);
      if (el('mmEndSub')) el('mmEndSub').textContent = 'to ' + DAYS[end.getDay()] + ' ' + MOS[end.getMonth()] + ' ' + end.getDate() + ', ' + end.getFullYear();
      if (el('mmCollected')) el('mmCollected').textContent = '$' + collected.toLocaleString();
      if (el('mmTargetSub')) el('mmTargetSub').textContent = 'of $' + target.toLocaleString() + ' target';
      var ci = el('mmCollectedInput');
      if (ci && document.activeElement !== ci) ci.value = collected ? String(collected) : '';

      var weeksLeft = Math.max(daysLeft, 0) / 7;
      if (el('mmRunRate')) {
        el('mmRunRate').textContent = (weeksLeft > 0 && daysLeft >= 0)
          ? '$' + Math.ceil(Math.max(target - collected, 0) / weeksLeft).toLocaleString()
          : (daysLeft < 0 ? 'window closed' : '—');
      }
      if (el('mmConv')) el('mmConv').textContent = String(convN);
      if (el('mmDoneToday')) el('mmDoneToday').textContent = String(doneToday);

      // Asks: same key shape as Year Zero, a target to aim at, never a gate.
      var askN = getAsk(dkey(now));
      if (el('mmAsk')) el('mmAsk').textContent = String(askN);
      if (el('mmAskStreak')) {
        // Consecutive days at target, counting back. A weekend below target
        // is a rest day and is skipped, not a break -- Year Zero's rule,
        // kept verbatim so the two cycles measure the same thing.
        var s = 0, dd = new Date();
        if (getAsk(dkey(dd)) < ASK_TARGET) dd.setDate(dd.getDate() - 1);
        for (var si = 0; si < 400; si++) {
          var dow = dd.getDay();
          var an = getAsk(dkey(dd));
          if (an >= ASK_TARGET) { s++; dd.setDate(dd.getDate() - 1); }
          else if (dow === 0 || dow === 6) { dd.setDate(dd.getDate() - 1); }
          else break;
        }
        el('mmAskStreak').textContent = 'streak ' + s + 'd';
      }
      renderDays();

      // The collapsed-state summary. This is the line that has to survive
      // "collapse everything", so it carries all three counters.
      var pills = el('mmPills');
      if (pills) {
        pills.innerHTML =
          '<span class="mm-pill">Week <b>' + (wk < 1 ? '0' : wkClamped) + '</b> of 12</span>' +
          '<span class="mm-pill">' + (daysLeft < 0 ? 'closed' : '<b>' + daysLeft + '</b> days left') + '</span>' +
          '<span class="mm-pill">$<b>' + collected.toLocaleString() + '</b> of $' + target.toLocaleString() + '</span>' +
          '<span class="mm-pill' + (convN >= CONV_TARGET ? ' ok' : (convN ? ' warn' : '')) + '"><b>' + convN + '</b> of ' + CONV_TARGET + ' conversations today</span>' +
          '<span class="mm-pill' + (doneToday ? ' ok' : '') + '"><b>' + doneToday + '</b> done today</span>';
      }

      // 12-week bar
      var track = el('mmWk12');
      if (track) {
        var status = state['cycle-status'] || cfg.cycleStatusFallback || '';
        var filled, label;
        if (status === 'closed') { filled = 12; label = 'Closed · all 12 weeks complete'; }
        else if (now < start) { filled = 0; label = 'Not started yet'; }
        else { filled = Math.max(0, Math.min(12, wk)); label = 'Week ' + filled + ' of 12 underway'; }
        var html = '';
        for (var i = 1; i <= 12; i++) {
          var cls = 'mm-wk12-seg' + (i <= filled ? ' filled' : '') + ((i === filled && status !== 'closed' && filled > 0) ? ' current' : '');
          var d = new Date(start.getTime() + (i - 1) * WEEK_MS);
          html += '<div class="' + cls + '" title="Week ' + i + ' · starts ' + MOS[d.getMonth()] + ' ' + d.getDate() + '">' + i + '</div>';
        }
        track.innerHTML = html;
        if (el('mmWk12Cap')) el('mmWk12Cap').textContent = label;
      }

      var anchor = el('mmAnchor');
      if (anchor) {
        var lines = ['item_id                 | value'];
        ['year-start-date', 'year-end-date', 'kpi-revenue-goal-target', 'kpi-revenue-goal-date', 'collected-revenue'].forEach(function (k) {
          lines.push((k + '                        ').slice(0, 24) + '| ' + (state[k] == null ? '(not set)' : state[k]));
        });
        anchor.innerHTML = esc(lines.join('\n')) + '<button class="mm-copy" id="mmAnchorCopy" type="button">Copy</button>';
        wireCopy();
      }
    }

    // -------------------------------------------------------------------
    // Hero -- the day's #1, straight off the board. Never authored here.
    // -------------------------------------------------------------------
    function renderHero() {
      var line = el('mmHeroLine'), why = el('mmHeroWhy'), meta = el('mmHeroMeta'), res = el('mmHeroRes');
      var ctl = el('mmHeroCtl');
      // The hero repaints on EVERY realtime write from any device, including
      // renders that renderAll deliberately withholds from the lists. Its
      // control bar now carries typeable forms, so it needs the same
      // half-typed-text protection the lists have: drop the handle and every
      // `if (ctl)` below becomes a no-op, leaving what he is typing alone.
      if (ctl && editInProgress()) ctl = null;
      if (!line) return;
      if (ctl) ctl.innerHTML = '';
      if (!remoteOk) {
        line.textContent = 'Could not read the board, so there is no #1 to show.';
        if (why) why.textContent = readError ? ('The read failed: ' + readError) : '';
        if (meta) meta.textContent = 'read failed';
        if (res) res.innerHTML = '';
        return;
      }
      // ---- REQUIREMENT 7 (2026-08-31) -------------------------------------
      // The #1 IS the live top-ranked row, not a separately cached string.
      // `cos-top-priority` used to DRIVE this tile, and on 2026-08-31 it held
      // text for an item that had already been discharged: the tile showed a
      // priority that matched no row, so it carried no resource and no
      // controls -- the single most important thing on the board was the one
      // thing he could not tick, note, reschedule or archive. That whole bug
      // class dies here, because the hero and the list now read ONE object.
      var b = buildBoard();
      if (b.fail) {
        line.textContent = 'Could not build the ranked board, so there is no #1 to show.';
        if (why) why.innerHTML = b.fail;
        if (meta) meta.textContent = 'unavailable';
        if (res) res.innerHTML = '';
        return;
      }
      var top = b.hero;
      if (!top) {
        line.textContent = 'Nothing is live and undecided right now.';
        if (why) why.textContent = 'Every ranked row that is yours is either done, archived, or parked on a later date. ' +
          'That is a finished list, not an empty one.';
        if (meta) meta.textContent = 'all clear';
        if (res) res.innerHTML = '';
        return;
      }

      var hk = String(top.key);
      line.textContent = top.headline || (top.title || '').split('\n')[0] || hk;
      if (why) {
        why.textContent = top.first_move
          ? ('First move: ' + top.first_move)
          : 'This row carries no FIRST-MOVE line, so none is shown. Add one to the row rather than guessing one.';
      }
      if (meta) {
        var due = effectiveDue(top);
        meta.textContent = (top.tier || 'COULD') + (due ? ' · due ' + prettyDate(due) : ' · no date');
      }

      // `cos-top-priority` is now a CROSS-CHECK, never the source. When the
      // published #1 disagrees with the live one, say so in one line instead
      // of silently showing whichever happens to be stale.
      var published = String(state['cos-top-priority'] || '').trim();
      var liveTitle = String(top.title || '').trim();
      var drift = (published && published !== liveTitle)
        ? '<div class="mm-stat-note">The last published #1 said something else. It is stale, and this tile is the live ranking.</div>'
        : '';
      if (b.heroSkipped && b.heroSkipped.length) {
        drift = '<div class="mm-stat-note">This is a ' + esc(top.tier || 'COULD') + ' because every ' +
          esc(b.heroSkipped.join(' and ')) + ' on the board is already done, archived, or moved to a later date. ' +
          'The ranking did not skip them; you cleared them.</div>' + drift;
      }

      if (res) res.innerHTML = resourcePanelHtml(top, hk);
      // The SAME control bar function every list tile uses. No second copy.
      if (ctl) ctl.innerHTML = drift + controlsHtml(hk);
      // The hero is filtered OUT of its tier list, so renderList never
      // registers it with the notes store. Register it here or a note he
      // writes on the day's #1 has nowhere to land.
      registerNoteItems([top]);
    }

    // -------------------------------------------------------------------
    // The ranked lists
    // -------------------------------------------------------------------
    function readWorklist() {
      var raw = state['cos-worklist'];
      if (!raw) return { items: null, error: null, date: null };
      try {
        var p = JSON.parse(raw);
        if (!p || !Array.isArray(p.items)) return { items: null, error: 'the stored worklist is not in the expected shape', date: null };
        return { items: p.items, error: null, date: p.denver_date || null, total: p.total_considered };
      } catch (e) {
        return { items: null, error: String(e && e.message ? e.message : e), date: null };
      }
    }

    function whenLabel(item) {
      if (!item.by_date) return '';
      var n = item.days_left;
      var cls = (n != null && n <= 0) ? ' due' : ((n != null && n <= 7) ? ' soon' : '');
      var txt = item.by_date;
      if (n != null) txt += (n < 0 ? ' · ' + Math.abs(n) + 'd overdue' : (n === 0 ? ' · today' : ' · ' + n + 'd'));
      return '<span class="mm-when' + cls + '">' + esc(txt) + '</span>';
    }

    // ---- NOTES store (same stack every other review page uses) -----------
    // A read is believed ONLY when the transport succeeded AND the server said
    // ok AND the body has the shape this page reads. A 401 answers with valid
    // JSON that parses fine and has no `notes` key; trusting that once made
    // Year Zero render "No notes yet" over a database full of his notes.
    function loadNotes(attempt) {
      attempt = attempt || 1;
      return fetch(NOTES_API + '/state?page_slug=' + encodeURIComponent(NOTES_SLUG), { cache: 'no-store' })
        .then(function (r) {
          return r.json().catch(function () { return null; })
            .then(function (j) { return { ok: r.ok, status: r.status, j: j }; });
        })
        .then(function (o) {
          if (!o.ok || !o.j || o.j.ok !== true || !Object.prototype.hasOwnProperty.call(o.j, 'notes')) {
            var why = (o.j && (o.j.error || o.j.detail)) || ('HTTP ' + o.status);
            if (attempt < 2) return loadNotes(attempt + 1);
            notesLoaded = false;
            notesReadError = String(why);
            return;
          }
          var next = {};
          (o.j.notes || []).forEach(function (n) { (next[n.item_id] = next[n.item_id] || []).push(n); });
          NOTES = next;
          REVIEW = (o.j.items && typeof o.j.items === 'object') ? o.j.items : {};
          notesLoaded = true;
          notesReadError = null;
        })
        .catch(function () {
          if (attempt < 2) return loadNotes(attempt + 1);
          notesLoaded = false;
          notesReadError = 'could not reach the notes server';
        });
    }

    // Idempotent server-side ON CONFLICT DO NOTHING registration. Safe on
    // every render; a failure un-registers so the next render retries rather
    // than silently never registering that row again.
    function registerNoteItems(rows) {
      var fresh = rows.filter(function (r) { return !registered[r.key]; });
      if (!fresh.length) return;
      fresh.forEach(function (r) { registered[r.key] = true; });
      fetch(NOTES_API + '/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page_slug: NOTES_SLUG,
          items: fresh.map(function (r) {
            return { item_id: r.key, item_label: (r.headline || r.title || r.key).slice(0, 180) };
          })
        })
      })
        .then(function (r) { if (!r.ok) fresh.forEach(function (x) { delete registered[x.key]; }); })
        .catch(function () { fresh.forEach(function (x) { delete registered[x.key]; }); });
    }

    function notesHtml(k) {
      var list = NOTES[k] || [], h = '';
      if (!notesLoaded) {
        h += '<div class="mm-stat-note bad">NOTES NOT READ' + (notesReadError ? ' (' + esc(notesReadError) + ')' : '') +
             '. This list is NOT what is in the database and may be missing notes you already wrote. ' +
             'Nothing was deleted. Reload before writing anything here.</div>';
      }
      list.forEach(function (n) {
        h += '<div class="mm-note"><span class="mm-note-ts">' + esc(noteClock(n.created_at)) + '</span>' + esc(n.note_text) + '</div>';
      });
      if (!list.length && notesLoaded) h += '<div class="mm-stat-note">No notes yet on this one.</div>';
      h += '<div class="mm-noteform">' +
             '<textarea data-noteinput="' + esc(k) + '" rows="2" placeholder="What happened, what you decided, or what you are waiting on."></textarea>' +
             '<div class="mm-formrow"><button type="button" data-notesave="' + esc(k) + '">Add note</button></div>' +
             '<span class="mm-stat-note" data-notestatus="' + esc(k) + '"></span>' +
           '</div>';
      return h;
    }

    // Reschedule demands a real FUTURE date and a reason. Both are checked
    // here only to save him a round trip; the ratified spec (D-20260830-06) is
    // that a skip without a new due date is not a skip at all.
    function pushFormHtml(k) {
      var p = pushOf(k);
      var t = new Date(); t.setDate(t.getDate() + 1);
      var def = (p && p.to) ? p.to : dkey(t);
      return '<label class="mm-formlbl">New date it is due on' +
          '<input type="date" data-pushdate="' + esc(k) + '" value="' + esc(def) + '" min="' + esc(dkey(t)) + '">' +
        '</label>' +
        '<textarea data-pushreason="' + esc(k) + '" rows="2" placeholder="Why you are moving it. Required -- this is what makes it a reschedule and not a drop."></textarea>' +
        '<div class="mm-formrow">' +
          '<button type="button" data-pushsave="' + esc(k) + '">Reschedule it</button>' +
          '<button type="button" class="ghost" data-pushcancel="' + esc(k) + '">Cancel</button>' +
          (p ? '<button type="button" class="ghost" data-pushundo="' + esc(k) + '">Undo the reschedule</button>' : '') +
        '</div>' +
        '<span class="mm-stat-note" data-pushstatus="' + esc(k) + '"></span>' +
        (p ? '<div class="mm-stat-note">Already rescheduled to ' + esc(prettyDate(p.to)) +
             '. Saving again replaces it, and both versions stay in the history.</div>' : '');
    }

    // Archive takes no date and needs no reason. The other of exactly two
    // outcomes a carried-over item can land on.
    function archiveFormHtml(k) {
      var a = archiveOf(k);
      return '<textarea data-archivereason="' + esc(k) + '" rows="2" placeholder="Optional -- why you are archiving this."></textarea>' +
        '<div class="mm-formrow">' +
          '<button type="button" data-archivesave="' + esc(k) + '">Archive it</button>' +
          '<button type="button" class="ghost" data-archivecancel="' + esc(k) + '">Cancel</button>' +
        '</div>' +
        '<span class="mm-stat-note" data-archivestatus="' + esc(k) + '"></span>' +
        (a ? '<div class="mm-stat-note">Already archived' + (a.ts ? ' ' + esc(noteClock(a.ts)) : '') +
             '. Saving again replaces the note, and both versions stay in the history.</div>' : '');
    }

    // -------------------------------------------------------------------
    // Resource panel (2026-08-31, money-map-actionable-items PRD S8.3/8.4)
    // -------------------------------------------------------------------
    // A cheap word-level diff for the "show original" toggle on a NEEDS
    // REVIEW resource -- current-vs-original only, per PRD S17 (edit HISTORY
    // diffing is parked for phase 2). Standard LCS on whitespace-split
    // tokens; texts here are capped (8000 chars server-side), so the O(n*m)
    // table is small in practice.
    function wordDiff(a, b) {
      var A = String(a || '').split(/(\s+)/);
      var B = String(b || '').split(/(\s+)/);
      var n = A.length, m = B.length;
      var dp = [];
      var i, j;
      for (i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); }
      for (i = n - 1; i >= 0; i--) {
        for (j = m - 1; j >= 0; j--) {
          dp[i][j] = (A[i] === B[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
      }
      var out = '', i2 = 0, j2 = 0;
      while (i2 < n && j2 < m) {
        if (A[i2] === B[j2]) { out += esc(A[i2]); i2++; j2++; }
        else if (dp[i2 + 1][j2] >= dp[i2][j2 + 1]) { out += '<del>' + esc(A[i2]) + '</del>'; i2++; }
        else { out += '<ins>' + esc(B[j2]) + '</ins>'; j2++; }
      }
      while (i2 < n) { out += '<del>' + esc(A[i2]) + '</del>'; i2++; }
      while (j2 < m) { out += '<ins>' + esc(B[j2]) + '</ins>'; j2++; }
      return out;
    }

    function resourceBadge(state) {
      var label = state === 'ready' ? 'READY' : (state === 'needs_review' ? 'YOUR REVIEW' : 'GAP');
      var cls = state === 'ready' ? 'ready' : (state === 'needs_review' ? 'review' : 'gap');
      return '<span class="mm-res-badge ' + cls + '">' + label + '</span>';
    }

    // `contact` is null (renders "no contact info on file") unless `source`
    // is non-empty -- PRD S8.1 rule, verbatim. No enrichment happens here;
    // this only renders what an act- marker already carries.
    function contactLineHtml(contact) {
      if (!contact || !contact.source) return '<div class="mm-res-contact none">No contact info on file.</div>';
      var name = contact.name ? esc(contact.name) + ' &middot; ' : '';
      var chan = contact.channel ? esc(contact.channel) : 'contact';
      var val = contact.value ? esc(contact.value) : '';
      var isUrl = /^https?:\/\//.test(String(contact.value || ''));
      var valHtml = isUrl ? ('<a href="' + esc(contact.value) + '" target="_blank" rel="noopener">' + val + '</a>') : val;
      return '<div class="mm-res-contact">' + name + esc(chan) + ': ' + valHtml +
        '<span class="mm-res-source">source: ' + esc(contact.source) + '</span></div>';
    }

    // Extra contact lines beyond the primary one -- e.g. an older phone
    // number found on file that should be surfaced, never omitted, but
    // never presented as a live/verified number either. `note` carries the
    // staleness label (required for anything not independently confirmed
    // current). Renders nothing if `extra` is empty/absent.
    function contactExtraHtml(extra) {
      if (!extra || !extra.length) return '';
      var out = '';
      for (var i = 0; i < extra.length; i++) {
        var c = extra[i] || {};
        if (!c.value) continue;
        var chan = c.channel ? esc(c.channel) : 'contact';
        out += '<div class="mm-res-contact mm-res-contact-extra">' + esc(chan) + ': ' + esc(c.value) +
          (c.note ? ' <span class="mm-res-contact-flag">(' + esc(c.note) + ')</span>' : '') +
          (c.source ? '<span class="mm-res-source">source: ' + esc(c.source) + '</span>' : '') +
          '</div>';
      }
      return out;
    }

    // Registers this item with the SAME 061 store the notes panel already
    // registers with (idempotent, page_slug = 'money-map-' + BOARD, item_id
    // = the worklist key) -- no second registration mechanism, per PRD S3.
    function reviewWidgetHtml(k, resource) {
      var rv = REVIEW[k] || {};
      var origText = (resource && resource.text) || '';
      var draftText = (rv.edited_text != null && rv.edited_text !== '') ? rv.edited_text : origText;
      var edited = rv.edited_text != null && rv.edited_text !== '' && rv.edited_text !== origText;
      var decision = rv.decision || null;
      var showOrig = !!REVIEW_SHOW_ORIG[k];

      var h = '<div class="mm-review" data-reviewwrap="' + esc(k) + '">';
      if (!notesLoaded) {
        h += '<div class="mm-stat-note bad">REVIEW STATE NOT READ' + (notesReadError ? ' (' + esc(notesReadError) + ')' : '') +
             '. What you see below may not be the current database state. Reload before saving.</div>';
      }
      h += '<textarea data-revtext="' + esc(k) + '" rows="4">' + esc(draftText) + '</textarea>';
      h += '<div class="mm-formrow">' +
        '<button type="button" data-revsave="' + esc(k) + '">Save edit</button>' +
        '<button type="button" class="ghost" data-revtoggleorig="' + esc(k) + '">' + (showOrig ? 'Hide original' : 'Show original') + '</button>' +
        '<button type="button" class="ok" data-revapprove="' + esc(k) + '">Approve</button>' +
        '<button type="button" class="bad" data-revreject="' + esc(k) + '">Reject</button>' +
      '</div>';
      if (edited) h += '<div class="mm-stat-note ok">Edited from the original draft. Approving now ships this version.</div>';
      if (showOrig) {
        h += '<div class="mm-diff"><b>Original vs. current' + (edited ? '' : ' (no edits yet)') + ':</b>' +
             '<div class="mm-diff-body">' + wordDiff(origText, draftText) + '</div></div>';
      }
      if (decision === 'reject') {
        h += (NOTES[k] || []).length
          ? '<div class="mm-stat-note bad">Rejected. Waiting on the drafting agent to act on the note below.</div>'
          : '<div class="mm-stat-note bad">Rejected -- waiting on a note saying why. Add one below.</div>';
      }
      h += '<textarea data-revnote="' + esc(k) + '" rows="2" placeholder="Notes for the drafting agent -- required on a reject, optional on an approve."></textarea>' +
        '<span class="mm-stat-note" data-revstatus="' + esc(k) + '"></span>' +
      '</div>';
      return h;
    }

    // The whole point of this build: every visible tile knows what state its
    // resource is in and shows the thing needed to act, or an honest gap. An
    // agent-owned row never reaches this function -- it renders in the "In
    // agent hands" drawer instead (renderLists), not here.
    function resourcePanelHtml(item, k) {
      var marker = actOf(k);   // the LIVE marker wins over the published snapshot
      var resState = (marker && marker.state) || item.res_state || 'gap';
      var resource = marker || item.resource || null;

      if (resState === 'ready') {
        var text = resource && resource.text;
        var box;
        if (text) {
          box = '<div class="mm-code" data-rescode="' + esc(k) + '">' + esc(text) +
            '<button class="mm-copy" type="button" data-rescopy="' + esc(k) + '">Copy</button></div>';
        } else if (resource && resource.url) {
          box = '<div class="mm-res-link">The draft lives at <a href="' + esc(resource.url) + '" target="_blank" rel="noopener">' + esc(resource.url) + '</a>.</div>';
        } else {
          box = '<div class="mm-res-gap">Marked READY with no text or link on the marker. Re-check <code>act-' + esc(k) + '</code>.</div>';
        }
        return '<div class="mm-res" data-reskey="' + esc(k) + '">' + resourceBadge('ready') + box + contactLineHtml(resource && resource.contact) + contactExtraHtml(resource && resource.contact_extra) + '</div>';
      }

      if (resState === 'needs_review') {
        return '<div class="mm-res" data-reskey="' + esc(k) + '">' + resourceBadge('needs_review') +
          reviewWidgetHtml(k, resource) + contactLineHtml(resource && resource.contact) + contactExtraHtml(resource && resource.contact_extra) + '</div>';
      }

      var missing = (resource && resource.missing) ? esc(resource.missing) : 'No resource has been drafted for this yet.';
      return '<div class="mm-res" data-reskey="' + esc(k) + '">' + resourceBadge('gap') +
        '<div class="mm-res-gap">' + missing + '</div>' + contactLineHtml(resource && resource.contact) + contactExtraHtml(resource && resource.contact_extra) + '</div>';
    }

    // Reads back the SAME resolved resource resourcePanelHtml uses (live
    // marker wins, else the row's published snapshot) for a key with no
    // `item` object in hand -- the review-widget click handlers below only
    // ever have the key, not the row.
    function findWorklistItem(k) {
      var wl = readWorklist();
      if (!wl.items) return null;
      for (var i = 0; i < wl.items.length; i++) {
        if (String(wl.items[i].key) === k) return wl.items[i];
      }
      return null;
    }

    function resourceOfKey(k) {
      var m = actOf(k);
      if (m) return m;
      var item = findWorklistItem(k);
      return (item && item.resource) || null;
    }

    // Repaints every `.mm-res` panel for a key in place (hero + list both
    // carry one when the hero text matches a ranked row) after a write that
    // can change its badge -- an approve can flip needs_review -> ready.
    function repaintResource(k) {
      var item = findWorklistItem(k);
      if (!item) return;
      var nodes = document.querySelectorAll('.mm-res[data-reskey="' + cssEsc(k) + '"]');
      var html = resourcePanelHtml(item, k);
      Array.prototype.forEach.call(nodes, function (node) {
        var wrap = document.createElement('div');
        wrap.innerHTML = html;
        node.parentNode.replaceChild(wrap.firstChild, node);
      });
    }

    // The live marker's `owner` wins over the published snapshot's `owner`
    // (PRD S8.2a, "always") -- an override he or an agent writes to the
    // marker takes effect on the next render, not the next publish run.
    function ownerOf(item) {
      var m = actOf(String(item.key));
      if (m && (m.owner === 'boubacar' || m.owner === 'agent')) return m.owner;
      return item.owner || 'boubacar';
    }

    // "In agent hands (N, oldest Xd)" -- the count survives on his surface,
    // the detail one tap down (PRD S8.3, the quiet-close asymmetry). Age is
    // read off whichever agent-owned rows carry a marker `ts`; a row with no
    // marker (verb-classified) has an unknown age and does not enter the max.
    function agentDrawerHtml(rows) {
      if (!rows.length) return '';
      var oldestDays = null;
      var now = new Date();
      rows.forEach(function (r) {
        var m = actOf(String(r.key));
        if (m && m.ts) {
          var t = new Date(m.ts);
          if (!isNaN(t.getTime())) {
            var days = Math.floor((now - t) / 86400000);
            if (oldestDays === null || days > oldestDays) oldestDays = days;
          }
        }
      });
      var ageTxt = oldestDays !== null ? (', oldest ' + oldestDays + 'd') : '';
      var rowsHtml = rows.map(function (r) {
        var m = actOf(String(r.key));
        var reason = (m && m.owner_reason) || r.owner_reason || 'agent work';
        var first = r.headline || (r.title || '').split('\n')[0] || r.key;
        return '<div class="mm-agent-row"><span class="mm-agent-title">' + esc(first) + '</span>' +
          '<span class="mm-agent-reason">' + esc(reason) + '</span></div>';
      }).join('');
      return '<details class="mm-agent-drawer"><summary><span class="mm-chev">&#9656;</span>' +
        'In agent hands (' + rows.length + ageTxt + ')</summary>' +
        '<div class="mm-agent-rows">' + rowsHtml + '</div></details>';
    }

    // -------------------------------------------------------------------
    // THE control bar. ONE function, every tile type.
    // -------------------------------------------------------------------
    // Read this before adding a new tile type anywhere on this page.
    //
    // These four controls -- Done, Notes, Reschedule, Archive -- went missing
    // three separate times on 2026-08-31, and each time the diagnosis was
    // different, because there were two independent ways for a row to reach
    // the screen and only one of them ever carried controls:
    //
    //   1. The ranked list tiles got the bar, but it was emitted INSIDE the
    //      collapsed <details> body. Forty rows rendered showing a checkbox
    //      and nothing else. Present in the DOM, invisible on the page, which
    //      from his side is the same thing as missing -- and the reason two
    //      verification passes "confirmed" a bar he could not see.
    //   2. The #1 tile (renderHero) never had the bar AT ALL. It shares no
    //      code with itemHtml. And because renderLists FILTERS the hero row
    //      out of the ranked list so it does not appear twice, the single
    //      most important item on the board had no Done, no Notes, no
    //      Reschedule and no Archive anywhere on the page. That was a real,
    //      total loss of function, not a visibility problem.
    //
    // So: the bar lives here, once, and it renders OUTSIDE the <details> so
    // it is visible without expanding anything. Any new tile type calls this.
    // Do not inline a second copy -- that duplication is the whole bug.
    function controlsHtml(k) {
      k = String(k);
      var done = isDone(k);
      var pushed = pushOf(k);
      var arch = archiveOf(k);
      var n = (NOTES[k] || []).length;

      return '<div class="mm-ctl">' +
          '<label class="mm-ctl-done"><input type="checkbox" data-done="' + esc(k) + '"' + (done ? ' checked' : '') + '> Done</label>' +
          '<button type="button" class="mm-ctl-btn' + (n ? ' has' : '') + '" data-notes="' + esc(k) + '">Notes' + (n ? ' (' + n + ')' : '') + '</button>' +
          '<button type="button" class="mm-ctl-btn' + (pushed ? ' on' : '') + '" data-push="' + esc(k) + '">' +
            (pushed ? 'Rescheduled' : 'Reschedule') + '</button>' +
          (arch
            ? '<button type="button" class="mm-ctl-btn" data-unarchive="' + esc(k) + '">Unarchive</button>'
            : '<button type="button" class="mm-ctl-btn arch" data-archive="' + esc(k) + '">Archive</button>') +
        '</div>' +

        (pushed ? '<div class="mm-marknote"><b>Rescheduled to ' + esc(prettyDate(pushed.to)) + '.</b> ' +
                    esc(String(pushed.reason || '')) +
                    (pushed.ts ? ' <span class="mm-when-sm">recorded ' + esc(noteClock(pushed.ts)) + '</span>' : '') +
                  '</div>' : '') +
        (arch ? '<div class="mm-marknote"><b>Archived' + (arch.ts ? ' ' + esc(noteClock(arch.ts)) : '') + '.</b> ' +
                  esc(String(arch.reason || 'No reason recorded.')) + '</div>' : '') +

        '<div class="mm-form" data-pushwrap="' + esc(k) + '"' + (formOpen[k] === 'push' ? '' : ' hidden') + '>' +
          (formOpen[k] === 'push' ? pushFormHtml(k) : '') + '</div>' +
        '<div class="mm-form" data-archivewrap="' + esc(k) + '"' + (formOpen[k] === 'archive' ? '' : ' hidden') + '>' +
          (formOpen[k] === 'archive' ? archiveFormHtml(k) : '') + '</div>' +
        '<div class="mm-notes-panel" data-noteswrap="' + esc(k) + '"' + (NOTES_OPEN[k] ? '' : ' hidden') + '>' +
          (NOTES_OPEN[k] ? notesHtml(k) : '') + '</div>';
    }

    // His priority hierarchy, in his own order. The number is computed
    // SERVER-SIDE in `orchestrator/cos_office/ranking.py` -- the one ranker
    // the morning brief and the on-demand answer also read -- and only
    // rendered here. A second classifier in the browser is the drift this
    // whole page is built to avoid. A row published before the ranker carried
    // this field renders no chip at all rather than a guessed one.
    var CLASS_LABEL = {
      1: 'meeting booked', 2: 'set up a meeting', 3: 'send or call',
      4: 'comment', 5: 'own post', 6: 'other work'
    };
    function classChipHtml(item) {
      var c = item.action_class;
      if (!c || !CLASS_LABEL[c]) return '';
      return '<span class="mm-class c' + c + '" title="' +
        esc(item.action_class_reason || 'priority class ' + c) + '">' + esc(CLASS_LABEL[c]) + '</span>';
    }

    function itemHtml(item) {
      // `headline` is picked server-side by the publisher, which knows to skip
      // this board's scaffolding lines ("DATE SET:", "STATUS:", "DAY 3 of 10")
      // and prefer the row's own ACTION line. The first-line fallback is only
      // for a worklist published before that field existed.
      var first = item.headline || (item.title || '').split('\n')[0] || '(this row has no text)';
      var facts = [];
      if (item.target != null) facts.push('target ' + item.target + (item.actual != null ? ', actual ' + item.actual : ', actual not recorded'));
      if (item.blocked_on) facts.push('blocked on ' + item.blocked_on);
      if (item.perishable) facts.push('perishable window');
      if (item.minutes != null) facts.push(item.minutes + ' min');
      facts.push(item.source || '');
      var k = String(item.key);
      var actMarker = actOf(k);
      var resState = (actMarker && actMarker.state) || item.res_state || 'gap';
      // PRD S8.3: a NEEDS REVIEW item's action line becomes "Review and
      // approve this draft" -- it IS his task now, not a description of one.
      var move = resState === 'needs_review'
        ? '<div class="mm-move"><b>First move:</b> Review and approve this draft.</div>'
        : (item.first_move
            ? '<div class="mm-move"><b>First move:</b> ' + esc(item.first_move) + '</div>'
            : '<div class="mm-move blank"><b>No first move on this row.</b> Add a <code>FIRST-MOVE:</code> line to it rather than guessing one.</div>');
      var done = isDone(k);
      var pushed = pushOf(k);
      var arch = archiveOf(k);

      // A rescheduled or archived row wears it on its face, collapsed. He has
      // to be able to tell at a glance that a row was LOOKED AT and moved on
      // purpose, rather than left untouched, without opening anything.
      var badges = '';
      if (pushed) badges += '<span class="mm-mark push">moved to ' + esc(prettyDate(pushed.to)) + '</span>';
      if (arch) badges += '<span class="mm-mark arch">archived</span>';

      // Requirement 6: DECIDED is done OR moved OR archived. All three dull.
      // Requirement 8: a row moved to a future date also carries is-later, so
      // it reads as parked rather than merely annotated.
      var stateCls = (done ? ' is-done' : '') + (arch ? ' is-arch' : '') +
                     (pushed ? ' is-push' : '') + (isFutureDated(item) ? ' is-later' : '');

      // The <details> holds the READING (title, first move, resource, facts).
      // The control bar is its SIBLING, not its child, so the four controls
      // are on screen without him expanding forty rows to find them.
      return '<div class="mm-row' + stateCls + '" data-rowkey="' + esc(k) + '">' +
        '<details class="mm-item' + stateCls + '"' +
          ' data-itemkey="' + esc(k) + '"' + (itemOpen[k] ? ' open' : '') + '>' +
        // ONE checkbox per item, his words, 2026-08-31. There used to be two:
        // an unlabelled box here in the summary and the labelled DONE control
        // in the bar below, both writing the same key. Two boxes for one fact
        // is a question about which one is real. The labelled one wins because
        // it says what it does; this one is gone.
        '<summary>' +
          '<span class="mm-rank">#' + item.rank + '</span>' +
          '<span class="mm-tier ' + esc(item.tier || 'COULD') + '">' + esc(item.tier || '') + '</span>' +
          // The kind of work, shown so a wrong classification is VISIBLE and
          // therefore correctable with a `CLASS: n` marker on the row. A
          // hierarchy nobody can see is a hierarchy nobody can fix.
          classChipHtml(item) +
          (item.revenue ? '<span class="mm-rev-chip">revenue</span>' : '') +
          (item.lane ? '<span class="mm-lane">' + esc(item.lane) + '</span>' : '') +
          whenLabel(item) + badges +
          '<span class="mm-item-title">' + esc(first) + '</span>' +
        '</summary>' +
        '<div class="mm-item-body">' + move +
          resourcePanelHtml(item, k) +
          '<div class="mm-full">' + esc(item.title || '') + '</div>' +
          '<div class="mm-facts">' + esc(facts.filter(Boolean).join(' · ')) + ' · ' + esc(k) + '</div>' +
        '</div></details>' +
        controlsHtml(k) +
      '</div>';
    }

    function renderList(hostId, metaId, rows, key, emptyMsg, movedOut) {
      var host = el(hostId), meta = el(metaId);
      if (!host) return;
      if (rows === null) { host.innerHTML = '<div class="mm-empty">' + emptyMsg + '</div>'; if (meta) meta.textContent = 'unavailable'; return; }
      // An empty section on a page whose job is telling him what to do reads
      // as a broken render, not as good news -- Year One shipped empty once
      // and cost him a working morning. So an emptied tier states its reason
      // in words, and when the reason is that its rows were rescheduled it
      // says so and points at where they went.
      var moved = movedOut || 0;
      if (!rows.length) {
        host.innerHTML = '<div class="mm-empty">' + (moved
          ? 'Nothing due in this tier today. ' + moved + ' row' + (moved === 1 ? ' was' : 's were') +
            ' moved to a later day and ' + (moved === 1 ? 'is' : 'are') + ' under <a href="#sec-later">On a later day</a>.'
          : 'Nothing ranked into this tier today. The board was read fine; this tier is genuinely empty.') + '</div>';
        if (meta) meta.textContent = '0 items' + (moved ? ' · ' + moved + ' on a later day' : '');
        return;
      }
      var showAll = !!expanded[key];
      var shown = showAll ? rows : rows.slice(0, PAGE_SIZE);

      // BATCHING, per the standing rule that the Money Map is grouped by KIND
      // OF WORK ("I want to see all the calling tasks together"). The ranker
      // already sorts by class inside a tier, so rows of one kind arrive
      // adjacent; this only draws the line between them so the batch is
      // visible instead of merely true. A run of rows with no class published
      // yet draws no header rather than a guessed one.
      var html = '', lastClass = null;
      shown.forEach(function (item) {
        var c = item.action_class;
        if (c && CLASS_LABEL[c] && c !== lastClass) {
          html += '<div class="mm-batch c' + c + '">' + esc(CLASS_LABEL[c]) + '</div>';
        }
        lastClass = c || lastClass;
        html += itemHtml(item);
      });
      if (rows.length > PAGE_SIZE) {
        html += '<div class="mm-more"><button class="mm-nav-btn" data-more="' + key + '">' +
          (showAll ? 'Show only the top ' + PAGE_SIZE : 'Show all ' + rows.length) + '</button></div>';
      }
      host.innerHTML = html;
      if (meta) meta.textContent = rows.length + ' item' + (rows.length === 1 ? '' : 's') +
        (moved ? ' · ' + moved + ' on a later day' : '');
      // Self-register the rendered rows with the notes store so a note he
      // writes on any of them has somewhere to land. Idempotent server side.
      registerNoteItems(shown);
    }

    // ONE function decides what he sees and in what order, and BOTH the #1
    // tile and the three tier lists read its answer. That is the whole point:
    // until today the hero read a cached `cos-top-priority` string and the
    // lists read `cos-worklist`, so the two could disagree -- and they did,
    // leaving the day's most important item showing text that matched no row
    // and therefore carried no controls at all.
    //
    // Returns null when the board could not be read or the list could not be
    // parsed, so callers can say "unknown" rather than draw an empty page.
    function buildBoard() {
      if (!remoteOk) {
        return { fail: 'The board could not be read, so this list is unknown, not empty.' +
                       (readError ? ' (' + esc(readError) + ')' : '') };
      }
      var wl = readWorklist();
      if (wl.error) {
        return { fail: 'The stored ranked list could not be parsed: ' + esc(wl.error) + '. Re-run the publisher.' };
      }
      if (!wl.items) {
        return { fail: 'No ranked list has been published to board <code>' + esc(BOARD) + '</code> yet. ' +
                       'Publish it with <code>python scripts/publish_money_map_worklist.py --write</code> on the orchestrator.' };
      }

      var agent = [], mine = [];
      wl.items.forEach(function (i) {
        // PRD S3: an item is on HIS list only if it requires him personally.
        if (ownerOf(i) === 'agent') agent.push(i); else mine.push(i);
      });

      // Requirement 8, the demotion. A row moved to a future date, and a row
      // already decided, both stop competing for today -- they sink to the
      // bottom of their own tier rather than leaving the page. Sort is STABLE
      // in every browser that matters, so the publisher's rank survives inside
      // each of the three groups; nothing is re-scored here.
      function sinkRank(i) {
        var k = String(i.key);
        if (isDone(k) || archiveOf(k)) return 2;   // decided and closed
        if (isFutureDated(i)) return 1;            // parked on a later date
        return 0;                                  // live today
      }
      mine.sort(function (a, b) { return sinkRank(a) - sinkRank(b); });

      // A rescheduled row leaves today's tier for the later list. The count
      // per tier is kept so each tier can say out loud how many of its rows
      // moved out -- an emptied section that does not explain itself reads
      // exactly like a broken render, which is this page's worst-ever bug.
      var tiers = { MUST: [], SHOULD: [], COULD: [] };
      var movedOut = { MUST: 0, SHOULD: 0, COULD: 0 };
      var later = [];
      mine.forEach(function (i) {
        var t = (i.tier === 'MUST' || i.tier === 'SHOULD') ? i.tier : 'COULD';
        if (scheduledLater(i)) { movedOut[t]++; later.push(i); return; }
        tiers[t].push(i);
      });
      // Flat, soonest first. No grouping headers: the date is already printed
      // on every one of these rows by the MOVED TO stamp itself.
      later.sort(function (a, b) {
        var x = scheduledLater(a) || '', y = scheduledLater(b) || '';
        return x < y ? -1 : (x > y ? 1 : 0);
      });

      // The #1 is the FIRST genuinely live, undecided, not-parked row in the
      // highest tier that has one. Same object the list renders, so the tile
      // cannot carry different text or a missing control bar, ever.
      var hero = null, heroSkipped = [];
      ['MUST', 'SHOULD', 'COULD'].forEach(function (t) {
        if (hero) return;
        for (var i = 0; i < tiers[t].length; i++) {
          if (sinkRank(tiers[t][i]) === 0) { hero = tiers[t][i]; return; }
        }
        // Nothing live in this tier. Remember it, so the tile can say WHY the
        // day's #1 is a COULD instead of leaving him to wonder whether the
        // ranking broke. A quiet fallthrough reads exactly like a bug.
        if (tiers[t].length) heroSkipped.push(t);
      });

      return { wl: wl, tiers: tiers, movedOut: movedOut, later: later, agent: agent, hero: hero, heroSkipped: heroSkipped };
    }

    function renderLists() {
      var b = buildBoard();
      if (b.fail) {
        renderList('mmMustList', 'mmMustMeta', null, 'must', b.fail);
        renderList('mmShouldList', 'mmShouldMeta', null, 'should', b.fail);
        renderList('mmCouldList', 'mmCouldMeta', null, 'could', b.fail);
        renderList('mmLaterList', 'mmLaterMeta', null, 'later', b.fail);
        return;
      }
      var today = dkey(new Date());
      if (b.wl.date && b.wl.date !== today) {
        banner('<b>THIS RANKING IS NOT TODAY&rsquo;S.</b>It was computed for ' + esc(b.wl.date) +
               ' and has not been recomputed since. The items are real; their order may not reflect today.', true);
      } else {
        clearBanner();
      }
      // The #1 renders ONCE, in its own tile above, and is filtered out of its
      // tier list here. This is not cosmetic de-duplication: every control on
      // this page is addressed by `[data-notes="<key>"]` and resolved with
      // querySelector, which returns the FIRST match in document order. Render
      // the same key twice and tapping Notes on the list row silently opens
      // the hero's panel instead -- a button that visibly does nothing, which
      // is exactly the complaint that started this rebuild. Rendering it once
      // is safe now in a way it was not before, because the hero carries the
      // full control bar from the same function every other tile uses.
      var heroKey = b.hero ? String(b.hero.key) : null;
      function withoutHero(rows) {
        return heroKey ? rows.filter(function (i) { return String(i.key) !== heroKey; }) : rows;
      }
      renderList('mmMustList', 'mmMustMeta', withoutHero(b.tiers.MUST), 'must', '', b.movedOut.MUST);
      renderList('mmShouldList', 'mmShouldMeta', withoutHero(b.tiers.SHOULD), 'should', '', b.movedOut.SHOULD);
      renderList('mmCouldList', 'mmCouldMeta', withoutHero(b.tiers.COULD), 'could', '', b.movedOut.COULD);
      renderList('mmLaterList', 'mmLaterMeta', withoutHero(b.later), 'later', '');
      var lm = el('mmLaterMeta');
      if (lm && b.later.length) {
        lm.textContent = b.later.length + ' item' + (b.later.length === 1 ? '' : 's') +
          ' · next ' + prettyDate(scheduledLater(b.later[0]));
      } else if (lm) {
        lm.textContent = 'nothing rescheduled';
      }
      var agentHost = el('mmAgentDrawer');
      if (agentHost) agentHost.innerHTML = agentDrawerHtml(b.agent);
      var nm = el('mmNotesMeta');
      if (nm) nm.textContent = state['notes-log'] ? 'has notes' : 'empty';
    }

    // A re-render blows away a half-typed note or reschedule reason, and
    // realtime fires a render on every write from ANY device, so this is not
    // hypothetical. Defer the list repaint instead; the tracker and hero carry
    // no typing and are always safe to repaint.
    var renderPending = false;
    function editInProgress() {
      var els = document.querySelectorAll('.mm-form textarea, .mm-noteform textarea, .mm-form input[type=date]');
      for (var i = 0; i < els.length; i++) {
        if (String(els[i].value || '').trim() || els[i] === document.activeElement) return true;
      }
      return false;
    }
    function renderAll() {
      renderTracker();
      renderHero();
      if (editInProgress()) { renderPending = true; return; }
      renderPending = false;
      renderLists();
    }

    // -------------------------------------------------------------------
    // Writes
    // -------------------------------------------------------------------
    function persist(item, value) {
      state[item] = value;
      try { localStorage.setItem(LSK + item, value); } catch (e) {}
      if (!sb) {
        setSync('error', 'Not saving');
        banner('<b>SAVE FAILED. WHAT YOU JUST CHANGED IS NOT IN THE DATABASE.</b>The database client never loaded on this page.', false);
        return;
      }
      setSync('saving', 'Saving');
      return sb.rpc(UPSERT_RPC, { p_board: BOARD, p_item: item, p_value: value, p_token: TOKEN })
        .then(function (res) {
          if (res.error) {
            setSync('error', 'Save failed');
            banner('<b>SAVE FAILED. WHAT YOU JUST CHANGED IS NOT IN THE DATABASE.</b>The board rejected the write for <b>' +
                   esc(item) + '</b>: ' + esc(res.error.message || 'rejected with no reason given') + '. Reload and try again.', false);
          } else {
            setSync('live', 'Synced');
            clearBanner();
          }
        })
        .catch(function () {
          setSync('offline', 'Offline (not saved)');
          banner('<b>NOT SAVING RIGHT NOW. YOU ARE OFFLINE.</b>The change to <b>' + esc(item) +
                 '</b> never left this device. It will go up when you reconnect and reload.', true);
        });
    }

    // -------------------------------------------------------------------
    // Read
    // -------------------------------------------------------------------
    function hydrate() {
      // The notes read runs alongside the board read; the list repaints once
      // it lands so every Notes button shows a real count, not a zero.
      loadNotes().then(function () { renderLists(); });
      if (!sb) { setSync('error', 'No client'); remoteOk = false; readError = 'the database client never loaded'; renderAll(); return; }
      setSync('saving', 'Loading');
      sb.from(TABLE).select('item_id,value,updated_at').eq('board_id', BOARD)
        .then(function (res) {
          if (res.error) {
            remoteOk = false;
            readError = res.error.message || 'the read was refused';
            setSync('offline', 'Read failed');
            banner('<b>COULD NOT READ THE BOARD.</b>Everything below is unknown, not empty. ' + esc(readError), false);
          } else {
            remoteOk = true; readError = null;
            (res.data || []).forEach(function (r) {
              state[r.item_id] = r.value;
              if (r.updated_at) stateTs[r.item_id] = r.updated_at;
            });
            setSync('live', 'Synced');
          }
          renderAll();
          var nb = el('mmNotes');
          if (nb && state['notes-log']) nb.value = state['notes-log'];
          var ns = el('mmNotesSaved');
          if (ns) ns.textContent = state['notes-log'] ? 'Last saved to the board.' : 'Not yet saved.';
        })
        .catch(function (e) {
          remoteOk = false;
          readError = String(e && e.message ? e.message : e);
          setSync('offline', 'Offline');
          banner('<b>COULD NOT READ THE BOARD.</b>Everything below is unknown, not empty. ' + esc(readError), false);
          renderAll();
        });

      try {
        sb.channel('mm-' + BOARD + '-live')
          .on('postgres_changes', { event: '*', schema: 'public', table: TABLE, filter: 'board_id=eq.' + BOARD },
            function (payload) {
              var row = payload.new || payload.old;
              if (!row) return;
              state[row.item_id] = row.value;
              if (row.updated_at) stateTs[row.item_id] = row.updated_at;
              renderAll();
            })
          .subscribe();
      } catch (e) {}
    }

    // -------------------------------------------------------------------
    // Wiring
    // -------------------------------------------------------------------
    function wireCopy() {
      var btn = el('mmAnchorCopy');
      if (!btn) return;
      btn.addEventListener('click', function () {
        var box = el('mmAnchor');
        var text = box ? box.textContent.replace(/Copy\s*$/, '').trim() : '';
        function done() {
          btn.textContent = 'Copied'; btn.classList.add('copied');
          setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 1500);
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () {});
        } else {
          try {
            var ta = document.createElement('textarea');
            ta.value = text; document.body.appendChild(ta); ta.select();
            document.execCommand('copy'); document.body.removeChild(ta); done();
          } catch (e) {}
        }
      });
    }

    // -------------------------------------------------------------------
    // Per-item controls: Done, Notes, Reschedule, Archive
    // -------------------------------------------------------------------
    // One delegated listener set, so rows re-rendered by realtime keep
    // working. Every write is confirmed by READING THE ROW BACK before
    // anything says "saved".
    function readBack(itemId) {
      if (!sb) return Promise.resolve({ error: { message: 'the database client never loaded on this page' } });
      return sb.from(TABLE).select('value').eq('board_id', BOARD).eq('item_id', itemId);
    }
    function statusEl(attr, k) { return document.querySelector('[' + attr + '="' + cssEsc(k) + '"]'); }
    function cssEsc(s) {
      if (root.CSS && root.CSS.escape) return root.CSS.escape(s);
      return String(s).replace(/["\\]/g, '\\$&');
    }
    function say(el2, cls, msg) { if (el2) { el2.className = 'mm-stat-note' + (cls ? ' ' + cls : ''); el2.textContent = msg; } }

    function wireItemControls() {
      // The Done box sits inside a <summary>. Without a capture-phase guard a
      // tick would also fold the tile shut under his finger.
      document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (t && t.tagName === 'INPUT' && t.hasAttribute && t.hasAttribute('data-done') && t.closest('summary')) {
          ev.stopPropagation();
        }
      }, true);

      // Remember which tiles he had open, so a realtime repaint does not shut
      // the row he is working in.
      document.addEventListener('toggle', function (ev) {
        var d = ev.target;
        if (!d || !d.classList || !d.classList.contains('mm-item')) return;
        var k = d.getAttribute('data-itemkey');
        if (k) itemOpen[k] = d.open;
      }, true);

      // ---- DONE ---------------------------------------------------------
      document.addEventListener('change', function (ev) {
        var t = ev.target;
        if (!t || !t.hasAttribute || !t.hasAttribute('data-done')) return;
        var k = t.getAttribute('data-done');
        var on = !!t.checked;
        var val = on ? '1' : '0';
        // The card border and the strike-through now live on the wrapper as
        // well as the <details>, because the control bar is a sibling of the
        // <details>, not a child of it. Both carry the class.
        var tile = document.querySelector('.mm-item[data-itemkey="' + cssEsc(k) + '"]');
        if (tile) tile.classList.toggle('is-done', on);
        var row = document.querySelector('.mm-row[data-rowkey="' + cssEsc(k) + '"]');
        if (row) row.classList.toggle('is-done', on);
        // Keep the twin boxes (summary + body) in step immediately.
        Array.prototype.forEach.call(document.querySelectorAll('input[data-done="' + cssEsc(k) + '"]'), function (b) { b.checked = on; });

        // Optimistic local update so the "done today" counter moves the
        // instant he ticks/unticks, without waiting on the round trip. The
        // real write timestamp lands moments later via readBack/realtime and
        // overwrites this with the true value.
        state[doneKey(k)] = val;
        if (on) stateTs[doneKey(k)] = new Date().toISOString();
        renderTracker();

        Promise.resolve(persist(doneKey(k), val))
          .then(function () { return readBack(doneKey(k)); })
          .then(function (res) {
            var rows = (res && res.data) || [];
            var back = rows.length ? rows[0].value : null;
            if ((res && res.error) || back !== val) {
              banner('<b>THAT TICK IS NOT IN THE DATABASE.</b>The board does not read back <b>' + esc(k) +
                     '</b> as ' + (on ? 'done' : 'not done') +
                     ((res && res.error) ? ' (' + esc(res.error.message || 'read failed') + ')' : '') +
                     '. It is only on this screen. Reload and tick it again.', false);
              return;
            }
            clearBanner();
            setSync('live', 'Synced');
          })
          .catch(function () {
            banner('<b>THAT TICK IS NOT CONFIRMED.</b>Could not reach the database to read <b>' + esc(k) +
                   '</b> back. Do not assume it is recorded.', false);
          });
      });

      // ---- NOTES / RESCHEDULE / ARCHIVE, one click listener --------------
      document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (!t || !t.getAttribute) return;
        var k;

        // --- notes panel toggle
        k = t.getAttribute('data-notes');
        if (k) {
          var wrap = document.querySelector('.mm-notes-panel[data-noteswrap="' + cssEsc(k) + '"]');
          if (!wrap) return;
          var opening = wrap.hidden;
          NOTES_OPEN[k] = opening;
          if (opening) {
            wrap.innerHTML = notesHtml(k);
            wrap.hidden = false;
            // Put the cursor in the box and scroll it into view. On a phone
            // the panel opens below the fold, and a panel he cannot see is
            // indistinguishable from a button that did nothing -- which is
            // exactly how this control got reported as broken.
            var box = wrap.querySelector('textarea[data-noteinput]');
            if (box) {
              try { box.focus({ preventScroll: true }); } catch (e) { try { box.focus(); } catch (e2) {} }
              try { wrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e3) {}
            }
          } else { wrap.hidden = true; wrap.innerHTML = ''; }
          return;
        }

        // --- save a note
        k = t.getAttribute('data-notesave');
        if (k) {
          var ta = document.querySelector('textarea[data-noteinput="' + cssEsc(k) + '"]');
          var st = statusEl('data-notestatus', k);
          var text = ta ? String(ta.value || '').trim() : '';
          if (!text) { say(st, 'bad', 'Write something first.'); return; }
          t.disabled = true;
          say(st, '', 'Saving...');
          fetch(NOTES_API + '/note', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_slug: NOTES_SLUG, item_id: k, note_text: text })
          })
            .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (o) {
              t.disabled = false;
              if (!o.ok || !o.j || o.j.ok !== true) {
                say(statusEl('data-notestatus', k), 'bad',
                  'NOT SAVED: ' + ((o.j && (o.j.detail || o.j.error)) || 'the server rejected it') +
                  '. Copy your text somewhere before you leave this page.');
                return;
              }
              if (ta) ta.value = '';
              say(statusEl('data-notestatus', k), '', 'Saved. Confirming against the database...');
              // A 200 is a claim. Re-read the store and find this exact text.
              return loadNotes().then(function () {
                var w = document.querySelector('.mm-notes-panel[data-noteswrap="' + cssEsc(k) + '"]');
                if (w) w.innerHTML = notesHtml(k);
                var stf = statusEl('data-notestatus', k);
                if (!notesLoaded) {
                  say(stf, 'bad', 'The server accepted it, but the notes store could not be re-read to confirm it. Keep a copy of your text.');
                  return;
                }
                var back = (NOTES[k] || []).some(function (n) { return (n.note_text || '') === text; });
                if (!back) {
                  say(stf, 'bad', 'NOT SAVED: the server said ok but the note is not in the database on a fresh read. Copy your text somewhere.');
                  return;
                }
                say(stf, 'ok', 'Saved. Confirmed by reading it back from the database.');
                var btns = document.querySelectorAll('.mm-ctl-btn[data-notes="' + cssEsc(k) + '"]');
                Array.prototype.forEach.call(btns, function (b) {
                  b.className = 'mm-ctl-btn has'; b.textContent = 'Notes (' + (NOTES[k] || []).length + ')';
                });
              });
            })
            .catch(function () {
              t.disabled = false;
              say(statusEl('data-notestatus', k), 'bad', 'NOT SAVED: could not reach the server. Copy your text somewhere before you leave this page.');
            });
          return;
        }

        // --- reschedule form open / cancel / undo
        k = t.getAttribute('data-push');
        if (k) {
          var pw = document.querySelector('.mm-form[data-pushwrap="' + cssEsc(k) + '"]');
          if (!pw) return;
          if (pw.hidden) { formOpen[k] = 'push'; pw.innerHTML = pushFormHtml(k); pw.hidden = false; }
          else { formOpen[k] = null; pw.hidden = true; pw.innerHTML = ''; }
          return;
        }
        k = t.getAttribute('data-pushcancel');
        if (k) {
          var pc = document.querySelector('.mm-form[data-pushwrap="' + cssEsc(k) + '"]');
          formOpen[k] = null;
          if (pc) { pc.hidden = true; pc.innerHTML = ''; }
          return;
        }
        k = t.getAttribute('data-pushundo');
        if (k) {
          formOpen[k] = null;
          persist(pushKey(k), JSON.stringify({ v: 1, del: 1 }));
          renderLists();
          return;
        }

        // --- reschedule save: the date is MANDATORY (D-20260830-06)
        k = t.getAttribute('data-pushsave');
        if (k) {
          var dEl = document.querySelector('input[data-pushdate="' + cssEsc(k) + '"]');
          var rEl = document.querySelector('textarea[data-pushreason="' + cssEsc(k) + '"]');
          var ps = statusEl('data-pushstatus', k);
          var newDate = dEl ? String(dEl.value || '').trim() : '';
          var reason = rEl ? String(rEl.value || '').trim() : '';
          if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) { say(ps, 'bad', 'Pick the new date this is due on.'); return; }
          if (newDate <= dkey(new Date())) { say(ps, 'bad', 'A reschedule moves it forward. Pick a date after today.'); return; }
          if (reason.length < 3) { say(ps, 'bad', 'Write why you are moving it. That is what makes this a reschedule and not a drop.'); return; }

          var prev = pushOf(k);
          var rec = {
            v: 1,
            from: (prev && prev.to) ? prev.to : dkey(new Date()),
            to: newDate, reason: reason,
            ts: new Date().toISOString(), by: 'boubacar'
          };
          t.disabled = true;
          say(ps, '', 'Saving...');
          var written = persist(pushKey(k), JSON.stringify(rec));

          // The reason also lands in his notes trail on this row. Same store
          // the Notes button writes to; no second notes system.
          fetch(NOTES_API + '/note', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_slug: NOTES_SLUG, item_id: k, note_text: 'RESCHEDULED to ' + newDate + '. ' + reason })
          }).then(function () { return loadNotes(); }).catch(function () {});

          Promise.resolve(written).then(function () { return readBack(pushKey(k)); })
            .then(function (res) {
              t.disabled = false;
              var sf = statusEl('data-pushstatus', k);
              var rows = (res && res.data) || [];
              var back = null;
              try { back = rows.length ? JSON.parse(rows[0].value) : null; } catch (e) { back = null; }
              if ((res && res.error) || !back || back.to !== newDate || String(back.reason) !== reason) {
                say(sf, 'bad', 'NOT SAVED: the reschedule is not in the database on a fresh read' +
                  ((res && res.error) ? ' (' + (res.error.message || 'read failed') + ')' : '') +
                  '. Nothing has moved. Try again before you leave this page.');
                return;
              }
              say(sf, 'ok', 'Rescheduled to ' + prettyDate(newDate) + '. Confirmed by reading it back from the database.');
              setTimeout(function () { formOpen[k] = null; renderLists(); }, 1200);
            })
            .catch(function () {
              t.disabled = false;
              say(statusEl('data-pushstatus', k), 'bad', 'NOT SAVED: could not reach the database to confirm it. Nothing has moved.');
            });
          return;
        }

        // --- archive form open / cancel / unarchive
        k = t.getAttribute('data-archive');
        if (k) {
          var aw = document.querySelector('.mm-form[data-archivewrap="' + cssEsc(k) + '"]');
          if (!aw) return;
          if (aw.hidden) { formOpen[k] = 'archive'; aw.innerHTML = archiveFormHtml(k); aw.hidden = false; }
          else { formOpen[k] = null; aw.hidden = true; aw.innerHTML = ''; }
          return;
        }
        k = t.getAttribute('data-archivecancel');
        if (k) {
          var ac = document.querySelector('.mm-form[data-archivewrap="' + cssEsc(k) + '"]');
          formOpen[k] = null;
          if (ac) { ac.hidden = true; ac.innerHTML = ''; }
          return;
        }
        k = t.getAttribute('data-unarchive');
        if (k) {
          formOpen[k] = null;
          persist(archiveKey(k), JSON.stringify({ v: 1, del: 1 }));
          renderLists();
          return;
        }

        // --- archive save: NO date required, reason optional
        k = t.getAttribute('data-archivesave');
        if (k) {
          var arEl = document.querySelector('textarea[data-archivereason="' + cssEsc(k) + '"]');
          var as = statusEl('data-archivestatus', k);
          var areason = arEl ? String(arEl.value || '').trim() : '';
          var arec = { v: 1, ts: new Date().toISOString(), reason: areason, by: 'boubacar' };
          t.disabled = true;
          say(as, '', 'Saving...');
          var awritten = persist(archiveKey(k), JSON.stringify(arec));

          if (areason) {
            fetch(NOTES_API + '/note', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ page_slug: NOTES_SLUG, item_id: k, note_text: 'ARCHIVED. ' + areason })
            }).then(function () { return loadNotes(); }).catch(function () {});
          }

          Promise.resolve(awritten).then(function () { return readBack(archiveKey(k)); })
            .then(function (res) {
              t.disabled = false;
              var sf = statusEl('data-archivestatus', k);
              var rows = (res && res.data) || [];
              var back = null;
              try { back = rows.length ? JSON.parse(rows[0].value) : null; } catch (e) { back = null; }
              if ((res && res.error) || !back || back.ts !== arec.ts) {
                say(sf, 'bad', 'NOT SAVED: the archive is not in the database on a fresh read' +
                  ((res && res.error) ? ' (' + (res.error.message || 'read failed') + ')' : '') +
                  '. Nothing has moved. Try again before you leave this page.');
                return;
              }
              say(sf, 'ok', 'Archived. Confirmed by reading it back from the database.');
              setTimeout(function () { formOpen[k] = null; renderLists(); }, 900);
            })
            .catch(function () {
              t.disabled = false;
              say(statusEl('data-archivestatus', k), 'bad', 'NOT SAVED: could not reach the database to confirm it. Nothing has moved.');
            });
          return;
        }

        // --- READY resource: copy to clipboard, phone-first one-tap copy
        k = t.getAttribute('data-rescopy');
        if (k) {
          var box = document.querySelector('.mm-code[data-rescode="' + cssEsc(k) + '"]');
          var rtext = box ? box.textContent.replace(/Copy\s*$/, '').trim() : '';
          function copyDone() {
            t.textContent = 'Copied'; t.classList.add('copied');
            setTimeout(function () { t.textContent = 'Copy'; t.classList.remove('copied'); }, 1500);
          }
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(rtext).then(copyDone).catch(function () {});
          } else {
            try {
              var ta2 = document.createElement('textarea');
              ta2.value = rtext; document.body.appendChild(ta2); ta2.select();
              document.execCommand('copy'); document.body.removeChild(ta2); copyDone();
            } catch (e) {}
          }
          return;
        }

        // --- NEEDS REVIEW: show/hide the original + word-level diff
        k = t.getAttribute('data-revtoggleorig');
        if (k) {
          REVIEW_SHOW_ORIG[k] = !REVIEW_SHOW_ORIG[k];
          // The textarea's live (possibly unsaved) text belongs in the diff,
          // not the last-saved edited_text -- so read it off the DOM rather
          // than re-deriving through repaintResource, which would blow away
          // whatever he is mid-typing.
          var rta = document.querySelector('textarea[data-revtext="' + cssEsc(k) + '"]');
          var wrapEl = document.querySelector('.mm-review[data-reviewwrap="' + cssEsc(k) + '"]');
          if (rta && wrapEl) {
            var liveVal = rta.value;
            var resrc = resourceOfKey(k);
            wrapEl.outerHTML = reviewWidgetHtml(k, resrc);
            var freshTa = document.querySelector('textarea[data-revtext="' + cssEsc(k) + '"]');
            if (freshTa) freshTa.value = liveVal;
          }
          return;
        }

        // --- NEEDS REVIEW: save an inline edit (061 /edit-text, append-only history)
        k = t.getAttribute('data-revsave');
        if (k) {
          var revTa = document.querySelector('textarea[data-revtext="' + cssEsc(k) + '"]');
          var rvs = statusEl('data-revstatus', k);
          var editedVal = revTa ? String(revTa.value || '') : '';
          t.disabled = true;
          say(rvs, '', 'Saving...');
          fetch(NOTES_API + '/edit-text', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_slug: NOTES_SLUG, item_id: k, edited_text: editedVal })
          })
            .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (o) {
              t.disabled = false;
              if (!o.ok || !o.j || o.j.ok !== true) {
                say(statusEl('data-revstatus', k), 'bad',
                  'NOT SAVED: ' + ((o.j && (o.j.detail || o.j.error)) || 'the server rejected it') +
                  '. Copy your edit somewhere before you leave this page.');
                return;
              }
              return loadNotes().then(function () {
                var back = REVIEW[k] && REVIEW[k].edited_text;
                if (back !== editedVal) {
                  say(statusEl('data-revstatus', k), 'bad',
                    'NOT SAVED: the server said ok but a fresh read does not show this edit. Copy your text somewhere.');
                  return;
                }
                say(statusEl('data-revstatus', k), 'ok', 'Saved. Confirmed by reading it back from the database.');
                repaintResource(k);
              });
            })
            .catch(function () {
              t.disabled = false;
              say(statusEl('data-revstatus', k), 'bad', 'NOT SAVED: could not reach the server. Copy your edit somewhere before you leave this page.');
            });
          return;
        }

        // --- NEEDS REVIEW: approve -> decision, then the client-side
        // ready-flip (PRD S8.4; server-side flip is Phase 2's first item,
        // S17). The flip only fires after the decision itself reads back
        // confirmed -- a half-failure here leaves the row visibly still
        // NEEDS REVIEW rather than silently claiming READY.
        k = t.getAttribute('data-revapprove');
        if (k) {
          var apNote = document.querySelector('textarea[data-revnote="' + cssEsc(k) + '"]');
          var apNoteText = apNote ? String(apNote.value || '').trim() : '';
          var apResource = resourceOfKey(k) || {};
          var apStatus = statusEl('data-revstatus', k);
          t.disabled = true;
          say(apStatus, '', 'Saving the decision...');
          fetch(NOTES_API + '/decision', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_slug: NOTES_SLUG, item_id: k, decision: 'approve' })
          })
            .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (o) {
              if (!o.ok || !o.j || o.j.ok !== true) {
                t.disabled = false;
                say(statusEl('data-revstatus', k), 'bad', 'NOT SAVED: the decision was not recorded' +
                  ((o.j && (o.j.detail || o.j.error)) ? ' (' + (o.j.detail || o.j.error) + ')' : '') + '. Still NEEDS REVIEW. Try again.');
                return null;
              }
              return fetch(NOTES_API + '/state?page_slug=' + encodeURIComponent(NOTES_SLUG), { cache: 'no-store' })
                .then(function (r2) { return r2.json().catch(function () { return null; }); })
                .then(function (j2) {
                  var confirmed = j2 && j2.ok === true && j2.items && j2.items[k] && j2.items[k].decision === 'approve';
                  if (!confirmed) {
                    t.disabled = false;
                    say(statusEl('data-revstatus', k), 'bad',
                      'NOT CONFIRMED: the decision does not read back as approved. Still NEEDS REVIEW. Try again before you leave this page.');
                    return null;
                  }
                  var finalText = (j2.items[k].edited_text != null && j2.items[k].edited_text !== '')
                    ? j2.items[k].edited_text : (apResource.text || '');
                  var newMarker = {
                    v: 1, owner: 'boubacar',
                    owner_reason: (apResource && apResource.owner_reason) || 'approved on the board',
                    state: 'ready', kind: (apResource && apResource.kind) || 'message',
                    text: finalText, contact: (apResource && apResource.contact) || null,
                    review: { page_slug: NOTES_SLUG, item_id: k },
                    by: 'boubacar', ts: new Date().toISOString()
                  };
                  if (apNoteText) {
                    fetch(NOTES_API + '/note', {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ page_slug: NOTES_SLUG, item_id: k, note_text: apNoteText })
                    }).then(function () { return loadNotes(); }).catch(function () {});
                  }
                  return Promise.resolve(persist(actKey(k), JSON.stringify(newMarker)))
                    .then(function () { return readBack(actKey(k)); })
                    .then(function (res3) {
                      t.disabled = false;
                      var rows3 = (res3 && res3.data) || [];
                      var back3 = null;
                      try { back3 = rows3.length ? JSON.parse(rows3[0].value) : null; } catch (e) { back3 = null; }
                      if ((res3 && res3.error) || !back3 || back3.state !== 'ready') {
                        say(statusEl('data-revstatus', k), 'bad',
                          'APPROVED, BUT NOT FLIPPED TO READY: the marker write did not read back. ' +
                          'The decision is safely recorded as approved -- reload this page to retry the flip.');
                        return;
                      }
                      say(statusEl('data-revstatus', k), 'ok', 'Approved. Confirmed READY by reading the marker back from the database.');
                      loadNotes().then(function () { repaintResource(k); });
                    })
                    .catch(function () {
                      t.disabled = false;
                      say(statusEl('data-revstatus', k), 'bad',
                        'APPROVED, BUT NOT FLIPPED TO READY: could not reach the database to confirm the marker. Reload to retry.');
                    });
                });
            })
            .catch(function () {
              t.disabled = false;
              say(statusEl('data-revstatus', k), 'bad', 'NOT SAVED: could not reach the server. Still NEEDS REVIEW. Try again.');
            });
          return;
        }

        // --- NEEDS REVIEW: reject -- stays needs_review, note carries why
        k = t.getAttribute('data-revreject');
        if (k) {
          var rjNote = document.querySelector('textarea[data-revnote="' + cssEsc(k) + '"]');
          var rjText = rjNote ? String(rjNote.value || '').trim() : '';
          var rjStatus = statusEl('data-revstatus', k);
          t.disabled = true;
          say(rjStatus, '', 'Saving...');
          fetch(NOTES_API + '/decision', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_slug: NOTES_SLUG, item_id: k, decision: 'reject' })
          })
            .then(function (r) { return r.json().catch(function () { return null; }).then(function (j) { return { ok: r.ok, j: j }; }); })
            .then(function (o) {
              t.disabled = false;
              if (!o.ok || !o.j || o.j.ok !== true) {
                say(statusEl('data-revstatus', k), 'bad', 'NOT SAVED: the rejection was not recorded' +
                  ((o.j && (o.j.detail || o.j.error)) ? ' (' + (o.j.detail || o.j.error) + ')' : '') + '. Try again.');
                return;
              }
              var noteWrite = rjText
                ? fetch(NOTES_API + '/note', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ page_slug: NOTES_SLUG, item_id: k, note_text: rjText })
                  })
                : Promise.resolve();
              return Promise.resolve(noteWrite).then(function () { return loadNotes(); }).then(function () {
                say(statusEl('data-revstatus', k), 'ok', 'Rejected. Confirmed by reading it back from the database.');
                repaintResource(k);
              });
            })
            .catch(function () {
              t.disabled = false;
              say(statusEl('data-revstatus', k), 'bad', 'NOT SAVED: could not reach the server. Try again.');
            });
          return;
        }
      });
    }

    function sections() { return Array.prototype.slice.call(document.querySelectorAll('.mm-sec')); }

    function wire() {
      sections().forEach(function (s) {
        var saved = foldGet(s.id);
        if (saved === '0') s.open = false;
        if (saved === '1') s.open = true;
        s.addEventListener('toggle', function () { foldSet(s.id, s.open); });
      });

      var burger = el('mmBurger'), nav = el('mmNav');
      if (burger && nav) {
        burger.addEventListener('click', function () {
          var open = nav.classList.toggle('open');
          burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      }
      var ca = el('mmCollapseAll'), ea = el('mmExpandAll');
      if (ca) ca.addEventListener('click', function () { sections().forEach(function (s) { s.open = false; foldSet(s.id, false); }); window.scrollTo({ top: 0, behavior: 'smooth' }); });
      if (ea) ea.addEventListener('click', function () { sections().forEach(function (s) { s.open = true; foldSet(s.id, true); }); });

      var top = el('mmTop');
      if (top) top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

      document.addEventListener('click', function (ev) {
        var t = ev.target;
        if (t && t.getAttribute && t.getAttribute('data-more')) {
          var k = t.getAttribute('data-more');
          expanded[k] = !expanded[k];
          renderLists();
        }
      });

      wireItemControls();

      var ci = el('mmCollectedInput');
      if (ci) ci.addEventListener('change', function () {
        persist('collected-revenue', (ci.value || '').replace(/[^0-9.]/g, '') || '0');
        renderTracker();
      });

      function bumpConv(delta) {
        var k = 'conv-count-' + dkey(new Date());
        var n = parseInt(state[k], 10); if (isNaN(n)) n = 0;
        n = Math.max(0, n + delta);
        persist(k, String(n));
        renderTracker();
      }
      if (el('mmConvPlus')) el('mmConvPlus').addEventListener('click', function () { bumpConv(1); });
      if (el('mmConvMinus')) el('mmConvMinus').addEventListener('click', function () { bumpConv(-1); });

      function bumpAsk(delta) {
        var k = askKey(dkey(new Date()));
        var n = Math.max(0, getAsk(dkey(new Date())) + delta);
        persist(k, String(n));
        renderTracker();
      }
      if (el('mmAskPlus')) el('mmAskPlus').addEventListener('click', function () { bumpAsk(1); });
      if (el('mmAskMinus')) el('mmAskMinus').addEventListener('click', function () { bumpAsk(-1); });

      var nb = el('mmNotes');
      if (nb) nb.addEventListener('blur', function () {
        var v = nb.value;
        if (v && v !== (state['notes-log'] || '')) {
          persist('notes-log', v);
          var ns = el('mmNotesSaved');
          if (ns) ns.textContent = 'Saved ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC.';
        }
      });

      wireCopy();
    }

    // -------------------------------------------------------------------
    shell();
    hydrate();
    setInterval(renderTracker, 60000);
  }

  root.MoneyMapYearPage = { init: function (cfg) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { init(cfg); });
    } else { init(cfg); }
  } };
})(window);
