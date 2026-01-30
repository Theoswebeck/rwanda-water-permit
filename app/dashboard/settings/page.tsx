"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Bell, Lock, Mail, Shield, Smartphone, UserCheck } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { MyDelegations } from "@/components/shared/my-delegations";

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<"applications">("applications");
  const { userProfile } = useAuth();

  const roleDashboards: Record<string, string> = {
    admin: "/admin",
    approver: "/approver",
    inspector: "/inspection",
    reviewer: "/review",
    assessor: "/assessment",
    verifier: "/verification",
    applicant: "/dashboard",
  };

  const backHref = roleDashboards[userProfile?.role || "applicant"] || "/dashboard";
  
  // Check if user is staff (can delegate roles)
  const isStaffUser = userProfile?.role && 
    ['reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin'].includes(userProfile.role);
  
  return (
    <DashboardLayout>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="container mx-auto px-4 py-6"
      >
        <div className="flex items-center mb-6">
          <Link href={backHref}>
            <Button variant="ghost" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
        </div>
        
        <div className="space-y-6">
          <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">Account Settings</h1>
          <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">Manage your account preferences and settings</p>
          
          <Tabs defaultValue="general" className="w-full">
            <TabsList className={`w-full max-w-xl grid ${isStaffUser ? 'grid-cols-5' : 'grid-cols-4'}`}>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="notifications">Notifications</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="privacy">Privacy</TabsTrigger>
              {isStaffUser && (
                <TabsTrigger value="delegations" className="flex items-center gap-1">
                  <UserCheck className="h-3.5 w-3.5" />
                  Delegations
                </TabsTrigger>
              )}
            </TabsList>
            
            {/* General Settings */}
            <TabsContent value="general" className="space-y-6 pt-6">
              <Card>
                <CardHeader>
                  <CardTitle>Language & Region</CardTitle>
                  <CardDescription>Customize your language and regional preferences</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="language">Language</Label>
                    <Select defaultValue="en">
                      <SelectTrigger id="language">
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="fr">Français</SelectItem>
                        <SelectItem value="rw">Kinyarwanda</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Time Zone</Label>
                    <Select defaultValue="africa-kigali">
                      <SelectTrigger id="timezone">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="africa-kigali">Africa/Kigali (GMT+2)</SelectItem>
                        <SelectItem value="africa-nairobi">Africa/Nairobi (GMT+3)</SelectItem>
                        <SelectItem value="utc">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Appearance</CardTitle>
                  <CardDescription>Customize the application appearance</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="darkMode">Dark Mode</Label>
                      <p className="text-sm text-muted-foreground">
                        Switch between light and dark themes
                      </p>
                    </div>
                    <Switch id="darkMode" />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Notification Settings */}
            <TabsContent value="notifications" className="space-y-6 pt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center">
                    <Bell className="mr-2 h-5 w-5 text-primary" />
                    <div>
                      <CardTitle>Notification Preferences</CardTitle>
                      <CardDescription>Manage how you receive notifications</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="emailNotifications">Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive application updates via email
                      </p>
                    </div>
                    <Switch id="emailNotifications" defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="smsNotifications">SMS Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive important updates via SMS
                      </p>
                    </div>
                    <Switch id="smsNotifications" />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="appNotifications">In-App Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Show notifications within the application
                      </p>
                    </div>
                    <Switch id="appNotifications" defaultChecked />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Notification Types</CardTitle>
                  <CardDescription>Choose what types of notifications you receive</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Application Status Updates</Label>
                      <p className="text-sm text-muted-foreground">
                        Notifications when your application status changes
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Reminders</Label>
                      <p className="text-sm text-muted-foreground">
                        Reminders for pending actions and deadlines
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Marketing & Announcements</Label>
                      <p className="text-sm text-muted-foreground">
                        News, updates, and marketing information
                      </p>
                    </div>
                    <Switch />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Security Settings */}
            <TabsContent value="security" className="space-y-6 pt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center">
                    <Lock className="mr-2 h-5 w-5 text-primary" />
                    <div>
                      <CardTitle>Password</CardTitle>
                      <CardDescription>Update your password</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="currentPwd">Current Password</Label>
                    <Input id="currentPwd" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="newPwd">New Password</Label>
                    <Input id="newPwd" type="password" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirmPwd">Confirm New Password</Label>
                    <Input id="confirmPwd" type="password" />
                  </div>
                  <Button className="mt-2">Update Password</Button>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <div className="flex items-center">
                    <Smartphone className="mr-2 h-5 w-5 text-primary" />
                    <div>
                      <CardTitle>Two-Factor Authentication</CardTitle>
                      <CardDescription>Enhance your account security</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Enable 2FA</Label>
                      <p className="text-sm text-muted-foreground">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Switch />
                  </div>
                  <div className="pt-2">
                    <Button variant="outline">Setup Two-Factor Authentication</Button>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <div className="flex items-center">
                    <Mail className="mr-2 h-5 w-5 text-primary" />
                    <div>
                      <CardTitle>Email Verification</CardTitle>
                      <CardDescription>Verify your email address</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">jane.doe@example.com</p>
                      <p className="text-sm text-green-600">Verified</p>
                    </div>
                    <Button variant="outline">Change Email</Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Privacy Settings */}
            <TabsContent value="privacy" className="space-y-6 pt-6">
              <Card>
                <CardHeader>
                  <div className="flex items-center">
                    <Shield className="mr-2 h-5 w-5 text-primary" />
                    <div>
                      <CardTitle>Privacy Settings</CardTitle>
                      <CardDescription>Manage your privacy preferences</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Data Sharing</Label>
                      <p className="text-sm text-muted-foreground">
                        Allow sharing anonymized data for service improvement
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Analytics Cookies</Label>
                      <p className="text-sm text-muted-foreground">
                        Allow analytics cookies to improve our services
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle>Data Management</CardTitle>
                  <CardDescription>Manage your personal data</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-sm">
                      You can request a copy of your personal data or delete your account at any time.
                    </p>
                    <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-2">
                      <Button variant="outline">Download My Data</Button>
                      <Button variant="destructive">Delete Account</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
            
            {/* Delegations Settings (Staff Only) */}
            {isStaffUser && (
              <TabsContent value="delegations" className="space-y-6 pt-6">
                <MyDelegations />
              </TabsContent>
            )}
          </Tabs>
        </div>
      </motion.div>
    </DashboardLayout>
  );
} 