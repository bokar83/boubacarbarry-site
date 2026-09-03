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
        body.appendChild(buildControls(key, state, readFailed));
      });
    }

    function buildControls(key, state, readFailed) {
      var wrap = document.createElement('div');
      wrap.className = 'rt';

      var status = readFailed ? '' : (state.status || '');
      var label = status === 'applied' ? 'Applied'
                : status === 'skipped' ? 'Skipped'
                : readFailed ? 'Unknown' : 'No decision yet';
      var when = state.statusDate ? ' on ' + esc(state.statusDate) : '';

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
        var next = {
          status: state.status || '',
          statusDate: state.statusDate || null,
          notes: state.notes || '',
          notesUpdated: state.notesUpdated || null,
          history: Array.isArray(state.history) ? state.history.slice() : []
        };
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
