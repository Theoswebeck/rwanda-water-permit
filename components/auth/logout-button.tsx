"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { translateText } from "@/lib/i18n/translator";
import { AppLanguage, getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { Button } from "@/components/ui/button";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { 
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { 
  LogOut, 
  RefreshCw, 
  AlertTriangle 
} from "lucide-react";

interface LogoutButtonProps {
  variant?: "button" | "dropdown" | "icon";
  size?: "sm" | "md" | "lg";
  className?: string;
  showIcon?: boolean;
  showText?: boolean;
}

export function LogoutButton({ 
  variant = "button", 
  size = "md", 
  className = "",
  showIcon = true,
  showText = true
}: LogoutButtonProps) {
  const { signOut } = useAuth();
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  const handleLogout = async () => {
    setIsLoggingOut(true);
    
    try {
      // Sign out and wait for it to complete
      await signOut();
      
      // Force a hard redirect to homepage to completely refresh the app state
      window.location.replace("/");
    } catch (err) {
      console.error("Logout error:", err);
      // Even if signOut fails, redirect to homepage
      window.location.replace("/");
    }
  };

  const LogoutContent = () => (
    <>
      {isLoggingOut ? (
        <>
          {showIcon && <RefreshCw className="h-4 w-4 animate-spin" />}
          {showText && <span className={showIcon ? "ml-2" : ""}>{tx("Signing out...")}</span>}
        </>
      ) : (
        <>
          {showIcon && <LogOut className="h-4 w-4" />}
          {showText && <span className={showIcon ? "ml-2" : ""}>{tx("Sign Out")}</span>}
        </>
      )}
    </>
  );

  const LogoutDialog = ({ children }: { children: React.ReactNode }) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <div className="flex items-center space-x-3">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1">
              <AlertDialogTitle className="text-lg font-semibold">
                {tx("Sign Out Confirmation")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-sm text-gray-600 mt-1">
                {tx("Are you sure you want to sign out? You'll need to log in again to access your account.")}
              </AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 gap-2">
          <AlertDialogCancel
            className="sm:flex-none"
            disabled={isLoggingOut}
          >
            {tx("Cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white sm:flex-none"
            disabled={isLoggingOut}
          >
            {isLoggingOut ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                {tx("Signing out...")}
              </>
            ) : (
              <>
                <LogOut className="h-4 w-4 mr-2" />
                {tx("Sign Out")}
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  if (variant === "dropdown") {
    return (
      <LogoutDialog>
        <DropdownMenuItem 
          className={`cursor-pointer text-red-600 focus:bg-red-50 focus:text-red-700 ${className}`}
          onSelect={(e) => e.preventDefault()}
        >
          <LogoutContent />
        </DropdownMenuItem>
      </LogoutDialog>
    );
  }

  if (variant === "icon") {
    return (
      <LogoutDialog>
        <Button
          variant="ghost"
          size="sm"
          className={`h-9 w-9 p-0 text-red-600 hover:bg-red-50 hover:text-red-700 ${className}`}
          disabled={isLoggingOut}
        >
          <LogoutContent />
        </Button>
      </LogoutDialog>
    );
  }

  // Default button variant
  const buttonSizes = {
    sm: "text-sm px-3 py-2",
    md: "text-sm px-4 py-2",
    lg: "text-base px-6 py-3"
  };

  return (
    <LogoutDialog>
      <Button
        variant="outline"
        size={size}
        className={`border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 transition-colors ${buttonSizes[size]} ${className}`}
        disabled={isLoggingOut}
      >
        <LogoutContent />
      </Button>
    </LogoutDialog>
  );
}
