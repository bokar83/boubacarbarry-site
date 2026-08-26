/*
 * Continue? (internal dir name stays python-dojo) -- frontend logic.
 *
 * Reads window.DOJO_TOKEN and window.DOJO_API, injected by the server-side
 * PHP gate that serves this page. Never authenticates itself, never stores
 * the token anywhere but memory, never touches localStorage with anything
 * except a crash-net copy of the code being edited and the theme choice.
 */

(function () {
  "use strict";

  // The visible product name. Change this one line (and nothing else) to
  // rename the app; it drives the tab title and the wordmark.
  var APP_NAME = "Continue";

  // ---------------------------------------------------------------------
  // Auth state
  // ---------------------------------------------------------------------

  var DOJO_TOKEN = window.DOJO_TOKEN || null;
  var DOJO_API = window.DOJO_API || null;
  var authOk = Boolean(DOJO_TOKEN && DOJO_API);

  var LOCAL_DRAFT_KEY = "dojo_local_draft_v1";
  var THEME_KEY = "dojo_theme_v1";

  var els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function cacheEls() {
    els.loadingScreen = byId("loading-screen");
    els.loadingDetail = byId("loading-detail");
    els.authBanner = byId("auth-banner");
    els.saveFailBanner = byId("save-fail-banner");
    els.output = byId("output");
    els.debugBtn = byId("debug-btn");
    els.runBtn = byId("run-btn");
    els.explainBtn = byId("explain-btn");
    els.clearOutputBtn = byId("clear-output-btn");
    els.explainPanel = byId("explain-panel");
    els.explainBody = byId("explain-body");
    els.explainResource = byId("explain-resource");
    els.explainMeta = byId("explain-meta");
    els.scratchStatus = byId("scratch-status");
    els.codeFallback = byId("code-fallback");
    els.editorHost = byId("editor-host");
    els.appTitle = byId("app-title");
    els.modeTitle = byId("mode-title");
    els.modeDesc = byId("mode-desc");
    els.tabDebug = byId("tab-debug");
    els.tabTest = byId("tab-test");
    els.tabProgress = byId("tab-progress");
    els.viewWorkspace = byId("view-workspace");
    els.viewProgress = byId("view-progress");
    els.progressStats = byId("progress-stats");
    els.conceptsTouched = byId("concepts-touched");
    els.conceptsNotTouched = byId("concepts-not-touched");
    els.errorTypesList = byId("error-types-list");
    els.assessBtn = byId("assess-btn");
    els.assessmentOutput = byId("assessment-output");
    els.themeToggle = byId("theme-toggle");
    els.themeToggleIcon = byId("theme-toggle-icon");
  }

  function showAuthBanner() {
    els.authBanner.classList.add("visible");
  }

  function hideAuthBanner() {
    els.authBanner.classList.remove("visible");
  }

  function showSaveFailBanner() {
    els.saveFailBanner.classList.add("visible");
  }

  function hideSaveFailBanner() {
    els.saveFailBanner.classList.remove("visible");
  }

  // ---------------------------------------------------------------------
  // Theme: OS preference on first visit, remembered after that. A
  // per-viewer convenience -- localStorage is the right tool here, never
  // the system of record.
  // ---------------------------------------------------------------------

  function getStoredTheme() {
    try {
      return window.localStorage.getItem(THEME_KEY);
    } catch (e) {
      return null;
    }
  }

  function storeTheme(theme) {
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch (e) {
      /* ignore */
    }
  }

  function systemPrefersDark() {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    if (els.themeToggleIcon) {
      els.themeToggleIcon.textContent = theme === "dark" ? "☽" : "☀";
    }
    if (editor) {
      editor.setOption("theme", theme === "dark" ? "material-darker" : "default");
    }
  }

  function initTheme() {
    var stored = getStoredTheme();
    var theme = stored || (systemPrefersDark() ? "dark" : "light");
    applyTheme(theme);
  }

  function toggleTheme() {
    var current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    var next = current === "dark" ? "light" : "dark";
    applyTheme(next);
    storeTheme(next);
  }

  // ---------------------------------------------------------------------
  // API helper -- the one place every server call goes through.
  // ---------------------------------------------------------------------

  function callApi(path, body) {
    if (!authOk) {
      showAuthBanner();
      return Promise.reject(new Error("no-auth"));
    }
    return fetch(DOJO_API + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dojo-token": DOJO_TOKEN,
      },
      body: JSON.stringify(body || {}),
    }).then(function (res) {
      if (res.status === 401) {
        showAuthBanner();
        var err = new Error("unauthorized");
        err.status = 401;
        throw err;
      }
      // Any non-401 response means the Edge Function's own verifyToken()
      // accepted this token (guard() checks auth before anything else runs),
      // so whatever caused the banner a moment ago is no longer true. Clear
      // it here rather than only at page load -- the banner previously had
      // no code path that ever hid it again within a session, so a single
      // transient 401 (a token-rotation race, a CORS-allowlist gap during a
      // deploy, etc.) left it stuck on screen forever even once the very
      // next call proved the session was fine.
      hideAuthBanner();
      return res.json().then(function (data) {
        if (!res.ok) {
          var e = new Error(data && data.message ? data.message : "request failed");
          e.status = res.status;
          e.data = data;
          throw e;
        }
        return data;
      });
    });
  }

  // ---------------------------------------------------------------------
  // Output pane rendering
  // ---------------------------------------------------------------------

  function clearOutput() {
    els.output.innerHTML = "";
  }

  function appendLine(text, cls) {
    var div = document.createElement("div");
    div.className = "line" + (cls ? " " + cls : "");
    div.textContent = text;
    els.output.appendChild(div);
    els.output.scrollTop = els.output.scrollHeight;
  }

  // ---------------------------------------------------------------------
  // Editor: CodeMirror 5 if it loaded, plain textarea fallback otherwise.
  // One editor instance, one code buffer, shared between Debug and Test
  // modes -- both modes act on the same thing he is working on.
  // ---------------------------------------------------------------------

  var editor = null;

  function initEditor() {
    if (window.CodeMirror) {
      els.editorHost.innerHTML = "";
      // Read the theme that initTheme() already resolved rather than hardcoding
      // "default". initTheme() runs BEFORE this function and applyTheme() skips
      // the editor when `editor` is still null, so a hardcoded light theme here
      // meant a first visit in dark mode rendered a WHITE editor pane on a dark
      // page. It looked correct to anyone who had clicked the toggle, which is
      // why it survived a screenshot pass.
      var startTheme =
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "material-darker"
          : "default";
      editor = window.CodeMirror(els.editorHost, {
        value: "",
        mode: "python",
        theme: startTheme,
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        matchBrackets: true,
        autoCloseBrackets: true,
        extraKeys: {
          "Ctrl-Enter": function () { runForCurrentMode(); },
          "Cmd-Enter": function () { runForCurrentMode(); },
        },
      });
      editor.on("change", onEditorChange);
      return;
    }
    els.codeFallback.style.display = "block";
    els.codeFallback.addEventListener("keydown", function (e) {
      if (e.key === "Tab") {
        e.preventDefault();
        var start = this.selectionStart;
        var end = this.selectionEnd;
        this.value = this.value.slice(0, start) + "    " + this.value.slice(end);
        this.selectionStart = this.selectionEnd = start + 4;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runForCurrentMode();
      }
    });
    els.codeFallback.addEventListener("input", onEditorChange);
  }

  function getCode() {
    return editor ? editor.getValue() : els.codeFallback.value;
  }

  function setCode(value) {
    if (editor) {
      editor.setValue(value || "");
    } else {
      els.codeFallback.value = value || "";
    }
  }

  // ---------------------------------------------------------------------
  // Scratch persistence
  // ---------------------------------------------------------------------

  var scratchSaveTimer = null;
  var lastSavedCode = "";

  function onEditorChange() {
    var code = getCode();
    try {
      window.localStorage.setItem(LOCAL_DRAFT_KEY, code);
    } catch (e) {
      /* not fatal */
    }
    if (scratchSaveTimer) {
      window.clearTimeout(scratchSaveTimer);
    }
    scratchSaveTimer = window.setTimeout(function () {
      saveScratch(code);
    }, 2000);
  }

  function saveScratch(code) {
    if (code === lastSavedCode) {
      return;
    }
    if (els.scratchStatus) {
      els.scratchStatus.textContent = "saving...";
    }
    callApi("/dojo-scratch", { action: "save", code: code })
      .then(function () {
        lastSavedCode = code;
        if (els.scratchStatus) {
          els.scratchStatus.textContent = "saved";
          window.setTimeout(function () {
            if (els.scratchStatus.textContent === "saved") {
              els.scratchStatus.textContent = "";
            }
          }, 1500);
        }
      })
      .catch(function () {
        if (els.scratchStatus) {
          els.scratchStatus.textContent = "not saved (offline?)";
        }
      });
  }

  function loadScratch() {
    if (!authOk) {
      try {
        var local = window.localStorage.getItem(LOCAL_DRAFT_KEY);
        if (local) setCode(local);
      } catch (e) {
        /* ignore */
      }
      return Promise.resolve();
    }
    return callApi("/dojo-scratch", { action: "load" })
      .then(function (data) {
        var code = data && typeof data.code === "string" ? data.code : "";
        if (code) {
          setCode(code);
          lastSavedCode = code;
        } else {
          try {
            var local = window.localStorage.getItem(LOCAL_DRAFT_KEY);
            if (local) setCode(local);
          } catch (e) {
            /* ignore */
          }
        }
      })
      .catch(function () {
        try {
          var local = window.localStorage.getItem(LOCAL_DRAFT_KEY);
          if (local) setCode(local);
        } catch (e) {
          /* ignore */
        }
      });
  }

  // ---------------------------------------------------------------------
  // Pyodide boot
  // ---------------------------------------------------------------------

  var pyodide = null;

  function bootPyodide() {
    els.loadingDetail.textContent = "Downloading the Python runtime (about 10 MB, cached after the first time).";
    return window
      .loadPyodide({ indexURL: "vendor/pyodide/" })
      .then(function (py) {
        pyodide = py;
        els.loadingDetail.textContent = "Ready.";
        py.setStdout({ batched: function (msg) { appendLine(msg, "stdout"); } });
        py.setStderr({ batched: function (msg) { appendLine(msg, "stderr"); } });
        return py;
      });
  }

  // ---------------------------------------------------------------------
  // "Cannot run this in a browser" detection.
  // ---------------------------------------------------------------------

  var UNSUPPORTED_TEXT_SIGNATURES = [
    /ModuleNotFoundError/,
    /socket\.gaierror/,
    /ConnectionRefusedError/,
    /urllib\.error\.URLError/,
    /PermissionError: \[Errno 1\]/,
    /OSError: \[Errno 99\]/,
    /NotImplementedError.*(subprocess|multiprocessing|fork)/i,
  ];

  function extractMissingModule(errorText) {
    var m = /ModuleNotFoundError: No module named '([^']+)'/.exec(errorText);
    return m ? m[1] : null;
  }

  function tryRecoverMissingModule(moduleName) {
    if (!pyodide || !moduleName) {
      return Promise.resolve(false);
    }
    return pyodide.loadPackage(moduleName).then(
      function () { return true; },
      function () { return false; }
    );
  }

  function looksUnsupported(errorText) {
    for (var i = 0; i < UNSUPPORTED_TEXT_SIGNATURES.length; i++) {
      if (UNSUPPORTED_TEXT_SIGNATURES[i].test(errorText)) return true;
    }
    return false;
  }

  function extractErrorType(errorText) {
    var lines = errorText.trim().split("\n");
    var lastLine = lines[lines.length - 1] || "";
    var m = /^([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception|Warning))\b/.exec(lastLine);
    return m ? m[1] : "UnknownError";
  }

  // ---------------------------------------------------------------------
  // Core execution -- shared by both modes. Returns a result object
  // instead of touching UI directly, so Debug mode and Test mode can each
  // decide what to do with the outcome.
  // ---------------------------------------------------------------------

  function executeAndClassify(code, isRetryAfterRecovery) {
    var startedAt = performance.now();
    return pyodide
      .runPythonAsync(code)
      .then(function () {
        var durationMs = Math.round(performance.now() - startedAt);
        return { outcome: "ok", durationMs: durationMs, errorType: null, errorText: null };
      })
      .catch(function (err) {
        var errorText = err && err.message ? String(err.message) : String(err);
        var durationMs = Math.round(performance.now() - startedAt);

        if (!isRetryAfterRecovery) {
          var missing = extractMissingModule(errorText);
          if (missing) {
            return tryRecoverMissingModule(missing).then(function (recovered) {
              if (recovered) {
                return executeAndClassify(code, true);
              }
              return classifyFailure(errorText, durationMs);
            });
          }
        }
        return classifyFailure(errorText, durationMs);
      });
  }

  function classifyFailure(errorText, durationMs) {
    var errorType = extractErrorType(errorText);
    if (looksUnsupported(errorText)) {
      return {
        outcome: "unsupported",
        durationMs: durationMs,
        errorType: errorType,
        errorText: errorText,
      };
    }
    return {
      outcome: "error",
      durationMs: durationMs,
      errorType: errorType,
      errorText: errorText,
    };
  }

  function renderResult(code, result) {
    if (result.outcome === "ok") {
      appendLine("(finished, no errors)", "ok-msg");
    } else if (result.outcome === "unsupported") {
      appendLine("This needs a real Python environment. Run it on Kaggle. Logged.", "unsupported-msg");
      appendLine(result.errorText, "meta");
    } else {
      appendLine(result.errorText, "traceback");
    }
  }

  function logRun(code, result) {
    var payload = {
      code: code,
      outcome: result.outcome,
      duration_ms: result.durationMs,
    };
    if (result.errorType) payload.error_type = result.errorType;
    if (result.errorText) payload.error_text = result.errorText;

    if (!authOk) {
      showAuthBanner();
      return Promise.resolve({ runId: null, saved: false });
    }

    return callApi("/dojo-log", payload)
      .then(function (data) {
        if (data && data.persisted) {
          hideSaveFailBanner();
          return { runId: data.run_id, saved: true };
        }
        showSaveFailBanner();
        return { runId: null, saved: false };
      })
      .catch(function (err) {
        if (err && err.status === 401) {
          return { runId: null, saved: false };
        }
        showSaveFailBanner();
        return { runId: null, saved: false };
      });
  }

  function renderExplanation(data) {
    els.explainPanel.classList.add("visible");
    els.explainBody.textContent = data.explanation || "No explanation returned.";
    els.explainResource.innerHTML = "";
    if (data.resource && data.resource.url && data.resource.title) {
      var a = document.createElement("a");
      a.href = data.resource.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = "Learn this properly: " + data.resource.title;
      els.explainResource.appendChild(a);
      if (data.resource.why) {
        var why = document.createElement("div");
        why.className = "resource-why";
        why.textContent = data.resource.why;
        els.explainResource.appendChild(why);
      }
    }
    var metaBits = [];
    if (data.model) metaBits.push(data.model);
    if (typeof data.cost_usd === "number") metaBits.push("$" + data.cost_usd.toFixed(4));
    if (typeof data.spend_today_usd === "number" && typeof data.cap_usd === "number") {
      metaBits.push("today: $" + data.spend_today_usd.toFixed(2) + " / $" + data.cap_usd.toFixed(2));
    }
    els.explainMeta.textContent = metaBits.join(" -- ");
  }

  function requestExplanation(runId, code, errorText, errorType) {
    els.explainPanel.classList.add("visible");
    els.explainBody.textContent = "Thinking...";
    els.explainResource.innerHTML = "";
    els.explainMeta.textContent = "";
    return callApi("/dojo-explain", {
      run_id: runId,
      code: code,
      error_text: errorText,
      error_type: errorType,
    })
      .then(renderExplanation)
      .catch(function (err) {
        if (err && err.status === 429) {
          els.explainBody.textContent = "Daily explanation budget is used up for today. Try again tomorrow.";
        } else if (err && err.status === 401) {
          els.explainBody.textContent = "";
        } else {
          els.explainBody.textContent = "Could not get an explanation right now. " + (err && err.message ? err.message : "");
        }
      });
  }

  // ---------------------------------------------------------------------
  // Mode: Debug (one button, auto-explain) vs Test & Run (manual explain).
  // ---------------------------------------------------------------------

  var currentMode = "debug"; // "debug" | "test"
  var lastTestRunId = null;
  var lastTestHadError = false;
  var lastTestCode = "";
  var lastTestErrorText = "";
  var lastTestErrorType = "";

  function setModeUi(mode) {
    currentMode = mode;
    var isDebug = mode === "debug";
    els.debugBtn.style.display = isDebug ? "" : "none";
    els.runBtn.style.display = isDebug ? "none" : "";
    els.explainBtn.style.display = isDebug ? "none" : "";
    if (isDebug) {
      els.modeTitle.textContent = "Debug my broken code";
      els.modeDesc.textContent = "Paste code that is failing. One button runs it and explains what went wrong.";
    } else {
      els.modeTitle.textContent = "Test and run my code";
      els.modeDesc.textContent = "Run anything. Ask why it broke only when you want to.";
    }
    els.explainPanel.classList.remove("visible");
    clearOutput();
  }

  function runForCurrentMode() {
    if (currentMode === "debug") {
      runDebug();
    } else {
      runTest();
    }
  }

  function runDebug() {
    if (!pyodide) return;
    var code = getCode();
    clearOutput();
    hideSaveFailBanner();
    els.explainPanel.classList.remove("visible");
    els.debugBtn.disabled = true;

    executeAndClassify(code, false)
      .then(function (result) {
        renderResult(code, result);
        return logRun(code, result).then(function (logInfo) {
          if (result.outcome === "ok") {
            appendLine("This runs clean. Nothing to debug.", "ok-msg");
            return;
          }
          if (result.outcome === "unsupported") {
            return; // honest message already shown; nothing to explain
          }
          if (!logInfo.runId) {
            // Save failed -- explain needs a run_id, so we cannot proceed
            // without pretending the run is on record when it is not.
            return;
          }
          return requestExplanation(logInfo.runId, code, result.errorText, result.errorType);
        });
      })
      .finally(function () {
        els.debugBtn.disabled = false;
      });
  }

  function runTest() {
    if (!pyodide) return;
    var code = getCode();
    clearOutput();
    hideSaveFailBanner();
    els.explainPanel.classList.remove("visible");
    setExplainEnabled(false);
    els.runBtn.disabled = true;

    executeAndClassify(code, false)
      .then(function (result) {
        renderResult(code, result);
        lastTestCode = code;
        lastTestErrorText = result.errorText || "";
        lastTestErrorType = result.errorType || "";
        lastTestHadError = result.outcome === "error";
        setExplainEnabled(lastTestHadError);
        return logRun(code, result).then(function (logInfo) {
          lastTestRunId = logInfo.runId;
          if (!logInfo.saved) {
            setExplainEnabled(false);
          }
        });
      })
      .finally(function () {
        els.runBtn.disabled = false;
      });
  }

  function setExplainEnabled(enabled) {
    els.explainBtn.disabled = !enabled;
  }

  function onExplainClick() {
    if (!lastTestHadError || !lastTestRunId) return;
    els.explainBtn.disabled = true;
    requestExplanation(lastTestRunId, lastTestCode, lastTestErrorText, lastTestErrorType).finally(function () {
      els.explainBtn.disabled = !lastTestHadError;
    });
  }

  // ---------------------------------------------------------------------
  // Progress view
  // ---------------------------------------------------------------------

  function renderStatCard(container, value, label) {
    var card = document.createElement("div");
    card.className = "stat-card";
    var v = document.createElement("div");
    v.className = "stat-value";
    v.textContent = String(value);
    var l = document.createElement("div");
    l.className = "stat-label";
    l.textContent = label;
    card.appendChild(v);
    card.appendChild(l);
    container.appendChild(card);
  }

  function loadProgress() {
    els.progressStats.innerHTML = "";
    els.conceptsTouched.innerHTML = "";
    els.conceptsNotTouched.innerHTML = "";
    els.errorTypesList.innerHTML = "";

    if (!authOk) {
      showAuthBanner();
      return;
    }

    callApi("/dojo-progress", {})
      .then(function (data) {
        renderStatCard(els.progressStats, data.total_runs != null ? data.total_runs : 0, "total runs");
        renderStatCard(els.progressStats, data.ok_runs != null ? data.ok_runs : 0, "clean runs");
        renderStatCard(els.progressStats, data.error_runs != null ? data.error_runs : 0, "error runs");
        renderStatCard(els.progressStats, data.unsupported_runs != null ? data.unsupported_runs : 0, "unsupported runs");
        renderStatCard(els.progressStats, data.distinct_run_days != null ? data.distinct_run_days : 0, "days practiced");

        (data.concepts_touched || []).forEach(function (c) {
          var pill = document.createElement("span");
          pill.className = "tag-pill touched";
          pill.textContent = c.tag + " (" + c.count + ")";
          els.conceptsTouched.appendChild(pill);
        });
        if (!(data.concepts_touched || []).length) {
          els.conceptsTouched.innerHTML = '<span class="hint">Nothing logged yet.</span>';
        }

        (data.concepts_not_touched || []).forEach(function (tag) {
          var pill = document.createElement("span");
          pill.className = "tag-pill not-touched";
          pill.textContent = tag;
          els.conceptsNotTouched.appendChild(pill);
        });
        if (!(data.concepts_not_touched || []).length) {
          els.conceptsNotTouched.innerHTML = '<span class="hint">Nothing to show.</span>';
        }

        (data.error_types || []).forEach(function (row) {
          var line = document.createElement("div");
          line.className = "error-type-row";
          var name = document.createElement("span");
          name.textContent = row.error_type;
          var count = document.createElement("span");
          count.textContent = String(row.count);
          line.appendChild(name);
          line.appendChild(count);
          els.errorTypesList.appendChild(line);
        });
        if (!(data.error_types || []).length) {
          els.errorTypesList.innerHTML = '<span class="hint">No errors logged yet.</span>';
        }
      })
      .catch(function (err) {
        if (err && err.status === 401) return;
        els.progressStats.innerHTML = '<span class="hint">Could not load progress right now.</span>';
      });
  }

  function runAssessment() {
    els.assessBtn.disabled = true;
    els.assessmentOutput.innerHTML = '<div class="placeholder">Working...</div>';

    callApi("/dojo-assess", {})
      .then(function (data) {
        els.assessmentOutput.textContent = data.assessment || "No assessment returned.";
      })
      .catch(function (err) {
        if (err && err.status === 401) {
          els.assessmentOutput.innerHTML = '<div class="placeholder"></div>';
          return;
        }
        els.assessmentOutput.innerHTML = '<div class="placeholder">Could not run the assessment right now.</div>';
      })
      .finally(function () {
        els.assessBtn.disabled = false;
      });
  }

  // ---------------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------------

  function switchTab(name) {
    var isWorkspace = name === "debug" || name === "test";
    els.tabDebug.classList.toggle("active", name === "debug");
    els.tabTest.classList.toggle("active", name === "test");
    els.tabProgress.classList.toggle("active", name === "progress");
    els.viewWorkspace.classList.toggle("active", isWorkspace);
    els.viewProgress.classList.toggle("active", name === "progress");
    if (isWorkspace) {
      setModeUi(name);
    } else {
      loadProgress();
    }
  }

  // ---------------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------------

  function init() {
    cacheEls();
    document.title = APP_NAME;
    els.appTitle.textContent = APP_NAME;

    initTheme();
    initEditor();
    setModeUi("debug");

    if (!authOk) {
      showAuthBanner();
    }

    els.debugBtn.addEventListener("click", runDebug);
    els.runBtn.addEventListener("click", runTest);
    els.explainBtn.addEventListener("click", onExplainClick);
    els.clearOutputBtn.addEventListener("click", clearOutput);
    els.assessBtn.addEventListener("click", runAssessment);
    els.themeToggle.addEventListener("click", toggleTheme);
    els.tabDebug.addEventListener("click", function () { switchTab("debug"); });
    els.tabTest.addEventListener("click", function () { switchTab("test"); });
    els.tabProgress.addEventListener("click", function () { switchTab("progress"); });

    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        if (document.activeElement !== els.codeFallback) {
          runForCurrentMode();
        }
      }
    });

    loadScratch().finally(function () {
      bootPyodide()
        .then(function () {
          els.loadingScreen.classList.add("hidden");
        })
        .catch(function (err) {
          els.loadingDetail.textContent = "The Python runtime failed to load. Reload the page to try again.";
          window.console && window.console.error && window.console.error(err);
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
