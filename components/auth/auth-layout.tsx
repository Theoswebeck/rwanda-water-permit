"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ReactNode, useState, useEffect } from "react";
import { translateText } from "@/lib/i18n/translator";
import { AppLanguage, getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";

interface AuthLayoutProps {
  children: ReactNode;
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2">
      {/* Left side - Dark themed sidebar with brand info */}
      <div className="hidden md:flex bg-black text-white flex-col justify-between p-8">
        <div>
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-2"
          >
            {/* RWB's own mark, not a generic placeholder — the logo must be
                the Rwanda Water Resources Board's on every page. */}
            <motion.img
              src="/assets/rwanda_water_board_Logo.png"
              alt="Rwanda Water Resources Board"
              className="h-10 w-auto bg-white rounded p-1"
              initial={{ y: 0 }}
              animate={{ y: [0, -6, 0] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <Link href="/" className="text-xl font-bold">
              {tx("Rwanda Water Resources Board")}
            </Link>
          </motion.div>
        </div>
        
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.5 }}
          className="py-8"
        >
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.7 }}
          >
            <blockquote className="text-xl font-medium mb-4">
              {tx("\"The mission of RWB is to ensure the availability of enough and well managed water resources for sustainable development.\"")}
            </blockquote>
          </motion.div>
        </motion.div>
        
        <div className="text-sm opacity-70">
          &copy; {new Date().getFullYear()} {tx("Rwanda Water Resources Board. All rights reserved.")}
        </div>
      </div>

      {/* Right side - Content area */}
      <div className="flex justify-center items-center p-6">
        <div className="w-full max-w-md">
          {children}
        </div>
      </div>
    </div>
  );
} 