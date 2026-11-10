"use client";

import React, { useState, useEffect, Suspense, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { RwbHeader } from "@/components/layout/rwb-header";
import { RwbSidebar } from "@/components/layout/rwb-sidebar";
import { RwbFooter } from "@/components/layout/rwb-footer";
import { Loader2 } from "lucide-react";

interface RwbDashboardLayoutProps {
  children: ReactNode;
  wide?: boolean;
}

export function RwbDashboardLayout({ children, wide = false }: RwbDashboardLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { userProfile, loading, isAuthenticated } = useAuth();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const savedState = localStorage.getItem("rwb_mini_sidebar");
    if (savedState === "true") {
      setIsCollapsed(true);
    }
  }, []);

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated) {
      router.push("/login");
      return;
    }

    if (userProfile?.must_change_password) {
      if (!pathname.includes("/change-password-required")) {
        router.push("/change-password-required");
      }
    }
  }, [userProfile, loading, isAuthenticated, router, pathname]);

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("rwb_mini_sidebar", String(next));
      if (!next) {
        setIsHovered(false);
      }
      return next;
    });
  };

  const handleExpandSidebar = () => {
    setIsCollapsed(false);
    setIsHovered(false);
    localStorage.setItem("rwb_mini_sidebar", "false");
  };

  // Show spinner only while auth state is unknown
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f3f5fa] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0072bc]" />
      </div>
    );
  }

  // If the user MUST change their password, only allow the change-password page
  // to render the full shell. Any other protected page shows a redirect spinner.
  const isChangePasswordPage = pathname.includes("/change-password-required");

  if (userProfile?.must_change_password && !isChangePasswordPage) {
    return (
      <div className="min-h-screen bg-[#f3f5fa] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#0072bc]" />
      </div>
    );
  }

  // The change-password page does NOT use this layout wrapper — it renders its own
  // standalone centered card. If it reaches here somehow, just render children.
  return (
    <div className="min-h-screen bg-[#f3f5fa] text-[#212529] font-sans antialiased">
      {/* Fixed 60px Blue Header */}
      <RwbHeader
        isCollapsed={isCollapsed}
        isHovered={isHovered}
        setIsHovered={setIsHovered}
        onToggleCollapse={handleToggleCollapse}
        onToggleMobileSidebar={() => setMobileOpen((prev) => !prev)}
      />

      <div className="flex">
        {/* Sidebar */}
        <Suspense fallback={null}>
          <RwbSidebar
            isCollapsed={isCollapsed}
            isHovered={isHovered}
            setIsHovered={setIsHovered}
            isOpenMobile={mobileOpen}
            onCloseMobile={() => setMobileOpen(false)}
            onExpandSidebar={handleExpandSidebar}
          />
        </Suspense>

        {/* Main Content Area */}
        <main
          className={`flex-1 min-w-0 pt-[60px] pb-[46px] transition-all duration-200 ${
            isCollapsed ? "lg:pl-[80px]" : "lg:pl-[260px]"
          }`}
        >
          <div className={`${wide ? "max-w-[100rem]" : "max-w-7xl"} mx-auto p-4 sm:p-6 w-full`}>
            {children}
          </div>
        </main>
      </div>

      {/* Fixed Bottom Blue Footer */}
      <RwbFooter />
    </div>
  );
}
