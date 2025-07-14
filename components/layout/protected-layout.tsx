"use client";

import { ReactNode } from 'react';
import { SuspensionGuard } from '@/components/auth/suspension-guard';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedLayoutProps {
  children: ReactNode;
}

export function ProtectedLayout({ children }: ProtectedLayoutProps) {
  const router = useRouter();
  const { signOut } = useAuth();

  const handleLogout = async () => {
    try {
      await signOut();
      router.push('/login');
    } catch (error) {
      console.error('Error during logout:', error);
      // Still redirect to login even if signOut fails
      router.push('/login');
    }
  };

  const handleContactSupport = () => {
    // Redirect to contact page or open support modal
    router.push('/contact');
  };

  return (
    <SuspensionGuard 
      onLogout={handleLogout}
      onContactSupport={handleContactSupport}
    >
      {children}
    </SuspensionGuard>
  );
} 