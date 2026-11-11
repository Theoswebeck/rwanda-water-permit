"use client";

import React from "react";
import { rwbConfig } from "@/config/rwb.config";

export const RwbFooter: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-40 h-[36px] bg-[#0072bc] text-white flex items-center justify-between px-4 sm:px-6 text-xs font-semibold shadow-xs select-none">
      <p className="m-0 leading-none truncate">
        &copy; {currentYear} {rwbConfig.institution.name}. All rights reserved.
      </p>
      <div className="hidden sm:flex items-center gap-4 text-[11px] text-white/90">
        <span>{rwbConfig.institution.country}</span>
      </div>
    </footer>
  );
};

