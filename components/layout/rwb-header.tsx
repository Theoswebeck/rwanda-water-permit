"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { rwbConfig } from "@/config/rwb.config";
import { Search, ChevronDown, User, KeyRound, LogOut, Menu, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

interface RwbHeaderProps {
  isCollapsed: boolean;
  isHovered?: boolean;
  setIsHovered?: (hovered: boolean) => void;
  onToggleCollapse: () => void;
  onToggleMobileSidebar: () => void;
}

export const RwbHeader: React.FC<RwbHeaderProps> = ({
  isCollapsed,
  isHovered = false,
  setIsHovered,
  onToggleCollapse,
  onToggleMobileSidebar,
}) => {
  const { userProfile, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const isExpandedView = !isCollapsed || isHovered;

  const displayName = userProfile
    ? `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim() || userProfile.email
    : "Staff Member";

  const displayRole = userProfile?.role
    ? userProfile.role.toUpperCase()
    : "STAFF";

  const roleDashboards: Record<string, string> = {
    admin: "/admin",
    approver: "/approver",
    inspector: "/inspection",
    reviewer: "/review",
    assessor: "/assessment",
    verifier: "/verification",
    applicant: "/dashboard",
  };
  const role = userProfile?.role?.toLowerCase() || "applicant";
  const dashboardHomeHref = roleDashboards[role] || "/dashboard";

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-[60px] bg-[#0072bc] text-white flex items-center justify-between px-3 sm:px-6 shadow-xs select-none">
      {/* Left side: Brand Area + System Title */}
      <div className="flex items-center h-full min-w-0">
        {/* Mobile menu hamburger button (< 1024px) */}
        <button
          onClick={onToggleMobileSidebar}
          className="lg:hidden p-2 mr-2 rounded hover:bg-white/10 text-white focus:outline-none shrink-0"
          title="Toggle Mobile Menu"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Brand Area */}
        <div
          onMouseEnter={() => isCollapsed && setIsHovered?.(true)}
          onMouseLeave={() => isCollapsed && setIsHovered?.(false)}
          className={`flex items-center h-full transition-all duration-200 shrink-0 ${
            isExpandedView
              ? "w-auto lg:w-[260px] justify-between px-1 lg:px-4"
              : "w-auto lg:w-[80px] justify-center px-1 lg:px-2"
          }`}
        >
          {/* Logo link */}
          <Link href="/dashboard" className="flex items-center justify-center shrink-0">
            <div className="hidden lg:block">
              {isExpandedView ? (
                <Image
                  src="/images/logo_New.png"
                  alt="RWB Logo"
                  width={140}
                  height={38}
                  className="object-contain max-h-[38px] w-auto brightness-0 invert"
                  priority
                />
              ) : (
                <Image
                  src="/images/logo_New.png"
                  alt="RWB Logo"
                  width={56}
                  height={34}
                  className="object-contain max-h-[34px] max-w-[56px] w-auto brightness-0 invert"
                  priority
                />
              )}
            </div>

            {/* Mobile logo (< 1024px) */}
            <div className="lg:hidden flex items-center">
              <Image
                src="/images/logo_New.png"
                alt="RWB Logo"
                width={110}
                height={32}
                className="object-contain max-h-[32px] w-auto brightness-0 invert"
                priority
              />
            </div>
          </Link>

          {/* Toggle Button — ONLY visible on desktop */}
          {isExpandedView && (
            <button
              onClick={onToggleCollapse}
              className="hidden lg:flex w-[20px] h-[20px] rounded-full border-2 border-white items-center justify-center hover:bg-white/20 transition-all focus:outline-none shrink-0 cursor-pointer"
              title={isCollapsed ? "Expand Sidebar Menu" : "Collapse Sidebar Menu"}
              aria-label="Toggle Sidebar"
            >
              <span className="w-[6px] h-[6px] rounded-full bg-white block" />
            </button>
          )}
        </div>

        {/* Vertical divider */}
        <div className="h-6 w-[1px] bg-white/30 mx-2.5 hidden sm:block shrink-0" />

        {/* System Title */}
        <div className="truncate pl-1 hidden sm:block">
          <h1 className="text-white text-sm sm:text-base md:text-lg font-bold tracking-wide truncate">
            {rwbConfig.name}
          </h1>
        </div>
      </div>

      {/* Right side: Search + Language + User Menu */}
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        {/* Search Input */}
        <div className="hidden md:flex items-center">
          <div className="relative">
            <input
              type="text"
              placeholder="Search permit, applicant..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-[#005fa0]/70 hover:bg-[#005fa0]/90 focus:bg-white focus:text-slate-900 focus:placeholder-slate-400 text-white placeholder-white/80 text-xs rounded-full pl-4 pr-8 py-1.5 border border-white/30 focus:outline-none focus:border-white transition-all w-44 lg:w-56"
            />
            <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/80 hover:text-white">
              <Search className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Language Switcher */}
        <div className="hidden sm:block">
          <LanguageSwitcher />
        </div>

        {/* User Account Display */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-1.5 text-white hover:text-white/90 font-bold text-xs sm:text-sm tracking-wide focus:outline-none max-w-[180px] sm:max-w-none"
          >
            <span className="truncate">{displayName}</span>
            <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-normal hidden md:inline">
              {displayRole}
            </span>
            <ChevronDown className="w-3.5 h-3.5 opacity-80 shrink-0" />
          </button>

          {showUserMenu && (
            <div className="absolute right-0 mt-2.5 w-56 bg-white rounded-md shadow-lg border border-slate-200 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 text-slate-800 text-xs">
              <div className="px-3.5 py-2 border-b border-slate-100 bg-slate-50">
                <p className="font-bold text-slate-900 truncate">{displayName}</p>
                <p className="text-[11px] text-slate-500 truncate">{userProfile?.email}</p>
                <span className="inline-block mt-1 text-[10px] uppercase font-bold text-[#0072bc] bg-blue-50 px-2 py-0.5 rounded">
                  {displayRole}
                </span>
              </div>

              <div className="sm:hidden px-3.5 py-2 border-b border-slate-100">
                <LanguageSwitcher />
              </div>

              <Link
                href="/dashboard/profile"
                onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-2 px-3.5 py-2 hover:bg-slate-100 text-slate-700 transition-colors"
              >
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>My Profile</span>
              </Link>

              <Link
                href={dashboardHomeHref}
                onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-2 px-3.5 py-2 hover:bg-slate-100 text-slate-700 transition-colors"
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-slate-400" />
                <span>Dashboard Home</span>
              </Link>

              <Link
                href="/dashboard/profile?tab=security"
                onClick={() => setShowUserMenu(false)}
                className="flex items-center gap-2 px-3.5 py-2 hover:bg-slate-100 text-slate-700 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                <span>Change Password</span>
              </Link>

              <div className="border-t border-slate-100 mt-1 pt-1">
                <button
                  type="button"
                  onClick={async () => {
                    setShowUserMenu(false);
                    await signOut();
                  }}
                  className="w-full text-left flex items-center gap-2 px-3.5 py-2 hover:bg-rose-50 text-rose-600 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>Logout</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

