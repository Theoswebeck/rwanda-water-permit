"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  redirectTo?: string;
  requireRole?: string[];
}

export function ProtectedRoute({ 
  children, 
  redirectTo = "/login",
  requireRole 
}: ProtectedRouteProps) {
  const { user, userProfile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      // If no user is authenticated, redirect to login
      if (!user) {
        console.log("🚫 No authenticated user, redirecting to login");
        router.push(redirectTo);
        return;
      }

      // If role is required and user doesn't have it, redirect
      if (requireRole && userProfile) {
        if (!requireRole.includes(userProfile.role)) {
          console.log("🚫 User doesn't have required role, redirecting");
          router.push("/unauthorized");
          return;
        }
      }
    }
  }, [user, userProfile, loading, router, redirectTo, requireRole]);

  // Show loading state while checking authentication
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated
  if (!user) {
    return null;
  }

  // Don't render if role check fails
  if (requireRole && userProfile && !requireRole.includes(userProfile.role)) {
    return null;
  }

  return <>{children}</>;
} 