"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getQueryClient } from "@/lib/react-query-provider";
import type { User } from "@/types/database";
import type { SignupAccountType } from "@/lib/auth/account-types";

interface SignUpData {
  email: string;
  password: string;
  accountType: SignupAccountType;
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  province?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
  address?: string;
  companyName?: string;
  companyTIN?: string;
  companyAddress?: string;
  companyPhone?: string;
  phone?: string;
  idNumber?: string;
  idType?: string;
  identification?: { number: string; type: string };
}

type AuthUser = {
  id: string;
  email?: string;
  user_metadata?: {
    role?: string;
    status?: string;
    account_type?: string;
    [key: string]: unknown;
  };
};

interface AuthContextType {
  user: AuthUser | null;
  userProfile: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string; mustChangePassword?: boolean }>;
  signUp: (data: SignUpData & { emailCode?: string }) => Promise<{ error?: string; userId?: string }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfile: (updates: Partial<User>) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  changePassword: (newPassword: string) => Promise<{ error?: string }>;
  isApplicant: boolean;
  isAdmin: boolean;
  isReviewer: boolean;
  isInspector: boolean;
  isApprover: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

async function readJsonSafe(response: Response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    try {
      const response = await fetch("/api/auth/me", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
      });
      const data = await readJsonSafe(response);

      if (!response.ok || !data?.success) {
        setUser(null);
        setUserProfile(null);
        return;
      }

      setUser((data.user || null) as AuthUser | null);
      setUserProfile((data.profile || null) as User | null);
    } catch (err) {
      console.error("❌ refreshProfile error:", err);
      setUser(null);
      setUserProfile(null);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      await refreshProfile();
      setLoading(false);
    };
    void bootstrap();
  }, []);

  const signIn = async (email: string, password: string) => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await readJsonSafe(response);

      if (!response.ok || !data?.success) {
        return { error: data?.message || "Authentication failed" };
      }

      setUser((data.user || null) as AuthUser | null);
      await refreshProfile();
      return { mustChangePassword: Boolean(data.mustChangePassword) };
    } catch (err) {
      console.error("❌ signIn error:", err);
      return { error: "An unexpected error occurred" };
    }
  };

  const signUp = async (data: SignUpData & { emailCode?: string }) => {
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await readJsonSafe(response);
      if (!response.ok || !result?.success) {
        return { error: result?.message || "Signup failed" };
      }
      return { userId: result.userId as string | undefined };
    } catch (err) {
      console.error("❌ signUp error:", err);
      return { error: "An unexpected error occurred during signup" };
    }
  };

  const signOut = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("❌ signOut request failed:", err);
    } finally {
      setUser(null);
      setUserProfile(null);
      // Drop all cached query data so the next user (who may log in without a
      // full page reload) never sees the previous user's cached lists.
      try {
        getQueryClient().clear();
      } catch {
        // no-op — cache clearing is best-effort
      }
    }
  };

  const updateProfile = async (updates: Partial<User>) => {
    try {
      const response = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await readJsonSafe(response);
      if (!response.ok || !data?.success) {
        return { error: data?.message || "Profile update failed" };
      }
      setUser((data.user || null) as AuthUser | null);
      setUserProfile((data.profile || null) as User | null);
      return {};
    } catch (err) {
      console.error("❌ updateProfile error:", err);
      return { error: "An unexpected error occurred" };
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const response = await fetch("/api/auth/email/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, purpose: "password_reset" }),
      });
      const data = await readJsonSafe(response);
      if (!response.ok || !data?.success) {
        return { error: data?.message || "Failed to send reset code" };
      }
      return {};
    } catch (err) {
      console.error("❌ resetPassword error:", err);
      return { error: "An unexpected error occurred" };
    }
  };

  const changePassword = async (newPassword: string) => {
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword }),
      });
      const data = await readJsonSafe(response);
      if (!response.ok || !data?.success) {
        return { error: data?.message || "Failed to change password" };
      }
      await refreshProfile();
      return {};
    } catch (err) {
      console.error("❌ changePassword error:", err);
      return { error: "An unexpected error occurred" };
    }
  };

  const isApplicant = userProfile?.role === "applicant";
  const isAdmin = userProfile?.role === "admin";
  const isReviewer = userProfile?.role === "reviewer";
  const isInspector = userProfile?.role === "inspector";
  const isApprover = userProfile?.role === "approver";

  const value: AuthContextType = {
    user,
    userProfile,
    loading,
    isAuthenticated: Boolean(user),
    signIn,
    signOut,
    signUp,
    refreshProfile,
    updateProfile,
    resetPassword,
    changePassword,
    isApplicant,
    isAdmin,
    isReviewer,
    isInspector,
    isApprover,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
