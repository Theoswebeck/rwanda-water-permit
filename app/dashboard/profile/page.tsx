"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Camera, Check, Pencil, User, Building2, LogOut } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const { user, userProfile, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<"applications">("applications");
  const [isEditing, setIsEditing] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const router = useRouter();
  
  // Debug logging
  console.log('🔍 Profile page render - User:', user?.id, 'Profile:', userProfile?.id, 'Loading:', loading);

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      console.log('🚪 Starting logout process...');
      
      // Add timeout to prevent hanging
      const logoutPromise = signOut();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Logout timeout')), 5000); // 5 second timeout
      });

      try {
        await Promise.race([logoutPromise, timeoutPromise]);
        console.log('✅ Logout successful via signOut');
      } catch (timeoutError) {
        console.log('⏰ Logout timed out, forcing manual cleanup');
        // Clear all possible browser storage if signOut hangs
        try {
          localStorage.clear();
          sessionStorage.clear();
          // Clear any potential supabase storage
          Object.keys(localStorage).forEach(key => {
            if (key.includes('supabase')) {
              localStorage.removeItem(key);
            }
          });
        } catch (storageError) {
          console.log('Storage clear error:', storageError);
        }
      }
      
      console.log('🔄 Redirecting to login...');
      
      // Try router.push first, fallback to window.location
      try {
        router.push('/login');
        // Give router a moment to work, then force redirect if needed
        setTimeout(() => {
          if (window.location.pathname !== '/login') {
            console.log('🔄 Router redirect failed, using window.location');
            window.location.href = '/login';
          }
        }, 1000);
      } catch (routerError) {
        console.log('🔄 Router failed, using window.location immediately');
        window.location.href = '/login';
      }
      
    } catch (error) {
      console.error('❌ Logout error:', error);
      // Force redirect even on error
      console.log('🔄 Forcing redirect despite error...');
      window.location.href = '/login';
    } finally {
      setIsLoggingOut(false);
    }
  };
  
  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!userProfile) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-4 py-6">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">Unable to load profile information.</p>
            <div className="text-sm text-gray-500">
              <p>Debug Info:</p>
              <p>User authenticated: {user ? '✅ Yes' : '❌ No'}</p>
              <p>User ID: {user?.id || 'N/A'}</p>
              <p>Profile loaded: {userProfile ? '✅ Yes' : '❌ No'}</p>
              <p>Loading state: {loading ? 'Loading...' : 'Complete'}</p>
            </div>
            <Button onClick={() => window.location.reload()}>
              Retry Loading Profile
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Helper function to get display name
  const getDisplayName = () => {
    if (userProfile.account_type === 'company') {
      return userProfile.company_name || 'Company User';
    }
    return `${userProfile.first_name || ''} ${userProfile.last_name || ''}`.trim() || 'User';
  };

  // Helper function to get initials
  const getInitials = () => {
    if (userProfile.account_type === 'company') {
      const company = userProfile.company_name || 'CU';
      return company.split(' ').map(word => word[0]).join('').toUpperCase().slice(0, 2);
    }
    const firstName = userProfile.first_name || '';
    const lastName = userProfile.last_name || '';
    return `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase() || 'U';
  };

  // Helper function to get full address
  const getFullAddress = () => {
    const parts = [
      userProfile.address,
      userProfile.cell,
      userProfile.sector,
      userProfile.district,
      userProfile.province
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : 'Not specified';
  };

  // Format member since date
  const getMemberSince = () => {
    if (userProfile.created_at) {
      return new Date(userProfile.created_at).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
    }
    return 'N/A';
  };

  return (
    <ProtectedRoute>
      <DashboardLayout>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="container mx-auto px-4 py-6"
        >
          <div className="flex items-center mb-6">
            <Link href="/dashboard">
              <Button variant="ghost" className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="md:col-span-1">
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4 relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={undefined} alt={getDisplayName()} />
                    <AvatarFallback className="text-2xl">{getInitials()}</AvatarFallback>
                  </Avatar>
                  <Button variant="outline" size="icon" className="absolute bottom-0 right-1/3 rounded-full h-8 w-8">
                    <Camera className="h-4 w-4" />
                    <span className="sr-only">Upload photo</span>
                  </Button>
                </div>
                <CardTitle className="flex items-center justify-center gap-2">
                  {userProfile.account_type === 'company' && (
                    <Building2 className="h-5 w-5 text-muted-foreground" />
                  )}
                  {getDisplayName()}
                </CardTitle>
                <CardDescription>{userProfile.email}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Account Status</span>
                    <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                      userProfile.status === 'active' 
                        ? 'text-green-600 bg-green-100' 
                        : 'text-red-600 bg-red-100'
                    }`}>
                      {userProfile.status === 'active' ? 'Active' : userProfile.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Member Since</span>
                    <span className="text-sm">{getMemberSince()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Account Type</span>
                    <span className="text-sm capitalize">{userProfile.account_type}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Role</span>
                    <span className="text-sm capitalize">{userProfile.role}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-2">
                <Button variant="outline" className="w-full">Account Settings</Button>
                <Button 
                  variant="outline" 
                  className="w-full border-red-500 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-600"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                >
                  {isLoggingOut ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600 mr-2"></div>
                      Logging out...
                    </>
                  ) : (
                    <>
                      <LogOut className="h-4 w-4 mr-2" />
                      Logout
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
          
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>
                    {userProfile.account_type === 'company' ? 'Company Information' : 'Personal Information'}
                  </CardTitle>
                  <CardDescription>
                    {userProfile.account_type === 'company' ? 'Manage your company details' : 'Manage your personal details'}
                  </CardDescription>
                </div>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setIsEditing(!isEditing)}
                >
                  {isEditing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                </Button>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="basic" className="w-full">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="basic">Basic Info</TabsTrigger>
                    <TabsTrigger value="identification">
                      {userProfile.account_type === 'company' ? 'Business Info' : 'Identification'}
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="basic" className="space-y-4 pt-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {userProfile.account_type === 'company' ? (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="companyName">Company Name</Label>
                            <Input 
                              id="companyName" 
                              defaultValue={userProfile.company_name || ''} 
                              disabled={!isEditing} 
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="companyTin">Company TIN</Label>
                            <Input 
                              id="companyTin" 
                              defaultValue={userProfile.company_tin || ''} 
                              disabled={!isEditing} 
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="companyPhone">Company Phone</Label>
                            <Input 
                              id="companyPhone" 
                              defaultValue={userProfile.company_phone || ''} 
                              disabled={!isEditing} 
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="companyAddress">Company Address</Label>
                            <Input 
                              id="companyAddress" 
                              defaultValue={userProfile.company_address || ''} 
                              disabled={!isEditing} 
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label htmlFor="firstName">First Name</Label>
                            <Input 
                              id="firstName" 
                              defaultValue={userProfile.first_name || ''} 
                              disabled={!isEditing} 
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="lastName">Last Name</Label>
                            <Input 
                              id="lastName" 
                              defaultValue={userProfile.last_name || ''} 
                              disabled={!isEditing} 
                            />
                          </div>
                        </>
                      )}
                      <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input 
                          id="email" 
                          defaultValue={userProfile.email} 
                          disabled={!isEditing} 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input 
                          id="phone" 
                          defaultValue={userProfile.phone || userProfile.mobile_phone || ''} 
                          disabled={!isEditing} 
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="address">Full Address</Label>
                        <Input 
                          id="address" 
                          defaultValue={getFullAddress()} 
                          disabled={!isEditing} 
                        />
                      </div>
                    </div>
                    {isEditing && (
                      <div className="flex justify-end">
                        <Button className="mt-4">Save Changes</Button>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="identification" className="space-y-4 pt-4">
                    {userProfile.account_type === 'company' ? (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="incorporationCert">Incorporation Certificate Number</Label>
                          <Input 
                            id="incorporationCert" 
                            defaultValue={userProfile.incorporation_certificate_number || ''} 
                            disabled={!isEditing} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Business License</Label>
                          <div className="border rounded-md p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <Building2 className="h-5 w-5 text-muted-foreground" />
                                <span>Business Registration Documents</span>
                              </div>
                              <Button variant="outline" size="sm">Upload</Button>
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="idNumber">ID Number</Label>
                          <Input 
                            id="idNumber" 
                            defaultValue={userProfile.id_number || ''} 
                            disabled={!isEditing} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="idType">ID Type</Label>
                          <Input 
                            id="idType" 
                            defaultValue={userProfile.id_type || ''} 
                            disabled={!isEditing} 
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>ID Documents</Label>
                          <div className="border rounded-md p-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-2">
                                <User className="h-5 w-5 text-muted-foreground" />
                                <span>National ID Card</span>
                              </div>
                              <Button variant="outline" size="sm">View</Button>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                    {isEditing && (
                      <div className="flex justify-end">
                        <Button className="mt-4">Save Changes</Button>
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Security Settings</CardTitle>
                <CardDescription>Manage your account security</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <Input id="currentPassword" type="password" disabled={!isEditing} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <Input id="newPassword" type="password" disabled={!isEditing} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <Input id="confirmPassword" type="password" disabled={!isEditing} />
                </div>
                {isEditing && (
                  <div className="flex justify-end">
                    <Button className="mt-4">Update Password</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </motion.div>
    </DashboardLayout>
    </ProtectedRoute>
  );
} 