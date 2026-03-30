# Fix Permit Holder Name in Water Use Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the actual permit holder name (not the project title) in Section 1: General Information of the water use report form.

**Architecture:** The `permitHolderName` useMemo in `water-use-report-form.tsx` falls through to `project_title` when `first_name`/`last_name` are both null. Fix by adding `email` to the applicant query/type, and using it as a fallback before giving up on name resolution.

**Tech Stack:** Next.js (TypeScript), Supabase, React

---

### Task 1: Add `email` to `PermitWithApplication` applicant type

**Files:**
- Modify: `hooks/usePermitsQuery.ts:25-29`

- [ ] **Step 1: Add `email` to the applicant interface**

```typescript
applicant?: {
  id: string
  first_name?: string
  last_name?: string
  company_name?: string
  email?: string
}
```

- [ ] **Step 2: Commit**

```bash
git add hooks/usePermitsQuery.ts
git commit -m "fix: add email to PermitWithApplication applicant type"
```

---

### Task 2: Include `email` in the Supabase select query

**Files:**
- Modify: `app/dashboard/water-use-report/page.tsx:96-98`

- [ ] **Step 1: Add `email` to the applicant select**

Change:
```typescript
applicant:users!applicant_id(
  id, first_name, last_name, company_name
)
```
To:
```typescript
applicant:users!applicant_id(
  id, first_name, last_name, company_name, email
)
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/water-use-report/page.tsx
git commit -m "fix: fetch applicant email in water-use-report query"
```

---

### Task 3: Fix `permitHolderName` to not fall back to `project_title`

**Files:**
- Modify: `components/dashboard/water-use-report-form.tsx:94-101`

- [ ] **Step 1: Update the useMemo to use email as fallback**

Change:
```typescript
const permitHolderName = useMemo(() => {
  const applicant = permit.application?.applicant;
  if (applicant?.company_name) return applicant.company_name;
  const individualName = `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim();
  if (individualName) return individualName;
  // Fallback for legacy rows where applicant relation was not joined.
  return permit.application?.project_title || 'N/A';
}, [permit.application?.applicant, permit.application?.project_title]);
```

To:
```typescript
const permitHolderName = useMemo(() => {
  const applicant = permit.application?.applicant;
  if (applicant?.company_name) return applicant.company_name;
  const individualName = `${applicant?.first_name || ''} ${applicant?.last_name || ''}`.trim();
  if (individualName) return individualName;
  if (applicant?.email) return applicant.email;
  return 'N/A';
}, [permit.application?.applicant]);
```

- [ ] **Step 2: Commit**

```bash
git add components/dashboard/water-use-report-form.tsx
git commit -m "fix: permit holder name uses email fallback, not project_title"
```
