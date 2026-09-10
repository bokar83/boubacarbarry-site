/* ===========================================================================
   ROLE TRACKER -- Applied / Skipped / Notes, persisted, for job-pipeline rows
   ---------------------------------------------------------------------------
   WHY IT EXISTS (2026-09-03, his own words)
     "Next time give me the option to mark them as applied for or skipped and
      to add notes so we can learn."

     The last clause is the point. This is not a status widget with a notes
     box bolted on -- the notes ARE the feature. A status tells you what
     happened; only the note tells you why, and the why is the part nobody
     can reconstruct six weeks later. Every note lands in a real database an
     agent can read before drafting the next application, which is what makes
     "so we can learn" true rather than decorative.

   WHERE IT WRITES -- the existing store, never a parallel one
     Supabase table `y0_money_map_state`, through the SECURITY DEFINER RPC
     `y0_upsert(p_board, p_item, p_value, p_token)`, on board_id
     'job-pipeline'. That RPC already took any p_board value and looked its
     token up generically, so a third board needed ZERO server change -- the
     same reason migration 069 could add board 'y1' without touching code.
     No new table, no new RPC, no second store to drift out of sync.

   KEYS ARE STABLE SLUGS, NEVER POSITIONS -- this is load-bearing
     Rows are keyed `role:ge-healthcare-exec-hrbp-uscan`, not `role-D`. This
     page is republished often and its rows are labelled A through E by
     position. Positional keys would silently reattach his notes to the wrong
     company the first time a role is added or dropped -- not a crash, a quiet
     lie that still reads as data. A slug also tells a future agent reading
     the raw table which company a row is about, with no page to consult.

   HONESTY RULES BAKED IN
     * A failed WRITE is loud, red, and never auto-dismisses. A silent failed
       save is worse than no feature, because the page keeps looking correct.
     * A failed READ renders a banner and leaves every row blank-and-labelled,
       never a confident "not applied yet". "Nothing recorded" and "I could
       not look" must never be the same picture.
     * localStorage is a crash net UNDER the database write, never the store.
       It is only ever read to warn him that an unsaved draft exists.
   =========================================================================== */

