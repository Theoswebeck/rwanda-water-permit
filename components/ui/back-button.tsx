"use client"

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

