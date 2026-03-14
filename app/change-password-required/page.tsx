"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Eye, EyeOff, Key, Loader2, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function ChangePasswordRequiredPage() {
  const router = useRouter();
  const { changePassword, refreshProfile, userProfile, user, signOut } = useAuth();
  
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    // Validate passwords match
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    // Validate password length
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    // Validate password strength (at least one uppercase, one lowercase, one number)
    const hasUppercase = /[A-Z]/.test(newPassword);
    const hasLowercase = /[a-z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    
    if (!hasUppercase || !hasLowercase || !hasNumber) {
      setError("Password must contain at least one uppercase letter, one lowercase letter, and one number");
      return;
    }

    setIsLoading(true);

    try {
      const result = await changePassword(newPassword);
      
      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess("Password updated successfully! Redirecting...");
      
      // Refresh profile to get updated flags
      await refreshProfile();
      
      // Redirect to appropriate dashboard based on effective roles (base + delegated)
      setTimeout(() => {
        const roleRedirects: Record<string, string> = {
          admin: '/admin',
          approver: '/approver',
          verifier: '/verification',
          inspector: '/inspection',
          assessor: '/assessment',
          reviewer: '/review',
          applicant: '/dashboard'
        };

        const effectiveRoles = (userProfile?.effective_roles as string[] | undefined) || [];
        const rolePriority = ['admin', 'approver', 'verifier', 'inspector', 'reviewer', 'assessor', 'applicant'];
        const highestRole = rolePriority.find((r) => effectiveRoles.map(er => String(er).toLowerCase()).includes(r));
        const redirectRole = highestRole || userProfile?.role || 'applicant';
        const redirectPath = roleRedirects[redirectRole] || '/dashboard';
        router.push(redirectPath);
      }, 1500);
      
    } catch (err) {
      console.error("Password change error:", err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    router.push('/login');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
            <ShieldAlert className="h-6 w-6 text-amber-600" />
          </div>
          <CardTitle className="text-2xl">Password Change Required</CardTitle>
          <CardDescription className="text-base">
            Your account was created by an administrator. For security reasons, you must set a new password before continuing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {user && (
            <div className="mb-4 p-3 bg-gray-50 rounded-md text-sm text-gray-600">
              Logged in as: <strong>{user.email}</strong>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            
            {success && (
              <Alert className="bg-green-50 border-green-200">
                <AlertDescription className="text-green-700">{success}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter your new password"
                  required
                  disabled={isLoading || !!success}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  disabled={isLoading}
                >
                  {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm your new password"
                  required
                  disabled={isLoading || !!success}
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  disabled={isLoading}
                >
                  {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="text-xs text-gray-500 space-y-1">
              <p>Password requirements:</p>
              <ul className="list-disc list-inside ml-2">
                <li>At least 6 characters</li>
                <li>At least one uppercase letter</li>
                <li>At least one lowercase letter</li>
                <li>At least one number</li>
              </ul>
            </div>

            <Button 
              type="submit" 
              className="w-full"
              disabled={isLoading || !newPassword || !confirmPassword || !!success}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating Password...
                </>
              ) : (
                <>
                  <Key className="mr-2 h-4 w-4" />
                  Set New Password
                </>
              )}
            </Button>
          </form>

          <div className="mt-4 pt-4 border-t text-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleLogout}
              disabled={isLoading}
              className="text-gray-500 hover:text-gray-700"
            >
              Sign out and use a different account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

