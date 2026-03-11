"use client";

import enMessages from "@/messages/en.json";
import rwMessages from "@/messages/rw.json";
import type { AppLanguage } from "@/lib/i18n/language";

type MessageMaps = {
  literal: Record<string, string>;
  words: Record<string, string>;
};

function getMaps(language: AppLanguage): MessageMaps {
  const source = language === "rw" ? rwMessages : enMessages;
  const appForm = source.applicationForm ?? {};
  return {
    literal: (appForm.literal ?? {}) as Record<string, string>,
    words: (appForm.words ?? {}) as Record<string, string>,
  };
}

function translateWordByWord(text: string, words: Record<string, string>): string {
  return text.replace(/\b[A-Za-z][A-Za-z/-]*\b/g, (word) => words[word] ?? word);
}

export function translateText(value: string, language: AppLanguage): string {
  if (language === "en" || !value) return value;

  const { literal, words } = getMaps(language);
  const direct = literal[value];
  if (direct) return direct;

  const trimmed = value.trim();
  if (trimmed && literal[trimmed]) {
    const prefix = value.slice(0, value.indexOf(trimmed));
    const suffix = value.slice(value.indexOf(trimmed) + trimmed.length);
    return `${prefix}${literal[trimmed]}${suffix}`;
  }

  return translateWordByWord(value, words);
}
