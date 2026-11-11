"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

interface RwbSidebarProps {
  isCollapsed: boolean;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onExpandSidebar: () => void;
  isHovered: boolean;
  setIsHovered: (hovered: boolean) => void;
}

interface MenuItem {
  title: string;
  href?: string;
  iconClass: string;
  badge?: string;
  subItems?: { title: string; href: string; iconClass?: string }[];
}

export const RwbSidebar: React.FC<RwbSidebarProps> = ({
  isCollapsed,
  isOpenMobile,
  onCloseMobile,
  onExpandSidebar,
  isHovered,
  setIsHovered,
}) => {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultTabByPath: Record<string, string> = {
    "/admin": "overview",
    "/approver": "approval",
    "/verification": "verification",
    "/review": "review",
    "/assessment": "assessment",
    "/inspection": "inspections",
    "/dashboard": "applications",
  };
  const currentTab = searchParams.get("tab") || defaultTabByPath[pathname] || "overview";
  const { userProfile } = useAuth();
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({
    "Admin Control Center": true,
    "Verification Control Center": true,
    "Approver Control Center": true,
    "Reviewer Control Center": true,
    "Assessor Control Center": true,
    "Inspection Control Center": true,
    "Applicant Portal": true,
    "Staff Workbenches": true,
  });

  const isDesktopMini = isCollapsed && !isHovered;
  const effectiveRoles = (userProfile?.effective_roles as string[] | undefined) || [];
  const rolePriority = ["admin", "approver", "verifier", "inspector", "reviewer", "assessor", "applicant"];
  const highestEffectiveRole = rolePriority.find((r) =>
    effectiveRoles.map((er) => String(er).toLowerCase()).includes(r)
  );
  const role = userProfile?.role?.toLowerCase() || highestEffectiveRole || "applicant";

  const toggleSubmenu = (title: string) => {
    if (isCollapsed && !isHovered) {
      onExpandSidebar();
    }
    setExpandedMenus((prev) => ({
      ...prev,
      [title]: !prev[title],
    }));
  };

  // Build role-specific navigation menu items
  const getMenuItems = (): MenuItem[] => {
    if (role === "admin") {
      return [
        {
          title: "Admin Control Center",
          iconClass: "fa fa-cogs",
          subItems: [
            { title: "System Overview", href: "/admin?tab=overview", iconClass: "fa fa-dashboard" },
            { title: "User Management", href: "/admin?tab=users", iconClass: "fa fa-users" },
            { title: "Applications Oversight", href: "/admin?tab=applications", iconClass: "fa fa-file-text" },
            { title: "Water Use Reports", href: "/admin?tab=water-reports", iconClass: "fa fa-tint" },
            { title: "Consolidated Map", href: "/admin?tab=map", iconClass: "fa fa-map" },
            { title: "Activity Logs", href: "/admin?tab=logs", iconClass: "fa fa-history" },
            { title: "Role Delegations", href: "/admin?tab=delegations", iconClass: "fa fa-user-shield" },
            { title: "API Key Access", href: "/admin?tab=api-access", iconClass: "fa fa-key" },
            { title: "Website Content", href: "/admin?tab=content", iconClass: "fa fa-edit" },
            { title: "Institutional Reports", href: "/admin?tab=reports", iconClass: "fa fa-chart-bar" },
            { title: "Permit Registry", href: "/approver?tab=permit-registry", iconClass: "fa fa-book" },
            { title: "Inspection Registry", href: "/approver?tab=inspection-registry", iconClass: "fa fa-list-alt" },
          ],
        },
        {
          title: "Staff Workbenches",
          iconClass: "fa fa-briefcase",
          subItems: [
            { title: "Approver Workbench", href: "/approver", iconClass: "fa fa-check-double" },
            { title: "Field Inspections", href: "/inspection", iconClass: "fa fa-clipboard-check" },
            { title: "Legal Review", href: "/review", iconClass: "fa fa-search" },
            { title: "Technical Assessment", href: "/assessment", iconClass: "fa fa-drafting-compass" },
            { title: "Verification Queue", href: "/verification", iconClass: "fa fa-user-check" },
          ],
        },
        {
          title: "Public Portals",
          iconClass: "fa fa-globe",
          subItems: [
            { title: "Applicant Portal", href: "/dashboard", iconClass: "fa fa-home" },
            { title: "New Application", href: "/new-application?mode=new", iconClass: "fa fa-plus-circle" },
            { title: "Public Water Dashboard", href: "/water-use-dashboard", iconClass: "fa fa-chart-line" },
          ],
        },
      ];
    }

    if (role === "approver") {
      return [
        {
          title: "Approver Control Center",
          iconClass: "fa fa-check-double",
          subItems: [
            { title: "Permitting", href: "/approver?tab=approval", iconClass: "fa fa-file-text" },
            { title: "Inspections", href: "/approver?tab=inspections", iconClass: "fa fa-clipboard-check" },
            { title: "Water Use Reports", href: "/approver?tab=water-reports", iconClass: "fa fa-tint" },
            { title: "Permit Registry", href: "/approver?tab=permit-registry", iconClass: "fa fa-book" },
            { title: "Inspection Registry", href: "/approver?tab=inspection-registry", iconClass: "fa fa-list-alt" },
            { title: "Management Dashboard", href: "/management", iconClass: "fa fa-tachometer-alt" },
          ],
        },
      ];
    }

    if (role === "inspector") {
      return [
        {
          title: "Inspection Control Center",
          iconClass: "fa fa-clipboard-check",
          subItems: [
            { title: "Field Inspections", href: "/inspection?tab=inspections", iconClass: "fa fa-clipboard-check" },
            { title: "Technical Assessment", href: "/inspection?tab=assessments", iconClass: "fa fa-tasks" },
            { title: "All Applications", href: "/inspection?tab=applications", iconClass: "fa fa-files-o" },
            { title: "Consolidated Map", href: "/inspection?tab=map", iconClass: "fa fa-map-marker" },
            { title: "Inspection Registry", href: "/inspection?tab=inspection-registry", iconClass: "fa fa-list-alt" },
            { title: "Management Dashboard", href: "/management", iconClass: "fa fa-tachometer-alt" },
          ],
        },
      ];
    }

    if (role === "reviewer") {
      return [
        {
          title: "Reviewer Control Center",
          iconClass: "fa fa-search",
          subItems: [
            { title: "Permitting", href: "/review?tab=review", iconClass: "fa fa-file-text" },
            { title: "Inspections", href: "/review?tab=inspections", iconClass: "fa fa-clipboard-check" },
            { title: "Water Use Reports", href: "/review?tab=water-reports", iconClass: "fa fa-tint" },
            { title: "Permit Registry", href: "/review?tab=permit-registry", iconClass: "fa fa-book" },
            { title: "Inspection Registry", href: "/review?tab=inspection-registry", iconClass: "fa fa-list-alt" },
            { title: "Management Dashboard", href: "/management", iconClass: "fa fa-tachometer-alt" },
          ],
        },
      ];
    }

    if (role === "assessor") {
      return [
        {
          title: "Assessor Control Center",
          iconClass: "fa fa-drafting-compass",
          subItems: [
            { title: "Permitting", href: "/assessment?tab=assessment", iconClass: "fa fa-file-text" },
            { title: "Inspections", href: "/assessment?tab=inspections", iconClass: "fa fa-clipboard-check" },
            { title: "Water Use Reports", href: "/assessment?tab=water-reports", iconClass: "fa fa-tint" },
            { title: "Permit Registry", href: "/assessment?tab=permit-registry", iconClass: "fa fa-book" },
            { title: "Inspection Registry", href: "/assessment?tab=inspection-registry", iconClass: "fa fa-list-alt" },
            { title: "Management Dashboard", href: "/management", iconClass: "fa fa-tachometer-alt" },
          ],
        },
      ];
    }

    if (role === "verifier") {
      return [
        {
          title: "Verification Control Center",
          iconClass: "fa fa-user-check",
          subItems: [
            { title: "Permitting", href: "/verification?tab=verification", iconClass: "fa fa-file-text" },
            { title: "Inspections", href: "/verification?tab=inspections", iconClass: "fa fa-clipboard-check" },
            { title: "Water Use Reports", href: "/verification?tab=water-reports", iconClass: "fa fa-tint" },
            { title: "Permit Registry", href: "/verification?tab=permit-registry", iconClass: "fa fa-book" },
            { title: "Inspection Registry", href: "/verification?tab=inspection-registry", iconClass: "fa fa-list-alt" },
            { title: "Management Dashboard", href: "/management", iconClass: "fa fa-tachometer-alt" },
          ],
        },
      ];
    }

    // Default: Applicant / Citizen / Enterprise
    return [
      {
        title: "Applicant Portal",
        iconClass: "fa fa-home",
        subItems: [
          { title: "My Applications", href: "/dashboard", iconClass: "fa fa-list-alt" },
          { title: "New Application", href: "/new-application?mode=new", iconClass: "fa fa-plus-circle" },
          { title: "Issued Permits", href: "/dashboard?tab=permits", iconClass: "fa fa-certificate" },
          { title: "Water Use Reports", href: "/dashboard?tab=reports", iconClass: "fa fa-tint" },
        ],
      },
    ];
  };

  const menuItems = getMenuItems();

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-slate-900/50 z-50 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      {/* Main Sidebar:
          - Mobile: slides in at 260px with full labels and submenus
          - Desktop Mini (isCollapsed && !isHovered): 80px width, centered icons
          - Desktop Expanded: 260px width
          - Desktop Hover-expanded: 260px overlay with shadow-2xl
      */}
      <aside
        onMouseEnter={() => isCollapsed && setIsHovered(true)}
        onMouseLeave={() => isCollapsed && setIsHovered(false)}
        className={cn(
          "fixed top-[60px] left-0 bottom-0 bg-white border-r border-[#e8ebed] flex flex-col transition-all duration-200 select-none overflow-y-auto",
          isDesktopMini ? "w-[260px] lg:w-[80px]" : "w-[260px]",
          isCollapsed && isHovered ? "shadow-2xl z-50" : "z-40",
          isOpenMobile ? "translate-x-0 z-50" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <div className="flex-1 py-3">
          <ul className={cn("space-y-0.5", isDesktopMini ? "px-2 lg:px-0" : "px-2")}>
            {menuItems.map((item, idx) => {
              const hasSub = !!item.subItems && item.subItems.length > 0;
              const isMenuOpen = !!expandedMenus[item.title];

              const checkUrlActive = (href?: string) => {
                if (!href) return false;
                if (href.includes("?tab=")) {
                  const [path, query] = href.split("?tab=");
                  return pathname === path && currentTab === query;
                }
                if (pathname === href) {
                  const currentQueryTab = searchParams.get("tab");
                  const defaultTab = defaultTabByPath[pathname];
                  return !currentQueryTab || currentQueryTab === defaultTab;
                }
                return false;
              };

              const isActive =
                checkUrlActive(item.href) ||
                (hasSub && item.subItems?.some((sub) => checkUrlActive(sub.href)));

              if (hasSub) {
                return (
                  <li key={`${item.title}-${idx}`}>
                    <button
                      type="button"
                      onClick={() => toggleSubmenu(item.title)}
                      title={isDesktopMini ? item.title : undefined}
                      className={cn(
                        "w-full flex items-center transition-colors cursor-pointer",
                        isDesktopMini
                          ? "px-3 py-2.5 justify-between text-sm lg:h-[48px] lg:px-0 lg:justify-center hover:bg-[#f3f5fa] rounded-sm"
                          : "px-3.5 py-2.5 justify-between text-sm font-semibold hover:bg-slate-100/80 rounded-sm",
                        isActive && "text-[#0072bc]"
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-center",
                          isDesktopMini ? "gap-3 lg:gap-0 lg:justify-center" : "gap-3"
                        )}
                      >
                        <i
                          className={cn(
                            item.iconClass,
                            "shrink-0 text-center",
                            isDesktopMini
                              ? "text-[16px] w-6 text-[#212b36] lg:w-auto lg:text-[18px]"
                              : "text-[16px] w-6 text-[#212b36]",
                            isActive && "text-[#0072bc]"
                          )}
                        />
                        <span
                          className={cn(
                            "truncate text-sm font-semibold text-[#212b36]",
                            isDesktopMini ? "block lg:hidden" : "block"
                          )}
                        >
                          {item.title}
                        </span>
                      </div>

                      <i
                        className={cn(
                          "fa fa-chevron-right text-[11px] text-slate-400 transition-transform duration-200 shrink-0",
                          isDesktopMini ? "inline-block lg:hidden" : "inline-block",
                          isMenuOpen && "rotate-90 text-slate-600"
                        )}
                      />
                    </button>

                    {/* Submenu Dropdown */}
                    {isMenuOpen && (
                      <ul
                        className={cn(
                          "pl-9 pr-2 py-1 space-y-1 animate-in fade-in slide-in-from-top-1 duration-150",
                          isDesktopMini && "block lg:hidden"
                        )}
                      >
                        {item.subItems!.map((sub, sIdx) => {
                          const isSubActive = checkUrlActive(sub.href);
                          return (
                            <li key={sIdx}>
                              <Link
                                href={sub.href}
                                onClick={() => {
                                  if (window.innerWidth < 1024) onCloseMobile();
                                }}
                                className={cn(
                                  "flex items-center gap-2.5 py-1.5 px-2.5 text-sm rounded-xs transition-colors",
                                  isSubActive
                                    ? "text-[#0072bc] font-bold bg-blue-50/80"
                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                                )}
                              >
                                {sub.iconClass && (
                                  <i
                                    className={cn(
                                      sub.iconClass,
                                      "text-xs w-4 text-center shrink-0",
                                      isSubActive ? "text-[#0072bc]" : "text-slate-400"
                                    )}
                                  />
                                )}
                                <span className="truncate">{sub.title}</span>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              }

              return (
                <li key={`${item.title}-${idx}`}>
                  <Link
                    href={item.href || "#"}
                    title={isDesktopMini ? item.title : undefined}
                    onClick={() => {
                      if (window.innerWidth < 1024) onCloseMobile();
                    }}
                    className={cn(
                      "flex items-center transition-colors",
                      isDesktopMini
                        ? "px-3.5 py-2.5 text-sm lg:h-[48px] lg:px-0 lg:justify-center hover:bg-[#f3f5fa] rounded-sm"
                        : "gap-3 px-3.5 py-2.5 text-sm font-semibold text-[#212b36] hover:bg-slate-100/80 rounded-sm",
                      isActive &&
                        (!isDesktopMini
                          ? "text-[#0072bc] bg-blue-50/60"
                          : "bg-blue-50/70 text-[#0072bc]")
                    )}
                  >
                    <i
                      className={cn(
                        item.iconClass,
                        "shrink-0 text-center",
                        isDesktopMini
                          ? "text-[16px] w-6 mr-3 lg:mr-0 lg:w-auto lg:text-[18px] text-[#212b36]"
                          : "text-[16px] w-6 mr-3 text-[#212b36]",
                        isActive && "text-[#0072bc]"
                      )}
                    />
                    <span
                      className={cn(
                        "truncate text-sm font-semibold text-[#212b36]",
                        isDesktopMini ? "block lg:hidden" : "block"
                      )}
                    >
                      {item.title}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Bottom Institutional Info */}
        {!isDesktopMini && (
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-500">
            <p className="font-semibold text-slate-700">RWB Water Permit</p>
            <p>Republic of Rwanda</p>
          </div>
        )}
      </aside>
    </>
  );
};

