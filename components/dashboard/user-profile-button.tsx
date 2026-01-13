"use client";

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

export function UserProfileButton() {
  const { user, userProfile, isAuthenticated } = useAuth();

  if (!isAuthenticated || !userProfile) {
    return null;
  }

  const getDisplayName = () => {
    if (userProfile.account_type === 'company') {
      return userProfile.company_name || "Company";
    }
    return `${userProfile.first_name || ""} ${userProfile.last_name || ""}`.trim() || "User";
  };

  const getInitials = () => {
    if (userProfile.account_type === 'company' && userProfile.company_name) {
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

  const primaryDashboard = roleDashboards[userProfile.role] || roleDashboards.applicant;
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
                <span className="text-sm font-medium">My Profile</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={primaryDashboard.href} className="flex items-center cursor-pointer rounded-md px-3 py-2 hover:bg-gray-50 transition-colors">
                <FileText className="mr-3 h-4 w-4 text-gray-500" />
                <span className="text-sm font-medium">{primaryDashboard.label}</span>
              </Link>
            </DropdownMenuItem>
            {isApplicant && (
              <DropdownMenuItem asChild>
                <Link href="/dashboard/settings" className="flex items-center cursor-pointer rounded-md px-3 py-2 hover:bg-gray-50 transition-colors">
                  <Settings className="mr-3 h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">Account Settings</span>
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