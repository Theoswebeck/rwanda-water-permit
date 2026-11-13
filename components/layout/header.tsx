"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Menu, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import {
  getPreferredLanguage,
  setPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { useSiteContent } from "@/lib/use-site-content";
import type { SiteContent } from "@/lib/site-content";

function buildNavItems(content: SiteContent) {
  return [
    { label: "Home", href: "/#hero" },
    { label: "Application Process", href: "/#application-process" },
    { label: "Permitted Activities", href: "/#features" },
    { label: "Water Dashboard", href: "/#water-dashboard" },
    { label: "Request API", href: "/api-access" },
    { label: "API Docs", href: "/api-access/docs" },
    {
      label: "User Manual",
      href: content.user_manual_url || "/assets/User_Manual_Guide_Rwanda_Water_Permit_Application_Portal.pdf",
      newTab: true,
    },
    {
      label: "Guidelines",
      href: content.guidelines_url || "/Water_Use_Permitting_Guidelines.pdf",
      newTab: true,
    },
    { label: "Contact", href: "/#contact" },
  ];
}

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");
  const pathname = usePathname();
  const navItems = buildNavItems(useSiteContent());
  const { userProfile, isAuthenticated } = useAuth();
  const isApplyPage = pathname === "/apply";
  const isLoginPage = pathname === "/login";
  const isRegisterPage = pathname === "/register";
  const isForgotPasswordPage = pathname.startsWith("/forgot-password");
  const isResetPasswordPage = pathname.startsWith("/reset-password");
  const isAuthPage = isLoginPage || isRegisterPage || isForgotPasswordPage || isResetPasswordPage;
  const isOptionalShellRoute =
    pathname.startsWith('/contract/terms') ||
    pathname.startsWith('/permit/view') ||
    pathname.startsWith('/permit/map') ||
    pathname.startsWith('/water-use-dashboard');
  const isDashboardPage =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/water-use-report') ||
    pathname.startsWith('/new-application') ||
    (isAuthenticated && isOptionalShellRoute);
  const isInspectionPage = pathname.startsWith('/inspection');
  const isReviewPage = pathname.startsWith('/review');
  const isAssessmentPage = pathname.startsWith('/assessment');
  const isVerificationPage = pathname.startsWith('/verification') || pathname.startsWith('/verifier');
  const isAdminPage = pathname.startsWith('/admin');
  const isApproverPage = pathname.startsWith('/approver');
  const isManagementPage = pathname.startsWith('/management');
  const isChangePasswordPage = pathname.startsWith('/change-password-required');
  const isTechnicalAssessmentPage = pathname.startsWith("/technical-assessment");

  // Staff-facing sections should not show the public marketing navigation.
  const isStaffPage =
    isInspectionPage ||
    isReviewPage ||
    isAssessmentPage ||
    isVerificationPage ||
    isAdminPage ||
    isApproverPage ||
    isManagementPage ||
    isTechnicalAssessmentPage;

  const shouldShowMinimalHeaderForStaff =
    isStaffPage ||
    (isAuthenticated &&
      !!userProfile &&
      ["assessor", "reviewer", "verifier", "approver"].includes(userProfile.role));

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  // When inside internal dashboard/staff pages, the RWB shell provides its own 60px header.
  // When on the landing page (/), or on auth pages (/login, /register, /forgot-password), hide the public header.
  if (isStaffPage || isDashboardPage || pathname === "/" || isAuthPage || isChangePasswordPage) {
    return null;
  }

  return (
    <header className="py-2.5 bg-[#0072bc] shadow-md sticky top-0 z-50">
      <div className="w-full px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
        {/* Brand Logo */}
        <div className="flex items-center shrink-0">
          <Link href="/" className="flex items-center gap-3">
            <Image
              src="/images/favicon_new.png"
              alt="Rwanda Water Resources Board"
              width={56}
              height={56}
              className="h-10 sm:h-12 w-auto object-contain brightness-0 invert shrink-0"
              priority
            />
          </Link>
        </div>

        {/* Desktop Navigation */}
        {shouldShowMinimalHeaderForStaff ? null : (
          <nav className="hidden lg:flex flex-1 items-center justify-center gap-4 xl:gap-6 mx-4">
            {navItems.map((item, index) => (
              <motion.div
                key={item.label}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: index * 0.04 }}
              >
                {item.href.startsWith("http") || item.newTab ? (
                  <a
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs xl:text-sm font-semibold text-white/90 hover:text-white transition-colors whitespace-nowrap"
                  >
                    {tx(item.label)}
                  </a>
                ) : (
                  <Link
                    href={item.href}
                    className="text-xs xl:text-sm font-semibold text-white/90 hover:text-white transition-colors whitespace-nowrap"
                  >
                    {tx(item.label)}
                  </Link>
                )}
              </motion.div>
            ))}
          </nav>
        )}

        {/* Action Controls & Profile / Auth */}
        <div className="hidden lg:flex shrink-0 items-center gap-3">
          {!shouldShowMinimalHeaderForStaff && (
            <LanguageSwitcher language={language} onChange={setPreferredLanguage} compact />
          )}

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-2.5"
          >
            {shouldShowMinimalHeaderForStaff ? (
              <Link href="/dashboard/profile">
                <Avatar className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-white/50 transition-all border border-white/20">
                  <AvatarImage src={undefined} alt="Profile" />
                  <AvatarFallback className="bg-[#005a96] text-white">
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
              </Link>
            ) : isAuthenticated ? (
              <Link href="/dashboard/profile">
                <Button variant="outline" className="rounded-lg px-5 py-2 text-xs xl:text-sm font-bold bg-white/10 text-white border-white/30 hover:bg-white/20 hover:text-white">
                  {tx("MY PROFILE")}
                </Button>
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-lg text-xs xl:text-sm font-bold border-2 border-white text-white hover:bg-white hover:text-[#0072bc] transition-all whitespace-nowrap"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 rounded-lg text-xs xl:text-sm font-bold bg-white text-[#0072bc] hover:bg-blue-50 transition-all shadow-md whitespace-nowrap"
                >
                  Register
                </Link>
              </>
            )}
          </motion.div>
        </div>

        {/* Mobile Navigation Trigger */}
        <div className="lg:hidden flex shrink-0 items-center gap-2">
          {!shouldShowMinimalHeaderForStaff && (
            <LanguageSwitcher language={language} onChange={setPreferredLanguage} compact />
          )}

          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10 rounded-lg text-white hover:bg-white/15 focus:bg-white/15"
                aria-label="Toggle navigation menu"
              >
                <Menu className="h-6 w-6" />
                <span className="sr-only">{tx("Toggle menu")}</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="border-l border-slate-200 bg-white p-6 w-[300px] sm:w-[360px]">
              <div className="flex items-center mb-6 pb-4 border-b">
                <Link href="/" className="flex items-center gap-3" onClick={() => setIsOpen(false)}>
                  <Image
                    src="/images/favicon_new.png"
                    alt="RWB"
                    width={40}
                    height={40}
                    className="h-9 w-auto object-contain"
                  />
                  <span className="text-gray-900 font-bold text-sm leading-tight">
                    Rwanda Water<br />Permit System
                  </span>
                </Link>
              </div>

              <nav className="flex flex-col space-y-1">
                {navItems.map((item) => {
                  return item.href.startsWith("http") || item.newTab ? (
                    <a
                      key={item.label}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between text-gray-700 hover:text-[#0072bc] hover:bg-blue-50 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      <span>{tx(item.label)}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  ) : (
                    <Link
                      key={item.label}
                      href={item.href}
                      className="text-gray-700 hover:text-[#0072bc] hover:bg-blue-50 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors"
                      onClick={() => setIsOpen(false)}
                    >
                      {tx(item.label)}
                    </Link>
                  );
                })}

                <div className="pt-5 mt-4 border-t space-y-3">
                  {isAuthenticated ? (
                    <Link
                      href="/dashboard/profile"
                      className="w-full block text-center py-2.5 rounded-lg border-2 border-[#0072bc] text-[#0072bc] text-sm font-bold"
                      onClick={() => setIsOpen(false)}
                    >
                      {tx("MY PROFILE")}
                    </Link>
                  ) : (
                    <>
                      <Link
                        href="/login"
                        className="w-full block text-center py-2.5 rounded-lg border-2 border-[#0072bc] text-[#0072bc] text-sm font-bold hover:bg-blue-50"
                        onClick={() => setIsOpen(false)}
                      >
                        Sign In
                      </Link>
                      <Link
                        href="/register"
                        className="w-full block text-center py-2.5 rounded-lg bg-[#0072bc] text-white text-sm font-bold hover:bg-[#005a96] shadow-sm"
                        onClick={() => setIsOpen(false)}
                      >
                        Register
                      </Link>
                    </>
                  )}
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
