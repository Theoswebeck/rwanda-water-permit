"use client";

import { useEffect, useState } from "react";
import type { AppLanguage } from "@/lib/i18n/language";
import { getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

/**
 * Client component that renders translated text.
 * Use in server components where you can't call hooks directly.
 */
export function Tx({ children }: { children: string }) {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  return <>{translateText(children, language)}</>;
}
