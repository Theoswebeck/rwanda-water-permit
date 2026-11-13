"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteContent } from "@/lib/use-site-content";

export function Footer() {
  const pathname = usePathname();
  const { isAuthenticated } = useAuth();
  const siteContent = useSiteContent();

  const isOptionalShellRoute =
    pathname.startsWith("/contract/terms") ||
    pathname.startsWith("/permit/view") ||
    pathname.startsWith("/permit/map") ||
    pathname.startsWith("/water-use-dashboard");

  const isInternalDashboardRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/water-use-report") ||
    pathname.startsWith("/new-application") ||
    pathname.startsWith("/inspection") ||
    pathname.startsWith("/review") ||
    pathname.startsWith("/assessment") ||
    pathname.startsWith("/verification") ||
    pathname.startsWith("/verifier") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/approver") ||
    pathname.startsWith("/management") ||
    pathname.startsWith("/change-password-required") ||
    pathname.startsWith("/technical-assessment") ||
    (isAuthenticated && isOptionalShellRoute);

  const isLoginPage = pathname === "/login";
  const isRegisterPage = pathname === "/register";
  const isForgotPasswordPage = pathname.startsWith("/forgot-password");
  const isResetPasswordPage = pathname.startsWith("/reset-password");
  const isAuthPage = isLoginPage || isRegisterPage || isForgotPasswordPage || isResetPasswordPage;

  // Suppress public footer when inside internal dashboard/workbench pages (RWB layout has its own institutional footer),
  // on landing page (/), or on auth pages (/login, /register, /forgot-password).
  if (isInternalDashboardRoute || pathname === "/" || isAuthPage) {
    return null;
  }

  const userManualUrl =
    siteContent.user_manual_url ||
    "/assets/User_Manual_Guide_Rwanda_Water_Permit_Application_Portal.pdf";
  const guidelinesUrl =
    siteContent.guidelines_url || "/Water_Use_Permitting_Guidelines.pdf";

  return (
    <footer id="footer" style={{ background: "linear-gradient(135deg, #003d6b 0%, #0072bc 100%)" }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {/* Column 1: Brand & Description */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <Image
                src="/images/logo_New.png"
                alt="RWB"
                width={40}
                height={40}
                className="rounded-full border-2 border-white/40"
              />
              <div className="text-white font-extrabold text-sm uppercase tracking-wide leading-tight">
                Rwanda Water Resources Board
              </div>
            </div>
            <p className="text-blue-100 text-sm leading-relaxed mb-6">
              Official regulatory authority entrusted with ensuring sustainable water resources management, fair allocation, and protection of natural hydrological basins across the Republic of Rwanda.
            </p>
          </div>

          {/* Column 2: Useful Links */}
          <div>
            <h3 className="text-white font-bold text-base mb-5">Useful Links</h3>
            <ul className="space-y-3">
              {[
                { label: "Ministry of Environment", href: "https://environment.gov.rw", newTab: true },
                { label: "MINEMA", href: "https://minema.gov.rw", newTab: true },
                { label: "REMA", href: "https://rema.gov.rw", newTab: true },
                { label: "User Manual Guide", href: userManualUrl, newTab: true },
                { label: "Water Permitting Guidelines", href: guidelinesUrl, newTab: true },
                { label: "National Water Use Dashboard", href: "/#water-dashboard" },
              ].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    target={link.newTab || link.href.startsWith("http") ? "_blank" : undefined}
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-100 hover:text-white text-sm transition-colors"
                  >
                    <i className="fa fa-arrow-right text-xs text-blue-300" />
                    <span>{link.label}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Contact Us */}
          <div>
            <h3 className="text-white font-bold text-base mb-5">Contact Us</h3>
            <ul className="space-y-4">
              <li className="flex items-start gap-3 text-blue-100 text-sm">
                <i className="fa fa-map-marker-alt text-blue-300 mt-0.5 w-4 text-center shrink-0" />
                <span>KN 3 AV Avenue, Nyarugenge Pension Plaza, Sopetrade, Kigali</span>
              </li>
              <li className="flex items-center gap-3 text-blue-100 text-sm">
                <i className="fa fa-envelope text-blue-300 w-4 text-center shrink-0" />
                <a href="mailto:info@rwb.rw" className="hover:text-white transition-colors">
                  info@rwb.rw
                </a>
              </li>
              <li className="flex items-center gap-3 text-blue-100 text-sm">
                <i className="fa fa-phone-alt text-blue-300 w-4 text-center shrink-0" />
                <span>
                  Toll Free Line: <strong className="text-white">9977</strong>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div className="border-t border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-blue-200 text-xs">
            &copy; {new Date().getFullYear()} Rwanda Water Resources Board. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-blue-200 text-xs">
            <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
            <Link href="/apply" className="hover:text-white transition-colors">Apply for Permit</Link>
            <Link href="/forgot-password" className="hover:text-white transition-colors">Reset Password</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
