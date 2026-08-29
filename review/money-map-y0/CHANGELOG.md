# Money Map (Year Zero) - Changelog

Plain dated list of what changed on this page, version by version. Started 2026-08-29 because
version bumps alone told nobody what actually changed.

## v21 - 2026-08-29
- Backfilled a LANE tag onto 279 narrative rows (kpi-*/status-*) that previously showed as
  UNASSIGNED, using the codename registry in docs/roadmap/README.md. 8 rows still classify as
  unassigned (no confident keyword match); 2 rows (kpi-next-action-fx-newsletter-2026-08-31,
  status-fpp-membership-join) were skipped because they are already near the 500-character row
  limit and adding the lane tag would push them over -- these need manual shortening before they
  can be tagged.
- Confirmed the task-board bidirectional wiring branch merged and did not break the page's read
  path (get_money_map still returns clean data).

## v20 and earlier
No changelog entry exists for these versions. See the git commit history against this file
(`git log -- review/money-map-y0/index.html` in the boubacarbarry-site repo) for the raw record.

## v22 -- 2026-08-29
Fixed the two counters that disagreed in the same block: "2 done today" beside
"0 of 21 on this list". Root cause: this morning's TL;DR row rewrite stripped the
`CADENCE: DAILY` / `STATUS: STANDING` marker from five rows, and two more `-daily`
rows never carried it, so those rows stopped landing on today's list. They stayed
tickable (the tick keys off the id) but became uncountable (the list keyed off the
text), so ticking one moved his order block and left the header at zero.
Two changes: an id ending `-daily` is now treated as recurring regardless of its
text, so the tick logic and the list logic ask the same question; and the header
now names the gap when work finished today was carried from an earlier day.
The seven rows were repaired in the database through the controlled writer.
