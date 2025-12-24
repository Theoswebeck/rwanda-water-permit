"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { 
  Settings, 
  Save, 
  RotateCcw, 
  Shield, 
  Mail, 
  Database,
  Globe,
  Bell,
  Clock,
  FileText,
  AlertTriangle,
  CheckCircle,
  Users,
  Key
} from "lucide-react";

export function SystemSettings() {
  const [settings, setSettings] = useState({
    general: {
      systemName: "Rwanda Water Resources Board Permit System",
      systemEmail: "noreply@rwb.gov.rw",
      supportEmail: "support@rwb.gov.rw",
      timezone: "Africa/Kigali",
      language: "en",
      maintenanceMode: false
    },
    notifications: {
      emailNotifications: true,
      smsNotifications: false,
      applicationUpdates: true,
      overdueReminders: true,
      weeklyReports: true,
      systemAlerts: true
    },
    workflow: {
      autoAssignment: true,
      reviewTimeout: 14,
      inspectionTimeout: 7,
      reminderDays: 3,
      escalationDays: 21,
      maxReviewerLoad: 15
    },
    security: {
      passwordMinLength: 8,
      passwordComplexity: true,
      sessionTimeout: 120,
      loginAttempts: 5,
      twoFactorAuth: false,
      auditLogging: true
    },
    system: {
      backupFrequency: "daily",
      logRetention: 90,
      maintenanceWindow: "02:00-04:00",
      apiRateLimit: 1000,
      maxFileSize: 50,
      allowedFileTypes: "pdf,jpg,png,doc,docx"
    }
  });

  const [hasChanges, setHasChanges] = useState(false);

  const updateSetting = (category: keyof typeof settings, key: string, value: any) => {
    setSettings(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [key]: value
      }
    }));
    setHasChanges(true);
  };

  const saveSettings = () => {
    // Mock save function
    setTimeout(() => {
      setHasChanges(false);
      alert("Settings saved successfully!");
    }, 1000);
  };

  const resetSettings = () => {
    if (confirm("Are you sure you want to reset all settings to defaults?")) {
      // Reset to default values
      setHasChanges(true);
    }
  };

  return (
    <div className="space-y-6">
      {/* Settings Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                System Settings
              </CardTitle>
              <CardDescription>
                Configure system-wide settings and preferences
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2">
              {hasChanges && (
                <Badge variant="outline" className="text-yellow-600">
                  Unsaved Changes
                </Badge>
              )}
              <Button variant="outline" onClick={resetSettings}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
              <Button onClick={saveSettings} disabled={!hasChanges}>
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="workflow">Workflow</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="system">System</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                General Settings
              </CardTitle>
              <CardDescription>
                Basic system configuration and contact information
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="systemName">System Name</Label>
                  <Input
                    id="systemName"
                    value={settings.general.systemName}
                    onChange={(e) => updateSetting("general", "systemName", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <Select 
                    value={settings.general.timezone}
                    onValueChange={(value) => updateSetting("general", "timezone", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Africa/Kigali">Africa/Kigali (UTC+2)</SelectItem>
                      <SelectItem value="UTC">UTC (UTC+0)</SelectItem>
                      <SelectItem value="Africa/Nairobi">Africa/Nairobi (UTC+3)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="systemEmail">System Email</Label>
                  <Input
                    id="systemEmail"
                    type="email"
                    value={settings.general.systemEmail}
                    onChange={(e) => updateSetting("general", "systemEmail", e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="supportEmail">Support Email</Label>
                  <Input
                    id="supportEmail"
                    type="email"
                    value={settings.general.supportEmail}
                    onChange={(e) => updateSetting("general", "supportEmail", e.target.value)}
                  />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="language">Default Language</Label>
                  <Select 
                    value={settings.general.language}
                    onValueChange={(value) => updateSetting("general", "language", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="rw">Kinyarwanda</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="maintenanceMode"
                    checked={settings.general.maintenanceMode}
                    onCheckedChange={(checked) => updateSetting("general", "maintenanceMode", checked)}
                  />
                  <Label htmlFor="maintenanceMode">Maintenance Mode</Label>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="workflow" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Workflow Settings
              </CardTitle>
              <CardDescription>
                Configure application processing workflows and timeouts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reviewTimeout">Review Timeout (days)</Label>
                  <Input
                    id="reviewTimeout"
                    type="number"
                    value={settings.workflow.reviewTimeout}
                    onChange={(e) => updateSetting("workflow", "reviewTimeout", parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum days for application review
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inspectionTimeout">Inspection Timeout (days)</Label>
                  <Input
                    id="inspectionTimeout"
                    type="number"
                    value={settings.workflow.inspectionTimeout}
                    onChange={(e) => updateSetting("workflow", "inspectionTimeout", parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum days for inspection completion
                  </p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="reminderDays">Reminder Days</Label>
                  <Input
                    id="reminderDays"
                    type="number"
                    value={settings.workflow.reminderDays}
                    onChange={(e) => updateSetting("workflow", "reminderDays", parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Days before deadline to send reminders
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxReviewerLoad">Max Reviewer Load</Label>
                  <Input
                    id="maxReviewerLoad"
                    type="number"
                    value={settings.workflow.maxReviewerLoad}
                    onChange={(e) => updateSetting("workflow", "maxReviewerLoad", parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum applications per reviewer
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="autoAssignment"
                    checked={settings.workflow.autoAssignment}
                    onCheckedChange={(checked) => updateSetting("workflow", "autoAssignment", checked)}
                  />
                  <Label htmlFor="autoAssignment">Enable Auto-Assignment</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Automatically assign applications to available reviewers based on workload
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Settings
              </CardTitle>
              <CardDescription>
                Configure system notifications and alerts
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Email Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Send email notifications for system events
                    </p>
                  </div>
                  <Switch
                    checked={settings.notifications.emailNotifications}
                    onCheckedChange={(checked) => updateSetting("notifications", "emailNotifications", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>SMS Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Send SMS for urgent notifications
                    </p>
                  </div>
                  <Switch
                    checked={settings.notifications.smsNotifications}
                    onCheckedChange={(checked) => updateSetting("notifications", "smsNotifications", checked)}
                  />
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Application Updates</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify users about application status changes
                    </p>
                  </div>
                  <Switch
                    checked={settings.notifications.applicationUpdates}
                    onCheckedChange={(checked) => updateSetting("notifications", "applicationUpdates", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Overdue Reminders</Label>
                    <p className="text-sm text-muted-foreground">
                      Send reminders for overdue applications
                    </p>
                  </div>
                  <Switch
                    checked={settings.notifications.overdueReminders}
                    onCheckedChange={(checked) => updateSetting("notifications", "overdueReminders", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Weekly Reports</Label>
                    <p className="text-sm text-muted-foreground">
                      Send weekly summary reports to administrators
                    </p>
                  </div>
                  <Switch
                    checked={settings.notifications.weeklyReports}
                    onCheckedChange={(checked) => updateSetting("notifications", "weeklyReports", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>System Alerts</Label>
                    <p className="text-sm text-muted-foreground">
                      Notify administrators about system issues
                    </p>
                  </div>
                  <Switch
                    checked={settings.notifications.systemAlerts}
                    onCheckedChange={(checked) => updateSetting("notifications", "systemAlerts", checked)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Settings
              </CardTitle>
              <CardDescription>
                Configure security policies and authentication settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="passwordMinLength">Minimum Password Length</Label>
                  <Input
                    id="passwordMinLength"
                    type="number"
                    value={settings.security.passwordMinLength}
                    onChange={(e) => updateSetting("security", "passwordMinLength", parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.security.sessionTimeout}
                    onChange={(e) => updateSetting("security", "sessionTimeout", parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Password Complexity</Label>
                    <p className="text-sm text-muted-foreground">
                      Require uppercase, lowercase, numbers, and special characters
                    </p>
                  </div>
                  <Switch
                    checked={settings.security.passwordComplexity}
                    onCheckedChange={(checked) => updateSetting("security", "passwordComplexity", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Two-Factor Authentication</Label>
                    <p className="text-sm text-muted-foreground">
                      Require 2FA for all administrative accounts
                    </p>
                  </div>
                  <Switch
                    checked={settings.security.twoFactorAuth}
                    onCheckedChange={(checked) => updateSetting("security", "twoFactorAuth", checked)}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>Audit Logging</Label>
                    <p className="text-sm text-muted-foreground">
                      Log all user actions for security auditing
                    </p>
                  </div>
                  <Switch
                    checked={settings.security.auditLogging}
                    onCheckedChange={(checked) => updateSetting("security", "auditLogging", checked)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="loginAttempts">Max Failed Login Attempts</Label>
                <Input
                  id="loginAttempts"
                  type="number"
                  value={settings.security.loginAttempts}
                  onChange={(e) => updateSetting("security", "loginAttempts", parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Account will be locked after this many failed attempts
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                System Configuration
              </CardTitle>
              <CardDescription>
                Advanced system settings and maintenance configuration
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="backupFrequency">Backup Frequency</Label>
                  <Select 
                    value={settings.system.backupFrequency}
                    onValueChange={(value) => updateSetting("system", "backupFrequency", value)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="logRetention">Log Retention (days)</Label>
                  <Input
                    id="logRetention"
                    type="number"
                    value={settings.system.logRetention}
                    onChange={(e) => updateSetting("system", "logRetention", parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="maintenanceWindow">Maintenance Window</Label>
                  <Input
                    id="maintenanceWindow"
                    value={settings.system.maintenanceWindow}
                    onChange={(e) => updateSetting("system", "maintenanceWindow", e.target.value)}
                    placeholder="HH:MM-HH:MM"
                  />
                  <p className="text-xs text-muted-foreground">
                    Daily maintenance window (24-hour format)
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="apiRateLimit">API Rate Limit (per hour)</Label>
                  <Input
                    id="apiRateLimit"
                    type="number"
                    value={settings.system.apiRateLimit}
                    onChange={(e) => updateSetting("system", "apiRateLimit", parseInt(e.target.value))}
                  />
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="maxFileSize">Max File Size (MB)</Label>
                  <Input
                    id="maxFileSize"
                    type="number"
                    value={settings.system.maxFileSize}
                    onChange={(e) => updateSetting("system", "maxFileSize", parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="allowedFileTypes">Allowed File Types</Label>
                  <Input
                    id="allowedFileTypes"
                    value={settings.system.allowedFileTypes}
                    onChange={(e) => updateSetting("system", "allowedFileTypes", e.target.value)}
                    placeholder="pdf,jpg,png,doc,docx"
                  />
                  <p className="text-xs text-muted-foreground">
                    Comma-separated list of allowed file extensions
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Status */}
          <Card>
            <CardHeader>
              <CardTitle>System Status</CardTitle>
              <CardDescription>Current system health and status indicators</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-medium">Database</div>
                    <div className="text-sm text-muted-foreground">Online</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-medium">Email Service</div>
                    <div className="text-sm text-muted-foreground">Online</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <div className="font-medium">Backup Service</div>
                    <div className="text-sm text-muted-foreground">Warning</div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <div>
                    <div className="font-medium">File Storage</div>
                    <div className="text-sm text-muted-foreground">Online</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
} 