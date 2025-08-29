"use client";

import { ProtectedRoute, ApplicantOnly } from "@/components/auth/protected-route";
import { ProfileManagement } from "@/components/profile/profile-management";

export default function ProfilePage() {
  return (
    <ProtectedRoute>
      <div className="container mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Profile Management</h1>
          <p className="text-gray-600 mt-2">
            Manage your account information and security settings
          </p>
        </div>
        
        <ProfileManagement />
      </div>
    </ProtectedRoute>
  );
}