"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  User,
  Mail,
  Phone,
  Building,
  MapPin,
  Calendar,
  Shield,
  Key,
  Eye,
  EyeOff,
  Save,
  Loader2,
  UserCheck,
  FileText,
  CheckCircle2,
  Hash,
  Edit3
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { MyDelegations } from "@/components/shared/my-delegations";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { PasswordStrength } from "@/components/auth/password-strength";
import { validatePassword } from "@/lib/security/password";

interface ProfileFormData {
  first_name?: string;
  last_name?: string;
  company_name?: string;
  company_tin?: string;
  phone?: string;
  company_phone?: string;
  company_address?: string;
  address?: string;
}

interface PasswordChangeData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export function ProfileManagement() {
  const { user, userProfile, updateProfile, changePassword } = useAuth();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(urlTab || "profile");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  // Profile form state
  const [profileData, setProfileData] = useState<ProfileFormData>({});

  // Password change state
  const [passwordData, setPasswordData] = useState<PasswordChangeData>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: ""
  });
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  });

  useEffect(() => {
    if (userProfile) {
      setProfileData({
        first_name: userProfile.first_name || "",
        last_name: userProfile.last_name || "",
        company_name: userProfile.company_name || "",
        company_tin: userProfile.company_tin || "",
        phone: userProfile.phone || "",
        company_phone: userProfile.company_phone || "",
        company_address: userProfile.company_address || "",
        address: userProfile.address || "",
      });
    }
  }, [userProfile]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();
    setIsLoading(true);

    try {
      const result = await updateProfile(profileData);

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(tx("Profile updated successfully!"));
        setIsEditing(false);
      }
    } catch {
      setError(tx("An unexpected error occurred"));
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError(tx("New passwords do not match"));
      return;
    }

    // Same policy the /api/auth/change-password route enforces.
    const strength = validatePassword(passwordData.newPassword, {
      email: user?.email,
      firstName: userProfile?.first_name,
      lastName: userProfile?.last_name,
    });
    if (!strength.valid) {
      setError(tx(strength.errors[0]));
      return;
    }

    setIsLoading(true);

    try {
      const result = await changePassword(passwordData.newPassword);

      if (result.error) {
        setError(result.error);
      } else {
        setSuccess(tx("Password updated successfully!"));
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        });
      }
    } catch {
      setError(tx("An unexpected error occurred"));
    } finally {
      setIsLoading(false);
    }
  };

  const getInitials = () => {
    if (userProfile?.account_type === 'company' && userProfile?.company_name) {
      return userProfile.company_name.split(' ').map(word => word[0]).join('').slice(0, 2).toUpperCase();
    }

    const firstName = userProfile?.first_name || "";
    const lastName = userProfile?.last_name || "";
    return `${firstName[0] || ""}${lastName[0] || ""}`.toUpperCase() || "U";
  };

  const getDisplayName = () => {
    if (userProfile?.account_type === 'company') {
      return userProfile?.company_name || "Company";
    }
    return `${userProfile?.first_name || ""} ${userProfile?.last_name || ""}`.trim() || "User";
  };

  const getRoleBadgeClass = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-50 text-red-700 border-red-200/80 font-semibold';
      case 'approver':
        return 'bg-purple-50 text-purple-700 border-purple-200/80 font-semibold';
      case 'inspector':
        return 'bg-blue-50 text-blue-700 border-blue-200/80 font-semibold';
      case 'reviewer':
        return 'bg-amber-50 text-amber-700 border-amber-200/80 font-semibold';
      case 'verifier':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200/80 font-semibold';
      case 'assessor':
        return 'bg-cyan-50 text-cyan-700 border-cyan-200/80 font-semibold';
      case 'applicant':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 font-semibold';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 font-semibold';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/80 font-medium';
      case 'inactive':
        return 'bg-slate-100 text-slate-700 border-slate-200 font-medium';
      case 'suspended':
        return 'bg-rose-50 text-rose-700 border-rose-200/80 font-medium';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-200 font-medium';
    }
  };

  // Check if user is staff (can delegate roles)
  const isStaffUser = userProfile?.role &&
    ['reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin'].includes(userProfile.role);

  if (!userProfile) {
    return (
      <div className="flex items-center justify-center p-12 bg-white rounded-2xl border border-slate-200/80">
        <Loader2 className="h-6 w-6 animate-spin text-[#0072bc]" />
        <span className="ml-3 text-slate-600 font-medium">{tx("Loading profile...")}</span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      {/* Profile Identity Card */}
      <Card className="border border-slate-200/80 bg-white rounded-2xl shadow-xs overflow-hidden">
        <div className="p-6 sm:p-7 bg-gradient-to-r from-blue-50/50 via-white to-slate-50/50">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start sm:items-center gap-4 min-w-0">
              <Avatar className="h-16 w-16 sm:h-20 sm:w-20 shrink-0 ring-4 ring-[#0072bc]/10 shadow-xs">
                <AvatarFallback className="bg-gradient-to-br from-[#0072bc] to-[#005a96] text-white text-xl sm:text-2xl font-bold tracking-tight">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight truncate">
                    {getDisplayName()}
                  </h2>
                </div>

                <div className="flex items-center gap-1.5 text-xs sm:text-sm text-slate-500 font-medium truncate">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{user?.email}</span>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Badge variant="outline" className={getRoleBadgeClass(userProfile.role)}>
                    <Shield className="h-3 w-3 mr-1" />
                    {userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)}
                  </Badge>

                  <Badge variant="outline" className={getStatusBadgeClass(userProfile.status)}>
                    <span className="h-1.5 w-1.5 rounded-full bg-current mr-1.5" />
                    {userProfile.status.charAt(0).toUpperCase() + userProfile.status.slice(1)}
                  </Badge>

                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200/80 font-medium capitalize">
                    <Building className="h-3 w-3 mr-1 text-slate-400" />
                    {userProfile.account_type}
                  </Badge>
                </div>
              </div>
            </div>

            <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-100">
              <div className="text-xs text-slate-500 flex items-center font-medium bg-white/80 border border-slate-200/70 px-3 py-1.5 rounded-lg">
                <Calendar className="h-3.5 w-3.5 mr-1.5 text-slate-400 shrink-0" />
                <span>{tx("Member since")} {new Date(userProfile.created_at).toLocaleDateString()}</span>
              </div>
              <LogoutButton size="sm" />
            </div>
          </div>
        </div>
      </Card>

      {/* Messages */}
      {error && (
        <div className="p-4 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-4 text-sm font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Profile Management Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100/90 border border-slate-200/80 rounded-xl w-full sm:w-auto h-auto">
          <TabsTrigger
            value="profile"
            className="flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg text-slate-600 data-[state=active]:bg-[#0072bc] data-[state=active]:text-white data-[state=active]:shadow-xs transition-all cursor-pointer"
          >
            <User className="h-4 w-4" />
            {tx("Profile")}
          </TabsTrigger>
          <TabsTrigger
            value="security"
            className="flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg text-slate-600 data-[state=active]:bg-[#0072bc] data-[state=active]:text-white data-[state=active]:shadow-xs transition-all cursor-pointer"
          >
            <Key className="h-4 w-4" />
            {tx("Security")}
          </TabsTrigger>
          <TabsTrigger
            value="account"
            className="flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg text-slate-600 data-[state=active]:bg-[#0072bc] data-[state=active]:text-white data-[state=active]:shadow-xs transition-all cursor-pointer"
          >
            <Shield className="h-4 w-4" />
            {tx("Account")}
          </TabsTrigger>
          {isStaffUser && (
            <TabsTrigger
              value="delegations"
              className="flex items-center gap-2 px-4 py-2 text-xs sm:text-sm font-semibold rounded-lg text-slate-600 data-[state=active]:bg-[#0072bc] data-[state=active]:text-white data-[state=active]:shadow-xs transition-all cursor-pointer"
            >
              <UserCheck className="h-4 w-4" />
              {tx("Delegations")}
            </TabsTrigger>
          )}
        </TabsList>

        {/* Profile Information Tab */}
        <TabsContent value="profile" className="space-y-4 m-0">
          <Card className="border border-slate-200/80 bg-white rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-100 bg-slate-50/40">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-lg font-bold text-slate-900">{tx("Profile Information")}</CardTitle>
                  <CardDescription className="text-xs sm:text-sm text-slate-500 mt-1">
                    {tx("Update your personal or company information")}
                  </CardDescription>
                </div>
                {!isEditing && (
                  <Button
                    onClick={() => setIsEditing(true)}
                    variant="outline"
                    className="shrink-0 flex items-center gap-1.5 h-9 px-3.5 border-slate-200 hover:bg-slate-50 font-medium text-xs sm:text-sm cursor-pointer rounded-lg"
                  >
                    <Edit3 className="h-3.5 w-3.5 text-slate-500" />
                    <span>{tx("Edit Profile")}</span>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-6">
              {!isEditing ? (
                // Read-only display
                <div className="space-y-6">
                  {userProfile.account_type === 'individual' ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 space-y-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          {tx("First Name")}
                        </div>
                        <div className="text-sm sm:text-base font-semibold text-slate-900">
                          {userProfile.first_name || tx("Not provided")}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 space-y-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-slate-400" />
                          {tx("Last Name")}
                        </div>
                        <div className="text-sm sm:text-base font-semibold text-slate-900">
                          {userProfile.last_name || tx("Not provided")}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 space-y-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {tx("Phone Number")}
                        </div>
                        <div className="text-sm sm:text-base font-semibold text-slate-900">
                          {userProfile.phone || tx("Not provided")}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 space-y-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          {tx("Address")}
                        </div>
                        <div className="text-sm sm:text-base font-semibold text-slate-900">
                          {userProfile.address || tx("Not provided")}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="sm:col-span-2 p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 space-y-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Building className="h-3.5 w-3.5 text-slate-400" />
                          {tx("Company Name")}
                        </div>
                        <div className="text-sm sm:text-base font-semibold text-slate-900">
                          {userProfile.company_name || tx("Not provided")}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 space-y-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Phone className="h-3.5 w-3.5 text-slate-400" />
                          {tx("Company Phone")}
                        </div>
                        <div className="text-sm sm:text-base font-semibold text-slate-900">
                          {userProfile.company_phone || tx("Not provided")}
                        </div>
                      </div>

                      <div className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 space-y-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <Hash className="h-3.5 w-3.5 text-slate-400" />
                          {tx("Tax ID (TIN)")}
                        </div>
                        <div className="text-sm sm:text-base font-semibold text-slate-900">
                          {userProfile.company_tin || tx("Not provided")}
                        </div>
                      </div>

                      <div className="sm:col-span-2 p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 space-y-1">
                        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" />
                          {tx("Company Address")}
                        </div>
                        <div className="text-sm sm:text-base font-semibold text-slate-900">
                          {userProfile.company_address || tx("Not provided")}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                // Editable form
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  {userProfile.account_type === 'individual' ? (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="first_name" className="text-xs font-semibold text-slate-700">{tx("First Name")}</Label>
                          <Input
                            id="first_name"
                            value={profileData.first_name || ""}
                            onChange={(e) => setProfileData(prev => ({ ...prev, first_name: e.target.value }))}
                            disabled={!isEditing}
                            className="mt-1.5 rounded-lg border-slate-200"
                          />
                        </div>
                        <div>
                          <Label htmlFor="last_name" className="text-xs font-semibold text-slate-700">{tx("Last Name")}</Label>
                          <Input
                            id="last_name"
                            value={profileData.last_name || ""}
                            onChange={(e) => setProfileData(prev => ({ ...prev, last_name: e.target.value }))}
                            disabled={!isEditing}
                            className="mt-1.5 rounded-lg border-slate-200"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="phone" className="text-xs font-semibold text-slate-700">{tx("Phone Number")}</Label>
                        <Input
                          id="phone"
                          value={profileData.phone || ""}
                          disabled={true}
                          readOnly
                          className="mt-1.5 bg-slate-50 text-slate-500 cursor-not-allowed rounded-lg border-slate-200"
                          placeholder={tx("Phone number cannot be changed")}
                        />
                      </div>
                      <div>
                        <Label htmlFor="address" className="text-xs font-semibold text-slate-700">{tx("Address")}</Label>
                        <Input
                          id="address"
                          value={profileData.address || ""}
                          onChange={(e) => setProfileData(prev => ({ ...prev, address: e.target.value }))}
                          disabled={!isEditing}
                          className="mt-1.5 rounded-lg border-slate-200"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label htmlFor="company_name" className="text-xs font-semibold text-slate-700">{tx("Company Name")}</Label>
                        <Input
                          id="company_name"
                          value={profileData.company_name || ""}
                          onChange={(e) => setProfileData(prev => ({ ...prev, company_name: e.target.value }))}
                          disabled={!isEditing}
                          className="mt-1.5 rounded-lg border-slate-200"
                        />
                      </div>
                      <div>
                        <Label htmlFor="company_phone" className="text-xs font-semibold text-slate-700">{tx("Company Phone")}</Label>
                        <Input
                          id="company_phone"
                          value={profileData.company_phone || ""}
                          disabled={true}
                          readOnly
                          className="mt-1.5 bg-slate-50 text-slate-500 cursor-not-allowed rounded-lg border-slate-200"
                          placeholder={tx("Phone number cannot be changed")}
                        />
                      </div>
                      <div>
                        <Label htmlFor="company_address" className="text-xs font-semibold text-slate-700">{tx("Company Address")}</Label>
                        <Input
                          id="company_address"
                          value={profileData.company_address || ""}
                          onChange={(e) => setProfileData(prev => ({ ...prev, company_address: e.target.value }))}
                          disabled={!isEditing}
                          className="mt-1.5 rounded-lg border-slate-200"
                        />
                      </div>
                    </>
                  )}

                  {isEditing && (
                    <div className="flex items-center space-x-3 pt-4 border-t border-slate-100">
                      <Button
                        type="submit"
                        disabled={isLoading}
                        className="bg-[#0072bc] hover:bg-[#005a96] text-white font-semibold text-sm px-5 h-10 rounded-lg shadow-xs cursor-pointer"
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            {tx("Saving...")}
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            {tx("Save Changes")}
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsEditing(false);
                          clearMessages();
                          if (userProfile) {
                            setProfileData({
                              first_name: userProfile.first_name || "",
                              last_name: userProfile.last_name || "",
                              company_name: userProfile.company_name || "",
                              company_tin: userProfile.company_tin || "",
                              phone: userProfile.phone || "",
                              company_phone: userProfile.company_phone || "",
                              company_address: userProfile.company_address || "",
                              address: userProfile.address || "",
                            });
                          }
                        }}
                        className="h-10 px-4 rounded-lg border-slate-200 hover:bg-slate-50 font-medium text-xs sm:text-sm cursor-pointer"
                      >
                        {tx("Cancel")}
                      </Button>
                    </div>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security" className="space-y-4 m-0">
          <Card className="border border-slate-200/80 bg-white rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-100 bg-slate-50/40">
              <CardTitle className="text-lg font-bold text-slate-900">{tx("Security Settings")}</CardTitle>
              <CardDescription className="text-xs sm:text-sm text-slate-500 mt-1">
                {tx("Manage your password and security credentials")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 max-w-xl">
              <form onSubmit={handlePasswordChange} className="space-y-5">
                <div>
                  <Label htmlFor="new_password" className="text-xs font-semibold text-slate-700">{tx("New Password")}</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="new_password"
                      type={showPasswords.new ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                      placeholder={tx("Enter new password")}
                      className="pr-10 rounded-lg border-slate-200"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                      onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                    >
                      {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                  <PasswordStrength
                    className="mt-2.5"
                    password={passwordData.newPassword}
                    context={{
                      email: user?.email,
                      firstName: userProfile?.first_name,
                      lastName: userProfile?.last_name,
                    }}
                  />
                </div>

                <div>
                  <Label htmlFor="confirm_password" className="text-xs font-semibold text-slate-700">{tx("Confirm New Password")}</Label>
                  <div className="relative mt-1.5">
                    <Input
                      id="confirm_password"
                      type={showPasswords.confirm ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder={tx("Confirm new password")}
                      className="pr-10 rounded-lg border-slate-200"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 text-slate-400 hover:text-slate-700 cursor-pointer"
                      onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                    >
                      {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="bg-[#0072bc] hover:bg-[#005a96] text-white font-semibold text-sm px-5 h-10 rounded-lg shadow-xs cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {tx("Updating Password...")}
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4 mr-2" />
                      {tx("Update Password")}
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Details Tab */}
        <TabsContent value="account" className="space-y-4 m-0">
          <Card className="border border-slate-200/80 bg-white rounded-2xl shadow-xs overflow-hidden">
            <CardHeader className="p-6 border-b border-slate-100 bg-slate-50/40">
              <CardTitle className="text-lg font-bold text-slate-900">{tx("Account Details")}</CardTitle>
              <CardDescription className="text-xs sm:text-sm text-slate-500 mt-1">
                {tx("View your institutional account metrics and identifiers")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl border border-slate-200/70 bg-gradient-to-br from-blue-50/40 to-slate-50/40 space-y-2">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-semibold uppercase tracking-wider">{tx("Account Type")}</span>
                    <Building className="h-4 w-4 text-[#0072bc]" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 capitalize">
                    {userProfile.account_type}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200/70 bg-gradient-to-br from-indigo-50/40 to-slate-50/40 space-y-2">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-semibold uppercase tracking-wider">{tx("Role Profile")}</span>
                    <Shield className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="text-xl font-bold text-slate-900 capitalize">
                    {userProfile.role}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200/70 bg-gradient-to-br from-cyan-50/40 to-slate-50/40 space-y-2">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-semibold uppercase tracking-wider">{tx("Applications")}</span>
                    <FileText className="h-4 w-4 text-[#0072bc]" />
                  </div>
                  <div className="text-2xl font-black text-[#0072bc]">
                    {userProfile.applications_count || 0}
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-200/70 bg-gradient-to-br from-emerald-50/40 to-slate-50/40 space-y-2">
                  <div className="flex items-center justify-between text-slate-500">
                    <span className="text-xs font-semibold uppercase tracking-wider">{tx("Reviews Completed")}</span>
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-black text-emerald-600">
                    {userProfile.reviews_count || 0}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 space-y-1">
                  <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{tx("System Account ID")}</Label>
                  <div className="flex items-center space-x-2 min-w-0 pt-1">
                    <User className="h-4 w-4 text-slate-400 shrink-0" />
                    <span className="font-mono text-xs text-slate-700 select-all break-all">{userProfile.id}</span>
                  </div>
                </div>

                {userProfile.id_type && userProfile.id_number && (
                  <div className="p-4 rounded-xl border border-slate-200/70 bg-slate-50/50 space-y-1">
                    <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {tx("National / Org ID")} ({userProfile.id_type.replace('_', ' ').toUpperCase()})
                    </Label>
                    <div className="flex items-center space-x-2 min-w-0 pt-1">
                      <Hash className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="font-mono text-xs text-slate-700">{userProfile.id_number}</span>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Delegations Tab (Staff Only) */}
        {isStaffUser && (
          <TabsContent value="delegations" className="space-y-4 m-0">
            <MyDelegations />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
