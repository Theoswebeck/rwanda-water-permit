"use client";

import { useState, useEffect } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AlertTriangle, UserX, WifiOff, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { translateText } from "@/lib/i18n/translator";
import { AppLanguage, getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";

interface AuthErrorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRetry?: () => void;
  onLogout?: () => void;
  error: {
    type: 'connection' | 'profile_missing' | 'profile_error' | 'session_expired' | 'account_deleted' | 'generic';
    title: string;
    message: string;
    retryable?: boolean;
  };
}

export function AuthErrorDialog({
  isOpen,
  onClose,
  onRetry,
  onLogout,
  error
}: AuthErrorDialogProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  const getIcon = () => {
    switch (error.type) {
      case 'connection':
        return <WifiOff className="h-6 w-6 text-orange-500" />;
      case 'profile_missing':
      case 'profile_error':
      case 'account_deleted':
        return <UserX className="h-6 w-6 text-red-500" />;
      case 'session_expired':
        return <Shield className="h-6 w-6 text-yellow-500" />;
      default:
        return <AlertTriangle className="h-6 w-6 text-red-500" />;
    }
  };

  const handlePrimaryAction = () => {
    if (error.retryable && onRetry) {
      onRetry();
    } else if (onLogout) {
      onLogout();
    } else {
      onClose();
    }
  };

  const getPrimaryActionText = () => {
    if (error.retryable && onRetry) {
      return tx("Try Again");
    } else if (onLogout && (error.type === 'session_expired' || error.type === 'account_deleted' || error.type === 'profile_missing')) {
      return tx("Go to Login");
    }
    return tx("OK");
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={onClose}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center gap-3 mb-2">
            {getIcon()}
            <AlertDialogTitle className="text-lg font-semibold">
              {error.title}
            </AlertDialogTitle>
          </div>
          <AlertDialogDescription className="text-sm text-gray-600 leading-relaxed">
            {error.message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
          {error.retryable && onRetry && (
            <Button variant="outline" onClick={onClose} className="sm:mr-auto">
              {tx("Cancel")}
            </Button>
          )}
          <AlertDialogAction asChild>
            <Button 
              onClick={handlePrimaryAction}
              variant={error.type === 'connection' ? "default" : "destructive"}
              className="w-full sm:w-auto"
            >
              {getPrimaryActionText()}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Helper function to create error objects
export const createAuthError = (
  type: AuthErrorDialogProps['error']['type'],
  customMessage?: string
): AuthErrorDialogProps['error'] => {
  const errorConfigs = {
    connection: {
      title: "Connection Error",
      message: customMessage || "Unable to connect to our servers. Please check your internet connection and try again.",
      retryable: true
    },
    profile_missing: {
      title: "Account Not Found",
      message: customMessage || "Your account profile was not found. This may mean your account has been removed. Please contact support for assistance.",
      retryable: false
    },
    profile_error: {
      title: "Profile Load Error", 
      message: customMessage || "We couldn't load your account information. Please try again or contact support if the problem persists.",
      retryable: true
    },
    session_expired: {
      title: "Session Expired",
      message: customMessage || "Your session has expired for security reasons. Please log in again to continue.",
      retryable: false
    },
    account_deleted: {
      title: "Account Unavailable",
      message: customMessage || "Your account appears to have been removed. Please contact support for more information.",
      retryable: false
    },
    generic: {
      title: "Something Went Wrong",
      message: customMessage || "An unexpected error occurred. Please try again or contact support if the problem continues.",
      retryable: true
    }
  };

  return {
    type,
    ...errorConfigs[type]
  };
};
