"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { KeyRound, BookOpen, ShieldCheck, Search, BarChart3 } from "lucide-react";

/**
 * Landing-page band pointing government institutions to the API access
 * program (request form + docs). Mirrors the CTASection visual language:
 * water photography under a dark overlay, secondary accent bar, glow
 * circles, pill buttons, staggered motion.
 */
export function ApiAccessSection() {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  const capabilities = [
    { icon: <ShieldCheck className="h-5 w-5" />, label: tx("Real-time permit verification") },
    { icon: <Search className="h-5 w-5" />, label: tx("Public permit registry search") },
    { icon: <BarChart3 className="h-5 w-5" />, label: tx("Water use statistics") },
  ];

  return (
    <section className="py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative mx-auto max-w-5xl overflow-hidden rounded-[2rem] p-8 md:p-12"
        >
          {/* Background image */}
          <div className="absolute inset-0 z-0">
            <Image
              src="/assets/serrah-galos-zDFIlyeGeP4-unsplash.jpg"
              alt="Water surface"
              fill
              style={{ objectFit: "cover" }}
            />
            <div className="absolute inset-0 z-10 bg-black/60" />
          </div>

          {/* Decorative elements */}
          <div className="absolute top-0 left-0 right-0 z-20 h-2 bg-secondary" />
          <div className="absolute -top-20 -right-20 z-10 h-40 w-40 rounded-full bg-secondary/20 blur-2xl" />
          <div className="absolute -bottom-20 -left-20 z-10 h-40 w-40 rounded-full bg-secondary/20 blur-2xl" />

          <div className="relative z-20 flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-xs font-medium tracking-wide text-white backdrop-blur-sm"
              >
                <KeyRound className="h-3.5 w-3.5" /> {tx("FOR GOVERNMENT INSTITUTIONS")}
              </motion.div>
              <motion.h2
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mt-4 text-3xl font-bold text-white md:text-4xl"
              >
                {tx("Water Permit Data API")}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.4 }}
                className="mt-3 text-white/90"
              >
                {tx(
                  "Integrate your systems with the national water permit registry through a secure, scoped API — access is granted per institution for a fixed period after review."
                )}
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: 0.5 }}
                className="mt-5 flex flex-wrap gap-x-6 gap-y-2"
              >
                {capabilities.map((c) => (
                  <span key={c.label} className="flex items-center gap-2 text-sm font-medium text-white/90">
                    <span className="text-secondary">{c.icon}</span>
                    {c.label}
                  </span>
                ))}
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="flex shrink-0 flex-col gap-3"
            >
              <Link href="/api-access">
                <Button size="lg" className="h-12 w-full rounded-full bg-white px-8 font-medium text-primary hover:bg-white/90 md:w-auto">
                  <KeyRound className="mr-2 h-4 w-4" /> {tx("Request API access")}
                </Button>
              </Link>
              <Link href="/api-access/docs">
                <Button
                  size="lg"
                  variant="outline"
                  className="h-12 w-full rounded-full border-white/40 bg-transparent px-8 font-medium text-white hover:bg-white/10 hover:text-white md:w-auto"
                >
                  <BookOpen className="mr-2 h-4 w-4" /> {tx("API documentation")}
                </Button>
              </Link>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
