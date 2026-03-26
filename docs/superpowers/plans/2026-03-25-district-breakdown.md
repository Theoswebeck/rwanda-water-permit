# District Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an expandable province → district accordion to the public Water Use Dashboard so citizens can drill into district-level permit counts.

**Architecture:** Server-side aggregation in the existing API route groups districts under their province; the existing province card is upgraded in-place to an accordion; one new `useState` drives which province is open (accordion — only one at a time).

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, lucide-react, shadcn/ui (`Progress`, `Skeleton`, `Card`).

---

## File Map

| File | Change |
|---|---|
| `app/api/public/water-use-dashboard/route.ts` | Add `permitsByDistrict` aggregation; include in response |
| `hooks/usePublicWaterUseDashboardQuery.ts` | Add `permitsByDistrict` to `snapshot` type |
| `app/water-use-dashboard/page.tsx` | Add `ChevronRight` import, `expandedProvince` state, replace province card |

---

## Task 1: API — add `permitsByDistrict` aggregation

**Files:**
- Modify: `app/api/public/water-use-dashboard/route.ts`

- [ ] **Step 1: Open the file and locate the insertion point**

  Open `app/api/public/water-use-dashboard/route.ts`. Find the block that ends with:
  ```typescript
  const permitsByCatchment = topCatchments;
  ```
  The new aggregation goes immediately after that line, before `const purposeTotal = ...`.

- [ ] **Step 2: Insert the district aggregation**

  After `const permitsByCatchment = topCatchments;`, add:

  ```typescript
  // Permits by district, grouped under province (system permits only — registry has no district field)
  const districtsByProvince = new Map<string, Map<string, number>>();
  for (const p of filtered) {
    const prov = (p.province ?? "").trim();
    const dist = (p.district ?? "").trim();
    if (!prov || !dist) continue;
    if (!districtsByProvince.has(prov)) districtsByProvince.set(prov, new Map());
    const dm = districtsByProvince.get(prov)!;
    dm.set(dist, (dm.get(dist) ?? 0) + 1);
  }

  const permitsByDistrict = permitsByProvince.map(({ key: province }) => {
    const dm = districtsByProvince.get(province);
    if (!dm) return { province, districts: [] as Array<{ key: string; label: string; count: number; percentage: number }> };
    const provTotal = Array.from(dm.values()).reduce((s, n) => s + n, 0) || 1;
    const districts = Array.from(dm.entries())
      .map(([key, count]) => ({
        key,
        label: key,
        count,
        percentage: (count / provTotal) * 100,
      }))
      .sort((a, b) => b.count - a.count);
    return { province, districts };
  });
  ```

- [ ] **Step 3: Add `permitsByDistrict` to the response object**

  Find the `return NextResponse.json({` block. Inside the `snapshot: { ... }` object, add `permitsByDistrict` after `permitsByCatchment`:

  ```typescript
  snapshot: {
    totalPermitsIssued,
    statusCounts,
    waterUseBySector,
    permitsByWaterSource,
    permitsByProvince,
    permitsByCatchment,
    permitsByDistrict,   // ← add this line
    trend,
    permitsIssuedThisMonth,
    permitsIssuedLastMonth,
    permitsIssuedMoMPercent,
    permitsIssuedYoYPercent,
  },
  ```

