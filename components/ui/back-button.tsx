"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { safeInternalPath } from "@/lib/safe-internal-path"
import { useAuth } from "@/contexts/AuthContext"
import { dashboardHomeForRole } from "@/lib/staff-nav"

// Local copy, as in protected-route.tsx: the shared normalizeRole lives in
// lib/auth/effective-roles.ts, which imports the database client and so cannot
// be pulled into a client component.
function normalizeRole(role: unknown): string {
  const raw = String(role ?? "").trim().toLowerCase()
  if (!raw) return ""
  if (raw === "application") return "applicant"
  return raw
}

interface BackButtonProps {
  label?: string
  className?: string
}

export function BackButton({ label = "Go Back", className }: BackButtonProps) {
  const handleBack = () => {
    if (typeof window !== "undefined") {
      window.history.back()
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleBack}
      className={className}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  )
}

interface SmartBackButtonProps {
  /** Where to navigate when there is no safe in-app history to return to. */
  fallbackHref: string
  label?: string
  className?: string
  variant?: "ghost" | "outline" | "default" | "secondary" | "link" | "destructive"
  size?: "default" | "sm" | "lg" | "icon"
}

export function SmartBackButton({
  fallbackHref,
  label = "Back",
  className,
  variant = "ghost",
  size = "default",
}: SmartBackButtonProps) {
  const router = useRouter()

  const handleBack = () => {
    if (typeof window !== "undefined") {
      // An explicit ?back= target threaded from the originating list is the
      // canonical destination — it makes a cold load return to the exact tab.
      // Read it from the live URL (not useSearchParams) so pages hosting this
      // button don't need their own Suspense boundary.
      let dest = fallbackHref
      try {
        const back = safeInternalPath(new URLSearchParams(window.location.search).get("back"))
        if (back) dest = back
      } catch {
        // keep fallbackHref
      }

      const ref = document.referrer
      let sameOrigin = false
      try {
        sameOrigin = !!ref && new URL(ref).origin === window.location.origin
      } catch {
        sameOrigin = false
      }
      // Real browser-back only when we came from an in-app page AND this tab
      // has a prior history entry to return to. A cmd-click "open in new tab"
      // sets a same-origin referrer but has no usable history, so it must fall
      // through to the fallback rather than dead-ending on router.back().
      if (sameOrigin && window.history.length > 1) {
        router.back()
        return
      }
      // Cold load (direct link / new tab / external referrer) → deterministic
      // list URL (the ?back= target when present, else the page's fallback).
      router.push(dest)
      return
    }
    router.push(fallbackHref)
  }

  return (
    <Button variant={variant} size={size} onClick={handleBack} className={className}>
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  )
}

interface BackToDashboardButtonProps {
  label?: string
  className?: string
  variant?: "ghost" | "outline" | "default" | "secondary" | "link" | "destructive"
  size?: "default" | "sm" | "lg" | "icon"
}

/**
 * "Back to Dashboard" that lands on the signed-in role's OWN dashboard.
 *
 * Pages under /dashboard hardcoded href="/dashboard", which is the applicant
 * dashboard. Admins (who may open any page) were returned there from an
 * application they had opened from /admin, and saw an empty list — "no
 * applications, no permits" — because that list only ever holds their own
 * applications. Resolving the destination from the role fixes every such page
 * at once; SmartBackButton still prefers real in-app history so the originating
 * tab is preserved when there is one.
 */
export function BackToDashboardButton({
  label = "Back to Dashboard",
  className,
  variant = "ghost",
  size = "default",
}: BackToDashboardButtonProps) {
  const { userProfile } = useAuth()
  const fallbackHref = dashboardHomeForRole(normalizeRole((userProfile as any)?.role))

  return (
    <SmartBackButton
      fallbackHref={fallbackHref}
      label={label}
      className={className}
      variant={variant}
      size={size}
    />
  )
}
