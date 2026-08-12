"use client";

export type AppLanguage = "en" | "rw";

// Feature flag: Kinyarwanda is temporarily disabled until the translation is
// professionally reviewed. Flip to true to restore the language switcher and
// "rw" resolution everywhere. No translations were removed.
export const KINYARWANDA_ENABLED = false;

export const APP_LANGUAGE_STORAGE_KEY = "waterpermit.app.language";
export const APP_LANGUAGE_EVENT = "waterpermit:language-change";

const isValidLanguage = (value: string | null): value is AppLanguage =>
  value === "en" || value === "rw";

export function getPreferredLanguage(): AppLanguage {
  if (!KINYARWANDA_ENABLED) return "en";
  if (typeof window === "undefined") return "en";

  const saved = window.localStorage.getItem(APP_LANGUAGE_STORAGE_KEY);
  if (isValidLanguage(saved)) return saved;

  const browserLanguage = window.navigator.language.toLowerCase();
  return browserLanguage.startsWith("rw") ? "rw" : "en";
}

export function setPreferredLanguage(language: AppLanguage) {
  if (!KINYARWANDA_ENABLED && language === "rw") return;
  if (typeof window === "undefined") return;
  window.localStorage.setItem(APP_LANGUAGE_STORAGE_KEY, language);
  window.dispatchEvent(new CustomEvent<AppLanguage>(APP_LANGUAGE_EVENT, { detail: language }));
}

export function subscribeToLanguageChanges(onChange: (language: AppLanguage) => void) {
  if (typeof window === "undefined") return () => {};

  const emit = (language: AppLanguage) => {
    if (!KINYARWANDA_ENABLED && language === "rw") return;
    onChange(language);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== APP_LANGUAGE_STORAGE_KEY) return;
    if (isValidLanguage(event.newValue)) emit(event.newValue);
  };

  const handleCustomEvent = (event: Event) => {
    const customEvent = event as CustomEvent<AppLanguage>;
    if (customEvent.detail === "en" || customEvent.detail === "rw") {
      emit(customEvent.detail);
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(APP_LANGUAGE_EVENT, handleCustomEvent);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(APP_LANGUAGE_EVENT, handleCustomEvent);
  };
}
