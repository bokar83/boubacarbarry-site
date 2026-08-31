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
  function parseDate(s, fallback) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : fallback;
  }

  function init(cfg) {
    cfg = cfg || {};
    var BOARD = cfg.boardId;
    var TOKEN = cfg.boardToken;
    var CONV_TARGET = cfg.convTarget || 5;
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
              '<a href="#sec-work">Work</a>' +
              '<a href="#sec-revenue">Revenue</a>' +
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
            '<div class="mm-sec-body"><div class="mm-hero-why" id="mmHeroWhy"></div></div>' +
          '</details>' +

          '<details class="mm-sec" id="sec-work" open>' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">Work to do</span>' +
              '<span class="mm-sec-meta" id="mmWorkMeta">&hellip;</span></summary>' +
            '<div class="mm-sec-body">' +
              '<p class="mm-lede">Ranked by the same engine the morning brief uses. Most important first, not nearest date first.</p>' +
              '<div id="mmWorkList"></div></div>' +
          '</details>' +

          '<details class="mm-sec" id="sec-revenue" open>' +
            '<summary><span class="mm-chev">&#9656;</span><span class="mm-sec-title">Revenue items</span>' +
              '<span class="mm-sec-meta" id="mmRevMeta">&hellip;</span></summary>' +
            '<div class="mm-sec-body">' +
              '<p class="mm-lede">The same ranking, filtered to the lanes that make money.</p>' +
              '<div id="mmRevList"></div></div>' +
          '</details>' +

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
        '</div>' +
        '<div class="mm-wk12"><div class="mm-wk12-track" id="mmWk12"></div><div class="mm-wk12-cap" id="mmWk12Cap">&nbsp;</div></div>' +
        '<div class="mm-conv-row">' +
          '<button class="mm-num-btn" id="mmConvMinus" aria-label="one fewer conversation">&minus;</button>' +
          '<div class="mm-conv-count" id="mmConv">0</div>' +
          '<button class="mm-num-btn" id="mmConvPlus" aria-label="one more conversation">+</button>' +
          '<div class="mm-conv-target">conversations today, of ' + CONV_TARGET + '</div>' +
        '</div>' +
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

      // The collapsed-state summary. This is the line that has to survive
      // "collapse everything", so it carries all three counters.
      var pills = el('mmPills');
      if (pills) {
        pills.innerHTML =
          '<span class="mm-pill">Week <b>' + (wk < 1 ? '0' : wkClamped) + '</b> of 12</span>' +
          '<span class="mm-pill">' + (daysLeft < 0 ? 'closed' : '<b>' + daysLeft + '</b> days left') + '</span>' +
          '<span class="mm-pill">$<b>' + collected.toLocaleString() + '</b> of $' + target.toLocaleString() + '</span>' +
          '<span class="mm-pill' + (convN >= CONV_TARGET ? ' ok' : (convN ? ' warn' : '')) + '"><b>' + convN + '</b> of ' + CONV_TARGET + ' conversations today</span>';
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
      var line = el('mmHeroLine'), why = el('mmHeroWhy'), meta = el('mmHeroMeta');
      if (!line) return;
      if (!remoteOk) {
        line.textContent = 'Could not read the board, so there is no #1 to show.';
        if (why) why.textContent = readError ? ('The read failed: ' + readError) : '';
        if (meta) meta.textContent = 'read failed';
        return;
      }
      var top = state['cos-top-priority'];
      if (!top) {
        line.textContent = 'No #1 has been published to this board yet.';
        if (why) why.innerHTML = 'The morning run writes <code>cos-top-priority</code>. Nothing has written it for board <code>' + esc(BOARD) + '</code>.';
        if (meta) meta.textContent = 'not set';
        return;
      }
      line.textContent = top;
      if (why) why.textContent = state['cos-top-priority-why'] || 'No reason was recorded with this priority.';
      var d = state['cos-top-priority-date'] || '';
      var today = dkey(new Date());
      if (meta) meta.textContent = d ? (d === today ? 'set today' : 'set ' + d + ', not today') : 'no date';
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
      var move = item.first_move
        ? '<div class="mm-move"><b>First move:</b> ' + esc(item.first_move) + '</div>'
        : '<div class="mm-move blank"><b>No first move on this row.</b> Add a <code>FIRST-MOVE:</code> line to it rather than guessing one.</div>';
      return '<details class="mm-item">' +
        '<summary>' +
          '<span class="mm-rank">#' + item.rank + '</span>' +
          '<span class="mm-tier ' + esc(item.tier || 'COULD') + '">' + esc(item.tier || '') + '</span>' +
          (item.lane ? '<span class="mm-lane">' + esc(item.lane) + '</span>' : '') +
          whenLabel(item) +
          '<span class="mm-item-title">' + esc(first) + '</span>' +
        '</summary>' +
        '<div class="mm-item-body">' + move +
          '<div class="mm-full">' + esc(item.title || '') + '</div>' +
          '<div class="mm-facts">' + esc(facts.filter(Boolean).join(' · ')) + ' · ' + esc(item.key) + '</div>' +
        '</div></details>';
    }

    function renderList(hostId, metaId, rows, key, emptyMsg) {
      var host = el(hostId), meta = el(metaId);
      if (!host) return;
      if (rows === null) { host.innerHTML = '<div class="mm-empty">' + emptyMsg + '</div>'; if (meta) meta.textContent = 'unavailable'; return; }
      if (!rows.length) { host.innerHTML = '<div class="mm-empty">Nothing ranked into this section today.</div>'; if (meta) meta.textContent = '0 items'; return; }
      var showAll = !!expanded[key];
      var shown = showAll ? rows : rows.slice(0, PAGE_SIZE);
      var html = shown.map(itemHtml).join('');
      if (rows.length > PAGE_SIZE) {
        html += '<div class="mm-more"><button class="mm-nav-btn" data-more="' + key + '">' +
          (showAll ? 'Show only the top ' + PAGE_SIZE : 'Show all ' + rows.length) + '</button></div>';
      }
      host.innerHTML = html;
      if (meta) meta.textContent = rows.length + ' item' + (rows.length === 1 ? '' : 's');
    }

    function renderLists() {
      if (!remoteOk) {
        var msg = 'The board could not be read, so this list is unknown, not empty.' +
                  (readError ? ' (' + esc(readError) + ')' : '');
        renderList('mmWorkList', 'mmWorkMeta', null, 'work', msg);
        renderList('mmRevList', 'mmRevMeta', null, 'rev', msg);
        return;
      }
      var wl = readWorklist();
      if (wl.error) {
        var e = 'The stored ranked list could not be parsed: ' + esc(wl.error) + '. Re-run the publisher.';
        renderList('mmWorkList', 'mmWorkMeta', null, 'work', e);
        renderList('mmRevList', 'mmRevMeta', null, 'rev', e);
        return;
      }
      if (!wl.items) {
        var m = 'No ranked list has been published to board <code>' + esc(BOARD) + '</code> yet. ' +
                'Publish it with <code>python scripts/publish_money_map_worklist.py --write</code> on the orchestrator.';
        renderList('mmWorkList', 'mmWorkMeta', null, 'work', m);
        renderList('mmRevList', 'mmRevMeta', null, 'rev', m);
        return;
      }
      var today = dkey(new Date());
      if (wl.date && wl.date !== today) {
        banner('<b>THIS RANKING IS NOT TODAY&rsquo;S.</b>It was computed for ' + esc(wl.date) +
               ' and has not been recomputed since. The items are real; their order may not reflect today.', true);
      } else {
        clearBanner();
      }
      // The day's #1 already has its own tile above. Listing it again as rank 1
      // makes the top of the work list a repeat of the thing he just read.
      // Matched on the text rather than on the rank, because the hero comes
      // from `cos-top-priority` and the list from `cos-worklist`: they agree
      // today and are allowed to disagree, and on a day they disagree BOTH
      // belong on the page.
      var heroText = (state['cos-top-priority'] || '').trim();
      var rows = wl.items.filter(function (i) { return !heroText || (i.title || '').trim() !== heroText; });
      var revenue = rows.filter(function (i) { return i.revenue; });
      var general = rows.filter(function (i) { return !i.revenue; });
      renderList('mmWorkList', 'mmWorkMeta', general, 'work', '');
      renderList('mmRevList', 'mmRevMeta', revenue, 'rev', '');
      var nm = el('mmNotesMeta');
      if (nm) nm.textContent = state['notes-log'] ? 'has notes' : 'empty';
    }

    function renderAll() { renderTracker(); renderHero(); renderLists(); }

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
