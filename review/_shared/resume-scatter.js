/* ===========================================================================
   RESUME SCATTER + MONTH SLIDER -- interactive replacement for the weekly
   bar chart on the job-pipeline resume-momentum section (2026-09-25).

   Boubacar direct: "go a little bit more exotic and creative with the
   graphic. Do we do a scatter plot or something else?... even if you can
   make it 3D or something that moves around. As I move a slider from month
   to month, it shows something different."

   ONE DOT PER APPLICATION, read live from the same y0_money_map_state store
   every other chart/table on this page reads (board_id 'job-pipeline'),
   never a second hand-typed dataset:
     x = applied date (real dates, not week buckets -- so a month with one
         lonely application shows real chronological gap, not a squashed bar)
     y = furthest funnel stage ever reached (same taxonomy master-table.js
         uses for its "how far did each application get" funnel: rejected
         with no interview at the bottom, offer at the top)
     color = inferred resume version, same date-window logic and the same
         dataviz-validated categorical hexes as the legend above this chart
         (#3987e5/#d95926/#199e70/#c98500 -- dark-mode categorical slots
         1/2/3/4). Resume version per application was never tracked as its
         own field -- this is inferred from file-modified-date windows, same
         honest limitation already stated in the page copy above the chart.

   THE "COOL" ELEMENT, and why it is NOT a literal 3D tilt: rotating the SVG
   in 3D space would have skewed the axis labels and the funnel-stage text
   unreadable at 375px, which fails the brief's own "must stay readable"
   condition. Instead: (1) each dot is filled with a radial gradient so it
   reads as a small raised bead rather than a flat disc -- a cheap pseudo-3D
   cue with zero text distortion; (2) a glowing vertical playhead sweeps
   across the plot as the slider moves, like a video scrubber; (3) the
   current month's dots pulse via a drop-shadow keyframe. All three respect
   prefers-reduced-motion.

   Beeswarm-lite jitter: many applications land in the same week (Aug 17 week
   alone is 71), so each dot gets a small DETERMINISTIC jitter (hashed off its
   own row key, not Math.random -- so a re-render never reshuffles a dot the
   viewer just found) inside its stage band and around its date, enough to
   separate overlapping dots without moving them off their true date/stage.
   =========================================================================== */

