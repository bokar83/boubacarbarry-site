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
     2. DO NEXT       a TILE, not a page. Two modes, his own words 2026-09-01:
                     when any MUST item is live today (a hard clock or a
                     promise to a named person), this tile points at the
                     Must section below and EVERY must-do item renders there,
                     together, first -- nothing is pulled out into its own
                     spot anymore. When nothing is a genuine must today, this
                     tile shows a rolling FIVE live items he can act on
                     directly and choose from, rather than a single forced
                     #1. Used to always be a single #1 pulled out of its own
                     tier, which is the behavior he asked to change.
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
  // Must/Should are FINISHABLE (2026-09-02, Boubacar direct): capped at 5,
  // and clearing them is the day being DONE for that tier -- no refill from
  // backlog. Could is the opposite: a ROLLING 5 that always refills the
  // moment a row is cleared, because nothing in it is an obligation. See the
  // long comment above pickCommitted() for the full model (cascade + the
  // arrival-can-bump rule) -- it is not a display accident, it is his stated
  // definition of the three tiers.
  var TIER_CAP = 5;
  var COULD_ROLLING_N = 5;
  var TABLE = 'y0_money_map_state';
  var UPSERT_RPC = 'y0_upsert';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Turns bare http(s) URLs inside plain-text row/note/reason content into
  // real, tappable links -- escape FIRST, then build the anchor around the
  // escaped pieces. Never string-concatenates raw unescaped text into HTML;
  // every non-URL segment still goes through esc() exactly as it always did.
  // Because the input is always plain text (esc() is the only thing that
  // ever touches these fields otherwise), there is never a pre-existing
  // anchor in here to double-link.
  //
  // HARD PLACEMENT RULE (2026-09-01, his own words after tapping one on the
  // live board): "the links need to be lowered down so that I can actually
  // click on it... right now the links are at the very top and when I click
  // on it all it does is open and close each section." A <details>
  // disclosure's ONLY toggle control is its <summary> -- any click landing
  // inside a <summary>, including on a descendant <a>, toggles the section
  // first and the browser never fires the navigation. So: NEVER call
  // linkify() on text that renders inside a <summary> (item-title, the hero
  // headline, a section title). Those stay plain via esc()/textContent, on
  // purpose, so the header reads as a title. linkify() is only for BODY
  // text -- rendered in a mm-item-body / mm-sec-body / a marknote / a note --
  // which sits outside the <summary> and lets a tap navigate normally.
  //
  // `truncate` (default true) shortens a very long URL's DISPLAY text only,
  // never its href, so the row does not blow out the mobile width. Pass
  // `false` for a "Copy" box (.mm-code) where the visible text doubles as
  // the exact string a button copies -- there, CSS word-break wraps the
  // full URL instead of shortening what gets copied.
  var URL_RE = /\bhttps?:\/\/[^\s<>"']+/g;
  function linkify(s, truncate) {
    var str = String(s == null ? '' : s);
    var out = '', last = 0, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(str))) {
      var raw = m[0];
      var start = m.index;
      var end = start + raw.length;
      // Trailing punctuation (a sentence's closing period/comma, a stray
      // bracket) is almost never part of the URL. Strip from the end,
      // unwinding one character at a time so "...page)." resolves to a
      // trail of ").", not just ".". A ')' is kept when it balances an '('
      // that is genuinely inside the URL (e.g. a Wikipedia "Foo_(bar)" link).
      var trail = '';
      while (raw.length) {
        var lastCh = raw.charAt(raw.length - 1);
        if (lastCh === ')') {
          var opens = (raw.match(/\(/g) || []).length;
          var closes = (raw.match(/\)/g) || []).length;
          if (closes <= opens) break;
        } else if ('.,;:!?]}\'"'.indexOf(lastCh) === -1) {
          break;
        }
        trail = lastCh + trail;
        raw = raw.slice(0, -1);
      }
      out += esc(str.slice(last, start));
      if (raw) {
        var display = (truncate !== false && raw.length > 64)
          ? raw.slice(0, 40) + '…' + raw.slice(-16)
          : raw;
        out += '<a class="mm-link" href="' + esc(raw) + '" target="_blank" rel="noopener noreferrer">' +
          esc(display) + '</a>';
      }
      out += esc(trail);
      last = end;
    }
    out += esc(str.slice(last));
    return out;
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

    // ---- DAY-STRIP DRILL-IN (2026-09-02) ----------------------------------
    // Tapping a date on the day-by-day strip opens exactly what is scheduled
    // to land THAT day -- every row whose effective due date (a reschedule's
    // `to`, or the row's own `by_date` when it has never been rescheduled)
    // equals the tapped date. Not a second page, not a second data source:
    // it filters the SAME `cos-worklist` array every tier list already reads,
    // and renders each row with itemHtml(), the exact function the tier lists
    // use -- so the Done checkbox, Reschedule form, Archive button and Notes
    // panel are the real, live controls (same document-level delegated
    // listeners in wireItemControls()), never a second reschedule path. Only
    // one thing tracks whether the drill-in is open: `dayModalDate`, null
    // when closed, else the YYYY-MM-DD it is showing.
    var dayModalDate = null;

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

    // ---- CLOSED, TODAY OR EARLIER (2026-09-01, corrected same day) --------
    // The other half of the same complaint, and the one that stung most:
    // "i put in notes for Y1 day 1 and i still see those items in there as
    // action items." On 2026-08-31 he ticked three rows done. Two of them
    // dropped off. `promise:5` did not -- the ranker republished it and this
    // page only DULLED it, so on 2026-09-01 it was still sitting in his Must
    // tier as one of two things he had to do. He had already done it and said
    // so, twice, with a tick and a note.
    //
    // FIRST CUT of this fix (same day, since reverted) kept a row ticked
    // TODAY inside its tier, dulled, on the theory that watching it dim in
    // place was the "look what I finished" signal. It was not: it produced
    // the exact defect Boubacar caught within hours -- the tracker pill said
    // "6 done today" while "Already done" said "1 item", because the section
    // collects only earlier-day closures and today's six never left their
    // tiers to be collected. Council (2026-09-01) confirmed: the count and
    // the section must never be able to disagree, ever, and consistency with
    // the sibling "On a later day" section (which removes a rescheduled row
    // from its tier immediately, not just once a day has passed) beats the
    // in-tier-dulling argument. The "watch today's progress" job is now done
    // by the tracker pill + the day-by-day strip, both already live and both
    // unaffected by this change -- this function no longer needs to serve
    // that job too.
    //
    // A row he closed TODAY OR EARLIER leaves its tier and lands in "Already
    // done". One guard remains, and it is still load-bearing:
    //   * only when the row is not re-dated for today or later. Recurring
    //     rows -- `recurring:brandon-daily` is the live example -- carry
    //     yesterday's (or today's) done marker AND a due date, because the
    //     next instance is genuinely new work. Without this guard the daily
    //     accountability message would disappear from his board every day.
    function closedEarlier(item) {
      var k = String(item.key);
      if (!isDone(k) && !archiveOf(k)) return null;
      var ts = stateTs[doneKey(k)] || (archiveOf(k) || {}).ts;
      if (!ts) return null;
      var d = new Date(ts);
      if (isNaN(d.getTime())) return null;
      var closed = denverDateStr(d);
      var due = effectiveDue(item);
      if (due && due >= todayStr()) return null;
      return closed;
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
              '<a href="#sec-hero">Do next</a>' +
              '<a href="#sec-must">Must</a>' +
              '<a href="#sec-should">Should</a>' +
              '<a href="#sec-could">Could</a>' +
              '<a href="#sec-later">Later</a>' +
              '<a href="#sec-done">Done</a>' +
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

          // Day-strip drill-in (2026-09-02). Hidden by default; opened by a
          // tap on any `.mm-day` cell in the day-by-day strip. Lives inside
          // `.mm-wrap` but is `position:fixed` in CSS so it sits above every
          // section regardless of scroll position -- phone-first, since he
          // reads this board on his phone.
          '<div class="mm-daymodal" id="mmDayModal" hidden>' +
            '<div class="mm-daymodal-backdrop" id="mmDayModalBackdrop"></div>' +
            '<div class="mm-daymodal-panel" role="dialog" aria-modal="true" aria-labelledby="mmDayModalTitle">' +
              '<div class="mm-daymodal-head">' +
                '<span class="mm-daymodal-title" id="mmDayModalTitle">&nbsp;</span>' +
                '<button type="button" class="mm-nav-btn" id="mmDayModalClose">Close</button>' +
              '</div>' +
              '<div class="mm-daymodal-body" id="mmDayModalBody"></div>' +
            '</div>' +
          '</div>' +

          '<details class="mm-sec" id="sec-tracker" open>' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">Tracker</span>' +
              '<div class="mm-track-pills" id="mmPills"></div></summary>' +
            '<div class="mm-sec-body" id="mmTrackerBody"></div>' +
          '</details>' +

          '<details class="mm-sec hero" id="sec-hero" open>' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-hero-badge" id="mmHeroBadge">#1 right now</span>' +
              '<span class="mm-sec-meta" id="mmHeroMeta"></span>' +
              '<span class="mm-hero-line" id="mmHeroLine">Reading the board&hellip;</span></summary>' +
            // ONE container, filled by renderHero() with either a pointer to
            // the Must section (must-mode) or up to five full itemHtml() rows
            // (five-mode) -- see renderHero()'s own comment. The old fixed
            // why/res/full/ctl slots were built for exactly one row; a block
            // of rows reuses itemHtml(), the SAME renderer the tier lists use,
            // so every row here already carries its own resource panel, full
            // text and control bar with no second copy of that markup.
            '<div class="mm-sec-body"><div id="mmHeroBody"></div></div>' +
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
          '<details class="mm-sec" id="sec-done">' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">Already done</span>' +
              '<span class="mm-sec-meta" id="mmDoneMeta">&hellip;</span></summary>' +
            '<div class="mm-sec-body">' +
              '<p class="mm-lede">Everything closed, today included -- this count always matches the tracker\'s "done today" pill. Kept here, never deleted, so a row closed by mistake can be un-ticked and come straight back to its tier.</p>' +
              '<div id="mmDoneList"></div></div>' +
          '</details>' +

          '<details class="mm-sec" id="sec-later">' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">On a later day</span>' +
              '<span class="mm-sec-meta" id="mmLaterMeta">&hellip;</span></summary>' +
            '<div class="mm-sec-body">' +
              '<p class="mm-lede">Rows that carry a new date. They are off today on purpose and every control still works here, so a row you want back today can be rescheduled straight from this list.</p>' +
              '<div id="mmLaterList"></div></div>' +
          '</details>' +

          '<div id="mmAgentDrawer"></div>' +
          '<div id="mmReadiness"></div>' +

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

      // The drill-in modal is built inside `.mm-wrap`, but `.mm-wrap` itself
      // sets `position:relative; z-index:1`, which makes it a stacking
      // context boundary -- EVERY fixed-position descendant's z-index (the
      // modal included) is compared against page-level siblings using THAT
      // boundary's z-index (1), never its own. The deploy-stamp badge lives
      // directly under <body> at z-index 99999 and would always paint over
      // the modal no matter how high the modal's own z-index goes. Moving
      // the modal node to be a direct child of <body> escapes `.mm-wrap`'s
      // stacking context so its z-index is finally compared where it is
      // declared. The modal's own inner HTML is fully rebuilt on every
      // hydrate/renderAll, so this move only needs to happen once.
      var modalEl = el('mmDayModal');
      if (modalEl && modalEl.parentNode !== document.body) { document.body.appendChild(modalEl); }

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
            ' data-day="' + esc(ds) + '" role="button" tabindex="0"' +
            ' aria-label="Show what lands ' + esc(prettyDate(ds)) + '"' +
            ' title="Tap to see what lands ' + esc(prettyDate(ds)) + '">' +
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
    // Day-strip drill-in (2026-09-02)
    // -------------------------------------------------------------------
    // Filters the SAME `cos-worklist` array every tier list reads -- no
    // second data source, no re-ranking. `effectiveDue()` already carries the
    // "a reschedule wins over the row's own by_date" rule the tier lists use,
    // so a rescheduled row shows up under its NEW date here too, not its old
    // one. Order is left exactly as the worklist published it (rank order),
    // same as every tier list -- "grouped/ordered the way the main list
    // already orders them" without a second sort implementation.
    function dayModalItems(dateStr) {
      var wl = readWorklist();
      if (wl.error) return { items: [], error: wl.error };
      if (!wl.items) return { items: [], error: null };
      return {
        items: wl.items.filter(function (i) { return effectiveDue(i) === dateStr; }),
        error: null
      };
    }

    function renderDayModal() {
      var host = el('mmDayModalBody');
      var titleEl = el('mmDayModalTitle');
      if (!host || !dayModalDate) return;
      if (titleEl) titleEl.textContent = prettyDate(dayModalDate) + ' · ' + dayModalDate;
      if (!remoteOk) {
        host.innerHTML = '<p class="mm-lede">The board could not be read, so this day is unknown, not empty. ' +
          esc(readError || '') + '</p>';
        return;
      }
      var res = dayModalItems(dayModalDate);
      if (res.error) {
        host.innerHTML = '<p class="mm-lede">The stored ranked list could not be parsed: ' + esc(res.error) + '</p>';
        return;
      }
      if (!res.items.length) {
        host.innerHTML = '<p class="mm-lede">Nothing scheduled to land on this day.</p>';
        return;
      }
      // Same row renderer the tier lists use -- Done, Reschedule, Archive and
      // Notes are the real controls, wired into the same document-level
      // delegated listeners already set up by wireItemControls(). Reschedule
      // here writes through the exact same persist(pushKey(k), ...) path a
      // reschedule from the Should tier would; there is no second write path.
      host.innerHTML = res.items.map(itemHtml).join('');
    }

    function openDayView(dateStr) {
      dayModalDate = dateStr;
      var modal = el('mmDayModal');
      if (modal) modal.hidden = false;
      try { document.body.style.overflow = 'hidden'; } catch (e) {}
      renderDayModal();
    }

    function closeDayView() {
      dayModalDate = null;
      var modal = el('mmDayModal');
      if (modal) modal.hidden = true;
      try { document.body.style.overflow = ''; } catch (e) {}
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
    // Do next -- points at whichever capped tier is live, first. Never
    // authored here; buildBoard() decides the mode, this only reads it.
    //
    // 2026-09-02 rebuild (cap + cascade replaces the 2026-09-01 "show every
    // live MUST unfiltered" build the same day it shipped -- see buildBoard()
    // for the full four-rule model). Three modes now, not two, and NONE of
    // them pull rows out into a second copy inside the tile any more: every
    // mode just points at its section with an anchor link and a preview
    // line, and the section itself (already capped to TIER_CAP or
    // COULD_ROLLING_N by buildBoard()) is the only place those rows render.
    // That closes the exact bug class the old "five mode" carried on purpose
    // (a row rendered twice means its Notes button silently opens the wrong
    // copy) rather than reproducing it for a third tier.
    //   MUST mode   -- at least one row survived today's Must cap.
    //   SHOULD mode -- Must is empty (cleared, or never had one today) and
    //                  at least one row survived the Should cap.
    //   COULD mode  -- both are empty; points at the rolling five instead.
    //   none mode   -- everything that is his is done, archived, or parked.
    // -------------------------------------------------------------------
    function renderHero() {
      var badge = el('mmHeroBadge'), line = el('mmHeroLine'), meta = el('mmHeroMeta');
      var body = el('mmHeroBody');
      if (!line || !body) return;
      if (editInProgress()) return;
      if (!remoteOk) {
        if (badge) badge.textContent = 'Board unavailable';
        line.textContent = 'Could not read the board, so there is nothing to show.';
        if (meta) meta.textContent = 'read failed';
        body.innerHTML = '';
        return;
      }
      // The tile reads the SAME live, ranked object the tier lists render --
      // see the note on REQUIREMENT 7 (2026-08-31) below buildBoard(). A
      // second, separately-cached string here is the exact bug class that
      // requirement closed, and re-decided.
      var b = buildBoard();
      if (b.fail) {
        if (badge) badge.textContent = 'Board unavailable';
        line.textContent = 'Could not build the ranked board, so there is nothing to show.';
        if (meta) meta.textContent = 'unavailable';
        body.innerHTML = b.fail;
        return;
      }

      function skippedNote(labelSuffix) {
        if (!b.heroSkipped || !b.heroSkipped.length) return '';
        return '<div class="mm-stat-note">Every ' + esc(b.heroSkipped.join(' and ')) +
          ' item on the board is already done, archived, or moved to a later date' + labelSuffix +
          '. The ranking did not skip them; you cleared them.</div>';
      }

      if (b.heroMode === 'must' || b.heroMode === 'should') {
        var isMust = b.heroMode === 'must';
        var items = isMust ? b.mustLiveItems : b.shouldLiveItems;
        var n = items.length;
        var first = items[0];
        var preview = first ? (first.headline || (first.title || '').split('\n')[0] || '') : '';
        if (badge) badge.textContent = isMust ? 'MUST' : 'SHOULD';
        line.textContent = preview + (n > 1 ? ' (+' + (n - 1) + ' more ' + (isMust ? 'must' : 'should') + (n - 1 === 1 ? '' : 's') + ')' : '');
        if (meta) meta.textContent = n + ' ' + (isMust ? 'must-do' : 'should-do') + ' item' + (n === 1 ? '' : 's') +
          ' today' + (n >= TIER_CAP ? ' (capped at ' + TIER_CAP + ')' : '');
        var anchor = isMust ? '#sec-must' : '#sec-should';
        var anchorLabel = isMust ? 'Must' : 'Should';
        body.innerHTML = skippedNote(isMust ? '' : ', or is genuinely empty today') +
          '<div class="mm-empty">Grouped together in <a href="' + anchor + '">' + anchorLabel + '</a>, opened below ' +
          '— nothing is pulled out into its own tile.' +
          (isMust && b.shouldOverflowCount ? ' ' + b.shouldOverflowCount + ' more Should row' +
            (b.shouldOverflowCount === 1 ? '' : 's') + ' will get a fresh look tomorrow.' : '') +
          '</div>';
        return;
      }

      if (b.heroMode === 'could') {
        if (badge) badge.textContent = 'Nice to have';
        line.textContent = 'Everything with a deadline or a promise is cleared. A rolling five, no obligation.';
        if (meta) meta.textContent = 'could · rolling five';
        body.innerHTML = skippedNote('') + '<div class="mm-empty">Grouped together in ' +
          '<a href="#sec-could">Could</a>, opened below — do any of them, great; skip them, no big deal.</div>';
        return;
      }

      // heroMode === 'none'
      if (badge) badge.textContent = 'All clear';
      line.textContent = 'Nothing is live and undecided right now.';
      if (meta) meta.textContent = 'all clear';
      body.innerHTML = '<div class="mm-empty">Every ranked row that is yours is either done, ' +
        'archived, or parked on a later date. That is a finished list, not an empty one.</div>';
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
        return { items: p.items, error: null, date: p.denver_date || null, total: p.total_considered, payload: p };
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

    // PRIORITY is not SEQUENCE (2026-09-02, Boubacar direct, the Enrique
    // example): the #1-ranked row today might be a 10:30 interview, which
    // means it is the day's top priority AND the wrong thing to reach for at
    // 8am. There is no structured clock-time field on a row today (ranking.py
    // carries a due DATE, never an hour), so this is a deliberately narrow,
    // named simplification: scan the row's own text for a clock time it
    // already states (e.g. "10:30am call with Enrique") and, when found,
    // mark it as time-anchored rather than "do this first." A real fix is a
    // structured start-time field on the row -- flagged, not built here,
    // because that is a ranking.py/publisher schema change and this task is
    // the tier page only.
    var TIME_RE = /\b(1[0-2]|0?[1-9])(:[0-5]\d)?\s*(am|pm)\b/i;
    function timePinLabel(item) {
      var hay = String((item.title || '') + ' ' + (item.first_move || ''));
      var m = TIME_RE.exec(hay);
      if (!m) return '';
      return '<span class="mm-mark" style="background:#3a3020;color:#e8c988;border:1px solid #7a5f2e;" ' +
        'title="This row names a fixed time. It is ranked by priority, not by what happens first this morning.">' +
        '&#128337; ' + esc(m[0]) + '</span>';
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
        h += '<div class="mm-note"><span class="mm-note-ts">' + esc(noteClock(n.created_at)) + '</span>' + linkify(n.note_text) + '</div>';
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
          box = '<div class="mm-code" data-rescode="' + esc(k) + '">' + linkify(text, false) +
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
        return '<div class="mm-agent-row"><span class="mm-agent-title">' + linkify(first) + '</span>' +
          '<span class="mm-agent-reason">' + linkify(reason) + '</span></div>';
      }).join('');
      return '<details class="mm-agent-drawer"><summary><span class="mm-chev">&#9656;</span>' +
        'In agent hands (' + rows.length + ageTxt + ')</summary>' +
        '<div class="mm-agent-rows">' + rowsHtml + '</div></details>';
    }

    // WHAT + HOW readiness line.
    // memory/feedback_money_map_rows_need_what_and_how_2026_09_01.md -- a row
    // reaches him only with a concrete next action AND the artifacts to do it.
    // The verdict is computed SERVER-SIDE in publish_money_map_worklist.py and
    // only rendered here; a second copy of the test in the browser is the drift
    // priority_keys.py exists to prevent.
    //
    // Renders NOTHING at all for a worklist published before the gate existed
    // (no `held_back` field). Every field is read defensively for the same
    // reason: an older blob must never blank or break the page.
    //
    // While the publisher's HOLD_ENABLED is false NOTHING is being hidden --
    // this line is a count of what does not YET meet the bar, on a board that
    // is still showing him all of it. The wording says exactly that, because a
    // line implying rows were removed when they were not is its own lie.
    function readinessHtml(p) {
      if (!p || !p.held_back || typeof p.held_back.count !== 'number') return '';
      var hb = p.held_back;
      var ready = (typeof p.ready_count === 'number') ? p.ready_count : null;
      var by = hb.by_reason || {};
      var bits = [];
      if (by.how) bits.push(by.how + ' need a draft or a contact');
      if (by.what) bits.push(by.what + ' have no action line');
      if (by['what+how']) bits.push(by['what+how'] + ' have neither');
      var delta = '';
      if (typeof p.became_ready_since === 'number') {
        delta = ' <span class="mm-when">' + p.became_ready_since + ' became ready since the last run</span>';
      }
      var verb = hb.hold_enabled
        ? 'held off this list'
        : 'not ready to act on yet, and still shown to you anyway';
      return '<div class="mm-marknote">' +
        '<b>' + hb.count + ' ' + esc(verb) + '.</b> ' +
        (ready !== null ? (ready + ' carry both a next action and the thing you need to do it. ') : '') +
        (bits.length ? esc(bits.join(', ')) + '. ' : '') +
        'Nobody is assigned to the rest yet.' + delta +
        ' <a href="/review/20260901-money-map-what-how-audit/">See the full breakdown</a>.' +
        '</div>';
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
                    linkify(String(pushed.reason || '')) +
                    (pushed.ts ? ' <span class="mm-when-sm">recorded ' + esc(noteClock(pushed.ts)) + '</span>' : '') +
                  '</div>' : '') +
        (arch ? '<div class="mm-marknote"><b>Archived' + (arch.ts ? ' ' + esc(noteClock(arch.ts)) : '') + '.</b> ' +
                  linkify(String(arch.reason || 'No reason recorded.')) + '</div>' : '') +

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
            ? '<div class="mm-move"><b>First move:</b> ' + linkify(item.first_move) + '</div>'
            : '<div class="mm-move blank"><b>No first move on this row.</b> Add a <code>FIRST-MOVE:</code> line to it rather than guessing one.</div>');
      var done = isDone(k);
      var pushed = pushOf(k);
      var arch = archiveOf(k);

      // A rescheduled, archived, or done row wears it on its face, collapsed.
      // He has to be able to tell at a glance that a row was LOOKED AT and
      // moved on purpose, rather than left untouched, without opening
      // anything. Done rows now leave their tier the moment they close
      // (2026-09-01), so this badge is what tells him, inside the now-larger
      // "Already done" list, which of those rows are today's -- the visual
      // cue that replaces the old in-tier dulling.
      var badges = '';
      badges += timePinLabel(item);
      if (pushed) badges += '<span class="mm-mark push">moved to ' + esc(prettyDate(pushed.to)) + '</span>';
      if (arch) badges += '<span class="mm-mark arch">archived</span>';
      if (done && !arch) {
        var closedOn = closedEarlier(item);
        badges += '<span class="mm-mark done">' +
          (closedOn === todayStr() ? 'done today' : (closedOn ? 'done ' + esc(prettyDate(closedOn)) : 'done')) +
          '</span>';
      }

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
          '<div class="mm-full">' + linkify(item.title || '') + '</div>' +
          '<div class="mm-facts">' + linkify(facts.filter(Boolean).join(' · ')) + ' · ' + esc(k) + '</div>' +
        '</div></details>' +
        controlsHtml(k) +
      '</div>';
    }

    function renderList(hostId, metaId, rows, key, emptyMsg, closedOut, laterOut) {
      var host = el(hostId), meta = el(metaId);
      if (!host) return;
      if (rows === null) { host.innerHTML = '<div class="mm-empty">' + emptyMsg + '</div>'; if (meta) meta.textContent = 'unavailable'; return; }
      // An empty section on a page whose job is telling him what to do reads
      // as a broken render, not as good news -- Year One shipped empty once
      // and cost him a working morning. So an emptied tier states its reason
      // in words, and when the reason is that its rows moved out it says so
      // and points at where each one actually went.
      //
      // TWO reasons a row leaves a tier, tracked SEPARATELY (2026-09-01
      // correction): closed (done or archived, now including today -- see
      // closedEarlier) goes to "Already done"; rescheduled goes to "On a
      // later day". Before this fix both shared one counter and this message
      // always said "moved to a later day", which was wrong on the day's
      // most common case -- a row he finished today, sitting under "Already
      // done" -- and would only have gotten more visibly wrong once today's
      // closures started leaving tiers instead of staying dulled in place.
      var closedN = closedOut || 0, laterN = laterOut || 0, moved = closedN + laterN;
      if (!rows.length) {
        var parts = [];
        if (closedN) parts.push(closedN + ' row' + (closedN === 1 ? ' is' : 's are') + ' done, under <a href="#sec-done">Already done</a>');
        if (laterN) parts.push(laterN + ' row' + (laterN === 1 ? ' was' : 's were') + ' moved to a later day, under <a href="#sec-later">On a later day</a>');
        host.innerHTML = '<div class="mm-empty">' + (moved
          ? 'Nothing due in this tier today. ' + parts.join(' and ') + '.'
          : 'Nothing ranked into this tier today. The board was read fine; this tier is genuinely empty.') + '</div>';
        if (meta) {
          var metaParts = [];
          if (closedN) metaParts.push(closedN + ' already done');
          if (laterN) metaParts.push(laterN + ' on a later day');
          meta.textContent = '0 items' + (metaParts.length ? ' · ' + metaParts.join(' · ') : '');
        }
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
      if (meta) {
        // "done" here counts ONLY the rows actually shown in THIS tier right
        // now (2026-09-01, corrected same day again): before this fix it
        // reported closedN -- rows that had ALREADY LEFT the tier for
        // "Already done" -- which is a different population from the rows
        // in front of him. He ticked four Must rows due today (the
        // closedEarlier guard correctly keeps a same-day-due row in its
        // tier instead of moving it out) and the header still read "4 items
        // - 1 done", because that 1 was one unrelated row that had left
        // MUST on an earlier day. Every row he was looking at was in fact
        // done, and the header disagreed with what his own eyes and the
        // per-row DONE badges showed. This number now can never read lower
        // than what is visibly ticked in the list below it.
        // The "Already done" list (key === 'closedearlier') is 100% done
        // rows by definition -- "N items - N done" there is true but only
        // repeats the section's own title, so this figure is skipped for
        // that one caller (Council, 2026-09-01).
        var doneShown = 0;
        if (key !== 'closedearlier') {
          for (var ri = 0; ri < rows.length; ri++) { if (isDone(String(rows[ri].key))) doneShown++; }
        }
        var metaSuffix = [];
        if (doneShown) metaSuffix.push(doneShown + ' done');
        if (closedN) metaSuffix.push(closedN + ' more already done, see Already done');
        if (laterN) metaSuffix.push(laterN + ' on a later day');
        meta.textContent = rows.length + ' item' + (rows.length === 1 ? '' : 's') +
          (metaSuffix.length ? ' · ' + metaSuffix.join(' · ') : '');
      }
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

      // A closed row (done or archived, any day, including today) leaves for
      // "Already done"; a rescheduled row leaves for "On a later day". The
      // count per tier is kept PER REASON, not combined, so each tier can say
      // out loud not just how many of its rows moved out but where each one
      // actually went -- an emptied section that does not explain itself
      // reads exactly like a broken render, which is this page's worst-ever
      // bug, and a section that explains itself WRONG (2026-09-01: "moved to
      // a later day" printed for rows that were actually done today) is the
      // same bug wearing a caption.
      var tiers = { MUST: [], SHOULD: [], COULD: [] };
      var closedOut = { MUST: 0, SHOULD: 0, COULD: 0 };
      var laterOut = { MUST: 0, SHOULD: 0, COULD: 0 };
      var later = [];
      var closed = [];
      mine.forEach(function (i) {
        var t = (i.tier === 'MUST' || i.tier === 'SHOULD') ? i.tier : 'COULD';
        if (closedEarlier(i)) { closedOut[t]++; closed.push(i); return; }
        if (scheduledLater(i)) { laterOut[t]++; later.push(i); return; }
        tiers[t].push(i);
      });
      closed.sort(function (a, b) {
        var x = closedEarlier(a) || '', y = closedEarlier(b) || '';
        return x < y ? 1 : (x > y ? -1 : 0);
      });
      // Flat, soonest first. No grouping headers: the date is already printed
      // on every one of these rows by the MOVED TO stamp itself.
      later.sort(function (a, b) {
        var x = scheduledLater(a) || '', y = scheduledLater(b) || '';
        return x < y ? -1 : (x > y ? 1 : 0);
      });

      // ---- MUST/SHOULD cap-and-cascade, COULD rolling five (2026-09-02) ---
      // Boubacar, verbatim, correcting the 2026-09-01 "show every live MUST"
      // build the same day it shipped: "for the must items I don't want more
      // than three to five must items every single day... on the should [tier]
      // it also should not have more than three to five items... on the could
      // we have always five showing up and they're rolling five." And on what
      // happens past five: "If the must list has ten items that really are
      // super vital and important, then they'd be the first five items on the
      // must list and then there'd be five items in the should list... If
      // there's something on the should list today that might be on the must
      // list tomorrow, you see how there's that relationship between them?"
      // and, on a same-day reprioritization: "As new things pop up, something
      // might bump something out because of priority" (his live example: the
      // Enrique interview did not exist as a Must this morning; something
      // that happened today made it tomorrow's #1).
      //
      // That is four rules, not one, and all four have to hold at once:
      //   1. MUST caps at TIER_CAP, ranked order, nothing re-scored here.
      //   2. Nothing is ever HIDDEN: whatever does not fit in MUST falls
      //      through into the SHOULD pool (ahead of genuine Should rows --
      //      it was still must-eligible, just not today's top five), and
      //      SHOULD caps at TIER_CAP the same way. Only SHOULD's own leftover
      //      goes unshown today -- it is not suppressed, it is simply next
      //      in line for TOMORROW's fresh top-five, the same as it always
      //      would have been under the ranker's own order.
      //   3. FINISHABLE, no backfill: once a row picked for today's Must or
      //      Should closes (done/archived) or moves to a later date, it
      //      leaves and nothing from the backlog slides up to replace it.
      //      Clearing the five really does mean the tier is done for the day.
      //   4. An ARRIVAL can still bump a still-pending row out (down into the
      //      tier below) when it out-ranks the day's weakest pick -- but only
      //      a genuine arrival: a row seeing this specific pool (must-eligible
      //      or should-eligible) for the FIRST TIME, tracked in `fseen-*`
      //      below. An old backlog row that merely inherits a slot freed by a
      //      completion does NOT get to sneak in that way -- that would be
      //      backfill wearing an arrival's clothes, and rule 3 forbids it.
      // pickCommitted() is the one place all four rules are enforced, reused
      // for both MUST and SHOULD so there is exactly one implementation of
      // "capped, finishable, arrival-can-bump" rather than two that can drift.
      //
      // COULD carries no obligation (his words: "nice to have... if you don't
      // do them, no big deal") so it gets none of this machinery: it is a
      // plain rolling window, recomputed fresh every render, of the top
      // COULD_ROLLING_N rows still live today. As one clears (done,
      // rescheduled, or archived -- the only three controls this page has;
      // there is no separate "skip"), it leaves tiers.COULD on the very next
      // render and the next-ranked Could row is simply already there.
      // "Arrival" is decided against a BASELINE SNAPSHOT of the pool taken
      // the first time today's set is established, not against "have I ever
      // seen this key before" -- a per-key first-seen timestamp cannot tell
      // an item that sat in the pool since 8am from one that just showed up,
      // because BOTH are "first seen today" on day one. A unit test caught
      // this exact bug in an earlier draft (see docs/audits/ for the harness
      // that failed on it): m6/m7/m8 were still being treated as "new" for
      // the rest of the day simply because today was also the first day
      // anyone had ever seen them. The baseline is stored right inside the
      // same lock JSON, so it costs one extra array, not a second persisted
      // key per item -- simpler than the per-item version it replaced, and
      // correct where that version was not.
      function pickCommitted(poolAllOrdered, lockKey, today, alwaysEligible) {
        var poolKeys = poolAllOrdered.map(function (i) { return String(i.key); });
        var byKey = {};
        poolAllOrdered.forEach(function (i) { byKey[String(i.key)] = i; });

        var raw = state[lockKey], parsed = null;
        try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
        // A fresh day (no lock yet, or the lock is from a prior date) gets a
        // free fill -- every eligible row deserves a fair shot at the day's
        // fresh top five, and the pool AS IT STANDS RIGHT NOW becomes the
        // baseline everything else is measured an "arrival" against for the
        // rest of today.
        var freshDay = !parsed || parsed.date !== today || !Array.isArray(parsed.keys);
        var baseline = freshDay ? poolKeys.slice() : (Array.isArray(parsed.baseline) ? parsed.baseline : poolKeys.slice());
        var kept = freshDay ? [] : parsed.keys.filter(function (k) { return poolKeys.indexOf(k) !== -1; });
        // Council (2026-09-02) flagged a real trust gap: a same-day bump
        // swaps a still-pending row out with no on-screen explanation, and
        // an unexplained disappearance from a list he's using for a
        // completion signal reads as the board losing a row, not as the
        // ranking working. bumpedOut names exactly which keys were swapped
        // out THIS call (not ones that simply finished/archived/moved), so
        // the caller can badge them rather than let them vanish quietly.
        var bumpedOut = [];

        var candidates = poolAllOrdered.filter(function (i) { return kept.indexOf(String(i.key)) === -1; });
        candidates.forEach(function (i) {
          var k = String(i.key);
          // A genuine arrival is a key that was NOT part of today's baseline
          // pool -- it showed up in a later re-rank, same as the Enrique
          // interview example. A key that WAS in the baseline but just never
          // got picked (or got picked and then finished) is known backlog:
          // it waits for tomorrow's fresh cap, never today's freed slot.
          var isArrival = baseline.indexOf(k) === -1;
          var eligible = freshDay || (alwaysEligible && alwaysEligible[k]) || isArrival;
          if (!eligible) return;
          if (kept.length < TIER_CAP) { kept.push(k); return; }
          var worstIdx = -1, worstRank = -1;
          kept.forEach(function (kk, idx) {
            var r = poolKeys.indexOf(kk);
            if (r > worstRank) { worstRank = r; worstIdx = idx; }
          });
          var candRank = poolKeys.indexOf(k);
          if (worstIdx !== -1 && candRank < worstRank) {
            bumpedOut.push(kept[worstIdx]);
            kept[worstIdx] = k; // bump
          }
        });

        kept.sort(function (a, b) { return poolKeys.indexOf(a) - poolKeys.indexOf(b); });
        // Cumulative for the day (not just this call) -- a bump can happen
        // on an earlier render than the one he's looking at, and it should
        // still be nameable when he opens the page later that same day.
        var priorBumped = (!freshDay && Array.isArray(parsed.bumped)) ? parsed.bumped : [];
        var bumpedToday = priorBumped.concat(bumpedOut).filter(function (k, idx, arr) { return arr.indexOf(k) === idx; });
        var serialized = JSON.stringify({ date: today, keys: kept, baseline: baseline, bumped: bumpedToday });
        if (state[lockKey] !== serialized) persist(lockKey, serialized);

        var keptSet = {}; kept.forEach(function (k) { keptSet[k] = 1; });
        return {
          kept: kept.map(function (k) { return byKey[k]; }).filter(Boolean),
          overflow: poolAllOrdered.filter(function (i) { return !keptSet[String(i.key)]; }),
          bumpedToday: bumpedToday.length
        };
      }

      var todayD = todayStr();
      var liveMustAll = tiers.MUST.filter(function (i) { return sinkRank(i) === 0; });
      var liveShouldAll = tiers.SHOULD.filter(function (i) { return sinkRank(i) === 0; });
      var liveCouldAll = tiers.COULD.filter(function (i) { return sinkRank(i) === 0; });

      var mustPick = pickCommitted(liveMustAll, 'mustpick-' + todayD, todayD, null);
      var mustOverflowKeys = {};
      mustPick.overflow.forEach(function (i) { mustOverflowKeys[String(i.key)] = 1; });
      // Must overflow cascades in AHEAD of genuine Should rows -- it was
      // still must-eligible, just not one of today's five, so it outranks
      // a plain Should row by construction. alwaysEligible means it never
      // has to pass its own arrival test to occupy the Should pool.
      var shouldPoolAll = mustPick.overflow.concat(liveShouldAll);
      var shouldPick = pickCommitted(shouldPoolAll, 'shouldpick-' + todayD, todayD, mustOverflowKeys);

      var displayMust = mustPick.kept;
      var displayShould = shouldPick.kept;
      var displayCould = liveCouldAll.slice(0, COULD_ROLLING_N);
      var shouldOverflowCount = shouldPick.overflow.length; // true leftover -- tomorrow's candidates, not shown today

      tiers.MUST = displayMust;
      tiers.SHOULD = displayShould;
      tiers.COULD = displayCould;

      // ---- DO NEXT tile: whichever capped tier is live, first (2026-09-02)-
      // Same "all together, first" behavior as before, just reading the
      // now-capped Must/Should/Could sets instead of an unbounded Must. Every
      // mode leaves heroKeys EMPTY: nothing is ever pulled out of a tier into
      // a second copy inside the tile (that duplicate-key rendering was
      // exactly the "Notes button silently does nothing" bug the 2026-09-01
      // build already fixed once). The tile only ever points at the section;
      // renderLists() renders that section's own (already-capped) rows.
      var heroMode, heroItems = [], heroKeys = [], heroSkipped = [];
      if (displayMust.length) {
        heroMode = 'must';
      } else if (displayShould.length) {
        heroMode = 'should';
        if (liveMustAll.length) heroSkipped.push('MUST');
      } else if (displayCould.length) {
        heroMode = 'could';
        if (liveMustAll.length) heroSkipped.push('MUST');
        if (liveShouldAll.length) heroSkipped.push('SHOULD');
      } else {
        heroMode = 'none';
      }

      return { wl: wl, tiers: tiers, closedOut: closedOut, laterOut: laterOut, later: later, closed: closed, agent: agent,
        heroMode: heroMode, heroItems: heroItems, heroKeys: heroKeys,
        mustLiveItems: displayMust, mustLiveCount: displayMust.length,
        shouldLiveItems: displayShould, shouldLiveCount: displayShould.length,
        shouldOverflowCount: shouldOverflowCount, mustBumpedToday: mustPick.bumpedToday || 0,
        heroSkipped: heroSkipped };
    }

    function renderLists() {
      var b = buildBoard();
      if (b.fail) {
        renderList('mmMustList', 'mmMustMeta', null, 'must', b.fail);
        renderList('mmShouldList', 'mmShouldMeta', null, 'should', b.fail);
        renderList('mmCouldList', 'mmCouldMeta', null, 'could', b.fail);
        renderList('mmLaterList', 'mmLaterMeta', null, 'later', b.fail);
        renderList('mmDoneList', 'mmDoneMeta', null, 'closedearlier', b.fail);
        return;
      }
      var today = dkey(new Date());
      if (b.wl.date && b.wl.date !== today) {
        banner('<b>THIS RANKING IS NOT TODAY&rsquo;S.</b>It was computed for ' + esc(b.wl.date) +
               ' and has not been recomputed since. The items are real; their order may not reflect today.', true);
      } else {
        clearBanner();
      }
      // heroKeys is always empty now (2026-09-02) -- no mode pulls a row out
      // of its tier into a second copy inside the "Do next" tile any more,
      // so there is nothing to de-duplicate here. withoutHero() is kept as a
      // no-op safety net rather than deleted outright: it costs nothing, and
      // it is the one guard against the exact "Notes button silently opens
      // the wrong copy" bug reappearing if a future mode ever pulls rows out
      // again without updating this call site.
      var heroKeys = b.heroKeys || [];
      function withoutHero(rows) {
        return heroKeys.length ? rows.filter(function (i) { return heroKeys.indexOf(String(i.key)) === -1; }) : rows;
      }
      renderList('mmMustList', 'mmMustMeta', withoutHero(b.tiers.MUST), 'must', '', b.closedOut.MUST, b.laterOut.MUST);
      renderList('mmShouldList', 'mmShouldMeta', withoutHero(b.tiers.SHOULD), 'should', '', b.closedOut.SHOULD, b.laterOut.SHOULD);
      renderList('mmCouldList', 'mmCouldMeta', withoutHero(b.tiers.COULD), 'could', '', b.closedOut.COULD, b.laterOut.COULD);
      renderList('mmLaterList', 'mmLaterMeta', withoutHero(b.later), 'later', '');
      renderList('mmDoneList', 'mmDoneMeta', withoutHero(b.closed), 'closedearlier', '');
      // Must/Should are now capped (TIER_CAP) and finishable -- see
      // buildBoard(). Should's own overflow (after must-overflow already
      // cascaded in ahead of it) is real backlog, not hidden: it waits for
      // tomorrow's fresh top-five rather than showing today, so the count
      // rides on the Should meta line instead of vanishing silently.
      var shMeta = el('mmShouldMeta');
      if (shMeta && b.shouldOverflowCount) {
        shMeta.textContent = (shMeta.textContent || '') + ' · +' + b.shouldOverflowCount +
          ' more waiting for tomorrow’s fresh ranking';
      }
      // Council (2026-09-02): a same-day bump (a new arrival out-ranking the
      // day's weakest Must pick) moves a row from Must to Should silently
      // otherwise -- its tier badge changes but nothing narrates WHY. Naming
      // the count on Must's own meta line is the cheap fix: the row is never
      // actually hidden (it renders in Should, tier badge and all), this
      // just stops the swap from reading as the board losing a row.
      var mMeta = el('mmMustMeta');
      if (mMeta && b.mustBumpedToday) {
        mMeta.textContent = (mMeta.textContent || '') + ' · ' + b.mustBumpedToday +
          ' bumped to Should today by something more urgent';
      }
      var lm = el('mmLaterMeta');
      if (lm && b.later.length) {
        lm.textContent = b.later.length + ' item' + (b.later.length === 1 ? '' : 's') +
          ' · next ' + prettyDate(scheduledLater(b.later[0]));
      } else if (lm) {
        lm.textContent = 'nothing rescheduled';
      }
      var agentHost = el('mmAgentDrawer');
      if (agentHost) agentHost.innerHTML = agentDrawerHtml(b.agent);
      var readyHost = el('mmReadiness');
      if (readyHost) readyHost.innerHTML = readinessHtml(b.wl && b.wl.payload);
      var nm = el('mmNotesMeta');
      if (nm) nm.textContent = state['notes-log'] ? 'has notes' : 'empty';
    }

    // A re-render blows away a half-typed note or reschedule reason, and
    // realtime fires a render on every write from ANY device, so this is not
    // hypothetical. Defer the list repaint instead; the tracker and hero carry
    // no typing and are always safe to repaint.
    //
    // BUG FIX 2026-09-01 (D-money-map-archive-reschedule-2026-09-01): a form
    // whose Save button is already disabled has been SUBMITTED, not typed
    // into -- his reason text is still sitting in the textarea only because
    // nothing has cleared it yet while the write is confirming. Counting
    // that as "still editing" is what froze the #1 tile: renderHero()'s own
    // editInProgress() guard (below) saw that non-empty, not-yet-cleared
    // textarea forever, so the hero's control bar (still wired to the item
    // he just archived or rescheduled) never got replaced -- the headline
    // moved to the new #1 but the Archive form underneath it, and the
    // reason text inside it, was the OLD item's, stuck. Skipping a
    // mid-submit form's fields here lets the very next render replace that
    // stale control bar instead of leaving it frozen forever.
    var renderPending = false;
    function editInProgress() {
      var els = document.querySelectorAll('.mm-form textarea, .mm-noteform textarea, .mm-form input[type=date]');
      for (var i = 0; i < els.length; i++) {
        var wrap = els[i].closest ? els[i].closest('.mm-form, .mm-noteform') : null;
        if (wrap && wrap.querySelector('button[disabled]')) continue; // already submitted, not being edited
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
      // The drill-in modal renders the SAME rows as itemHtml() elsewhere, so
      // it needs the same live repaint on every write/realtime tick -- a
      // reschedule saved from inside the modal must move the row out (or
      // change its date-stamp) on screen without him closing and reopening.
      if (dayModalDate) renderDayModal();
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
          // renderAll(), not the bare list repaint: an undone reschedule can
          // put THIS row back in the #1 spot, and only renderAll() touches
          // the hero tile. See the 2026-09-01 note on editInProgress().
          renderAll();
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
              // renderAll(), not the bare list repaint (D-money-map-archive-
              // reschedule-2026-09-01): the row leaving its tier is only half
              // the fix. If this row WAS the #1, only renderAll() replaces
              // the hero tile with the new #1 -- a bare renderLists() left
              // the old headline and its stale controls on screen forever,
              // which read to him as "reschedule does not move the row."
              // The reason textarea and date input are cleared here (not just
              // formOpen[k]) because editInProgress() reads their live DOM
              // value at the moment renderAll() runs; by 1200ms the Save
              // button is re-enabled again, so the disabled-button skip in
              // editInProgress() no longer exempts them -- an uncleared value
              // would still read as "still typing" and block this exact
              // repaint.
              setTimeout(function () {
                formOpen[k] = null;
                if (rEl) rEl.value = '';
                if (dEl) dEl.value = '';
                renderAll();
              }, 1200);
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
          // renderAll(), for the same reason as data-pushundo above.
          renderAll();
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
              // renderAll(), not the bare list repaint (D-money-map-archive-
              // reschedule-2026-09-01, the root cause of the sticky-archive-
              // form report): archiving the current #1 makes a DIFFERENT row
              // the new #1. Only renderAll() repaints the hero tile with that
              // new row's own headline AND its own, empty control bar. A bare
              // renderLists() left the hero's headline stuck on this item and
              // its control bar -- including the open Archive form and the
              // reason just typed -- glued in place, so the NEXT item that
              // took the #1 spot visually inherited the old item's open
              // archive box and its old reason text.
              // Clearing arEl's value here (not just formOpen[k]) matters: by
              // 900ms the Save button is re-enabled, so editInProgress()'s
              // disabled-button skip no longer exempts this textarea, and an
              // uncleared reason would still read as "still typing" and block
              // this very repaint.
              setTimeout(function () {
                formOpen[k] = null;
                if (arEl) arEl.value = '';
                renderAll();
              }, 900);
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

      // ---- day-strip drill-in wiring (2026-09-02) ----------------------
      // Delegated (not bound per-cell) because renderDays() rebuilds the
      // strip's innerHTML on every render/realtime tick -- a per-cell
      // listener would be silently lost on the very first repaint.
      document.addEventListener('click', function (ev) {
        var day = ev.target.closest && ev.target.closest('[data-day]');
        if (day) { openDayView(day.getAttribute('data-day')); return; }
        if (ev.target.id === 'mmDayModalClose' || ev.target.id === 'mmDayModalBackdrop') { closeDayView(); return; }
      });
      // Enter/Space activates a day cell the same as a tap -- it carries
      // role="button" tabindex="0", not a real <button>, because the day
      // strip's own layout (a horizontal scroller of many small cells) is
      // built as <div>s throughout.
      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Enter' && ev.key !== ' ') return;
        var day = ev.target.closest && ev.target.closest('[data-day]');
        if (day) { ev.preventDefault(); openDayView(day.getAttribute('data-day')); }
      });
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && dayModalDate) closeDayView();
      });

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