(function (root) {
  'use strict';

  var TABLE = 'y0_money_map_state';
  var UPSERT_RPC = 'y0_upsert';
  var LS_PREFIX = 'rt-draft:';

  /* ---- INTERVIEW STAGE (2026-09-10, his own words) ----------------------
     "The job pipeline should show the stage of interview (recruiter, hiring
      manager, etc.). So wgu, Edwards are all past recruiter the others are
      with recruiter."

     A status says a role IS at interview. It never says WHERE, and where is
     the thing he scans for. This is one more optional key on the row's
     existing JSON value -- `interviewStage` plus `interviewStageDate` -- not
     a column, not a table, not a second store. The rows are free-form JSON
     blobs already carrying company/title/appliedDate/evidence, so a new key
     costs no migration and an old row without it renders as "stage not
     recorded" rather than as a confident guess.

     The ladder is ordered because "past recruiter" is a comparison, and a
     comparison needs an order. It stops at `offer` deliberately: an offer is
     an outcome, and outcomes belong to `status`, not here.

     He sets it himself from the row. A stage an agent hardcodes into the page
     is wrong within days; a stage he changes with one tap is not.
     ---------------------------------------------------------------------- */
  var STAGES = [
    { v: 'recruiter',      label: 'Recruiter screen' },
    { v: 'hiring-manager', label: 'Hiring manager' },
    { v: 'panel',          label: 'Panel / team' },
    { v: 'final',          label: 'Final round' },
    { v: 'offer',          label: 'Offer stage' }
  ];

  function stageLabel(v) {
    for (var i = 0; i < STAGES.length; i++) {
      if (STAGES[i].v === v) { return STAGES[i].label; }
    }
    return '';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function prettyStamp(iso) {
    if (!iso) { return ''; }
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return iso; }
    var MOS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var h = d.getHours(), m = String(d.getMinutes()).padStart(2, '0');
    var ap = h >= 12 ? 'pm' : 'am';
    h = h % 12; if (h === 0) { h = 12; }
    return MOS[d.getMonth()] + ' ' + d.getDate() + ', ' + h + ':' + m + ap;
  }

  // A row's stored value is a JSON STRING (the column is text, as every other
  // board's rows are). Anything unparseable is treated as absent rather than
  // thrown away silently -- a corrupt row must not look like an empty one.
  function parseRow(raw) {
    if (!raw) { return null; }
    try {
      var v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (v && typeof v === 'object') ? v : null;
    } catch (e) { return null; }
  }

  function RoleTracker() {}

  RoleTracker.init = function (cfg) {
    var sb = null;
    var BOARD = cfg.boardId;
    var TOKEN = cfg.boardToken;
    var rows = Array.prototype.slice.call(
      document.querySelectorAll('[data-role^="role:"]')
    );
    if (!rows.length) { return; }

    var host = document.querySelector(cfg.bannerMount) || document.body;

    function banner(kind, html) {
      var el = document.createElement('div');
      el.className = 'rt-banner' + (kind === 'warn' ? ' rt-banner-warn' : '');
      el.innerHTML = html;
      host.insertBefore(el, host.firstChild);
    }

    if (!root.supabase || typeof root.supabase.createClient !== 'function') {
      banner('bad',
        '<strong>The tracker could not load.</strong> The database client script did not load, ' +
        'so nothing on this page can be saved right now. Every control below is disabled on purpose ' +
        'rather than accepting a click it cannot honour.');
      renderAll({}, true);
      return;
    }

    sb = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnon);

    // ---- READ ----------------------------------------------------------
    sb.from(TABLE).select('item_id,value').eq('board_id', BOARD)
      .then(function (res) {
        if (res.error) { throw res.error; }
        var byId = {};
        (res.data || []).forEach(function (r) {
          var v = parseRow(r.value);
          if (v) { byId[r.item_id] = v; }
        });
        renderAll(byId, false);
      })
      .catch(function (err) {
        banner('bad',
          '<strong>Could not read the saved statuses.</strong> Every row below is showing blank ' +
          'because the read failed, <em>not</em> because nothing is recorded. Do not trust an empty ' +
          'status on this load. Error: <code>' + esc(err && err.message ? err.message : String(err)) + '</code>');
        renderAll({}, true);
      });

    // ---- RENDER --------------------------------------------------------
    function renderAll(byId, readFailed) {
      rows.forEach(function (row) {
        var key = row.getAttribute('data-role');
        var body = row.children[1] || row;
        var state = byId[key] || {};
        row.setAttribute('data-stage', readFailed ? '' : (state.interviewStage || ''));
        row.setAttribute('data-stage-name', state.company ||
          (row.getAttribute('data-role-label') || key.replace('role:', '')).split(' ')[0]);
        body.appendChild(buildControls(key, state, readFailed));
      });
      renderUnbacked(byId, readFailed);
      renderStageSummary(readFailed);
    }

    // ---- STAGE SUMMARY, VISIBLE WHILE THE SECTION IS SHUT ---------------
    // The interview section folds. Which stage each role is at is precisely
    // what he is scanning for, so it has to survive the fold -- a label only
    // visible after a tap is a label he will not see. This paints the chips
    // into the <summary> itself, which stays on screen when the section is
    // closed. Reads from the same DOM the rows were just rendered from, so
    // it can never disagree with them.
    function renderStageSummary(readFailed) {
      var mount = document.querySelector(cfg.stageSummaryMount || '');
      if (!mount) { return; }
      var host2 = mount.querySelector('.rt-stagebar');
      if (!host2) {
        host2 = document.createElement('span');
        host2.className = 'rt-stagebar';
        mount.appendChild(host2);
      }
      if (readFailed) {
        host2.innerHTML = '<span class="rt-chip rt-chip-none">stages unavailable, read failed</span>';
        return;
      }
      var scope = mount.parentNode || document;
      var chips = Array.prototype.slice.call(scope.querySelectorAll('[data-role^="role:"]'))
        .map(function (r) {
          var name = r.getAttribute('data-stage-name') || '';
          var st = r.getAttribute('data-stage') || '';
          return '<span class="rt-chip" data-stage="' + esc(st) + '">' +
            '<b>' + esc(name) + '</b>' +
            (st ? esc(stageLabel(st) || st) : 'stage not recorded') + '</span>';
        });
      host2.innerHTML = chips.join('');
    }

    // ---- ROWS IN THE DB THAT THIS PAGE HAS NO HTML FOR ------------------
    // The role write-ups on this page are baked into the HTML and the database
    // only overlays status and notes onto them. That was fine while every row
    // was authored by hand. It stops being fine the moment an automated sweep
    // can INSERT a role: the row would be written correctly and be completely
    // invisible here, which is the worst of both worlds -- the board would
    // quietly disagree with the page and nobody would know which to believe.
    //
    // So: anything on the board with no matching [data-role] element is
    // rendered into its own block at the top, from the row's own catalog
    // fields. It is deliberately plain -- these have no write-up yet, and
    // pretending otherwise would overstate what we know about them.
    // Silent when there is nothing new, which is the normal case.
    function renderUnbacked(byId, readFailed) {
      if (readFailed) { return; }
      var known = {};
      rows.forEach(function (r) { known[r.getAttribute('data-role')] = true; });
      var extras = Object.keys(byId).filter(function (k) {
        return k.indexOf('role:') === 0 && !known[k];
      });
      if (!extras.length) { return; }

      extras.sort(function (a, b) {
        var da = (byId[a] || {}).appliedDate || '';
        var db = (byId[b] || {}).appliedDate || '';
        return db.localeCompare(da);
      });

      var box = document.createElement('section');
      box.className = 'rt-unbacked';
      box.innerHTML =
        '<h2>Added by the daily sweep (' + extras.length + ')</h2>' +
        '<p>These roles are on the board but have no write-up on this page yet. ' +
        'They were found in the mailbox by the daily sweep. Status and notes below ' +
        'save exactly like every other row.</p>';

      extras.forEach(function (key) {
        var st = byId[key] || {};
        var card = document.createElement('div');
        card.className = 'rank rt-unbacked-row';
        card.setAttribute('data-role', key);
        var head = document.createElement('div');
        head.innerHTML =
          '<strong>' + esc(st.company || key.replace('role:', '')) + '</strong>' +
          (st.title ? ' &mdash; ' + esc(st.title) : '') +
          (st.appliedDate ? ' <span class="rt-dim">(' + esc(st.appliedDate) + ')</span>' : '') +
          (st.evidence ? '<div class="rt-dim">' + esc(st.evidence) + '</div>' : '');
        card.appendChild(head);
        card.appendChild(buildControls(key, st, false));
        box.appendChild(card);
      });

      host.insertBefore(box, host.firstChild);
    }

    function buildControls(key, state, readFailed) {
      var wrap = document.createElement('div');
      wrap.className = 'rt';

      var status = readFailed ? '' : (state.status || '');
      // The two buttons only ever WRITE 'applied' or 'skipped', but a row's status
      // can also arrive from elsewhere -- the 2026-09-09 mailbox reconciliation
      // writes 'interviewed', 'rejected' and 'unclear' straight into the store.
      // Those three used to fall through to "No decision yet", so a role that had
      // actually reached an interview rendered as undecided. That is the exact
      // failure mode this file's own header bans: a signal that lies is worse than
      // a blank one. Label them for what they are; they stay read-only here,
      // because nothing on this page should be able to downgrade an interview to
      // "applied" with a stray click.
      var label = status === 'applied' ? 'Applied'
                : status === 'skipped' ? 'Skipped'
                : status === 'interviewed' ? 'Interviewed'
                : status === 'rejected' ? 'Rejected'
                : status === 'unclear' ? 'Status unclear'
                : readFailed ? 'Unknown' : 'No decision yet';
      var when = state.statusDate ? ' on ' + esc(state.statusDate) : '';

      // The stage row is offered whenever a role has reached an interview, or
      // whenever a stage is already recorded. Showing it on an unapplied role
      // would invite a stage on something that has no interview at all.
      var stage = readFailed ? '' : (state.interviewStage || '');
      var showStage = !readFailed && (status === 'interviewed' || !!stage);
      var stageHtml = !showStage ? '' :
        '<div class="rt-stagerow">' +
          '<label class="rt-stagelabel" for="stg-' + esc(key) + '">Interview stage</label>' +
          '<select class="rt-stage" id="stg-' + esc(key) + '">' +
            '<option value=""' + (stage ? '' : ' selected') + '>Not recorded</option>' +
            STAGES.map(function (s) {
              return '<option value="' + s.v + '"' +
                (stage === s.v ? ' selected' : '') + '>' + s.label + '</option>';
            }).join('') +
          '</select>' +
          '<span class="rt-stagewhen">' +
            (state.interviewStageDate ? 'set ' + esc(state.interviewStageDate) : '') +
          '</span>' +
        '</div>';

      wrap.innerHTML =
        '<div class="rt-head">' +
          '<span class="rt-state" data-state="' + esc(status) + '">' + esc(label) + '</span>' +
          '<span class="rt-when">' + (status ? when : '') + '</span>' +
          '<span class="rt-btns">' +
            '<button type="button" class="rt-btn" data-set="applied" aria-pressed="' +
              (status === 'applied' ? 'true' : 'false') + '">Applied</button>' +
            '<button type="button" class="rt-btn" data-set="skipped" aria-pressed="' +
              (status === 'skipped' ? 'true' : 'false') + '">Skipped</button>' +
          '</span>' +
        '</div>' +
        stageHtml +
        '<p class="rt-why">Why you applied, why you passed, what the recruiter said, what you would ' +
        'do differently. This is the part nobody can reconstruct later, and it is what the next ' +
        'application gets written from.</p>' +
        '<textarea class="rt-note" rows="3" placeholder="What happened, and what you took from it."></textarea>' +
        '<div class="rt-foot">' +
          '<button type="button" class="rt-btn" data-save="1">Save note</button>' +
          '<span class="rt-saved"></span>' +
        '</div>' +
        '<div class="rt-err"></div>';

      var noteEl = wrap.querySelector('.rt-note');
      var savedEl = wrap.querySelector('.rt-saved');
      var errEl = wrap.querySelector('.rt-err');
      var stateEl = wrap.querySelector('.rt-state');
      var whenEl = wrap.querySelector('.rt-when');

      noteEl.value = state.notes || '';
      if (state.notesUpdated) {
        savedEl.textContent = 'Saved ' + prettyStamp(state.notesUpdated);
      }

      // A local draft only ever WARNS. It is never treated as the saved value,
      // because a page that quietly serves an unsaved draft as truth is the
      // failure mode this whole design exists to avoid.
      try {
        var draft = root.localStorage.getItem(LS_PREFIX + key);
        if (draft && draft !== (state.notes || '')) {
          noteEl.value = draft;
          savedEl.setAttribute('data-dirty', '1');
          savedEl.textContent = 'Unsaved draft on this device. Press Save note.';
        }
      } catch (e) { /* private mode, blocked storage -- never fatal */ }

      if (readFailed) {
        Array.prototype.forEach.call(wrap.querySelectorAll('.rt-btn'), function (b) {
          b.disabled = true;
        });
        noteEl.disabled = true;
        savedEl.textContent = 'Controls disabled: the page could not read its own saved state.';
        return wrap;
      }

      function showErr(what, err) {
        errEl.setAttribute('data-shown', '1');
        errEl.innerHTML = '<strong>' + esc(what) + ' was NOT saved.</strong> Your text is still in the ' +
          'box and a copy is kept on this device, so nothing is lost. Try again, and if it keeps ' +
          'failing say so rather than assuming it went through. Error: <code>' +
          esc(err && err.message ? err.message : String(err)) + '</code>';
      }

      function clearErr() { errEl.removeAttribute('data-shown'); errEl.innerHTML = ''; }

      function write(item, value) {
        return sb.rpc(UPSERT_RPC, {
          p_board: BOARD, p_item: item, p_value: value, p_token: TOKEN
        }).then(function (res) {
          if (res.error) { throw res.error; }
          return true;
        });
      }

      // Every write sends the WHOLE row, with the prior status appended to
      // history first. A status change never discards the status it replaced:
      // "applied on the 3rd, then withdrawn on the 9th" is the sequence worth
      // keeping, and an overwrite would destroy exactly the history the notes
      // exist to build.
      function currentValue(patch) {
        // Start from the WHOLE stored row, not a fixed whitelist of five keys.
        // A row now carries catalog fields this widget never writes -- company,
        // title, appliedDate, sourceMailbox, sweep, evidence -- put there by the
        // 2026-09-09 mailbox reconciliation. Rebuilding the object from a
        // whitelist silently dropped every one of them on the first click of
        // Applied, Skipped or Save note: no error, no visible change, the row
        // just quietly lost the data that says which company it is about.
        var next = {};
        Object.keys(state || {}).forEach(function (k) { next[k] = state[k]; });
        next.status = state.status || '';
        next.statusDate = state.statusDate || null;
        next.notes = state.notes || '';
        next.notesUpdated = state.notesUpdated || null;
        next.history = Array.isArray(state.history) ? state.history.slice() : [];
        Object.keys(patch).forEach(function (k) { next[k] = patch[k]; });
        return next;
      }

      Array.prototype.forEach.call(wrap.querySelectorAll('[data-set]'), function (btn) {
        btn.addEventListener('click', function () {
          clearErr();
          var want = btn.getAttribute('data-set');
          // Pressing the active status again clears it. He can undo a mis-tap
          // without an agent, and the clear is recorded in history like any
          // other decision rather than vanishing.
          var next = (state.status === want) ? '' : want;
          var d = todayISO();
          var hist = Array.isArray(state.history) ? state.history.slice() : [];
          hist.push({ status: next || 'cleared', date: d, from: state.status || '' });
          var payload = currentValue({ status: next, statusDate: next ? d : null, history: hist });

          Array.prototype.forEach.call(wrap.querySelectorAll('.rt-btn'), function (b) { b.disabled = true; });
          write(key, JSON.stringify(payload)).then(function () {
            state = payload;
            stateEl.setAttribute('data-state', next);
            stateEl.textContent = next === 'applied' ? 'Applied'
                                : next === 'skipped' ? 'Skipped' : 'No decision yet';
            whenEl.textContent = next ? ' on ' + d : '';
            wrap.querySelector('[data-set="applied"]').setAttribute('aria-pressed', next === 'applied' ? 'true' : 'false');
            wrap.querySelector('[data-set="skipped"]').setAttribute('aria-pressed', next === 'skipped' ? 'true' : 'false');
          }).catch(function (err) {
            showErr('That status', err);
          }).then(function () {
            Array.prototype.forEach.call(wrap.querySelectorAll('.rt-btn'), function (b) { b.disabled = false; });
          });
        });
      });

      // ---- stage: same write path as everything else on this row ---------
      // Reuses write()/currentValue(), so the whole row is sent, the prior
      // stage is appended to history rather than overwritten, and a failed
      // write is as loud here as it is for a note. On failure the select is
      // put back to the value the database still holds -- a control showing a
      // stage that was never saved is exactly the lie this file bans.
      var stageEl = wrap.querySelector('.rt-stage');
      if (stageEl) {
        stageEl.addEventListener('change', function () {
          clearErr();
          var want = stageEl.value;
          var prev = state.interviewStage || '';
          if (want === prev) { return; }
          var d = todayISO();
          var hist = Array.isArray(state.history) ? state.history.slice() : [];
          hist.push({ interviewStage: want || 'cleared', date: d, from: prev });
          var payload = currentValue({
            interviewStage: want,
            interviewStageDate: want ? d : null,
            history: hist
          });
          stageEl.disabled = true;
          write(key, JSON.stringify(payload)).then(function () {
            state = payload;
            var whenS = wrap.querySelector('.rt-stagewhen');
            if (whenS) { whenS.textContent = want ? 'set ' + d : ''; }
            var rowEl = document.querySelector('[data-role="' + key + '"]');
            if (rowEl) { rowEl.setAttribute('data-stage', want); }
            renderStageSummary(false);
          }).catch(function (err) {
            stageEl.value = prev;
            showErr('That interview stage', err);
          }).then(function () {
            stageEl.disabled = false;
          });
        });
      }

      noteEl.addEventListener('input', function () {
        savedEl.setAttribute('data-dirty', '1');
        savedEl.textContent = 'Not saved yet. Press Save note.';
        try { root.localStorage.setItem(LS_PREFIX + key, noteEl.value); } catch (e) {}
      });

      wrap.querySelector('[data-save]').addEventListener('click', function () {
        clearErr();
        var stamp = new Date().toISOString();
        var payload = currentValue({ notes: noteEl.value, notesUpdated: stamp });
        Array.prototype.forEach.call(wrap.querySelectorAll('.rt-btn'), function (b) { b.disabled = true; });
        write(key, JSON.stringify(payload)).then(function () {
          state = payload;
          savedEl.removeAttribute('data-dirty');
          savedEl.textContent = 'Saved ' + prettyStamp(stamp);
          try { root.localStorage.removeItem(LS_PREFIX + key); } catch (e) {}
        }).catch(function (err) {
          showErr('That note', err);
        }).then(function () {
          Array.prototype.forEach.call(wrap.querySelectorAll('.rt-btn'), function (b) { b.disabled = false; });
        });
      });

      return wrap;
    }
  };

  root.RoleTracker = RoleTracker;
})(window);
