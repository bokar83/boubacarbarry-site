/*
 * edit-attribution.js -- who wrote the text in a review page's edit box.
 *
 * Why this exists (2026-09-15, Boubacar: "Fix the label."): review pages with
 * inline editing showed "Edited by you" whenever the box differed from the
 * live text. But the box is PREFILLED by an agent (a recommended option, a
 * drafted version) and "Use this" loads agent-written options too. That
 * attributed agent text to him and made his review record untrustworthy.
 *
 * Rule: "Edited by you" appears ONLY when he typed in the box on this page
 * (this session) or the database recorded the saved edit as typed
 * (edited_source === 'typed'). Text that matches an option or the page's own
 * prefill is a SUGGESTION until he approves it, then it is his PICK.
 * Anything else saved earlier with no typed record is shown neutrally --
 * never as his.
 *
 * Pure functions, no DOM. Loaded by pages via
 *   <script src="/review/_shared/edit-attribution.js"></script>
 * and exported for node tests (scripts/tests/edit-attribution.test.js).
 */
(function (root) {
  'use strict';

  function norm(s) { return String(s == null ? '' : s).replace(/\r\n/g, '\n').trim(); }

  function matchOption(boxText, options) {
    var box = norm(boxText);
    var list = options || [];
    for (var i = 0; i < list.length; i++) {
      if (norm(list[i].text) === box) { return list[i]; }
    }
    return null;
  }

  // p: { boxText, currentText, options:[{key:'A'|null, text}], decision,
  //      typedThisSession:boolean, savedSource:string|undefined }
  // options should include the page's own prefill as {key:null, text} when it
  // is not already one of the lettered options.
  function attributionLabel(p) {
    var box = norm(p.boxText);
    if (!box || box === norm(p.currentText)) { return { kind: 'none', label: '' }; }
    var opt = matchOption(box, p.options);
    if (opt) {
      if (p.decision === 'approve') {
        return { kind: 'picked', label: opt.key ? 'You picked option ' + opt.key : 'You approved the draft as written' };
      }
      return { kind: 'suggested', label: opt.key ? 'Suggested: option ' + opt.key + ', not yet approved' : 'Drafted for you, not yet approved' };
    }
    if (p.typedThisSession || p.savedSource === 'typed') { return { kind: 'edited', label: 'Edited by you' }; }
    return { kind: 'unattributed', label: 'Saved earlier, not typed by you on this page' };
  }

  // The source value a page sends with POST /edit-text for the text now in the box.
  function sourceFor(p) {
    var opt = matchOption(p.boxText, p.options);
    if (opt) { return opt.key ? 'option:' + opt.key : 'prefill'; }
    return p.typedThisSession ? 'typed' : 'browser';
  }

  var api = { attributionLabel: attributionLabel, sourceFor: sourceFor };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; }
  if (root) { root.EditAttribution = api; }
})(typeof window !== 'undefined' ? window : null);
