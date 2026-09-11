/* ===========================================================================
   MASTER TABLE -- ONE table for every role on the job pipeline board
   ---------------------------------------------------------------------------
   WHY IT EXISTS (2026-09-10, his own words)

     "there are a few where I have applied and we already got the rejection
      saying that they're not proceeding with me. On that table under status,
      it shouldn't say 'Applied' anymore. It should say 'Rejected' or something
      along those lines... Anything that's older than 90 days, we should mark as
      stale if we didn't get a response from them... And i should be able to
      filter that table, right?"

     and then:

     "And combine the two tables into a single master table."

   THE BUG THIS FILE EXISTS TO KILL -- a status column that reads nothing
     The page used to carry the roster as a STATIC HTML <table>: 308 rows with
     the status baked into the markup at publish time. RoleTracker overlays the
     live database status onto elements carrying [data-role^="role:"], and those
     <tr> elements carried no such attribute, so the roster's Status column was
     never read from the store at all. It was a photograph of the store taken on
     2026-09-09.

     That is the whole defect. The database is not wrong and never was --
     141 applied / 140 rejected / 22 unclear / 5 interviewed, which is exactly
     what the mailbox reconciliation wrote. A status changing in the store could
     not move the roster, so the moment a rejection landed the table kept saying
     Applied and looked authoritative doing it. It agreed with the database only
     for as long as nobody's status changed, which is not a property, it is a
     coincidence with a short shelf life.

     So this file renders EVERY row from the database read, one table, no baked
     statuses anywhere. A status can now only be wrong if the store is wrong.

   WHY ONE TABLE AND NOT TWO STACKED
     The five roles at interview were never a different KIND of thing from the
     other 303. They are the same applications further along. Two tables made
     that look like two datasets and forced him to hold both in his head. One
     table, one column set: the rich per-role fields (rank, stage, recruiter
     write-up, artifact links) populate where they exist and are simply empty
     where they do not. Default sort puts what matters now on top; everything
     else is a filter away.

   STALE IS COMPUTED, NEVER STAMPED -- this is load-bearing
     `staleness()` runs at RENDER, from today's date against the row's own
     applied date. Nothing writes a 'stale' value anywhere, ever. A stamped
     stale flag is correct for one day and wrong every day after, and it would
     need a job to maintain that nobody would notice had stopped.

     Stale is a DISPLAY state, not an outcome. It never replaces a recorded
     status: a Rejected row is still Rejected at 200 days, and only a row with
     status 'applied' and no response can read stale. It renders as a SECOND
     badge beside the real status, never instead of it.
   =========================================================================== */

