"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { KeyRound, BookOpen, ShieldCheck, Search, BarChart3 } from "lucide-react";

/**
 * 100% full-width Landing-page section for Government Institutions API access.
 * Clean white background with official RWB brand colors focused on the action buttons and badge accents.
 */
export function ApiAccessSection() {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  const capabilities = [
    { icon: <ShieldCheck className="h-5 w-5 text-[#0072bc]" />, label: tx("Real-time permit verification") },
    { icon: <Search className="h-5 w-5 text-[#0072bc]" />, label: tx("Public permit registry search") },
    { icon: <BarChart3 className="h-5 w-5 text-[#0072bc]" />, label: tx("Water use statistics") },
  ];

  return (
    <section className="relative overflow-hidden py-20 bg-white text-gray-900 w-full border-t border-gray-100">
      {/* 100% aligned content container matching other sections */}
      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8">
        <div className="flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            {/* Government Badge */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200/80 px-4 py-1.5 text-xs font-bold tracking-wide text-[#0072bc]"
            >
              <KeyRound className="h-3.5 w-3.5 text-[#0072bc]" />
              <span>{tx("FOR GOVERNMENT INSTITUTIONS")}</span>
            </motion.div>

            {/* Title */}
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-4 text-3xl font-extrabold text-gray-900 sm:text-4xl lg:text-5xl tracking-tight"
            >
              {tx("Water Permit Data API")}
            </motion.h2>

            {/* Description */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-4 text-base sm:text-lg text-gray-600 leading-relaxed font-normal"
            >
              {tx(
                "Integrate your systems with the national water permit registry through a secure, scoped API — access is granted per institution for a fixed period after review."
              )}
            </motion.p>

            {/* Capability Badges */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-6 flex flex-wrap gap-x-6 gap-y-3"
            >
              {capabilities.map((c) => (
                <span
                  key={c.label}
                  className="flex items-center gap-2 text-sm font-semibold text-gray-700 bg-gray-50 px-3.5 py-1.5 rounded-lg border border-gray-200/80"
                >
                  {c.icon}
                  <span>{c.label}</span>
                </span>
              ))}
            </motion.div>
          </div>

          {/* Action Buttons with RWB Brand Colors */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex w-full shrink-0 flex-col sm:flex-row lg:flex-col gap-4 sm:w-auto"
          >
            {/* Primary Action Button (RWB Royal Blue) */}
            <Link href="/api-access" className="w-full sm:w-auto">
              <button
                type="button"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-13 px-8 py-3.5 rounded-xl bg-[#0072bc] hover:bg-[#005a96] text-white font-bold text-sm shadow-md hover:shadow-xl hover:scale-105 transition-all cursor-pointer"
              >
                <KeyRound className="h-4 w-4 text-white" />
                <span>{tx("Request API access")}</span>
              </button>
            </Link>

            {/* Secondary Action Button (Outlined RWB Blue) */}
            <Link href="/api-access/docs" className="w-full sm:w-auto">
              <button
                type="button"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-13 px-8 py-3.5 rounded-xl border-2 border-[#0072bc] bg-white text-[#0072bc] hover:bg-blue-50 font-bold text-sm shadow-sm hover:shadow-md transition-all cursor-pointer"
              >
                <BookOpen className="h-4 w-4 text-[#0072bc]" />
                <span>{tx("API documentation")}</span>
              </button>
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
