# Port Bulk / District Water Supply to Production — Cherry-Pick Plan

**Date:** 2026-06-06
**Goal:** Bring the **entire** bulk / District Water Supply feature from UAT
(`chore/stage-unstaged-2026-03-01-uat`) to production (`chore/stage-unstaged-2026-03-01`),
**bulk-only** — without dragging the ~506 lines of unrelated non-bulk UAT changes
(translations, transfer/renewal fixes) that are interleaved in shared files.

**Hard constraints**
- Preserve prod's intentional differences: `lib/payment-utils.ts` `DEFAULT_FEE: 35000` (UAT is 20).
  Verified: **no bulk commit touches `payment-utils.ts`**, so the cherry-pick can't change it.
- Never resolve conflicts directly on the prod branch — use a throwaway integration branch.
- Run the DB migration on the prod database **before** the new code is serving traffic.

---

## 1. What moves

**54 curated bulk commits** (oldest→newest), reverts removed. Full ordered list in Appendix A.
Brand-new files (e.g. `components/dashboard/bulk-networks-table.tsx`,
`app/api/applications/[id]/next-permit-number/route.ts`,
`database/migrations/2026-05-07-bulk-application.sql`, the bulk specs) travel inside their
commits and will not conflict.

**8 commits intentionally EXCLUDED** (revert/re-apply pairs and no-ops):

| Excluded | Why |
|---|---|
| `9a2f8fc` + revert `e141b4f` | "allow new-application for any role" then reverted — net zero |
| `ae91fe7` + revert `460a42e` | await-before-payment; superseded by `c3d30f0` (kept) |
| `53610c8` + revert `aa82e80` | persist bulk_networks on payment; superseded by `a053193` (kept) |
| `3cdbf00` + revert `8117603` | derive isBulk from is_bulk; made moot by `45873d3` (kept) |

## 2. DB migration

`database/migrations/2026-05-07-bulk-application.sql` adds, idempotently (`IF NOT EXISTS`):
- `users.is_bulk_applicant boolean` (dormant — district is open to all users)
- `applications.is_bulk boolean`, `applications.bulk_networks jsonb`, `applications.bulk_district text`
- `permits.parent_permit_id uuid`, `permits.network_sequence_index integer` + index

Run it against the **prod** database before merging the code to prod (it is safe to run early —
columns are additive and unused until the code ships).

## 3. Execution

1. **Branch:** `git checkout chore/stage-unstaged-2026-03-01 && git pull && git checkout -b bulk-to-prod`.
2. **Cherry-pick** the 54 commits in order (Appendix A): `git cherry-pick <sha>` one batch at a time.
   - Conflict policy: **take the bulk hunk, keep prod's surrounding non-bulk code.** Bulk changes
     are recognizable (`isDistrictWaterSupply`, `is_bulk`, `bulk_networks`, `BulkNetworksTable`,
     `isRealNetworkRow`, `persistDraftBeforePayment`, `paymentApplication`, child-permit logic).
   - `8be8a67` ("add missing isBulkApplicant prop **on prod**") may apply empty — if git reports
     "nothing to commit", `git cherry-pick --skip` it; the prop arrives via `fe1da2a`/`3096040`.
   - Expect the heaviest conflicts in: `components/dashboard/application-form-new.tsx`,
     `app/dashboard/application/[id]/terms/page.tsx`, `lib/pdf-permit-server.ts`,
     `lib/contract-terms.ts`, `lib/permit/public-permit-query.ts`, and the staff view pages
     (assessment/review/approver/verification) + `assessor-recommendations.tsx`.
3. **Build gate:** after the cherry-picks, `npm run build` MUST pass (webpack catches what tsc misses).
4. **Code review:** dispatch a reviewer on `chore/stage-unstaged-2026-03-01..bulk-to-prod` focused on
   (a) no non-bulk UAT changes leaked in, (b) `payment-utils.ts` fee still 35000, (c) bulk flows intact.
5. **Migrate prod DB:** run `2026-05-07-bulk-application.sql`.
6. **Merge:** `git checkout chore/stage-unstaged-2026-03-01 && git merge --no-ff bulk-to-prod`,
   then `git push origin chore/stage-unstaged-2026-03-01` (auto-deploys).
7. **Smoke test on prod:** create a District Water Supply application end-to-end (form → payment →
   documents saved → assessment sections 1–4 → issue → parent + N child permits, no empty row,
   PDF annex matches), and confirm a normal (non-district) application is unaffected.

## 4. Verification checklist (must all pass before merge)
- [ ] `npm run build` clean on `bulk-to-prod`.
- [ ] `git diff prod..bulk-to-prod -- lib/payment-utils.ts` is **empty** (fee untouched).
- [ ] No Kinyarwanda-translation / transfer-only hunks leaked into shared files (spot-check the
      `application-form-new.tsx` diff is ~bulk-only).
- [ ] Prod DB has the 6 new bulk columns.
- [ ] Bulk smoke test passes; non-bulk application still issues a single permit normally.

## 5. Rollback
- Pre-merge: discard `bulk-to-prod` (no prod impact).
- Post-merge, pre-push: `git reset --hard origin/chore/stage-unstaged-2026-03-01`.
- Post-deploy: revert the merge commit and redeploy. The additive DB columns can stay (unused) —
  no destructive down-migration needed.

---

## Appendix A — ordered cherry-pick list (54)

```
d5c1dcc 1747fb6 d37b0a6 af72a5b 596190c 6b7623e 955dc5e 742259b 3e20f9d 4566c3a
732b1ee ba2b3a4 9aea920 d11d035 fe1da2a 1c73eae da73c3d 318aab5 5a3b6ee 5e58481
756d903 1977f56 54bb5e9 3f97be0 9f3533e b27848d 6172541 d9cb53c b0fd2e9 8fb0fb8
abd8f27 49acfb0 1ae9b5b c4e3194 bd8e1ba 11248df ec05f1c 9e794ec bfead59 60d079e
cb16cad 3096040 3a9f60d 8be8a67 d6e952d cc073fe 0c30bbb 45873d3 c3d30f0 a053193
fbee55a a875271 8b857b3 7af45a9
```
