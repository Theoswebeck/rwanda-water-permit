"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  UserCheck
} from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { MyDelegations } from "@/components/shared/my-delegations";

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
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  
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
        setSuccess("Profile updated successfully!");
        setIsEditing(false);
      }
    } catch (err) {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    clearMessages();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    if (passwordData.newPassword.length < 6) {
      setError("Password must be at least 6 characters long");
      return;
    }

    setIsLoading(true);

    try {
      const result = await changePassword(passwordData.newPassword);
      
      if (result.error) {
        setError(result.error);
      } else {
        setSuccess("Password updated successfully!");
        setPasswordData({
          currentPassword: "",
          newPassword: "",
          confirmPassword: ""
        });
      }
    } catch (err) {
      setError("An unexpected error occurred");
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

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin': return 'bg-red-100 text-red-800';
      case 'approver': return 'bg-purple-100 text-purple-800';
      case 'inspector': return 'bg-blue-100 text-blue-800';
      case 'reviewer': return 'bg-yellow-100 text-yellow-800';
      case 'applicant': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      case 'suspended': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Check if user is staff (can delegate roles)
  const isStaffUser = userProfile?.role && 
    ['reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin'].includes(userProfile.role);

  if (!userProfile) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading profile...</span>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Profile Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center space-x-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="text-lg font-semibold">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-2xl">{getDisplayName()}</CardTitle>
              <CardDescription className="flex items-center space-x-2 mt-1">
                <Mail className="h-4 w-4" />
                <span>{user?.email}</span>
              </CardDescription>
              <div className="flex items-center space-x-2 mt-2">
                <Badge className={getRoleColor(userProfile.role)}>
                  <Shield className="h-3 w-3 mr-1" />
                  {userProfile.role.charAt(0).toUpperCase() + userProfile.role.slice(1)}
                </Badge>
                <Badge className={getStatusColor(userProfile.status)}>
                  {userProfile.status.charAt(0).toUpperCase() + userProfile.status.slice(1)}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col items-end space-y-3">
              <div className="text-right text-sm text-gray-500">
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-1" />
                  Joined {new Date(userProfile.created_at).toLocaleDateString()}
                </div>
              </div>
              
              <div className="flex space-x-2">
                {/* Logout Button */}
                <LogoutButton size="sm" />
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Messages */}
      {error && (
        <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
          {error}
        </div>
      )}
      {success && (
        <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md">
          {success}
        </div>
      )}

      {/* Profile Management Tabs */}
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className={`grid w-full ${isStaffUser ? 'grid-cols-4' : 'grid-cols-3'}`}>
          <TabsTrigger value="profile">Profile Information</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="account">Account Details</TabsTrigger>
          {isStaffUser && (
            <TabsTrigger value="delegations" className="flex items-center gap-1">
              <UserCheck className="h-3.5 w-3.5" />
              Delegations
            </TabsTrigger>
          )}
        </TabsList>

        {/* Profile Information Tab */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>
                    Update your personal or company information
                  </CardDescription>
                </div>
                {!isEditing && (
                  <Button onClick={() => setIsEditing(true)} variant="outline">
                    Edit Profile
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!isEditing ? (
                // Read-only display
                <div className="space-y-6">
                  {userProfile.account_type === 'individual' ? (
                    <>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">First Name</h3>
                          <p className="mt-1 text-sm text-gray-600">{userProfile.first_name || "Not provided"}</p>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">Last Name</h3>
                          <p className="mt-1 text-sm text-gray-600">{userProfile.last_name || "Not provided"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">Phone Number</h3>
                        <p className="mt-1 text-sm text-gray-600">{userProfile.phone || "Not provided"}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">Company Name</h3>
                        <p className="mt-1 text-sm text-gray-600">{userProfile.company_name || "Not provided"}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">Company Phone</h3>
                          <p className="mt-1 text-sm text-gray-600">{userProfile.company_phone || "Not provided"}</p>
                        </div>
                        <div>
                          <h3 className="text-sm font-medium text-gray-900">Tax ID (TIN)</h3>
                          <p className="mt-1 text-sm text-gray-600">{userProfile.company_tin || "Not provided"}</p>
                        </div>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900">Company Address</h3>
                        <p className="mt-1 text-sm text-gray-600">{userProfile.company_address || "Not provided"}</p>
                      </div>
                    </>
                  )}
                  
                  {/* Only show Address field for individual accounts */}
                  {userProfile.account_type === 'individual' && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">Address</h3>
                      <p className="mt-1 text-sm text-gray-600">{userProfile.address || "Not provided"}</p>
                    </div>
                  )}
                </div>
              ) : (
                // Editable form
                <form onSubmit={handleProfileSubmit} className="space-y-4">
                  {userProfile.account_type === 'individual' ? (
                    <>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label htmlFor="first_name">First Name</Label>
                          <Input
                            id="first_name"
                            value={profileData.first_name || ""}
                            onChange={(e) => setProfileData(prev => ({ ...prev, first_name: e.target.value }))}
                            disabled={!isEditing}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label htmlFor="last_name">Last Name</Label>
                          <Input
                            id="last_name"
                            value={profileData.last_name || ""}
                            onChange={(e) => setProfileData(prev => ({ ...prev, last_name: e.target.value }))}
                            disabled={!isEditing}
                            className="mt-1"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                          id="phone"
                          value={profileData.phone || ""}
                          disabled={true}
                          readOnly
                          className="mt-1 bg-gray-50 cursor-not-allowed"
                          placeholder="Phone number cannot be changed"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label htmlFor="company_name">Company Name</Label>
                        <Input
                          id="company_name"
                          value={profileData.company_name || ""}
                          onChange={(e) => setProfileData(prev => ({ ...prev, company_name: e.target.value }))}
                          disabled={!isEditing}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="company_phone">Company Phone</Label>
                        <Input
                          id="company_phone"
                          value={profileData.company_phone || ""}
                          disabled={true}
                          readOnly
                          className="mt-1 bg-gray-50 cursor-not-allowed"
                          placeholder="Phone number cannot be changed"
                        />
                      </div>
                      <div>
                        <Label htmlFor="company_address">Company Address</Label>
                        <Input
                          id="company_address"
                          value={profileData.company_address || ""}
                          onChange={(e) => setProfileData(prev => ({ ...prev, company_address: e.target.value }))}
                          disabled={!isEditing}
                          className="mt-1"
                        />
                      </div>
                    </>
                  )}

                  {/* Only show Address field for individual accounts */}
                  {userProfile.account_type === 'individual' && (
                    <div>
                      <Label htmlFor="address">Address</Label>
                      <Input
                        id="address"
                        value={profileData.address || ""}
                        onChange={(e) => setProfileData(prev => ({ ...prev, address: e.target.value }))}
                        disabled={!isEditing}
                        className="mt-1"
                      />
                    </div>
                  )}

                  {isEditing && (
                    <div className="flex space-x-2 pt-4">
                      <Button type="submit" disabled={isLoading}>
                        {isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Changes
                          </>
                        )}
                      </Button>
                      <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => {
                          setIsEditing(false);
                          clearMessages();
                          // Reset form data
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
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Security Tab */}
        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>
                Manage your password and security preferences
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <Label htmlFor="new_password">New Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="new_password"
                      type={showPasswords.new ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, newPassword: e.target.value }))}
                      placeholder="Enter new password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPasswords(prev => ({ ...prev, new: !prev.new }))}
                    >
                      {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="confirm_password">Confirm New Password</Label>
                  <div className="relative mt-1">
                    <Input
                      id="confirm_password"
                      type={showPasswords.confirm ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      placeholder="Confirm new password"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3"
                      onClick={() => setShowPasswords(prev => ({ ...prev, confirm: !prev.confirm }))}
                    >
                      {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <Button type="submit" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Updating Password...
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4 mr-2" />
                      Update Password
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Account Details Tab */}
        <TabsContent value="account">
          <Card>
            <CardHeader>
              <CardTitle>Account Details</CardTitle>
              <CardDescription>
                View your account information and statistics
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Account Type</Label>
                  <div className="flex items-center space-x-2">
                    <Building className="h-4 w-4 text-gray-500" />
                    <span className="capitalize">{userProfile.account_type}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Account ID</Label>
                  <div className="flex items-center space-x-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="font-mono text-sm">{userProfile.id}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Applications Submitted</Label>
                  <div className="text-2xl font-bold text-blue-600">
                    {userProfile.applications_count || 0}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">Reviews Completed</Label>
                  <div className="text-2xl font-bold text-green-600">
                    {userProfile.reviews_count || 0}
                  </div>
                </div>

                {userProfile.id_type && userProfile.id_number && (
                  <>
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">ID Type</Label>
                      <div className="capitalize">{userProfile.id_type.replace('_', ' ')}</div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-medium">ID Number</Label>
                      <div className="font-mono">{userProfile.id_number}</div>
                    </div>
                  </>
                )}
              </div>


            </CardContent>
          </Card>
        </TabsContent>

        {/* Delegations Tab (Staff Only) */}
        {isStaffUser && (
          <TabsContent value="delegations">
            <MyDelegations />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
