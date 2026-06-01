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
            {/* Make the entire logo bounce */}
            <motion.svg 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              initial={{ y: 0 }}
              animate={{ 
                y: [0, -10, -2, -8, 0], 
                scale: [1, 0.95, 1.02, 0.97, 1]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
                times: [0, 0.35, 0.5, 0.65, 1] // Adjusted timing for more dynamic bounce
              }}
            >
              {/* Outer circle */}
              <circle 
                cx="12" 
                cy="12" 
                r="10" 
                stroke="white" 
                strokeWidth="2" 
                fill="none" 
              />
              
              {/* Inner circle with pronounced movement */}
              <motion.circle 
                cx="12" 
                cy="12" 
                r="3.5"
                fill="white"
                stroke="rgba(0,0,0,0.1)"
                strokeWidth="0.5"
                animate={{ 
                  scale: [1, 0.85, 1.05, 0.9, 1],
                  y: [0, 0.5, -0.5, 0.25, 0] // Add slight vertical movement within the outer circle
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  times: [0, 0.35, 0.5, 0.65, 1]
                }}
              />
              
              {/* Enhanced shadow in white dot */}
              <motion.ellipse 
                cx="12.5" 
                cy="12.5" 
                rx="1.5" 
                ry="1.5"
                fill="rgba(0, 0, 0, 0.1)"
                initial={{ opacity: 0.1 }}
                animate={{ opacity: [0.1, 0.3, 0.15, 0.25, 0.1] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                  times: [0, 0.35, 0.5, 0.65, 1]
                }}
              />
            </motion.svg>
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