(function (root) {
  'use strict';

  var TABLE = 'y0_money_map_state';
  var STALE_DAYS = 90;
  var LS_FILTER = 'jp-master-filter';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function parseRow(raw) {
    if (!raw) { return null; }
    try {
      var v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (v && typeof v === 'object') ? v : null;
    } catch (e) { return null; }
  }

  // The date a row's clock runs from. appliedDate is the honest one; statusDate
  // is the fallback for a row the sweep dated only by its outcome email. A row
  // with neither has no clock and can never be called stale -- "I do not know
  // when this was sent" and "this has been quiet for 90 days" are different
  // facts and must not render as the same badge.
  function rowDate(st) {
    var d = st.appliedDate || st.statusDate || '';
    return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : '';
  }

  function daysSince(iso) {
    if (!iso) { return null; }
    var then = new Date(iso + 'T00:00:00');
    if (isNaN(then.getTime())) { return null; }
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.floor((today - then) / 86400000);
  }

  // Stale, computed live every render. Only ever true for a row that is still
  // 'applied' -- i.e. one where nothing at all came back. Never for rejected
  // (an outcome arrived), never for interviewed (a human replied), never for
  // unclear (we do not know enough to call it silence).
  function staleness(st) {
    if ((st.status || '') !== 'applied') { return null; }
    var d = rowDate(st);
    if (!d) { return null; }
    var age = daysSince(d);
    if (age == null || age < STALE_DAYS) { return null; }
    return age;
  }

  var STATUS_LABEL = {
    applied: 'Applied',
    rejected: 'Rejected',
    interviewed: 'Interviewed',
    unclear: 'Status unclear',
    skipped: 'Skipped'
  };

  var STAGE_LABEL = {
    'recruiter': 'Recruiter screen',
    'hiring-manager': 'Hiring manager',
    'panel': 'Panel / team',
    'final': 'Final round',
    'offer': 'Offer stage'
  };

  /* ---- THANK-YOU STATE (2026-09-10) -------------------------------------
     One more optional key on the row's existing JSON value -- `thankYouState`
     plus an optional `thankYouUrl` -- read the same way `interviewStage` and
     `preferenceRank` are. Not a column of markup, not a second store.

     ABSENT MEANS ABSENT. A role with no thank-you renders an EMPTY cell, never
     the word "none" styled as a state and never a to-do. The standing rule on
     this page is that a miss past the point of being useful is closed quietly,
     so a drafted note on a role that has gone silent reads as history, not as
     something he owes.

     `waiting` is the one state that is genuinely live, and it is live because
     of his own ruling on 2026-09-10: a thank-you cannot be written before he
     debriefs. It says the ball is with him, not that an agent is behind.  */
  var TY_LABEL = {
    'sent': 'Sent',
    'drafted': 'Drafted, not sent',
    'waiting': 'Waiting on your notes'
  };

  function thankYouCell(st) {
    var state = st.thankYouState || '';
    if (!TY_LABEL[state]) { return ''; }
    var text = TY_LABEL[state];
    var url = st.thankYouUrl || '';
    var chip = '<span class="mt-chip mt-ty mt-ty-' + esc(state) + '">' + esc(text) + '</span>';
    return url ? '<a href="' + esc(url) + '">' + chip + '</a>' : chip;
  }

  // Sort weight. Lower sorts first. This is the "what matters now" order:
  // live conversations, then live applications, then the ones we cannot read,
  // then the ones that have gone quiet, then the ones that are over. Nothing is
  // hidden by it -- everything below the fold is one filter tap away.
  function bucket(st) {
    var s = st.status || '';
    if (s === 'interviewed') { return 0; }
    if (s === 'applied') { return staleness(st) ? 3 : 1; }
    if (s === 'unclear') { return 2; }
    if (s === 'skipped') { return 4; }
    return 5; // rejected, and anything unrecognised, last
  }

  function titleOf(st, key) {
    return st.title || st.role ||
      (key.replace(/^role:/, '').replace(/-/g, ' '));
  }

  function companyOf(st, key) {
    return st.company || key.replace(/^role:/, '').split('-')[0];
  }

  var MasterTable = {};

  MasterTable.build = function (cfg) {
    return new Promise(function (resolve) {
      var mount = document.querySelector(cfg.mount);
      if (!mount) { resolve(false); return; }

      function fail(msg) {
        // A failed read is loud and never renders an empty table. An empty
        // table and a table we could not fill must never look the same.
        mount.innerHTML =
          '<div class="mt-banner"><strong>Could not read the board, so no rows are ' +
          'shown.</strong> This is a failed read, <em>not</em> an empty pipeline. Do not ' +
          'trust an empty or missing status on this load. Error: <code>' + esc(msg) +
          '</code></div>';
      }

      if (!root.supabase || typeof root.supabase.createClient !== 'function') {
        fail('the database client script did not load');
        resolve(false);
        return;
      }

      var sb = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnon);

      sb.from(TABLE).select('item_id,value,updated_at').eq('board_id', cfg.boardId)
        .then(function (res) {
          if (res.error) { throw res.error; }
          render(mount, res.data || []);
          resolve(true);
        })
        .catch(function (err) {
          fail(err && err.message ? err.message : String(err));
          resolve(false);
        });
    });
  };

  // ---- SWEEP STATUS -- say when it last ran, never render a silent blank ----
  // Every role the sweep finds is now a row in the master table, so the old
  // "roles with no write-up yet" block has nothing left to list. Hiding it
  // silently would make "the sweep found nothing new" and "the sweep did not
  // run" look identical, which is the one thing this page must never do.
  //
  // The honest thing to report is the newest `sweep` tag actually present in
  // the data. There is no last-run timestamp to show: `lastSweep` exists in
  // ROLE_MERGE_ALLOWED_KEYS in orchestrator/cos_office/money_map.py and nothing
  // has ever written it, on any row. So this reports the tag, and says plainly
  // that a tag is not a run time. It must not claim the sweep never ran --
  // all 308 rows carry a sweep tag, so that would be false.
  function renderSweepStatus(mountSel, rows) {
    var mount = document.querySelector(mountSel);
    if (!mount) { return; }
    var tags = {};
    var newest = '';
    rows.forEach(function (r) {
      var t = r.st.sweep;
      if (!t) { return; }
      tags[t] = (tags[t] || 0) + 1;
      if (String(t) > newest) { newest = String(t); }
    });
    var breakdown = Object.keys(tags).sort().reverse().map(function (t) {
      return '<li><code>' + esc(t) + '</code> &mdash; ' + tags[t] + ' roles</li>';
    }).join('');
    mount.innerHTML = newest
      ? '<p>Every role the mailbox sweep has found is already a row in the master ' +
        'table, so there is nothing listed separately here any more. That is the ' +
        'sweep working, not the sweep empty.</p>' +
        '<p><strong>Most recent sweep tag in the data: <code>' + esc(newest) +
        '</code>.</strong> That is a tag written onto the rows, <em>not</em> a ' +
        'recorded run time &mdash; no row on this board carries a last-run ' +
        'timestamp, so the honest answer to "when did it last run" is that the ' +
        'newest batch it wrote is tagged ' + esc(newest) + '.</p>' +
        '<ul class="mt-dim">' + breakdown + '</ul>'
      : '<p><strong>No sweep tag is present on any row.</strong> That is not the same ' +
        'as an empty sweep, and it is not a claim that it never ran &mdash; it means ' +
        'this page cannot tell you, and you should not read the table as complete.</p>';
  }

  function render(mount, data) {
    // ---- harvest the authored write-ups already on the page -------------
    // The five roles at interview carry hand-written detail -- recruiter name
    // and number, why he ranked it where he did, links to the prep page and the
    // drafted thank-you. That is the most valuable copy on the page and it is
    // not in the database. Move it, never regenerate it: these blocks are
    // detached from wherever they were authored and re-parented into their own
    // row's detail pane, so a merge into one table costs nothing written.
    var authored = {};
    Array.prototype.slice.call(document.querySelectorAll('.rank[data-role^="role:"]'))
      .forEach(function (el) {
        var key = el.getAttribute('data-role');
        var body = el.children[1] || el;
        authored[key] = body;
        if (el.parentNode) { el.parentNode.removeChild(el); }
      });

    var rows = [];
    var newest = '';
    data.forEach(function (r) {
      if (String(r.item_id).indexOf('role:') !== 0) { return; }
      var st = parseRow(r.value);
      if (!st) { return; }
      if (r.updated_at && r.updated_at > newest) { newest = r.updated_at; }
      rows.push({ key: r.item_id, st: st });
    });

    rows.sort(function (a, b) {
      var ba = bucket(a.st), bb = bucket(b.st);
      if (ba !== bb) { return ba - bb; }
      // Inside the interview bucket his own preference order wins, because he
      // set it by hand and it is the only ranking on this page he authored.
      if (ba === 0) {
        var ra = parseInt(a.st.preferenceRank, 10);
        var rb = parseInt(b.st.preferenceRank, 10);
        if (isNaN(ra)) { ra = 999; }
        if (isNaN(rb)) { rb = 999; }
        if (ra !== rb) { return ra - rb; }
      }
      // Everywhere else: freshest first.
      return String(rowDate(b.st)).localeCompare(String(rowDate(a.st)));
    });

    // ---- counts, computed from the same rows the table renders ----------
    var counts = { all: rows.length, interviewed: 0, applied: 0, stale: 0, unclear: 0, rejected: 0 };
    rows.forEach(function (r) {
      var s = r.st.status || '';
      if (s === 'interviewed') { counts.interviewed++; }
      else if (s === 'applied') { counts.applied++; if (staleness(r.st)) { counts.stale++; } }
      else if (s === 'unclear') { counts.unclear++; }
      else if (s === 'rejected') { counts.rejected++; }
    });

    var FILTERS = [
      { v: 'all', label: 'All', n: counts.all },
      { v: 'interviewed', label: 'At interview', n: counts.interviewed },
      { v: 'applied', label: 'Applied', n: counts.applied },
      { v: 'stale', label: 'Stale, 90d+ quiet', n: counts.stale },
      { v: 'unclear', label: 'Status unclear', n: counts.unclear },
      { v: 'rejected', label: 'Rejected', n: counts.rejected }
    ];

    var stampTxt = newest
      ? 'Statuses read live from the board just now. Most recent change on the board: ' +
        esc(String(newest).slice(0, 16).replace('T', ' ')) + ' UTC.'
      : 'Statuses read live from the board just now.';

    var html =
      '<div class="mt-controls">' +
        '<div class="mt-filters" role="group" aria-label="Filter roles by status">' +
          FILTERS.map(function (f) {
            return '<button type="button" class="mt-f" data-f="' + f.v + '" ' +
              'aria-pressed="false">' + esc(f.label) +
              ' <span class="mt-n">' + f.n + '</span></button>';
          }).join('') +
        '</div>' +
        '<label class="mt-searchwrap"><span class="mt-sr">Search company or role</span>' +
          '<input type="search" class="mt-search" placeholder="Search company or role">' +
        '</label>' +
        '<p class="mt-showing" aria-live="polite"></p>' +
        '<p class="mt-stamp">' + stampTxt + '</p>' +
      '</div>' +
      '<div class="mt-wrap"><table class="mt-tbl"><thead><tr>' +
        '<th scope="col" class="mt-c-rank">#</th>' +
        '<th scope="col">Company</th>' +
        '<th scope="col">Role</th>' +
        '<th scope="col">Status</th>' +
        '<th scope="col">Stage</th>' +
        '<th scope="col">Thank-you</th>' +
        '<th scope="col">Date</th>' +
        '<th scope="col"><span class="mt-sr">Detail</span></th>' +
      '</tr></thead><tbody></tbody></table></div>' +
      '<p class="mt-empty" hidden>Nothing matches that filter. Clear it to see every role again.</p>';

    mount.innerHTML = html;

    var tbody = mount.querySelector('.mt-tbl tbody');

    rows.forEach(function (r, i) {
      var st = r.st;
      var s = st.status || '';
      var stale = staleness(st);
      var d = rowDate(st);
      var rank = parseInt(st.preferenceRank, 10);
      var label = STATUS_LABEL[s] || (s ? s : 'No decision recorded');
      var stage = st.interviewStage || '';


      var tr = document.createElement('tr');
      tr.className = 'mt-row';
      tr.setAttribute('data-status', s);
      tr.setAttribute('data-stale', stale ? '1' : '0');
      tr.setAttribute('data-key', r.key);
      tr.setAttribute('data-find',
        (companyOf(st, r.key) + ' ' + titleOf(st, r.key)).toLowerCase());

      tr.innerHTML =
        '<td class="mt-c-rank" data-label="#">' + (isNaN(rank) ? '' : rank) + '</td>' +
        '<td data-label="Company"><strong>' + esc(companyOf(st, r.key)) + '</strong></td>' +
        '<td data-label="Role">' + esc(titleOf(st, r.key)) + '</td>' +
        '<td data-label="Status">' +
          '<span class="st st-' + esc(s || 'none') + ' mt-chip">' + esc(label) + '</span>' +
          (stale ? ' <span class="st mt-stale" title="No response in ' + stale +
            ' days. This is computed from the date every time the page loads and is ' +
            'never saved.">Stale &middot; ' + stale + 'd</span>' : '') +
        '</td>' +
        '<td data-label="Stage">' + (stage ? esc(STAGE_LABEL[stage] || stage) : '') + '</td>' +
        '<td data-label="Thank-you">' + thankYouCell(st) + '</td>' +
        '<td data-label="Date">' + esc(d) + '</td>' +
        '<td class="mt-c-more"><button type="button" class="mt-more" aria-expanded="false">' +
          'Open<span class="mt-sr"> detail for ' + esc(companyOf(st, r.key)) + '</span></button></td>';

      tbody.appendChild(tr);

      // ---- detail row -------------------------------------------------
      // Every role gets a .rank[data-role] host with TWO children, because
      // RoleTracker writes its controls into children[1]. Building one for all
      // 308 rows is deliberate: it means the sweep's "roles with no write-up"
      // block finds no orphans and hides itself, so the same role can no longer
      // appear twice on one page under two different renderings.
      var dtr = document.createElement('tr');
      dtr.className = 'mt-detailrow';
      dtr.hidden = true;
      var td = document.createElement('td');
      td.setAttribute('colspan', '8');
      var host = document.createElement('div');
      host.className = 'rank mt-detail';
      host.setAttribute('data-role', r.key);
      host.setAttribute('data-role-label', companyOf(st, r.key).toLowerCase());
      var numEl = document.createElement('div');
      numEl.className = 'num';
      numEl.textContent = isNaN(rank) ? '' : String(rank);
      var bodyEl = document.createElement('div');
      bodyEl.className = 'mt-detailbody';

      if (authored[r.key]) {
        bodyEl.appendChild(authored[r.key]);
      } else {
        // No hand-written write-up. Say so plainly rather than dressing the
        // row's own catalog fields up as one.
        var plain = document.createElement('div');
        plain.innerHTML =
          '<strong>' + esc(companyOf(st, r.key)) + '</strong> &mdash; ' +
          esc(titleOf(st, r.key)) +
          (d ? ' <span class="mt-dim">(' + esc(d) + ')</span>' : '') +
          (st.evidence ? '<div class="mt-dim">' + esc(st.evidence) + '</div>' : '') +
          '<div class="mt-dim">No write-up for this role yet. It is here because the ' +
          'mailbox sweep found it.</div>';
        bodyEl.appendChild(plain);
      }

      host.appendChild(numEl);
      host.appendChild(bodyEl);
      td.appendChild(host);
      dtr.appendChild(td);
      tbody.appendChild(dtr);

      tr.querySelector('.mt-more').addEventListener('click', function () {
        var open = dtr.hidden;
        dtr.hidden = !open;
        this.setAttribute('aria-expanded', open ? 'true' : 'false');
        this.firstChild.nodeValue = open ? 'Close' : 'Open';
      });

      // ---- keep the table cell honest after HE changes a status --------
      // RoleTracker owns the write and repaints its own chip inside the detail.
      // It emits no event, so the table cell would otherwise keep showing the
      // status the page loaded with while the detail showed the new one -- two
      // truths on one screen, which is the failure this whole file exists to
      // end. Watching the chip is cheap and cannot disagree with it.
      var chipCell = tr.querySelector('.mt-chip');
      var obs = new MutationObserver(function () {
        var live = host.querySelector('.rt-state');
        if (!live) { return; }
        var v = live.getAttribute('data-state') || '';
        chipCell.textContent = live.textContent;
        chipCell.className = 'st st-' + (v || 'none') + ' mt-chip';
        tr.setAttribute('data-status', v);
        // A status that is no longer 'applied' cannot be stale, and a row he
        // just marked applied gets its staleness recomputed from the same
        // date -- still computed, still never stored.
        var badge = tr.querySelector('.mt-stale');
        var nowStale = staleness({ status: v, appliedDate: st.appliedDate, statusDate: st.statusDate });
        if (badge && !nowStale) { badge.parentNode.removeChild(badge); }
        tr.setAttribute('data-stale', nowStale ? '1' : '0');
        applyFilter();
      });
      obs.observe(host, { childList: true, subtree: true, characterData: true });
    });

    renderSweepStatus('#sweep-mount', rows);

    // ---- filtering ------------------------------------------------------
    var allRows = Array.prototype.slice.call(tbody.querySelectorAll('.mt-row'));
    var btns = Array.prototype.slice.call(mount.querySelectorAll('.mt-f'));
    var search = mount.querySelector('.mt-search');
    var showing = mount.querySelector('.mt-showing');
    var empty = mount.querySelector('.mt-empty');
    var active = 'all';

    // Which filter he last used is a per-viewer convenience, not a decision, so
    // localStorage is the right home for it. Nothing he DECIDES is stored here.
    try {
      var saved = localStorage.getItem(LS_FILTER);
      if (saved && FILTERS.some(function (f) { return f.v === saved; })) { active = saved; }
    } catch (e) { /* private window, blocked storage: the default is fine */ }

    function matches(tr) {
      var s = tr.getAttribute('data-status');
      var ok = active === 'all' ? true
             : active === 'stale' ? tr.getAttribute('data-stale') === '1'
             : s === active;
      if (!ok) { return false; }
      var q = (search.value || '').trim().toLowerCase();
      if (!q) { return true; }
      return tr.getAttribute('data-find').indexOf(q) !== -1;
    }

    function applyFilter() {
      var n = 0;
      allRows.forEach(function (tr) {
        var on = matches(tr);
        tr.hidden = !on;
        // A detail pane left open under a filtered-out row would otherwise
        // float free of its row.
        var d = tr.nextElementSibling;
        if (d && d.classList.contains('mt-detailrow') && !on) {
          d.hidden = true;
          var b = tr.querySelector('.mt-more');
          if (b) { b.setAttribute('aria-expanded', 'false'); b.firstChild.nodeValue = 'Open'; }
        }
        if (on) { n++; }
      });
      btns.forEach(function (b) {
        b.setAttribute('aria-pressed', b.getAttribute('data-f') === active ? 'true' : 'false');
      });
      var q = (search.value || '').trim();
      var fLabel = (FILTERS.filter(function (f) { return f.v === active; })[0] || {}).label || 'All';
      showing.textContent = 'Showing ' + n + ' of ' + allRows.length + ' roles' +
        (active === 'all' ? '' : ' · ' + fLabel) +
        (q ? ' · matching "' + q + '"' : '');
      empty.hidden = n !== 0;
      try { localStorage.setItem(LS_FILTER, active); } catch (e) { /* fine */ }
    }

    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        var v = b.getAttribute('data-f');
        // Tapping the active filter again clears it, so he can get back to
        // everything without hunting for an "All" button.
        active = (active === v && v !== 'all') ? 'all' : v;
        applyFilter();
      });
    });
    search.addEventListener('input', applyFilter);

    applyFilter();
  }

  root.MasterTable = MasterTable;
})(window);
