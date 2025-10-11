# Meeting Notes - System Updates Required

## 1. Summary / Decisions

•⁠  ⁠Final process: Assessor and Reviewer roles are consolidated into a single role. Inspector role removed.
•⁠  ⁠Approval remains a separate, final step handled by the Approver.
•⁠  ⁠Deliverable 2: approved.
•⁠  ⁠Pending items: RWB to provide inspection report. Gilbert and Vital to discuss permit transfer/modification internally and report back to QT.

---

## 2. Role responsibilities and process flow

*Roles*

•⁠  ⁠*Assessor / Reviewer (single role)*

  * Receive application and attachments.
  * Verify completeness of documents.
  * Perform field visits and submit a field report.
  * Prepare a verification summary and make a recommendation (Yes / No).
  * Either mark the assessment as ready for approver or return the application for correction.

•⁠  ⁠*Approver*

  * Reviews the assessor/reviewer recommendation and supporting documents before taking final action.
  * Can approve, reject, revoke, or request amendments.
  * Has ability to revoke issued permits and trigger related actions (QR invalidation, notifications).

*Process flow*

1.⁠ ⁠Submission (applicant)
2.⁠ ⁠Assessment (assessor/reviewer consolidated)
3.⁠ ⁠Approval (approver) — issue permit OR reject OR revoke

---

## 3. UI and form requirements

### Routes / pages

•⁠  ⁠*/review* renamed to */assessment*

  * Shows all applications.
  * Filters: application status.
  * Sorting: by submission time (choose earliest or latest).
  * Date range picker to limit results.

•⁠  ⁠*/technical-assessment*

  * Field report section.
  * Summary of the report (text).
  * Upload area for detailed report and additional files (photos, PDFs).
  * Recommendation control: radio Yes / No plus an optional required explanation field when No is selected.

•⁠  ⁠*/inspection*

  * Accept inspection report uploads from RWB or field teams.
  * Attach photos and structured inspection checklist.

•⁠  ⁠*/approver*

  * View assessor recommendations prior to any action.
  * Add a tab next to View Comments labeled Assessor Recommendation (or similar) to surface the recommendation and justification.
  * Filters: status, date range.
  * Sorting: by submission time (earliest/latest).
  * Application rejection reason: optional.
  * Remove the existing Approve Conditions UI element.

•⁠  ⁠*/map-concession*

  * Placeholder present. Implement map display and concession overlays as required.

### Form layout and placement

•⁠  ⁠Move the *Required documents* banner to directly above the *Irrigation details* table.
•⁠  ⁠Show *environmental message* when the relevant numeric value exceeds 10. The UI should display the message inline with the irrigation details.
•⁠  ⁠Show a *feasibility* indicator in the same area as irrigation details when available.

### Document / attachments — rename + explicit list

Change "General requirements" to *Required attachments* and list explicitly:

1.⁠ ⁠*Application letter* addressed to RWB. Required for all applications.
2.⁠ ⁠*Registration certificate* from relevant institution (RDB, RGB, RCA). Required for corporate or institutional applicants.
3.⁠ ⁠*National ID* of the applicant. Required for individual applicants.

Remove any generic "general requirements" text; list only the attachments above.

### Polygon / map input

•⁠  ⁠Add an *Add polygon* button to allow multiple polygons per application.
•⁠  ⁠Enforce a minimum of *5 vertices* per polygon.
•⁠  ⁠Validate polygon geometry client-side and server-side. If polygon vertex count < 5, show inline error and block submission.

### Village selection

•⁠  ⁠Replace free-text village input with a *dropdown* or searchable select control bound to the canonical village list. Do not allow free text.

---

## 4. Validation rules (client and server)

•⁠  ⁠All validation must be implemented both client-side and server-side.
•⁠  ⁠*Table validation*: If a required table cell is empty, block submission and show an inline error on the specific cell.
•⁠  ⁠*Numeric fields*: enforce numeric-only input. If letters are entered in numeric fields, show an immediate inline error and prevent submission.
•⁠  ⁠*Type enforcement*: ensure field types are enforced in the UI and the API accepts/returns strict types.
•⁠  ⁠Remove the option labeled "NO, I do not have access to the land" from the form controls.

---

## 5. Technical assessment content requirements

•⁠  ⁠*Field report*: short summary section (free text).
•⁠  ⁠*Detailed report*: file upload area supporting PDF and image attachments. Multiple files allowed.
•⁠  ⁠*Recommendation*: required Yes / No control. If No, require an explanation text area.
•⁠  ⁠*Attachment metadata*: store uploader id, timestamp, file type, and file hash for audit.

---

## 6. Approver behavior and UI

•⁠  ⁠Approver dashboard must surface the assessor recommendation clearly before allow­ing approve/reject/revoke actions.
•⁠  ⁠Add a tab or pane for Assessor Recommendation next to Comments.
•⁠  ⁠Approver can revoke issued permits. Revoke action must:

  * Mark permit status as Revoked.
  * Invalidate associated QR code(s).
  * Record revocation in the audit log with actor id and timestamp.
  * Send notification to applicant (see Notifications below).
•⁠  ⁠Application rejection reason is optional. Do not force a reason to be entered.

---

## 7. Permit lifecycle, QR, notifications

•⁠  ⁠*Permit revocation*: Approver can revoke. Revocation must cascade to:

  * Set permit.active = false in database.
  * Invalidate QR code tokens and any mobile/scan endpoints that check permit validity.
  * Log revocation event with details.

•⁠  ⁠*Expiry notifications*:

  * System must send SMS to the permit holder *3 days before* permit expiry.
  * Implement a scheduled job (cron) that scans permits where expiry\_date = now + 3 days and sends SMS via the SMS gateway.
  * Also trigger SMS on revocation and on approval issuance.

•⁠  ⁠*Permit transfer and amendment*:

  * RWB to confirm policy and workflow. Pending RWB response.
  * Gilbert and Vital will run internal discussion and then report results to QT.

---

## 8. Logging and audit trail

•⁠  ⁠Implement an append-only audit log for each application and permit. Each record must include:

  * timestamp (ISO 8601), actor id, actor role, action type (submit, update, assess, recommend, approve, reject, revoke, attach-file, transfer, amend), data delta or summary, attachment ids if any.
•⁠  ⁠UI must provide a view of the step-by-step log for each application, filterable by action type and date range.
•⁠  ⁠Logs must be exportable (CSV) for compliance and review.

---

## 9. Pending items and action owners

•⁠  ⁠*RWB*: deliver inspection report to QT.
•⁠  ⁠*Gilbert + Vital*: discuss permit transfer and amendment process internally; report decisions to QT.
•⁠  ⁠*QT*: review RWB inspection report when delivered; proceed with any follow-up.
•⁠  ⁠*Dev team*: implement UI and validation changes described above; implement audit logging and SMS scheduled job.
•⁠  ⁠*Product / PM*: confirm exact threshold for environmental message if the numeric "10" refers to area, number of wells, or another metric. If clarification cannot be obtained, implement as a configurable threshold in the settings table.
