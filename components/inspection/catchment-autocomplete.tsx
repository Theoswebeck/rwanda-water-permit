"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

type CatchmentLevel = "level1" | "level2";

type CatchmentSuggestionsResponse = {
  success: boolean;
  data?: { level1?: string[]; level2?: string[] };
};

// Module-level cache shared by all instances on the page so we only fetch once
// per short window. We give it a TTL so values an assessor saves during the
// same SPA session show up in the dropdown the next time the form is reopened.
// `invalidateCatchmentSuggestionsCache()` lets save handlers force a refresh.
const CACHE_TTL_MS = 30_000;
let suggestionsCache: {
  at: number;
  promise: Promise<{ level1: string[]; level2: string[] }>;
} | null = null;

export function invalidateCatchmentSuggestionsCache(): void {
  suggestionsCache = null;
}

async function fetchCatchmentSuggestions(): Promise<{ level1: string[]; level2: string[] }> {
  const now = Date.now();
  if (!suggestionsCache || now - suggestionsCache.at > CACHE_TTL_MS) {
    suggestionsCache = {
      at: now,
      promise: (async () => {
        try {
          const res = await fetch("/api/inspections/catchment-suggestions", {
            credentials: "include",
            cache: "no-store",
          });
          if (!res.ok) return { level1: [], level2: [] };
          const json = (await res.json()) as CatchmentSuggestionsResponse;
          return {
            level1: Array.isArray(json?.data?.level1) ? (json.data!.level1 as string[]) : [],
            level2: Array.isArray(json?.data?.level2) ? (json.data!.level2 as string[]) : [],
          };
        } catch {
          return { level1: [], level2: [] };
        }
      })(),
    };
  }
  return suggestionsCache.promise;
}

/**
 * Free-text input with autocomplete suggestions sourced from prior inspections.
 * Falls back gracefully to a plain editable input if suggestions can't load.
 *
 * Mirrors the visual treatment of `EditableLockedField` for "missing — editable"
 * fields so the section reads consistently.
 */
export function CatchmentAutocomplete({
  label,
  level,
  value,
  onChange,
  disabled,
}: {
  label: string;
  level: CatchmentLevel;
  value: string;
  onChange: (next: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchCatchmentSuggestions().then((data) => {
      if (cancelled) return;
      setSuggestions(level === "level1" ? data.level1 : data.level2);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [level]);

  const trimmed = value.trim();
  const hasSuggestions = loaded && suggestions.length > 0;

  return (
    <div className="space-y-2">
      <Label className="text-sm">
        {label}
        {!disabled && (
          <span className="ml-1.5 text-xs text-amber-600 dark:text-amber-400 font-normal">
            (missing — editable)
          </span>
        )}
      </Label>

      {hasSuggestions && !disabled ? (
        <Popover open={open} onOpenChange={setOpen}>
          <div className="flex items-stretch gap-2">
            <Input
              disabled={disabled}
              value={value}
              placeholder={`Enter ${label.toLowerCase()}…`}
              className={cn(
                "h-11 border-slate-200 dark:border-slate-800",
                "bg-amber-50/50 dark:bg-amber-950/10 border-amber-300 dark:border-amber-800 focus:border-amber-500 focus:ring-amber-500/20"
              )}
              onChange={(e) => onChange(e.target.value)}
            />
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Show suggestions"
                className="h-11 w-11 shrink-0 border-amber-300 dark:border-amber-800"
              >
                <ChevronsUpDown className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
          </div>
          <PopoverContent className="w-[280px] p-0" align="end">
            <Command>
              {/* Drive the popover filter from the same `value` the user typed
                  into the main input so they don't have to retype to filter. */}
              <CommandInput
                placeholder={`Filter ${label.toLowerCase()}…`}
                value={value}
                onValueChange={onChange}
              />
              <CommandList>
                <CommandEmpty>No matching suggestions.</CommandEmpty>
                <CommandGroup heading="Used before">
                  {suggestions.map((option) => (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={(currentValue) => {
                        onChange(currentValue);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          trimmed.toLowerCase() === option.toLowerCase()
                            ? "opacity-100"
                            : "opacity-0"
                        )}
                      />
                      {option}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : (
        <Input
          disabled={disabled}
          value={value}
          placeholder={disabled ? "N/A" : `Enter ${label.toLowerCase()}…`}
          className={cn(
            "h-11 border-slate-200 dark:border-slate-800",
            disabled
              ? "bg-muted/30"
              : "bg-amber-50/50 dark:bg-amber-950/10 border-amber-300 dark:border-amber-800 focus:border-amber-500 focus:ring-amber-500/20"
          )}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
