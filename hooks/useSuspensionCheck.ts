import { useAuth } from '@/contexts/AuthContext';
import type { User } from '@/types/database';

interface SuspensionInfo {
  isSuspended: boolean;
  user: User | null;
  loading: boolean;
}

export function useSuspensionCheck(): SuspensionInfo {
  const { userProfile, loading: authLoading } = useAuth();

  // If still loading auth state, show loading
  if (authLoading) {
    return {
      isSuspended: false,
      user: null,
      loading: true
    };
  }

  // If no user profile, they're not logged in (redirect will be handled by auth)
  if (!userProfile) {
    return {
      isSuspended: false,
      user: null,
      loading: false
    };
  }

  // Check if user is suspended
  const isSuspended = userProfile.status === 'suspended';

  return {
    isSuspended,
    user: userProfile,
    loading: false
  };
} 