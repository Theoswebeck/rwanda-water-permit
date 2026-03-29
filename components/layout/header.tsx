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

const navItems = [
  { label: "Guidelines", href: "https://www.waterpermit.rwb.rw/Water_Use_Permitting_Guidelines.pdf" },
  { label: "Water Use Dashboard", href: "/water-use-dashboard" },
  { label: "Contact", href: "https://waterpermit.rwb.rw/contact" },
];

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");
  const pathname = usePathname();
  const { userProfile, isAuthenticated } = useAuth();
  const isApplyPage = pathname === "/apply";
  const isLoginPage = pathname === "/login";
  const isRegisterPage = pathname === "/register";
  const isDashboardPage = pathname.startsWith('/dashboard');
  const isApplicationPage = pathname.includes('/application');
  const isInspectionPage = pathname.startsWith('/inspection');
  const isReviewPage = pathname.startsWith('/review');
  const isAssessmentPage = pathname.startsWith('/assessment');
  const isVerificationPage = pathname.startsWith('/verification') || pathname.startsWith('/verifier');
  const isAdminPage = pathname.startsWith('/admin');
  const isApproverPage = pathname.startsWith('/approver');
  const isManagementPage = pathname.startsWith('/management');
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

  return (
    <header className="py-4 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between gap-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
            className="min-w-0 flex-1"
          >
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/assets/rwanda_water_board_Logo.png"
                alt="Rwanda Water Resources Board"
                width={48}
                height={48}
                className="shrink-0"
              />
              <span className="text-foreground font-semibold tracking-tight truncate text-sm sm:text-base">
                {tx("Rwanda Water Permit Portal")}
              </span>
            </Link>
          </motion.div>

          {/* Desktop Navigation */}
          {shouldShowMinimalHeaderForStaff ? null : (
            <nav className="hidden md:flex shrink-0 space-x-10">
              {navItems.map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                >
                  {item.href.startsWith('http') ? (
                    <a 
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium"
                    >
                      {tx(item.label)}
                    </a>
                  ) : (
                    <Link 
                      href={item.href}
                      className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium"
                    >
                      {tx(item.label)}
                    </Link>
                  )}
                </motion.div>
              ))}

            </nav>
          )}

          <div className="hidden md:flex shrink-0 items-center gap-3">
            {!shouldShowMinimalHeaderForStaff && (
              <LanguageSwitcher language={language} onChange={setPreferredLanguage} compact />
            )}
            {/* CTA Button */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
            >
              {shouldShowMinimalHeaderForStaff ? (
                <Link href="/dashboard/profile">
                  <Avatar className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary transition-all">
                    <AvatarImage src={undefined} alt="Profile" />
                    <AvatarFallback>
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                </Link>
              ) : isDashboardPage ? (
                /* On dashboard pages, show the profile link if not already in profile */
                pathname === "/dashboard/profile" ? null : (
                  <Link href="/dashboard/profile">
                    <Button variant="outline" className="rounded-full px-6">
                      {tx("MY PROFILE")}
                    </Button>
                  </Link>
                )
              ) : isApplyPage ? (
                <Link href="/login">
                  <Button className="bg-primary hover:bg-primary/90 rounded-full px-6">
                    {tx("LOGIN")}
                  </Button>
                </Link>
              ) : isLoginPage || isRegisterPage ? (
                <Link href="/">
                  <Button variant="outline" className="rounded-full px-6">
                    {tx("HOME")}
                  </Button>
                </Link>
              ) : isInspectionPage || isReviewPage || isAssessmentPage || isVerificationPage || isAdminPage || isApproverPage || isManagementPage || isTechnicalAssessmentPage ? (
                /* Show profile icon on inspection, review, admin, and approver pages */
                <Link href="/dashboard/profile">
                  <Avatar className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary transition-all">
                    <AvatarImage src={undefined} alt="Profile" />
                    <AvatarFallback>
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                </Link>
              ) : isAuthenticated ? (
                <Link href="/dashboard/profile">
                  <Button variant="outline" className="rounded-full px-6">
                    {tx("MY PROFILE")}
                  </Button>
                </Link>
              ) : (
                <Link href="/apply">
                  <Button className="bg-primary hover:bg-primary/90 rounded-full px-6">
                    {tx("APPLY NOW")}
                  </Button>
                </Link>
              )}
            </motion.div>
          </div>

          {/* Mobile Navigation */}
          <div className="md:hidden flex shrink-0 items-center gap-2">
            {!shouldShowMinimalHeaderForStaff && (
              <LanguageSwitcher language={language} onChange={setPreferredLanguage} compact />
            )}
            {shouldShowMinimalHeaderForStaff ? (
              isAuthenticated ? (
                <Link href="/dashboard/profile">
                  <Avatar className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary transition-all">
                    <AvatarImage src={undefined} alt="Profile" />
                    <AvatarFallback>
                      <User className="h-5 w-5" />
                    </AvatarFallback>
                  </Avatar>
                </Link>
              ) : null
            ) : (
              <Sheet open={isOpen} onOpenChange={setIsOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="text-primary">
                    <Menu className="h-6 w-6" />
                    <span className="sr-only">{tx("Toggle menu")}</span>
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="border-l border-border">
                <div className="flex items-center mb-8 mt-2">
                  <Link href="/" className="flex items-center" onClick={() => setIsOpen(false)}>
                    <Image
                      src="/assets/rwanda_water_board_Logo.png"
                      alt="Rwanda Water Resources Board"
                      width={32}
                      height={32}
                      className="mr-2"
                    />
                    <span className="text-foreground font-semibold text-sm">{tx("Rwanda Water Permit Portal")}</span>
                  </Link>
                </div>

                <nav className="flex flex-col space-y-6 mt-8">
                  {navItems.map((item) => {
                    return item.href.startsWith('http') ? (
                      <a 
                        key={item.label}
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground hover:text-primary transition-colors text-base font-medium"
                        onClick={() => setIsOpen(false)}
                      >
                          {tx(item.label)}
                      </a>
                    ) : (
                      <Link 
                        key={item.label}
                        href={item.href}
                        className="text-foreground hover:text-primary transition-colors text-base font-medium"
                        onClick={() => setIsOpen(false)}
                      >
                        {tx(item.label)}
                      </Link>
                    );
                  })}

                  <div className="pt-6 mt-6 border-t">
                    {isDashboardPage ? (
                      /* On dashboard pages, show the profile link if not already in profile */
                      pathname === "/dashboard/profile" ? null : (
                        <Link href="/dashboard/profile" onClick={() => setIsOpen(false)}>
                          <Button variant="outline" className="w-full rounded-full mt-4">
                            {tx("MY PROFILE")}
                          </Button>
                        </Link>
                      )
                    ) : isApplyPage ? (
                      <Link href="/login" onClick={() => setIsOpen(false)}>
                        <Button className="w-full bg-primary hover:bg-primary/90 rounded-full mt-4">
                          {tx("LOGIN")}
                        </Button>
                      </Link>
                    ) : isLoginPage || isRegisterPage ? (
                      <Link href="/" onClick={() => setIsOpen(false)}>
                        <Button variant="outline" className="w-full rounded-full mt-4">
                          {tx("HOME")}
                        </Button>
                      </Link>
                    ) : isInspectionPage || isReviewPage || isAssessmentPage || isVerificationPage || isAdminPage || isApproverPage || isManagementPage || isTechnicalAssessmentPage ? (
                      /* Hide button on inspection, review, and admin pages */
                      null
                    ) : isAuthenticated ? (
                      <Link href="/dashboard/profile" onClick={() => setIsOpen(false)}>
                        <Button variant="outline" className="w-full rounded-full mt-4">
                          {tx("MY PROFILE")}
                        </Button>
                      </Link>
                    ) : (
                      <Link href="/apply" onClick={() => setIsOpen(false)}>
                        <Button className="w-full bg-primary hover:bg-primary/90 rounded-full mt-4">
                          {tx("APPLY NOW")}
                        </Button>
                      </Link>
                    )}
                  </div>
                </nav>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>
      </div>
    </header>
  );
} 