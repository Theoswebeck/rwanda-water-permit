"use client"

import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

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
    }
    // Cold load (direct link / new tab / external referrer) → deterministic list URL.
    router.push(fallbackHref)
  }

  return (
    <Button variant={variant} size={size} onClick={handleBack} className={className}>
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  )
}
