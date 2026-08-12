"use client";

import { Button } from "@/components/ui/button";
import { KINYARWANDA_ENABLED, type AppLanguage } from "@/lib/i18n/language";

interface LanguageSwitcherProps {
  language: AppLanguage;
  onChange: (language: AppLanguage) => void;
  compact?: boolean;
}

const options: Array<{ value: AppLanguage; flag: string; label: string }> = [
  { value: "en", flag: "🇬🇧", label: "EN" },
  { value: "rw", flag: "🇷🇼", label: "RW" },
];

export function LanguageSwitcher({ language, onChange, compact = false }: LanguageSwitcherProps) {
  // Hidden while Kinyarwanda is disabled pending professional translation review.
  if (!KINYARWANDA_ENABLED) return null;

  return (
    <div className="flex items-center gap-1 rounded-full border bg-background/70 p-1">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size={compact ? "sm" : "default"}
          variant={language === option.value ? "default" : "ghost"}
          className={compact ? "h-8 px-2.5" : "h-9 px-3"}
          onClick={() => onChange(option.value)}
          aria-label={`Switch language to ${option.value === "en" ? "English" : "Kinyarwanda"}`}
        >
          <span className="mr-1">{option.flag}</span>
          <span className="text-xs font-semibold">{option.label}</span>
        </Button>
      ))}
    </div>
  );
}
