# RWB Meeting Fixes — 2026-08-10 Design

Source: RWB latest meeting notes + "Highlighted Points_Permit System (for QT).docx" (16 points).
Base branch: `chore/stage-unstaged-2026-03-01` (= PROD). No pushes until user approves.
Strategy: 12 independent agents, each in its own git worktree branch `rwb/<slug>`, merged into an
integration branch afterwards, then reviewed 3× with /code-review before finishing.

## Task groups (docx point numbers in brackets)

1. **rwb-permit-format** — Permit PDF layout consistency between abstraction & concession
   (same text start line), justified text, defined paragraph spacing [10]; remove the need for
   assessors to type `**bold**` in the document text editor — emphasis applied automatically,
   legacy markers still render. Owns `lib/pdf-permit-server.ts` + editor UI.
2. **rwb-staff-tables** — Resubmission date: on resubmit after return-for-revision, update the
   submission date shown in ALL staff tables and applicant views [14]; assessors can see/track
   status of ALL applications (read-only outside their stage) [4,5]; return-for-revision reason
   stays visible to assessors after resubmission [2].
3. **rwb-tollfree** — "Toll Free Line: 9977" bold & big directly under APPLY NOW in the hero;
   replace +250782985880 with 9977 in footer/contact [15].
4. **rwb-kinyarwanda-off** — temporarily disable the Kinyarwanda front-end toggle behind a flag;
   translations kept for later re-enable [16].
5. **rwb-permit-data-source** — permit/contract fields sourced from the APPLICATION, except water
   output volume/discharge which comes from the assessment report; source location + allocated
   discharge consistent across assessment report, permit, contract (data layer only) [1,3].
6. **rwb-dossier-download** — staff ZIP download of the full dossier: documents, assessment
   report, permit, contract, approved inspections; missing files skipped with a manifest [4,8].
7. **rwb-missing-docs** — replace `{"success":false,"message":"Server error"}` on lost uploads
   (2026-07-08 incident) with honest "document missing / under recovery" messaging everywhere;
   missing-file indicator on document lists [7].
8. **rwb-inspection-registry-edit** — assessors can edit off-system `inspection_registry` rows
   (not system inspections); compliance re-derived after edit [9].
9. **rwb-other-activities** — "Other Activities" available for BOTH permit types via two distinct
   auto-categorised entries (no manual category selection — hard rule); mirrors concession wiring
   of gaz_extraction/port_construction [11].
10. **rwb-termination-status** — new `terminated` status for exempted uses (e.g. irrigation
    ≤ 1 ha), distinct from returned-for-revision; staff action + badges + applicant notice;
    SQL migration file only, not executed [12].
11. **rwb-sms-approval** — Pindo SMS to applicant on permit approval prompting terms acceptance
    before issuance; non-blocking [13].
12. **rwb-concession-map-print** — printable concession boundary map via the View Map function
    (docx offers this as the accepted alternative to a PDF annex), for client + RWB [6].

## Conflict management (verified 3×)
- `lib/pdf-permit-server.ts` owned exclusively by agent 1; agent 5 is data-layer only
  (`document-slots/build-context`, `permit-text-data`, `contract-placeholders`); agent 12 builds a
  standalone printable page, not a PDF annex.
- Staff table pages owned by agent 2 (dates + visibility combined for that reason).
- Shared `messages/en.json`/`rw.json` edits accepted as trivial merge conflicts.
- DB changes (agents 9, 10, maybe 2) land as SQL files in `database/`, never executed by agents.

## Integration
Merge each `rwb/*` branch into `integration/rwb-meeting-2026-08-10`, resolve conflicts, build,
then run /code-review at least 3 times and fix findings. No push until user says so.