(function (root) {
  'use strict';

  var TABLE = 'y0_money_map_state';
  var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Same version windows as the hand-authored legend above this chart on the
  // page -- keep these two in sync if that legend's dates ever change.
  var VERSIONS = [
    { key: 'v3', label: 'v3 or earlier', color: '#3987e5', before: '2026-04-15' },
    { key: 'v4', label: 'v4', color: '#d95926', before: '2026-08-16' },
    { key: 'v5', label: 'v5', color: '#199e70', before: '2026-09-03' },
    { key: 'v6', label: 'v6', color: '#c98500', before: null }
  ];

  function resumeVersionFor(dateStr) {
    for (var i = 0; i < VERSIONS.length; i++) {
      var v = VERSIONS[i];
      if (!v.before || dateStr < v.before) { return v; }
    }
    return VERSIONS[VERSIONS.length - 1];
  }

  // Same funnel taxonomy as master-table.js's normalizeFunnelStage/furthestStage
  // (kept as a small local copy -- master-table.js does not export these).
  function normalizeFunnelStage(raw) {
    var s = String(raw || '').toLowerCase();
    if (s === 'recruiter') { return 'recruiter'; }
    if (s === 'hiring-manager') { return 'hiring-manager'; }
    if (s === 'onsite' || s === 'panel' || s === 'final') { return 'onsite'; }
    if (s === 'offer') { return 'offer'; }
    return '';
  }

  function furthestStage(st) {
    if ((st.status || '') === 'offer') { return 'offer'; }
    var stage = normalizeFunnelStage(st.interviewStage);
    if (stage) { return stage; }
    if ((st.status || '') === 'interviewed') { return 'recruiter'; }
    return '';
  }

  var STAGE_RANK = { none: 0, recruiter: 1, 'hiring-manager': 2, onsite: 3, offer: 4 };
  var STAGE_AXIS_LABEL = [
    'Rejected / no interview',
    'Interview: recruiter',
    'Interview: hiring manager',
    'Additional interview / onsite',
    'Offer'
  ];

  function stageKeyOf(st) { return furthestStage(st) || 'none'; }

  // The date a row's clock runs from -- appliedDate is the honest one,
  // statusDate is the fallback for a row dated only by its outcome email.
  function rowDate(st) {
    var d = st.appliedDate || st.statusDate || '';
    return (/^\d{4}-\d{2}-\d{2}/.test(d)) ? d.slice(0, 10) : '';
  }

  function companyOf(st, key) { return st.company || key.replace(/^role:/, '').split('-')[0]; }
  function titleOf(st, key) { return st.title || st.role || key.replace(/^role:/, '').replace(/-/g, ' '); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // Deterministic pseudo-random in [0,1) from a string seed -- never
  // Math.random, so re-rendering (a resize, a re-fetch) never reshuffles a
  // dot the viewer already found and is hovering.
  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = ((h << 5) - h + str.charCodeAt(i)) | 0; }
    return h;
  }
  function rand01(seed) {
    var h = hash(seed);
    return (((h % 10000) + 10000) % 10000) / 10000;
  }

  function dayNum(dateStr) { return Math.floor(new Date(dateStr + 'T00:00:00').getTime() / 86400000); }
  function monthKeyOf(dateStr) { return dateStr.slice(0, 7); }

  function parseRow(raw) {
    if (!raw) { return null; }
    try {
      var v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return (v && typeof v === 'object') ? v : null;
    } catch (e) { return null; }
  }

  var ResumeScatter = {};

  ResumeScatter.build = function (cfg) {
    return new Promise(function (resolve) {
      var mount = document.querySelector(cfg.mount);
      if (!mount) { resolve(false); return; }

      function fail(msg) {
        mount.innerHTML =
          '<div class="mt-banner"><strong>Could not read the board, so no chart is shown.</strong> ' +
          'This is a failed read, not an empty pipeline. Error: <code>' + esc(msg) + '</code></div>';
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
          resolve(render(mount, res.data || []));
        })
        .catch(function (err) {
          fail(err && err.message ? err.message : String(err));
          resolve(false);
        });
    });
  };

  function render(mount, rows) {
    var points = [];
    var noDateCount = 0;

    rows.forEach(function (r) {
      var st = parseRow(r.value) || {};
      var key = r.item_id || '';
      var d = rowDate(st);
      if (!d) { noDateCount++; return; }
      var rank = STAGE_RANK[stageKeyOf(st)];
      points.push({
        key: key,
        company: companyOf(st, key),
        title: titleOf(st, key),
        date: d,
        day: dayNum(d),
        month: monthKeyOf(d),
        rank: rank,
        stageLabel: STAGE_AXIS_LABEL[rank],
        version: resumeVersionFor(d),
        status: st.status || 'unclear',
        open: (st.status === 'applied' || st.status === 'unclear' || st.status === 'drafted')
      });
    });

    if (!points.length) {
      mount.innerHTML = '<p class="mt-dim">No dated applications to plot yet.</p>';
      return true;
    }

    points.sort(function (a, b) { return a.day - b.day; });

    // ---- month axis -------------------------------------------------------
    var months = [];
    var seenMonth = {};
    points.forEach(function (p) {
      if (!seenMonth[p.month]) { seenMonth[p.month] = true; months.push(p.month); }
    });
    months.sort();
    var monthIndex = {};
    months.forEach(function (m, i) { monthIndex[m] = i; });

    // ---- geometry -----------------------------------------------------------
    var minDay = points[0].day;
    var maxDay = points[points.length - 1].day;
    var spanDays = Math.max(1, maxDay - minDay);
    var leftPad = 12, rightPad = 18, topPad = 16, bottomPad = 34;
    var bandCount = 5;
    var width = Math.max(760, Math.min(2000, Math.round(spanDays * 3.4) + leftPad + rightPad));
    var plotWidth = width - leftPad - rightPad;
    var bandHeight = 62;
    var plotHeight = bandHeight * bandCount;
    var height = plotHeight + topPad + bottomPad;

    function xFor(p) {
      var frac = (p.day - minDay) / spanDays;
      var jitter = (rand01(p.key + ':x') - 0.5) * 7;
      return leftPad + frac * plotWidth + jitter;
    }
    function yBandCenter(rank) {
      // rank 4 (offer) renders at the top, rank 0 (rejected / no interview)
      // at the bottom -- "higher is further along" per the brief.
      return topPad + (4 - rank + 0.5) * bandHeight;
    }
    function yFor(p) {
      var amp = bandHeight * 0.5 - 9;
      var jitter = (rand01(p.key + ':y') - 0.5) * 2 * amp;
      return yBandCenter(p.rank) + jitter;
    }

    // ---- build DOM ----------------------------------------------------------
    mount.innerHTML = '';

    var reduceMotion = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var controls = document.createElement('div');
    controls.className = 'rs-controls';

    var playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'rs-play';
    playBtn.setAttribute('aria-pressed', 'false');
    playBtn.textContent = '▶ Play';
    if (reduceMotion) { playBtn.style.display = 'none'; }

    var range = document.createElement('input');
    range.type = 'range';
    range.className = 'rs-range';
    range.min = '0';
    range.max = String(Math.max(0, months.length - 1));
    range.value = String(Math.max(0, months.length - 1));
    range.setAttribute('aria-label', 'Month scrubber');
    if (months.length < 2) { range.disabled = true; }

    var monthLabel = document.createElement('div');
    monthLabel.className = 'rs-month';

    var countLabel = document.createElement('div');
    countLabel.className = 'rs-count';

    controls.appendChild(playBtn);
    controls.appendChild(range);
    controls.appendChild(monthLabel);
    controls.appendChild(countLabel);

    var scroll = document.createElement('div');
    scroll.className = 'rs-scroll';
    var svgHost = document.createElement('div');
    svgHost.className = 'rs-svg-host';
    svgHost.style.width = width + 'px';
    scroll.appendChild(svgHost);

    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('viewBox', '0 0 ' + width + ' ' + height);
    svg.style.display = 'block';

    // gridlines (recessive, one per band boundary)
    for (var b = 0; b <= bandCount; b++) {
      var gy = topPad + b * bandHeight;
      var line = document.createElementNS(svgNS, 'line');
      line.setAttribute('x1', leftPad); line.setAttribute('x2', width - rightPad);
      line.setAttribute('y1', gy); line.setAttribute('y2', gy);
      line.setAttribute('class', 'rs-grid');
      svg.appendChild(line);
    }
    // y-axis labels, one per stage band
    for (var rIdx = 0; rIdx < bandCount; rIdx++) {
      var ly = yBandCenter(rIdx);
      var txt = document.createElementNS(svgNS, 'text');
      txt.setAttribute('x', 4);
      txt.setAttribute('y', ly + 4);
      txt.setAttribute('class', 'rs-axis-label');
      txt.textContent = STAGE_AXIS_LABEL[rIdx];
      svg.appendChild(txt);
    }
    // month ticks along the bottom. Thinned by actual PIXEL distance, not just
    // index parity -- these are real calendar dates, not evenly-spaced
    // buckets, so two adjacent months can sit only days apart on the axis
    // (May and Jun 2026 each had exactly one application, 7 days apart) and
    // their labels collided when thinning only looked at every-other index.
    // A minimum pixel gap catches both the "many months" case and the
    // "few months but close together" case with one rule.
    var MIN_TICK_GAP = 46;
    var lastTickX = -Infinity;
    months.forEach(function (m) {
      var firstOfMonth = null;
      for (var pi = 0; pi < points.length; pi++) {
        if (points[pi].month === m) { firstOfMonth = points[pi]; break; }
      }
      if (!firstOfMonth) { return; }
      var tx = leftPad + ((firstOfMonth.day - minDay) / spanDays) * plotWidth;
      if (tx - lastTickX < MIN_TICK_GAP) { return; }
      lastTickX = tx;
      var mm = parseInt(m.split('-')[1], 10) - 1;
      var yy = m.split('-')[0].slice(2);
      var tick = document.createElementNS(svgNS, 'text');
      tick.setAttribute('x', Math.max(leftPad, tx));
      tick.setAttribute('y', height - 10);
      tick.setAttribute('class', 'rs-axis-label');
      tick.textContent = MONTH_NAMES[mm] + " '" + yy;
      svg.appendChild(tick);
    });

    // radial gradients per version -- the pseudo-3D "bead" look
    var defs = document.createElementNS(svgNS, 'defs');
    VERSIONS.forEach(function (v) {
      var grad = document.createElementNS(svgNS, 'radialGradient');
      grad.setAttribute('id', 'rs-grad-' + v.key);
      grad.setAttribute('cx', '35%'); grad.setAttribute('cy', '30%'); grad.setAttribute('r', '75%');
      var s1 = document.createElementNS(svgNS, 'stop');
      s1.setAttribute('offset', '0%'); s1.setAttribute('stop-color', '#ffffff'); s1.setAttribute('stop-opacity', '0.85');
      var s2 = document.createElementNS(svgNS, 'stop');
      s2.setAttribute('offset', '35%'); s2.setAttribute('stop-color', v.color); s2.setAttribute('stop-opacity', '1');
      var s3 = document.createElementNS(svgNS, 'stop');
      s3.setAttribute('offset', '100%'); s3.setAttribute('stop-color', v.color); s3.setAttribute('stop-opacity', '1');
      grad.appendChild(s1); grad.appendChild(s2); grad.appendChild(s3);
      defs.appendChild(grad);
    });
    svg.appendChild(defs);

    // shared tooltip -- one <div>, positioned per-hover
    var tip = document.createElement('div');
    tip.className = 'rs-tip';
    document.body.appendChild(tip);
    function showTip(p, evt) {
      tip.innerHTML = '<strong>' + esc(p.company) + '</strong><br>' +
        esc(p.title) + '<br>' +
        esc(p.date) + ' &middot; ' + esc(p.version.label) + '<br>' +
        esc(p.stageLabel) + (p.status ? ' (' + esc(p.status) + ')' : '');
      tip.classList.add('rs-show');
      moveTip(evt);
    }
    function moveTip(evt) {
      var x = (evt.touches && evt.touches[0] ? evt.touches[0].clientX : evt.clientX) || 0;
      var y = (evt.touches && evt.touches[0] ? evt.touches[0].clientY : evt.clientY) || 0;
      tip.style.left = Math.min(x + 14, (root.innerWidth || 400) - 250) + 'px';
      tip.style.top = Math.max(y - 40, 8) + 'px';
    }
    function hideTip() { tip.classList.remove('rs-show'); }

    var circles = [];
    points.forEach(function (p) {
      var c = document.createElementNS(svgNS, 'circle');
      c.setAttribute('cx', xFor(p).toFixed(1));
      c.setAttribute('cy', yFor(p).toFixed(1));
      c.setAttribute('r', 5);
      c.setAttribute('fill', 'url(#rs-grad-' + p.version.key + ')');
      if (p.open) {
        // still-open applications (applied/unclear/drafted, never rejected or
        // interviewed) get a dashed ring -- a secondary encoding via stroke,
        // not a second hue, so color stays reserved for resume version alone.
        c.setAttribute('stroke', 'rgba(255,255,255,.55)');
        c.setAttribute('stroke-width', '1.2');
        c.setAttribute('stroke-dasharray', '2,2');
      }
      c.setAttribute('class', 'rs-pt');
      c.setAttribute('tabindex', '0');
      c.setAttribute('role', 'img');
      c.setAttribute('aria-label', p.company + ', applied ' + p.date + ', ' + p.version.label + ', ' + p.stageLabel);
      c.addEventListener('mouseenter', function (e) { showTip(p, e); });
      c.addEventListener('mousemove', moveTip);
      c.addEventListener('mouseleave', hideTip);
      c.addEventListener('focus', function (e) { showTip(p, e); });
      c.addEventListener('blur', hideTip);
      c.addEventListener('touchstart', function (e) { showTip(p, e); }, { passive: true });
      svg.appendChild(c);
      circles.push(c);
    });

    svgHost.appendChild(svg);

    var playhead = document.createElement('div');
    playhead.className = 'rs-playhead';
    svgHost.appendChild(playhead);

    var wrap = document.createElement('div');
    wrap.appendChild(controls);
    wrap.appendChild(scroll);
    mount.appendChild(wrap);

    // ---- slider logic ---------------------------------------------------------
    function xOfLastPointThrough(idx) {
      var mkey = months[idx];
      var lastX = leftPad;
      for (var i = 0; i < points.length; i++) {
        if (points[i].month <= mkey) {
          lastX = leftPad + ((points[i].day - minDay) / spanDays) * plotWidth;
        } else {
          break;
        }
      }
      return lastX;
    }

    function applySelection(idx) {
      var mkey = months[idx];
      var mm = parseInt(mkey.split('-')[1], 10) - 1;
      var yy = mkey.split('-')[0];
      monthLabel.textContent = MONTH_NAMES[mm] + ' ' + yy;

      var seenThrough = 0;
      circles.forEach(function (c, i) {
        var p = points[i];
        var pIdx = monthIndex[p.month];
        c.classList.remove('rs-now');
        if (pIdx < idx) {
          c.style.opacity = '0.28';
          seenThrough++;
        } else if (pIdx === idx) {
          c.style.opacity = '1';
          if (!reduceMotion) { c.classList.add('rs-now'); }
          seenThrough++;
        } else {
          c.style.opacity = '0.045';
        }
      });

      countLabel.textContent = seenThrough + ' of ' + points.length + ' applications through this month';
      playhead.style.left = (xOfLastPointThrough(idx) + 6) + 'px';
    }

    range.addEventListener('input', function () {
      applySelection(parseInt(range.value, 10));
    });

    var playTimer = null;
    playBtn.addEventListener('click', function () {
      if (playTimer) {
        clearInterval(playTimer);
        playTimer = null;
        playBtn.textContent = '▶ Play';
        playBtn.setAttribute('aria-pressed', 'false');
        return;
      }
      playBtn.textContent = '⏸ Pause';
      playBtn.setAttribute('aria-pressed', 'true');
      range.value = '0';
      applySelection(0);
      playTimer = setInterval(function () {
        var next = parseInt(range.value, 10) + 1;
        if (next > months.length - 1) {
          clearInterval(playTimer);
          playTimer = null;
          playBtn.textContent = '▶ Play';
          playBtn.setAttribute('aria-pressed', 'false');
          return;
        }
        range.value = String(next);
        applySelection(next);
      }, 650);
    });

    applySelection(months.length - 1);

    if (noDateCount) {
      var note = document.createElement('p');
      note.className = 'counts-note';
      note.style.marginTop = '8px';
      note.textContent = noDateCount + ' application' + (noDateCount === 1 ? '' : 's') +
        ' with no recorded date could not be plotted and are not shown above.';
      mount.appendChild(note);
    }

    return true;
  }

  root.ResumeScatter = ResumeScatter;
})(window);
