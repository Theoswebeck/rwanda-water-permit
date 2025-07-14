"use client";

import { ReactNode } from 'react';
import { useSuspensionCheck } from '@/hooks/useSuspensionCheck';
import { SuspensionNotice } from './suspension-notice';
import { Loader2 } from 'lucide-react';

interface SuspensionGuardProps {
  children: ReactNode;
  onLogout?: () => void;
  onContactSupport?: () => void;
}

export function SuspensionGuard({ 
  children, 
  onLogout, 
  onContactSupport 
}: SuspensionGuardProps) {
  const { isSuspended, user, loading } = useSuspensionCheck();

  // Show loading state while checking suspension status
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Checking account status...</p>
        </div>
      </div>
    );
  }

  // Show suspension notice if user is suspended
  if (isSuspended && user) {
    return (
      <SuspensionNotice 
        user={user}
        onLogout={onLogout}
        onContactSupport={onContactSupport}
      />
    );
  }

  // Show normal content if user is not suspended
  return <>{children}</>;
} 