"use client";

import { useState, useEffect } from "react";
import { translateText } from "@/lib/i18n/translator";
import { AppLanguage, getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { User, FileText, Settings, Shield } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { useAuth } from "@/contexts/AuthContext";
import Link from "next/link";
import { isOrganisationAccountType } from "@/lib/auth/account-types";

export function UserProfileButton() {
  const { user, userProfile, isAuthenticated } = useAuth();
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  if (!isAuthenticated || !userProfile) {
    return null;
  }

  const getDisplayName = () => {
    if (isOrganisationAccountType(userProfile.account_type)) {
      return userProfile.company_name || tx("Organisation");
    }
    return `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim() || tx("User");
  };

  const getInitials = () => {
    if (isOrganisationAccountType(userProfile.account_type) && userProfile.company_name) {
      return userProfile.company_name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
    }
    
    const firstName = userProfile.first_name || "";
    const lastName = userProfile.last_name || "";
    return `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "U";
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'approver': return 'bg-purple-100 text-purple-800';
      case 'inspector': return 'bg-blue-100 text-blue-800';
      case 'reviewer': return 'bg-yellow-100 text-yellow-800';
      case 'verifier': return 'bg-indigo-100 text-indigo-800';
      case 'assessor': return 'bg-orange-100 text-orange-800';
      case 'applicant': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const roleDashboards: Record<string, { href: string; label: string }> = {
    admin: { href: "/admin", label: "Admin Dashboard" },
    approver: { href: "/approver", label: "Approver Dashboard" },
    inspector: { href: "/inspection", label: "Inspection Dashboard" },
    reviewer: { href: "/review", label: "Review Dashboard" },
    assessor: { href: "/assessment", label: "Assessment Dashboard" },
    verifier: { href: "/verification", label: "Verification Dashboard" },
    applicant: { href: "/dashboard", label: "My Applications" },
  };

  // Use effective roles (base + delegated) so delegated approvers see Approver Dashboard link
  const effectiveRoles = (userProfile?.effective_roles as string[] | undefined) ||
    (user?.user_metadata?.effective_roles as string[] | undefined) ||
    [];
  const normalizedEffective = effectiveRoles.map((r) => String(r ?? "").trim().toLowerCase()).filter(Boolean);
  const rolePriority = ["admin", "approver", "verifier", "inspector", "reviewer", "assessor", "applicant"];
  const highestRole = rolePriority.find((r) => normalizedEffective.includes(r));
  const primaryRole = highestRole ?? userProfile.role ?? "applicant";
  const primaryDashboard = roleDashboards[primaryRole] || roleDashboards.applicant;

  // All dashboards user can access via effective roles (for delegated users)
  const accessibleDashboards = rolePriority
    .filter((r) => normalizedEffective.includes(r));
  const isApplicant = userProfile.role === "applicant";

  return (
    <div className="fixed top-4 right-4 z-50">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Avatar className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all duration-200 shadow-lg">
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64 p-0 shadow-lg border-0 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center justify-start gap-3 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b">
            <Avatar className="h-12 w-12 ring-2 ring-white shadow-md">
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white font-semibold text-lg">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col space-y-1 leading-none flex-1 min-w-0">
              <p className="font-medium text-gray-900 truncate">{getDisplayName()}</p>
              <p className="text-sm text-gray-600 truncate">{user?.email}</p>
              <Badge className={`w-fit text-xs mt-1 ${getRoleBadgeColor(userProfile.role)}`}>
                <Shield className="h-3 w-3 mr-1" />
                {userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)}
              </Badge>
            </div>
          </div>
          <div className="p-2">
            <DropdownMenuItem asChild>
              <Link href="/dashboard/profile" className="flex items-center cursor-pointer rounded-md px-3 py-2 hover:bg-gray-50 transition-colors">
                <User className="mr-3 h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">{tx("My Profile")}</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={primaryDashboard.href} className="flex items-center cursor-pointer rounded-md px-3 py-2 hover:bg-gray-50 transition-colors">
                <FileText className="mr-3 h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">{tx(primaryDashboard.label)}</span>
              </Link>
            </DropdownMenuItem>
            {accessibleDashboards.length > 1 && (
              <>
                {accessibleDashboards
                  .filter((r) => roleDashboards[r] && roleDashboards[r].href !== primaryDashboard.href)
                  .map((r) => (
                    <DropdownMenuItem key={r} asChild>
                      <Link href={roleDashboards[r].href} className="flex items-center cursor-pointer rounded-md px-3 py-2 hover:bg-gray-50 transition-colors">
                        <Shield className="mr-3 h-4 w-4 text-gray-500" />
                        <span className="text-sm font-medium">{tx(roleDashboards[r].label)}</span>
                      </Link>
                    </DropdownMenuItem>
                  ))}
              </>
            )}
            {isApplicant && (
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" className="flex items-center cursor-pointer rounded-md px-3 py-2 hover:bg-gray-50 transition-colors">
                  <Settings className="mr-3 h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">{tx("Account Settings")}</span>
                </Link>
              </DropdownMenuItem>
            )}
          </div>
          <DropdownMenuSeparator className="my-1" />
          <div className="p-2">
            <LogoutButton variant="dropdown" />
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
} 