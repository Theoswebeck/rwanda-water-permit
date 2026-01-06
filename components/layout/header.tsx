"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Menu, X, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Guidelines", href: "https://www.waterpermit.rwb.rw/Water_Use_Permitting_Guidelines.pdf" },
  { label: "Regulations", href: "/regulations" },
  { label: "Resources", href: "/resources" },
  { label: "Contact", href: "/contact" },
];

export function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
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

  // Helper to check if we should hide the Apply button
  const shouldHideApplyButton =
    isApplyPage ||
    isLoginPage ||
    isRegisterPage ||
    isDashboardPage ||
    isApplicationPage ||
    isInspectionPage ||
    isReviewPage ||
    isAssessmentPage ||
    isVerificationPage ||
    isAdminPage ||
    isApproverPage ||
    isManagementPage;
  
  return (
    <header className="py-4 bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between">
          <motion.div 
            initial={{ opacity: 0, x: -20 }} 
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Link href="/" className="flex items-center">
              {/* Black and white Rwanda Water Resources Board logo */}
              <div className="relative w-12 h-12 mr-3 grayscale">
                <svg width="48" height="48" viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
                  {/* Blue circle background */}
                  <circle cx="400" cy="270" r="250" fill="#2563EB" />
                  
                  {/* Sun rays */}
                  <path d="M400 120 L380 80 M400 120 L420 80 M400 120 L440 90 M400 120 L360 90 M400 120 L340 100 M400 120 L460 100" stroke="white" strokeWidth="12" />
                  
                  {/* Sun */}
                  <circle cx="400" cy="150" r="30" fill="#FACC15" />
                  
                  {/* Mountains */}
                  <path d="M250 270 L400 170 L550 270" stroke="white" strokeWidth="10" fill="none" />
                  <path d="M280 270 L400 200 L520 270" fill="#65A30D" />
                  
                  {/* Land stripes */}
                  <path d="M180 320 L620 320" stroke="#65A30D" strokeWidth="20" />
                  <path d="M200 350 L600 350" stroke="#65A30D" strokeWidth="15" />
                  <path d="M220 375 L580 375" stroke="#65A30D" strokeWidth="10" />
                  
                  {/* Water waves */}
                  <path d="M150 450 Q300 380, 450 450 T750 450" stroke="#3B82F6" strokeWidth="20" fill="none" />
                  <path d="M150 500 Q300 430, 450 500 T750 500" stroke="#3B82F6" strokeWidth="15" fill="none" />
                  <path d="M250 550 Q400 500, 550 550" stroke="#3B82F6" strokeWidth="25" fill="none" />
                </svg>
              </div>
              
              <span className="text-foreground font-semibold tracking-tight">Rwanda Water Permit Portal</span>
            </Link>
          </motion.div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex space-x-10">
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
                    {item.label}
                  </a>
                ) : (
                  <Link 
                    href={item.href}
                    className="text-muted-foreground hover:text-primary transition-colors text-sm font-medium"
                  >
                    {item.label}
                  </Link>
                )}
              </motion.div>
            ))}

          </nav>

          {/* CTA Button */}
          <motion.div 
            className="hidden md:block"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            {isDashboardPage ? (
              /* On dashboard pages, show the profile link if not already in profile */
              pathname === "/dashboard/profile" ? null : (
                <Link href="/dashboard/profile">
                  <Button variant="outline" className="rounded-full px-6">
                    MY PROFILE
                  </Button>
                </Link>
              )
            ) : isApplyPage ? (
              <Link href="/login">
                <Button className="bg-primary hover:bg-primary/90 rounded-full px-6">
                  LOGIN
                </Button>
              </Link>
            ) : isLoginPage || isRegisterPage ? (
              <Link href="/">
                <Button variant="outline" className="rounded-full px-6">
                  HOME
                </Button>
              </Link>
            ) : isInspectionPage || isReviewPage || isAssessmentPage || isVerificationPage || isAdminPage || isApproverPage || isManagementPage ? (
              /* Show profile icon on inspection, review, admin, and approver pages */
              <Link href="/dashboard/profile">
                <Avatar className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary transition-all">
                  <AvatarImage src={undefined} alt="Profile" />
                  <AvatarFallback>
                    <User className="h-5 w-5" />
                  </AvatarFallback>
                </Avatar>
              </Link>
            ) : (
              <Link href="/apply">
                <Button className="bg-primary hover:bg-primary/90 rounded-full px-6">
                  APPLY NOW
                </Button>
              </Link>
            )}
          </motion.div>

          {/* Mobile Navigation */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild className="md:hidden">
              <Button variant="ghost" size="icon" className="text-primary">
                <Menu className="h-6 w-6" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="border-l border-border">
              <div className="flex items-center justify-between mb-8 mt-2">
                <Link href="/" className="flex items-center" onClick={() => setIsOpen(false)}>
                  {/* Black and white Rwanda Water Resources Board logo (smaller for mobile) */}
                  <div className="relative w-8 h-8 mr-2 grayscale">
                    <svg width="32" height="32" viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* Blue circle background */}
                      <circle cx="400" cy="270" r="250" fill="#2563EB" />
                      
                      {/* Sun rays */}
                      <path d="M400 120 L380 80 M400 120 L420 80 M400 120 L440 90 M400 120 L360 90 M400 120 L340 100 M400 120 L460 100" stroke="white" strokeWidth="12" />
                      
                      {/* Sun */}
                      <circle cx="400" cy="150" r="30" fill="#FACC15" />
                      
                      {/* Mountains */}
                      <path d="M250 270 L400 170 L550 270" stroke="white" strokeWidth="10" fill="none" />
                      <path d="M280 270 L400 200 L520 270" fill="#65A30D" />
                      
                      {/* Land stripes */}
                      <path d="M180 320 L620 320" stroke="#65A30D" strokeWidth="20" />
                      <path d="M200 350 L600 350" stroke="#65A30D" strokeWidth="15" />
                      <path d="M220 375 L580 375" stroke="#65A30D" strokeWidth="10" />
                      
                      {/* Water waves */}
                      <path d="M150 450 Q300 380, 450 450 T750 450" stroke="#3B82F6" strokeWidth="20" fill="none" />
                      <path d="M150 500 Q300 430, 450 500 T750 500" stroke="#3B82F6" strokeWidth="15" fill="none" />
                      <path d="M250 550 Q400 500, 550 550" stroke="#3B82F6" strokeWidth="25" fill="none" />
                    </svg>
                  </div>
                  <span className="text-foreground font-semibold text-sm">Rwanda Water Permit Portal</span>
                </Link>
                <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-muted-foreground">
                  <X className="h-5 w-5" />
                </Button>
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
                      {item.label}
                    </a>
                  ) : (
                    <Link 
                      key={item.label}
                      href={item.href}
                      className="text-foreground hover:text-primary transition-colors text-base font-medium"
                      onClick={() => setIsOpen(false)}
                    >
                      {item.label}
                    </Link>
                  );
                })}

                <div className="pt-6 mt-6 border-t">
                  {isDashboardPage ? (
                    /* On dashboard pages, show the profile link if not already in profile */
                    pathname === "/dashboard/profile" ? null : (
                      <Link href="/dashboard/profile" onClick={() => setIsOpen(false)}>
                        <Button variant="outline" className="w-full rounded-full mt-4">
                          MY PROFILE
                        </Button>
                      </Link>
                    )
                  ) : isApplyPage ? (
                    <Link href="/login" onClick={() => setIsOpen(false)}>
                      <Button className="w-full bg-primary hover:bg-primary/90 rounded-full mt-4">
                        LOGIN
                      </Button>
                    </Link>
                  ) : isLoginPage || isRegisterPage ? (
                    <Link href="/" onClick={() => setIsOpen(false)}>
                      <Button variant="outline" className="w-full rounded-full mt-4">
                        HOME
                      </Button>
                    </Link>
                  ) : isInspectionPage || isReviewPage || isAssessmentPage || isVerificationPage || isAdminPage || isApproverPage || isManagementPage ? (
                    /* Hide button on inspection, review, and admin pages */
                    null
                  ) : (
                    <Link href="/apply" onClick={() => setIsOpen(false)}>
                      <Button className="w-full bg-primary hover:bg-primary/90 rounded-full mt-4">
                        APPLY NOW
                      </Button>
                    </Link>
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