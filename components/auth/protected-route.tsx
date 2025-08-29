"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { RefreshCw } from "lucide-react";

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

  useEffect(() => {
    if (loading) return; // Wait for auth state to load

    // If not authenticated, redirect to login
    if (!isAuthenticated || !user) {
      router.push('/login');
      return;
    }

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
          reviewer: '/review',
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
  }, [user, userProfile, loading, isAuthenticated, allowedRoles, redirectTo, requireProfile, router]);

  // Show loading state
  if (loading || !user || (requireProfile && !userProfile)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  // Check role access again (redundant but safe)
  if (allowedRoles.length > 0 && userProfile && !allowedRoles.includes(userProfile.role)) {
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