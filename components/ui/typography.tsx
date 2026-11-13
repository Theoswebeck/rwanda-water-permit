"use client"

import { cn } from "@/lib/utils"

export function TypographyH1({ children }: { children: React.ReactNode }) {
  return (
    <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-primary">
      {children}
    </h1>
  )
}

export function TypographyH2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-heading mt-12 scroll-m-28 text-2xl font-medium tracking-tight first:mt-0 lg:mt-20 [&+p]:!mt-4 *:[code]:text-2xl">
      {children}
    </h2>
  )
}

export function TypographyH3({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="scroll-m-20 text-2xl font-semibold tracking-tight">
      {children}
    </h3>
  )
}

export function TypographyH4({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="scroll-m-20 text-xl font-semibold tracking-tight">
      {children}
    </h4>
  )
}

export function TypographyP({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p className={cn("leading-relaxed [&:not(:first-child)]:mt-6", className)}>
      {children}
    </p>
  )
}

export function TypographyBlockquote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="mt-6 border-l-2 pl-6 italic">
      {children}
    </blockquote>
  )
}

export function TypographyTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-6 w-full overflow-y-auto">
      {children}
    </div>
  )
}

export function TypographyList({ children }: { children: React.ReactNode }) {
  return (
    <ul className="my-6 ml-6 list-disc [&>li]:mt-2">
      {children}
    </ul>
  )
}

export function TypographyInlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-muted relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold">
      {children}
    </code>
  )
}

export function TypographyLead({ children }: { children: React.ReactNode }) {
  return (
    <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground text-xl">
      {children}
    </p>
  )
}

export function TypographyLarge({ children }: { children: React.ReactNode }) {
  return <div className="text-lg font-semibold">{children}</div>
}

export function TypographySmall({ children }: { children: React.ReactNode }) {
  return (
    <small className="text-sm leading-none font-medium">{children}</small>
  )
}

export function TypographyMuted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted-foreground text-sm">{children}</span>
} 