# Auto-Derive Water Use Category Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the manual Water Use Category radio buttons and replace them with a read-only badge auto-derived from the selected activity.

**Architecture:** Single-file change in `application-form-new.tsx`. The existing `effectiveWaterUseCategory` derived value already drives all conditional UI. The useEffect that currently only resets category to abstraction needs to also set it to concession. The radio group UI block is replaced with a badge.

**Tech Stack:** Next.js, React Hook Form, Tailwind CSS

---

### Task 1: Update the useEffect to also auto-set waterUseCategory to "concession"

**Files:**
- Modify: `components/dashboard/application-form-new.tsx:1682-1687`

Currently the useEffect only resets to `"abstraction"` when leaving concession activities. It must also set `"concession"` when entering them, so the submitted form value is always correct.

- [ ] **Step 1: Replace the useEffect block (lines 1682–1687)**

Find this exact block:

```tsx
  }, [isPureConcession, form]);
```

The full block starting around line 1682 is:

```tsx
    if (!isPureConcession && form.getValues('waterUseCategory') === 'concession') {
      form.setValue('waterUseCategory', 'abstraction', { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    }
  }, [isPureConcession, form]);
```

Replace with:

```tsx
    if (isPureConcession) {
      form.setValue('waterUseCategory', 'concession', { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    } else if (form.getValues('waterUseCategory') === 'concession') {
      form.setValue('waterUseCategory', 'abstraction', { shouldDirty: false, shouldTouch: false, shouldValidate: false });
    }
  }, [isPureConcession, form]);
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing errors unrelated to this file).

---

### Task 2: Replace radio group UI with read-only badge

**Files:**
- Modify: `components/dashboard/application-form-new.tsx:4296-4333`

- [ ] **Step 1: Replace the entire conditional FormField block**

Find this block (lines 4296–4333):

```tsx
                  {/* Water Use Category selector – shown for activities that are not pure-concession */}
                  {watchedIntendedActivities && watchedIntendedActivities.length > 0 && !isPureConcession && (
                    <FormField
                      control={form.control}
                      name="waterUseCategory"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-base font-medium">
                            {tx("Water Use Category *")}
                          </FormLabel>
                          <p className="text-sm text-muted-foreground mb-2">
                            {tx("Select whether this activity involves water abstraction or a water concession.")}
                          </p>
                          <FormControl>
                            <RadioGroup
                              value={field.value || "abstraction"}
                              onValueChange={(value) => {
                                if (readOnly) return;
                                field.onChange(value);
                              }}
                              disabled={readOnly}
                              className={`flex gap-6 ${readOnly ? "cursor-default opacity-60" : ""}`}
                            >
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="abstraction" id="wuc-abstraction" />
                                <Label htmlFor="wuc-abstraction" className="cursor-pointer">{tx("Abstraction")}</Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <RadioGroupItem value="concession" id="wuc-concession" />
                                <Label htmlFor="wuc-concession" className="cursor-pointer">{tx("Concession")}</Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
```

Replace with:

```tsx
                  {/* Water Use Category – auto-derived from selected activity, read-only */}
                  {watchedIntendedActivities && watchedIntendedActivities.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-base font-medium">{tx("Water Use Category")}</p>
                      <p className="text-sm text-muted-foreground mb-2">
                        {tx("Automatically determined by the selected activity.")}
                      </p>
                      <span
                        className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                          effectiveWaterUseCategory === "concession"
                            ? "bg-teal-100 text-teal-800"
                            : "bg-blue-100 text-blue-800"
                        }`}
                      >
                        {effectiveWaterUseCategory === "concession" ? tx("Concession") : tx("Abstraction")}
                      </span>
                    </div>
                  )}
```

- [ ] **Step 2: Verify no TypeScript errors**

```bash
cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing ones).

- [ ] **Step 3: Run full build**

```bash
cd /Users/nourumuneza/go/src/waterpermit && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` with no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/nourumuneza/go/src/waterpermit && git add components/dashboard/application-form-new.tsx && git commit -m "feat: auto-derive water use category from activity, replace radio with read-only badge"
```

---

### Task 3: Push to prod and cherry-pick to UAT

- [ ] **Step 1: Push to production branch**

```bash
cd /Users/nourumuneza/go/src/waterpermit && git push origin chore/stage-unstaged-2026-03-01
```

- [ ] **Step 2: Note the commit SHA**

```bash
git log --oneline -1
```

Copy the SHA (e.g. `a1b2c3d`).

- [ ] **Step 3: Cherry-pick to UAT**

```bash
git fetch origin chore/stage-unstaged-2026-03-01-uat
git checkout chore/stage-unstaged-2026-03-01-uat
git cherry-pick <SHA-from-step-2>
git push origin chore/stage-unstaged-2026-03-01-uat
git checkout chore/stage-unstaged-2026-03-01
```
