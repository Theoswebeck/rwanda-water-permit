"use client";

import { useEffect } from 'react';
import { sessionManager } from '@/lib/utils/session-manager';
import { useAuth } from '@/contexts/AuthContext';

export function SessionInitializer() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      sessionManager.initialize();
    }

    // Cleanup on unmount
    return () => {
      // Session manager handles its own cleanup
    };
  }, [isAuthenticated]);

  return null; // This component doesn't render anything
}
