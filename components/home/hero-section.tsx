"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

export function HeroSection() {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  return (
    <section
      id="hero"
      className="hero-section relative min-h-screen flex items-center justify-center overflow-hidden w-full"
      style={{
        background: 'linear-gradient(135deg, #003d6b 0%, #0072bc 50%, #0a8fd8 100%)',
      }}
    >
      {/* Decorative ambient elements */}
      <div className="absolute top-20 right-[-80px] w-96 h-96 rounded-full opacity-10 border-4 border-white pointer-events-none" />
      <div className="absolute bottom-[-60px] left-[-60px] w-80 h-80 rounded-full opacity-10 border-4 border-white pointer-events-none" />
      <div className="absolute top-1/2 right-1/4 w-32 h-32 rounded-full opacity-5 bg-white pointer-events-none" />

      {/* Elegant wave transition into the next section */}
      <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
        <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
          <path
            d="M0,64L80,69.3C160,75,320,85,480,80C640,75,800,53,960,48C1120,43,1280,53,1360,58.7L1440,64L1440,120L1360,120C1280,120,1120,120,960,120C800,120,640,120,480,120C320,120,160,120,80,120L0,120Z"
            fill="#f3f5fa"
          />
        </svg>
      </div>

      {/* Main Content Area */}
      <div className="relative z-20 max-w-5xl mx-auto px-4 sm:px-8 text-center pt-28 pb-36">
        {/* Main Heading */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-4 tracking-tight"
        >
          {tx("Rwanda Water Permit System")}
        </motion.h1>

        {/* Description */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-blue-100 text-base sm:text-lg max-w-2xl mx-auto mb-8 leading-relaxed font-normal"
        >
          {tx("Welcome to the official Rwanda Water Resources Board Water permit System. Apply, track, and manage your water use permits through our secure digital platform for sustainable water resource management in Rwanda.")}
        </motion.p>

        {/* Primary Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8"
        >
          <Link
            href="/login"
            className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-white text-[#0072bc] font-extrabold rounded-xl text-base shadow-xl hover:shadow-2xl hover:scale-105 transition-all cursor-pointer"
          >
            <span>{tx("APPLY NOW")}</span>
            <ArrowRight className="h-4 w-4 text-[#0072bc]" />
          </Link>
        </motion.div>

        {/* Security / Privacy Badges & Toll Free Line */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="flex flex-wrap items-center justify-center gap-4 text-white"
        >
          <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/20 text-xs font-bold tracking-wider">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-200">
              <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.75.75 0 00.674 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08z" clipRule="evenodd" />
            </svg>
            <span>{tx("SECURITY")}</span>
          </div>

          <div className="flex items-center gap-2 bg-white/15 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/20 text-xs font-bold tracking-wider">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-200">
              <path fillRule="evenodd" d="M15.75 1.5a6.75 6.75 0 00-6.651 7.906c.067.39-.032.717-.221.906l-6.5 6.499a3 3 0 00-.878 2.121v2.818c0 .414.336.75.75.75H6a.75.75 0 00.75-.75v-1.5h1.5A.75.75 0 009 19.5V18h1.5a.75.75 0 00.75-.75V15h1.5a.75.75 0 00.75-.75v-1.5h1.5a.75.75 0 00.75-.75V9.81a8.998 8.998 0 002.987-.238c.39-.067.717.032.906.221a6.75 6.75 0 00-3.937-8.293z" clipRule="evenodd" />
            </svg>
            <span>{tx("PRIVACY")}</span>
          </div>

          <a
            href="tel:9977"
            className="flex items-center gap-2.5 bg-white/20 backdrop-blur-sm px-5 py-2 rounded-xl border border-white/30 text-white font-extrabold hover:bg-white/30 transition-all text-sm cursor-pointer"
          >
            <i className="fa fa-phone-alt text-blue-200" />
            <span>{tx("Toll Free Line: 9977")}</span>
          </a>
        </motion.div>
      </div>
    </section>
  );
}