- [ ] **Step 4: Verify the server compiles**

  ```bash
  cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors. If TypeScript complains about an implicit `any` on `districts`, the explicit type annotation in Step 2 (`as Array<...>`) resolves it.

- [ ] **Step 5: Smoke-test the API response**

  With the dev server running (`npm run dev`), open in your browser or run:

  ```bash
  curl -s "http://localhost:3000/api/public/water-use-dashboard" | python3 -m json.tool | grep -A 20 '"permitsByDistrict"'
  ```

  Expected: a JSON array where each entry has `province` (string) and `districts` (array of `{ key, label, count, percentage }`). Provinces with no district data return `districts: []`.

- [ ] **Step 6: Commit**

  ```bash
  git add app/api/public/water-use-dashboard/route.ts
  git commit -m "feat(api): add permitsByDistrict aggregation to public dashboard snapshot"
  ```

---

## Task 2: TypeScript — add `permitsByDistrict` to hook type

**Files:**
- Modify: `hooks/usePublicWaterUseDashboardQuery.ts`

- [ ] **Step 1: Open the file and locate the `snapshot` type**

  Open `hooks/usePublicWaterUseDashboardQuery.ts`. Find the `snapshot:` block inside `PublicWaterUseDashboardResponse`. It currently ends with:

  ```typescript
    permitsIssuedYoYPercent: number | null;
  };
  ```

- [ ] **Step 2: Add the new type field**

  Add `permitsByDistrict` after `permitsByCatchment`:

  ```typescript
  export type PublicWaterUseDashboardResponse = {
    snapshot: {
      totalPermitsIssued: number;
      statusCounts: Record<string, number>;
      waterUseBySector: Array<{ key: string; label: string; percentage: number; count: number }>;
      permitsByWaterSource: Array<{ key: string; label: string; percentage: number; count: number }>;
      permitsByProvince: Array<{ key: string; label: string; count: number; percentage: number }>;
      permitsByCatchment: Array<{ key: string; label: string; count: number; percentage: number }>;
      permitsByDistrict: Array<{
        province: string;
        districts: Array<{ key: string; label: string; count: number; percentage: number }>;
      }>;
      trend: Array<{ month: string; permitsIssued: number }>;
      permitsIssuedThisMonth: number;
      permitsIssuedLastMonth: number;
      permitsIssuedMoMPercent: number | null;
      permitsIssuedYoYPercent: number | null;
    };
    map: {
      catchments: Array<{
        catchment: string;
        count: number;
        lat: number;
        lng: number;
        topWaterSource: string | null;
        topPurpose: string | null;
      }>;
    };
    generatedAt: string;
  };
  ```

- [ ] **Step 3: Verify no TypeScript errors**

  ```bash
  cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add hooks/usePublicWaterUseDashboardQuery.ts
  git commit -m "feat(types): add permitsByDistrict to PublicWaterUseDashboardResponse"
  ```

---

## Task 3: UI — replace province card with expandable accordion

**Files:**
- Modify: `app/water-use-dashboard/page.tsx`

- [ ] **Step 1: Add `ChevronRight` to the lucide-react import**

  Find the lucide-react import block:

  ```typescript
  import {
    Droplets,
    Search,
    ShieldCheck,
    ArrowRight,
    AlertTriangle,
    ArrowUpRight,
    TrendingUp,
    TrendingDown,
    MapPin,
    Waves,
  } from "lucide-react";
  ```

  Replace it with:

  ```typescript
  import {
    Droplets,
    Search,
    ShieldCheck,
    ArrowRight,
    AlertTriangle,
    ArrowUpRight,
    TrendingUp,
    TrendingDown,
    MapPin,
    Waves,
    ChevronRight,
  } from "lucide-react";
  ```

- [ ] **Step 2: Add `expandedProvince` state**

  Find the existing state declarations at the top of `WaterUseDashboardPage`:

  ```typescript
  const [q, setQ] = useState("");
  const [province, setProvince] = useState<string>("all");
  ```

  Add after the last `useState` in that group (before `const districtOptions`):

  ```typescript
  const [expandedProvince, setExpandedProvince] = useState<string | null>(null);
  ```

  And add the toggle helper immediately after:

  ```typescript
  function toggleProvince(key: string) {
    setExpandedProvince(prev => (prev === key ? null : key));
  }
  ```

- [ ] **Step 3: Replace the province card**

  Find and replace the entire `"Permits by province"` Card (from `<Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">` that contains `Permits by province` in the CardTitle, to its closing `</Card>`).

  Replace with:

  ```tsx
  <Card className="shadow-sm bg-background/70 backdrop-blur rounded-2xl">
    <CardHeader>
      <CardTitle className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        Permits by province
      </CardTitle>
      <CardDescription>Click a province to see district breakdown</CardDescription>
    </CardHeader>
    <CardContent className="space-y-2">
      {isLoading ? (
        <>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </>
      ) : (snapshot?.permitsByProvince ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No geographic data available for the current selection.</p>
      ) : (
        (snapshot?.permitsByProvince ?? []).map((row, idx) => {
          const isExpanded = expandedProvince === row.key;
          const districtData = (snapshot?.permitsByDistrict ?? []).find(d => d.province === row.key);
          const dotColor =
            idx === 0 ? "bg-emerald-600" :
            idx === 1 ? "bg-emerald-400" :
            idx === 2 ? "bg-emerald-300" :
            idx === 3 ? "bg-emerald-200" : "bg-slate-300";
          return (
            <div
              key={row.key}
              className={[
                "rounded-lg border overflow-hidden",
                isExpanded ? "border-emerald-200" : "border-border",
              ].join(" ")}
            >
              <button
                className={[
                  "w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40 cursor-pointer",
                  isExpanded ? "bg-emerald-50/50" : "",
                ].join(" ")}
                onClick={() => toggleProvince(row.key)}
                aria-expanded={isExpanded}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${dotColor}`} />
                  <span className="font-medium truncate">{row.label}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:flex items-center gap-2">
                    <Progress value={row.percentage} className="h-1.5 w-20 bg-muted" />
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(row.count)} · {row.percentage.toFixed(0)}%
                  </span>
                  <ChevronRight
                    className={[
                      "h-4 w-4 text-muted-foreground transition-transform duration-150",
                      isExpanded ? "rotate-90 text-emerald-600" : "",
                    ].join(" ")}
                  />
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-emerald-100 bg-white px-3 pb-3 pt-2.5 pl-6">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2.5">
                    Districts — % of province total
                  </p>
                  {!districtData || districtData.districts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No district data available.</p>
                  ) : (
                    <div className="space-y-2">
                      {districtData.districts.map((d, dIdx) => (
                        <div key={d.key} className="flex items-center gap-3">
                          <span className="text-sm text-foreground w-28 truncate shrink-0">{d.label}</span>
                          <div className="flex-1 flex items-center gap-2 min-w-0">
                            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                              <div
                                className={`h-full rounded-full ${dIdx < 3 ? "bg-emerald-300" : "bg-emerald-200"}`}
                                style={{ width: `${d.percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0 w-20 text-right">
                              {formatNumber(d.count)} · {d.percentage.toFixed(0)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </CardContent>
  </Card>
  ```

- [ ] **Step 4: Verify TypeScript compilation**

  ```bash
  cd /Users/nourumuneza/go/src/waterpermit && npx tsc --noEmit 2>&1 | head -30
  ```

  Expected: no errors.

- [ ] **Step 5: Visual verification in browser**

  Start the dev server if not already running:

  ```bash
  cd /Users/nourumuneza/go/src/waterpermit && npm run dev
  ```

  Open `http://localhost:3000/water-use-dashboard` and verify:

  1. **Default state** — all province rows are collapsed; each shows dot + name + progress bar + count/pct + right-pointing chevron
  2. **Expand** — clicking a province row reveals district sub-rows indented under it; chevron rotates to point down; row header turns green-tinted
  3. **Accordion** — clicking a second province collapses the first
  4. **Collapse** — clicking an open province collapses it (chevron returns to right)
  5. **Empty state** — if a province has no district data, "No district data available." appears inside the expansion
  6. **Mobile** — at 375px viewport, district names truncate cleanly; count/percentage stays right-aligned

- [ ] **Step 6: Commit**

  ```bash
  git add app/water-use-dashboard/page.tsx
  git commit -m "feat(ui): add expandable province→district accordion to water-use-dashboard"
  ```

---

## Task 4: Push to remote

- [ ] **Step 1: Push**

  ```bash
  git push origin chore/stage-unstaged-2026-03-01
  ```

  Expected: branch updated on remote with 3 new commits (Tasks 1–3).
