"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { KeyRound, BookOpen, Building2 } from "lucide-react";

/**
 * Landing-page band pointing government institutions to the API access
 * program (request form + docs). Mirrors the styling conventions of the
 * other home sections (motion-on-scroll, i18n via translateText).
 */
export function ApiAccessSection() {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  return (
    <section className="bg-slate-50 py-16">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-5xl rounded-[2rem] border bg-white p-8 md:p-10"
        >
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">
                <Building2 className="h-3.5 w-3.5" /> {tx("For government institutions")}
              </div>
              <h2 className="mt-3 text-2xl font-bold text-slate-900 md:text-3xl">
                {tx("Water Permit Data API")}
              </h2>
              <p className="mt-2 text-slate-600">
                {tx(
                  "Verify water permits in real time, search the public permit registry, and consume permit statistics — through a secure, scoped API for government agencies."
                )}
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2">
              <Link href="/api-access">
                <Button size="lg" className="w-full md:w-auto">
                  <KeyRound className="mr-2 h-4 w-4" /> {tx("Request API access")}
                </Button>
              </Link>
              <Link href="/api-access/docs">
                <Button variant="outline" size="lg" className="w-full md:w-auto">
                  <BookOpen className="mr-2 h-4 w-4" /> {tx("API documentation")}
                </Button>
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
