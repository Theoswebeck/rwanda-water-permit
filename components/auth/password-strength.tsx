"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";

import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import {
  PASSWORD_REQUIREMENTS,
  scorePassword,
  type PasswordContext,
  validatePassword,
} from "@/lib/security/password";
import { cn } from "@/lib/utils";

interface PasswordStrengthProps {
  password: string;
  /** Used to reject passwords containing the user's own name/email. */
  context?: PasswordContext;
  className?: string;
}

const BAR_COLORS = [
  "bg-red-500",
  "bg-orange-500",
  "bg-yellow-500",
  "bg-lime-500",
  "bg-green-600",
];

const TEXT_COLORS = [
  "text-red-600",
  "text-orange-600",
  "text-yellow-700",
  "text-lime-700",
  "text-green-700",
];

/**
 * Strength meter + live requirement checklist.
 *
 * Reads the same policy the API routes enforce (`lib/security/password.ts`),
 * so the UI can never tell a user a password is fine that the server rejects.
 */
export function PasswordStrength({ password, context, className }: PasswordStrengthProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  if (!password) return null;

  const { score, label } = scorePassword(password);
  const { errors } = validatePassword(password, context);

  // Requirements not covered by the checklist below (common password, contains
  // your name, repeated characters, ...) are surfaced as a single hint.
  const extraError = errors.find(
    (e) => !PASSWORD_REQUIREMENTS.some((r) => e.includes(r.label))
  );

  return (
    <div className={cn("space-y-2", className)} aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 gap-1">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={cn(
                "h-full flex-1 rounded-full transition-colors",
                i <= score ? BAR_COLORS[score] : "bg-gray-200"
              )}
            />
          ))}
        </div>
        <span className={cn("text-xs font-medium whitespace-nowrap", TEXT_COLORS[score])}>
          {tx(label)}
        </span>
      </div>

      <ul className="grid gap-1 sm:grid-cols-2">
        {PASSWORD_REQUIREMENTS.map((requirement) => {
          const met = requirement.test(password);
          return (
            <li
              key={requirement.label}
              className={cn(
                "flex items-center gap-1.5 text-xs",
                met ? "text-green-700" : "text-muted-foreground"
              )}
            >
              {met ? (
                <Check className="h-3 w-3 shrink-0" aria-hidden />
              ) : (
                <X className="h-3 w-3 shrink-0" aria-hidden />
              )}
              <span>{tx(requirement.label)}</span>
            </li>
          );
        })}
      </ul>

      {extraError && <p className="text-xs text-orange-600">{tx(extraError)}</p>}
    </div>
  );
}
