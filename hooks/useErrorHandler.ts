import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

interface ErrorHandlerOptions {
  showNotification?: boolean;
  redirectToHome?: boolean;
  reloadPage?: boolean;
  goBack?: boolean;
}

export function useErrorHandler() {
  const router = useRouter();

  const handleError = useCallback((
    error: unknown, 
    operation: string = 'operation',
    options: ErrorHandlerOptions = {}
  ) => {
    const {
      showNotification = true,
      redirectToHome = false,
      reloadPage = false,
      goBack = true
    } = options;

    // Log the error for debugging
    console.error(`Failed to ${operation}:`, error);

    // Get error message
    const errorMessage = error instanceof Error ? error.message : `Failed to ${operation}`;

    // Show browser notification if enabled (fallback for user feedback)
    if (showNotification && typeof window !== 'undefined') {
      // Simple alert as fallback - you can replace with toast notifications
      window.alert(`❌ Error: ${errorMessage}\n\n🔄 Reloading previous page...`);
    }

    // Handle navigation based on options
    setTimeout(() => {
      if (redirectToHome) {
        router.push('/');
      } else if (reloadPage) {
        window.location.reload();
      } else if (goBack) {
        // Try to go back, fallback to reload if no history
        if (window.history.length > 1) {
          router.back();
        } else {
          window.location.reload();
        }
      }
    }, 1000); // Small delay to let user see the error message

    return errorMessage;
  }, [router]);

  const handleErrorWithReload = useCallback((error: unknown, operation: string = 'operation') => {
    return handleError(error, operation, { reloadPage: true });
  }, [handleError]);

  const handleErrorWithBack = useCallback((error: unknown, operation: string = 'operation') => {
    return handleError(error, operation, { goBack: true });
  }, [handleError]);

  const handleErrorWithHome = useCallback((error: unknown, operation: string = 'operation') => {
    return handleError(error, operation, { redirectToHome: true });
  }, [handleError]);

  return {
    handleError,
    handleErrorWithReload,
    handleErrorWithBack,
    handleErrorWithHome
  };
} 