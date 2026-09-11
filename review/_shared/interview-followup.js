/* interview-followup.js
   One block per interview prep page, carrying the whole lifecycle of that interview.

   THE FLIP, and it is date-driven, never hand-set
     BEFORE the interview date, the block sits at the very bottom of the page as a stub.
     ON or AFTER the interview date, the block moves itself to the TOP of .wrap, opens,
     and closes every other collapsible section, because prep is history by then and the
     follow-up is the live, time-sensitive thing.
     The comparison is today's local date against data-interview-date on the block.
     Nothing is stored and nothing is toggled by a human, so the same published file
     behaves differently tomorrow than it does today.
     PROOF: append ?asof=YYYY-MM-DD to the URL to render the page as it would render on
     that date. The visible stamp in the block reports both dates and which way it went.

   THE THREE STATES AFTER THE INTERVIEW (his ruling, 2026-09-10)
     "The reality is that it can't be written until i give you the feedback."
     1. sent     -- a thank-you already went out. Shown as a record, not as a to-do.
     2. drafted  -- a thank-you exists, written from real material. Shown ready to copy.
     3. waiting  -- no debrief from him yet, so NO thank-you exists and none is shown.
                    The top of the page asks for his notes instead.
     No agent writes a thank-you from a job description. A fabricated recollection of a
     conversation he actually had is unrecoverable once it reaches the interviewer, so
     the waiting state shows no draft, no placeholder and no generic text at all.

   THE DEBRIEF BOX
     Persisted to the real shared database (Supabase board `job-pipeline`, the same store
     the pipeline page and the Money Map boards use), keyed `debrief:<slug>` in its own
     item id so it can never overwrite a role row. Append-only: each save adds a stamped
     entry, nothing is replaced. localStorage is used ONLY as a crash net strictly under
     the database write, never as the store. A failed write is loud, red, and stays.
*/
(function (root) {
  'use strict';

  var TABLE = 'y0_money_map_state';
  var UPSERT_RPC = 'y0_upsert';
  var LS_PREFIX = 'ty-debrief-draft:';

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function todayISO() {
    try {
      var q = new URLSearchParams(root.location.search).get('asof');
      if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) { return q; }
    } catch (e) { /* older browser: fall through to the real date */ }
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' +
      String(d.getMinutes()).padStart(2, '0');
  }

  function parseRow(raw) {
    if (!raw) { return null; }
    try {
      var v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (v && typeof v === 'object') ? v : null;
    } catch (e) { return null; }
  }

  function addCopyButtons(block) {
    block.querySelectorAll('.ty-copy').forEach(function (box) {
      // Capture the text BEFORE the button exists, so a button label can never
      // ride along into a real recruiter's inbox.
      var text = box.getAttribute('data-copy') || box.textContent;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ty-btn';
      btn.textContent = 'Copy';
      btn.addEventListener('click', function () {
        if (!navigator.clipboard || !navigator.clipboard.writeText) {
          btn.textContent = 'Copy unavailable, select it by hand';
          return;
        }
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'Copied';
          setTimeout(function () { btn.textContent = 'Copy'; }, 1600);
        }, function () {
          btn.textContent = 'Copy failed, select it by hand';
        });
      });
      box.parentNode.insertBefore(btn, box.nextSibling);
    });
  }

  function wireDebrief(block, cfg) {
    var pane = block.querySelector('[data-ty-debrief]');
    if (!pane) { return; }

    var slug = block.getAttribute('data-slug') || '';
    var itemId = 'debrief:' + slug;
    var ta = pane.querySelector('textarea');
    var btn = pane.querySelector('[data-ty-save]');
    var msg = pane.querySelector('[data-ty-msg]');
    var log = pane.querySelector('[data-ty-log]');
    var sb = null;

    function say(kind, html) {
      msg.className = 'ty-msg ty-' + kind;
      msg.innerHTML = html;
    }

    // Crash net only. Never the store.
    try {
      var draft = root.localStorage.getItem(LS_PREFIX + slug);
      if (draft && !ta.value) { ta.value = draft; }
    } catch (e) { /* private mode, no draft, fine */ }
    ta.addEventListener('input', function () {
      try { root.localStorage.setItem(LS_PREFIX + slug, ta.value); } catch (e) { /* ignore */ }
    });

    if (!root.supabase || typeof root.supabase.createClient !== 'function') {
      btn.disabled = true;
      say('bad', '<strong>Your notes cannot be saved right now.</strong> The database client ' +
        'script did not load, so the Save button is disabled on purpose rather than ' +
        'accepting a click it cannot honour. Anything you type stays in this browser only.');
      return;
    }
    sb = root.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnon);

    function renderLog(entries) {
      if (!entries || !entries.length) {
        log.innerHTML = '<p class="ty-dim">No debrief saved yet for this interview.</p>';
        return;
      }
      log.innerHTML = entries.map(function (e) {
        return '<div class="ty-entry"><div class="ty-dim">Saved ' + esc(e.ts) + '</div>' +
          '<div class="ty-pre">' + esc(e.text) + '</div></div>';
      }).join('');
    }

    function read() {
      return sb.from(TABLE).select('item_id,value')
        .eq('board_id', cfg.boardId).eq('item_id', itemId)
        .then(function (res) {
          if (res.error) { throw res.error; }
          var row = (res.data || [])[0];
          return parseRow(row && row.value) || {};
        });
    }

    read().then(function (v) {
      renderLog(v.entries || []);
    }).catch(function (err) {
      log.innerHTML = '';
      say('bad', '<strong>Could not read your saved notes.</strong> This box is showing empty ' +
        'because the read failed, <em>not</em> because nothing is saved. Do not retype on top of ' +
        'it. Error: <code>' + esc(err && err.message ? err.message : String(err)) + '</code>');
    });

    btn.addEventListener('click', function () {
      var text = ta.value.trim();
      if (!text) { say('warn', 'Nothing to save yet.'); return; }
      btn.disabled = true;
      say('dim', 'Saving to the database...');
      // Read the whole object, append, write it back. Never a whitelist rebuild:
      // y0_upsert replaces the entire value, so a partial payload deletes history.
      read().then(function (v) {
        var entries = Array.isArray(v.entries) ? v.entries.slice() : [];
        entries.push({ ts: stamp(), text: text });
        v.entries = entries;
        v.slug = slug;
        v.kind = 'interview-debrief';
        return sb.rpc(UPSERT_RPC, {
          p_board: cfg.boardId, p_item: itemId,
          p_value: JSON.stringify(v), p_token: cfg.boardToken
        }).then(function (res) {
          if (res.error) { throw res.error; }
          // Prove it landed by reading it back, not by trusting a green response.
          return read();
        }).then(function (after) {
          var n = (after.entries || []).length;
          if (n !== entries.length) {
            throw new Error('Wrote ' + entries.length + ' entries but read back ' + n + '.');
          }
          renderLog(after.entries);
          ta.value = '';
          try { root.localStorage.removeItem(LS_PREFIX + slug); } catch (e) { /* ignore */ }
          say('good', 'Saved and read back from the database. ' + n + ' entr' +
            (n === 1 ? 'y' : 'ies') + ' on file for this interview. ' +
            'Tell an agent it is there and the thank-you gets written from it.');
        });
      }).catch(function (err) {
        say('bad', '<strong>SAVE FAILED. Your notes are NOT in the database.</strong> ' +
          'They are still in the box above and in this browser, so nothing is lost, but do not ' +
          'close this tab assuming it saved. Error: <code>' +
          esc(err && err.message ? err.message : String(err)) + '</code>');
      }).then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
    });
  }

  function init(cfg) {
    var block = document.getElementById('ty-block');
    if (!block) { return; }
    var wrap = document.querySelector('.wrap');
    if (!wrap) { return; }

    var when = block.getAttribute('data-interview-date') || '';
    var now = todayISO();
    // Zero-padded ISO dates compare correctly as strings.
    var after = when !== '' && now >= when;

    var st = block.querySelector('[data-ty-stamp]');
    if (st) {
      st.textContent = after
        ? 'Interview date ' + when + ' has passed (today is ' + now +
          '), so this section moved itself to the top and the prep below is folded shut.'
        : 'Interview is ' + when + ' (today is ' + now +
          '). This stays at the bottom until the day of, then moves itself up here.';
    }

    if (after) {
      block.classList.add('ty-live');
      var mast = wrap.querySelector('header.mast') || wrap.querySelector('header');
      if (mast && mast.parentNode === wrap) {
        wrap.insertBefore(block, mast.nextSibling);
      } else {
        wrap.insertBefore(block, wrap.firstChild);
      }
      document.querySelectorAll('details').forEach(function (el) {
        if (!block.contains(el)) { el.open = false; }
      });
      var d = block.querySelector('details');
      if (d) { d.open = true; }
    } else {
      block.classList.add('ty-pending');
      wrap.appendChild(block);
      var dd = block.querySelector('details');
      if (dd) { dd.open = false; }
    }

    addCopyButtons(block);
    if (after) { wireDebrief(block, cfg); }
  }

  root.InterviewFollowup = {
    init: function (cfg) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { init(cfg); });
      } else {
        init(cfg);
      }
    }
  };
})(window);
