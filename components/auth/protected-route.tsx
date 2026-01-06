"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { RefreshCw } from "lucide-react";

const SUPERUSER_EMAILS = new Set(["nizzogentl1@gmail.com", "nshutidavy@gmail.com"]);

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: string[];
  redirectTo?: string;
  requireProfile?: boolean;
}

export function ProtectedRoute({ 
  children, 
  allowedRoles = [], 
  redirectTo,
  requireProfile = true 
}: ProtectedRouteProps) {
  const router = useRouter();
  const { user, userProfile, loading, isAuthenticated } = useAuth();
  const isSuperuser = SUPERUSER_EMAILS.has(String(user?.email ?? "").trim().toLowerCase());

  useEffect(() => {
    if (loading) return; // Wait for auth state to load

    // If not authenticated, redirect to login
    if (!isAuthenticated || !user) {
      const redirect =
        typeof window !== "undefined"
          ? encodeURIComponent(window.location.pathname + window.location.search)
          : encodeURIComponent("/dashboard");
      router.replace(`/login?redirect=${redirect}`);
      return;
    }

    // Superusers can access all pages regardless of role/profile.
    if (isSuperuser) return;

    // If profile is required but not loaded, wait or redirect
    if (requireProfile && !userProfile) {
      // Could show loading or redirect to profile setup
      return;
    }

    // Check role-based access
    if (allowedRoles.length > 0 && userProfile) {
      if (!allowedRoles.includes(userProfile.role)) {
        // Redirect based on user role if access denied
        const roleRedirects = {
          admin: '/admin',
          approver: '/approver',
          inspector: '/inspection',
          assessor: '/assessment',
          reviewer: '/review',
          verifier: '/verification',
          applicant: '/dashboard'
        };
        
        const redirectPath = redirectTo || roleRedirects[userProfile.role as keyof typeof roleRedirects] || '/dashboard';
        router.push(redirectPath);
        return;
      }
    }

    // Check user status
    if (userProfile && (userProfile.status === 'suspended' || userProfile.status === 'inactive')) {
      router.push('/login?error=' + userProfile.status);
      return;
    }

    // Check if user must change password (admin-created staff accounts)
    // Skip this check if already on the change-password-required page
    if (userProfile && userProfile.must_change_password) {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      if (!currentPath.includes('/change-password-required')) {
        router.push('/change-password-required');
        return;
      }
    }
  }, [user, userProfile, loading, isAuthenticated, allowedRoles, redirectTo, requireProfile, router]);

  // Show loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Not authenticated: don't spin forever, show an actionable fallback
  if (!isAuthenticated || !user) {
    const redirect =
      typeof window !== "undefined"
        ? encodeURIComponent(window.location.pathname + window.location.search)
        : encodeURIComponent("/dashboard");

    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center max-w-md">
          <div className="flex items-center justify-center gap-2 mb-3">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="font-medium">Redirecting to login…</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            If this doesn’t move forward, your session check may be timing out. Click below to continue.
          </p>
          <Link
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
            href={`/login?redirect=${redirect}`}
          >
            Go to login
          </Link>
        </div>
      </div>
    );
  }

  // Authenticated but profile not ready: show a better state than infinite spinner
  if (!isSuperuser && requireProfile && !userProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6">
        <div className="text-center max-w-md">
          <div className="flex items-center justify-center gap-2 mb-3">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="font-medium">Loading your profile…</span>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            This can happen if the database is slow or unreachable. Try reloading the page.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  // Check role access again (redundant but safe)
  if (!isSuperuser && allowedRoles.length > 0 && userProfile && !allowedRoles.includes(userProfile.role)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-gray-600">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

// Higher-order component for role-specific protection
export function withRoleProtection(Component: React.ComponentType, allowedRoles: string[]) {
  return function ProtectedComponent(props: any) {
    return (
      <ProtectedRoute allowedRoles={allowedRoles}>
        <Component {...props} />
      </ProtectedRoute>
    );
  };
}

// Specific role guards
export const AdminOnly = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={['admin']}>{children}</ProtectedRoute>
);

export const ApproverOnly = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={['approver']}>{children}</ProtectedRoute>
);

export const InspectorOnly = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={['inspector']}>{children}</ProtectedRoute>
);

export const ReviewerOnly = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={['reviewer']}>{children}</ProtectedRoute>
);

export const ApplicantOnly = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={['applicant']}>{children}</ProtectedRoute>
);

export const StaffOnly = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute allowedRoles={['admin', 'approver', 'inspector', 'reviewer']}>
    {children}
  </ProtectedRoute>
);