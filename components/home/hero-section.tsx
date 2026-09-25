"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

// Define a deterministic set of values for the floating dots
// This will ensure the same values are used on both server and client
const floatingDots = [
  { width: 12.68, height: 24.45, left: 45.53, top: 25.37, animY: 10, animX: -5, duration: 8.3, delay: 0.2 },
  { width: 20.23, height: 18.15, left: 74.66, top: 86.60, animY: -8, animX: 12, duration: 7.5, delay: 0.5 },
  { width: 7.21, height: 20.62, left: 76.14, top: 13.49, animY: 15, animX: -3, duration: 9.1, delay: 1.2 },
  { width: 15.71, height: 7.73, left: 88.82, top: 8.77, animY: -12, animX: -7, duration: 6.8, delay: 0.8 },
  { width: 15.77, height: 19.96, left: 0.61, top: 28.92, animY: 5, animX: 10, duration: 8.7, delay: 1.5 },
  { width: 16.32, height: 18.27, left: 77.57, top: 94.96, animY: -14, animX: -6, duration: 7.3, delay: 0.3 },
  { width: 8.38, height: 7.49, left: 13.00, top: 3.91, animY: 8, animX: 8, duration: 9.5, delay: 1.0 },
  { width: 22.20, height: 20.97, left: 73.77, top: 77.36, animY: -7, animX: -9, duration: 6.5, delay: 0.7 },
  { width: 23.95, height: 16.78, left: 33.74, top: 9.55, animY: 12, animX: 4, duration: 8.0, delay: 1.3 },
  { width: 7.36, height: 6.24, left: 21.45, top: 72.32, animY: -10, animX: 7, duration: 7.8, delay: 0.6 },
  { width: 12.46, height: 24.61, left: 42.77, top: 42.24, animY: 6, animX: -8, duration: 9.3, delay: 1.1 },
  { width: 22.21, height: 24.23, left: 87.32, top: 38.43, animY: -15, animX: 5, duration: 6.9, delay: 0.4 },
  { width: 11.60, height: 9.48, left: 0.86, top: 32.37, animY: 9, animX: 9, duration: 8.2, delay: 1.4 },
  { width: 17.56, height: 6.97, left: 51.03, top: 81.62, animY: -6, animX: -10, duration: 7.7, delay: 0.9 },
  { width: 23.99, height: 6.31, left: 74.37, top: 10.76, animY: 14, animX: 6, duration: 9.0, delay: 0.1 },
  { width: 20.73, height: 11.03, left: 76.49, top: 56.65, animY: -9, animX: -4, duration: 8.5, delay: 1.7 },
  { width: 20.25, height: 16.56, left: 31.15, top: 92.50, animY: 7, animX: 11, duration: 7.1, delay: 0.2 },
  { width: 16.86, height: 19.47, left: 27.51, top: 2.09, animY: -13, animX: 3, duration: 8.9, delay: 1.6 },
  { width: 20.23, height: 22.67, left: 40.57, top: 4.07, animY: 13, animX: -11, duration: 7.4, delay: 0.5 },
  { width: 24.19, height: 18.57, left: 84.18, top: 37.32, animY: -11, animX: 2, duration: 8.6, delay: 1.0 },
];

