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
