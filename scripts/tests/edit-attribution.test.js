// node scripts/tests/edit-attribution.test.js  -- exits non-zero on failure.
var assert = require('assert');
var ea = require('../../review/_shared/edit-attribution.js');

var current = 'I find what is slowing your business down.';
var A = 'Helping HR teams put AI to work.';
var B = 'AI + HR | For teams buried in AI tools.';
var options = [{ key: 'A', text: A }, { key: 'B', text: B }];
var cases = 0;
function eq(p, kind, label) {
  var r = ea.attributionLabel(p);
  assert.strictEqual(r.kind, kind, JSON.stringify(p) + ' -> ' + JSON.stringify(r));
  if (label) { assert.strictEqual(r.label, label); }
  cases++;
}

// 1. Agent prefill (option A in the box, nothing typed, no decision) -> suggestion, never "Edited by you".
eq({ boxText: A, currentText: current, options: options }, 'suggested', 'Suggested: option A, not yet approved');
// 2. "Use this" loads B, not approved -> suggestion.
eq({ boxText: B + '\n', currentText: current, options: options, decision: null }, 'suggested', 'Suggested: option B, not yet approved');
// 3. Use this + approve -> his pick.
eq({ boxText: B, currentText: current, options: options, decision: 'approve' }, 'picked', 'You picked option B');
// 4. Browser typed save -> Edited by you (this session, and after reload via saved source).
eq({ boxText: A + ' Mine.', currentText: current, options: options, typedThisSession: true }, 'edited', 'Edited by you');
eq({ boxText: A + ' Mine.', currentText: current, options: options, savedSource: 'typed', decision: 'approve' }, 'edited', 'Edited by you');
// 5. Text saved by an agent / unrecorded author -> never his.
eq({ boxText: 'agent test edit', currentText: current, options: options, savedSource: 'agent' }, 'unattributed');
eq({ boxText: 'legacy edit', currentText: current, options: options }, 'unattributed');
// 6. Box equals live text -> no label.
eq({ boxText: current, currentText: current, options: options, typedThisSession: true }, 'none');
// 7. Keyless page prefill (round-1 draft) -> drafted, not his.
eq({ boxText: 'draft text', currentText: current, options: [{ key: null, text: 'draft text' }], decision: 'reject' }, 'suggested', 'Drafted for you, not yet approved');
// 8. Rejecting a suggestion does not make it his pick.
eq({ boxText: A, currentText: current, options: options, decision: 'reject' }, 'suggested');

// sourceFor
assert.strictEqual(ea.sourceFor({ boxText: A, options: options, typedThisSession: true }), 'option:A'); cases++;
assert.strictEqual(ea.sourceFor({ boxText: 'x', options: options, typedThisSession: true }), 'typed'); cases++;
assert.strictEqual(ea.sourceFor({ boxText: 'x', options: options }), 'browser'); cases++;
assert.strictEqual(ea.sourceFor({ boxText: 'd', options: [{ key: null, text: 'd' }] }), 'prefill'); cases++;

console.log('edit-attribution: ' + cases + ' assertions passed');