export function HeroSection() {
  const [isInView, setIsInView] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  useEffect(() => {
    // Set in view after a small delay to trigger animations once loaded
    const timer = setTimeout(() => {
      setIsInView(true);
    }, 300);
    return () => clearTimeout(timer);
  }, []);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.3
      }
    }
  };

  const fadeInUp = {
    hidden: { opacity: 0, y: 30 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8 } }
  };

  const buttonVariants = {
    hover: {
      scale: 1.05,
      boxShadow: "0 12px 32px rgba(255, 255, 255, 0.35)",
      transition: {
        type: "spring",
        stiffness: 400,
        damping: 10
      }
    },
    tap: {
      scale: 0.95,
      boxShadow: "0 5px 10px rgba(0, 0, 0, 0.1)"
    }
  };

  const featureIconVariants = {
    hover: {
      rotate: [0, 10, -10, 0],
      transition: { duration: 0.5 }
    }
  };

  return (
    <section className="hero-section relative overflow-hidden min-h-[600px] md:min-h-[650px]">
      {/* Background image - now covering the full width */}
      <div className="absolute top-0 right-0 bottom-0 left-0 w-full h-full overflow-hidden">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="h-full w-full"
        >
          <img
            src="/assets/DJI_0123_1.JPG"
            alt="Aerial view of boat on Rwanda lake"
            className="h-full w-full object-cover"
            style={{ position: "absolute" }}
          />
          {/* Dark overlay for better text visibility */}
          <div className="absolute inset-0 bg-black/40"></div>
        </motion.div>
      </div>

      <div className="container mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 items-center min-h-[600px] md:min-h-[650px]">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8 }}
            className="md:col-span-7 px-4 py-12"
          >
            <motion.h1
              className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 tracking-tight text-white"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
            >
              <motion.span
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.7, delay: 0.3 }}
              >
                {tx("Rwanda Water Permit Portal")}
              </motion.span>
            </motion.h1>

            <motion.p
              className="text-white/90 mb-8 text-lg"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
            >
              {tx("Welcome to the official Rwanda Water Resources Board permit application portal. Apply, track, and manage your water concession permits through our secure digital platform for sustainable water resource management in Rwanda.")}
            </motion.p>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center mb-8">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.9 }}
              >
                <Link href="/apply">
                  <motion.div
                    className="relative"
                    whileHover="hover"
                    whileTap="tap"
                    variants={buttonVariants}
                  >
                    {/* Pulsing halo draws the eye to the primary CTA */}
                    <motion.span
                      aria-hidden
                      className="absolute inset-0 rounded-full bg-white/40 pointer-events-none"
                      animate={{ scale: [1, 1.25], opacity: [0.6, 0] }}
                      transition={{ repeat: Infinity, duration: 1.8, ease: "easeOut" }}
                    />
                    <Button size="lg" className="bg-white text-primary hover:bg-white rounded-full px-8 h-12 font-medium relative overflow-hidden group">
                      <span className="relative z-10 flex items-center gap-2">
                        {tx("APPLY NOW")}
                        <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                      </span>
                      {/* Shimmer sweeps across on hover */}
                      <span
                        aria-hidden
                        className="absolute inset-y-0 -left-full w-full bg-gradient-to-r from-transparent via-sky-200/70 to-transparent skew-x-12 transition-transform duration-700 ease-out group-hover:translate-x-[200%]"
                      />
                    </Button>
                  </motion.div>
                </Link>
                <motion.a
                  href="tel:9977"
                  className="mt-4 block text-2xl md:text-3xl font-bold text-white tracking-wide drop-shadow-md hover:text-white/90 transition-colors"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 1.1 }}
                >
                  {tx("Toll Free Line: 9977")}
                </motion.a>
              </motion.div>

              <motion.div
                className="flex items-center gap-4 mt-6 sm:mt-0"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                <motion.div
                  className="flex items-center gap-2"
                  variants={fadeInUp}
                  whileHover="hover"
                >
                  <motion.div
                    className="bg-white/20 rounded-full p-2"
                    variants={featureIconVariants}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
                      <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.75.75 0 00.674 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.39-.223-2.73-.635-3.985a.75.75 0 00-.722-.516l-.143.001c-2.996 0-5.717-1.17-7.734-3.08z" clipRule="evenodd" />
                    </svg>
                  </motion.div>
                  <span className="text-sm font-medium text-white">{tx("SECURITY")}</span>
                </motion.div>
                <motion.div
                  className="flex items-center gap-2"
                  variants={fadeInUp}
                  whileHover="hover"
                >
                  <motion.div
                    className="bg-white/20 rounded-full p-2"
                    variants={featureIconVariants}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
                      <path fillRule="evenodd" d="M15.75 1.5a6.75 6.75 0 00-6.651 7.906c.067.39-.032.717-.221.906l-6.5 6.499a3 3 0 00-.878 2.121v2.818c0 .414.336.75.75.75H6a.75.75 0 00.75-.75v-1.5h1.5A.75.75 0 009 19.5V18h1.5a.75.75 0 00.75-.75V15h1.5a.75.75 0 00.75-.75v-1.5h1.5a.75.75 0 00.75-.75V9.81a8.998 8.998 0 002.987-.238c.39-.067.717.032.906.221a6.75 6.75 0 00-3.937-8.293z" clipRule="evenodd" />
                    </svg>
                  </motion.div>
                  <span className="text-sm font-medium text-white">{tx("PRIVACY")}</span>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Floating dots background */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10 pointer-events-none">
        {floatingDots.map((dot, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full bg-primary/5"
            style={{
              width: dot.width,
              height: dot.height,
              left: `${dot.left}%`,
              top: `${dot.top}%`,
            }}
            animate={{
              y: [0, dot.animY],
              x: [0, dot.animX],
              opacity: [0.1, 0.5, 0.1],
            }}
            transition={{
              duration: dot.duration,
              repeat: Infinity,
              repeatType: "reverse",
              delay: dot.delay,
            }}
          />
        ))}
      </div>
    </section>
  );
}
