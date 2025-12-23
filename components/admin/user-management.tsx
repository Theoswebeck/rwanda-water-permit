"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { 
  UserPlus, 
  Search, 
  MoreHorizontal, 
  Edit, 
  Shield, 
  User,
  CheckCircle,
  AlertTriangle,
  Mail,
  Phone,
  Loader2
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getAllUsers, updateUser } from "@/lib/supabase";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { User as UserType } from "@/types/database";
import { useErrorHandler } from "@/hooks/useErrorHandler";

interface User {
  id: string;
  email: string;
  phone?: string;
  role: "applicant" | "reviewer" | "inspector" | "admin" | "approver";
  status: "active" | "inactive" | "suspended";
  account_type: "individual" | "company" | "cooperative" | "organization" | "institution";
  first_name?: string;
  last_name?: string;
  company_name?: string;
  created_at: string;
  last_login_at?: string;
  applications_count: number;
  reviews_count: number;
  inspections_count: number;
}

const userValidationSchema = z.object({
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  role: z.enum(["applicant", "assessor", "reviewer", "inspector", "admin", "approver"]),
  status: z.enum(["active", "inactive", "suspended"]),
  account_type: z.enum(["individual", "company", "cooperative", "organization", "institution"]),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  company_name: z.string().optional(),
}).refine((data) => {
  // For individual accounts, first_name and last_name are required
  if (data.account_type === 'individual') {
    return data.first_name && data.first_name.trim() !== '' && 
           data.last_name && data.last_name.trim() !== '';
  }
  // For organizational accounts, company_name is required  
  if (['company', 'cooperative', 'organization', 'institution'].includes(data.account_type)) {
    return data.company_name && data.company_name.trim() !== '';
  }
  return true;
}, {
  message: "Individual accounts require first and last name. Organizational accounts require company name.",
  path: ["account_type"] // This will show the error on the account_type field
});

type UserFormValues = z.infer<typeof userValidationSchema>;

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const { handleErrorWithBack } = useErrorHandler();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userValidationSchema),
    defaultValues: {
      email: "",
      phone: "",
      role: "assessor", // Default to assessor (staff role) - applicants must self-register
      status: "active",
      account_type: "individual",
      first_name: "",
      last_name: "",
      company_name: "",
    },
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const userData = await getAllUsers();
      setUsers(userData.map((user: UserType) => ({
        id: user.id,
        email: user.email,
        phone: user.phone,
        role: user.role,
        status: user.status,
        account_type: user.account_type,
        first_name: user.first_name,
        last_name: user.last_name,
        company_name: user.company_name,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
        applications_count: user.applications_count || 0,
        reviews_count: user.reviews_count || 0,
        inspections_count: user.inspections_count || 0,
      })));
    } catch (err) {
      handleErrorWithBack(err, 'load users');
    } finally {
      setLoading(false);
    }
  };

  const getRoleBadge = (role: User["role"]) => {
    const roleColors = {
      admin: "bg-red-100 text-red-700 border-red-200",
      approver: "bg-purple-100 text-purple-700 border-purple-200",
      reviewer: "bg-blue-100 text-blue-700 border-blue-200",
      inspector: "bg-green-100 text-green-700 border-green-200",
      applicant: "bg-gray-100 text-gray-700 border-gray-200",
    };
    return <Badge variant="outline" className={roleColors[role]}>{role}</Badge>;
  };

  const getStatusBadge = (status: User["status"]) => {
    switch (status) {
      case "active":
        return <Badge variant="outline" className="bg-green-100 text-green-700 border-green-200">Active</Badge>;
      case "inactive":
        return <Badge variant="outline" className="bg-gray-100 text-gray-700 border-gray-200">Inactive</Badge>;
      case "suspended":
        return <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">Suspended</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const handleAddUser = async (data: UserFormValues) => {
    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    
    try {
      // Staff users are created via API (which creates auth user + sends invite email)
      // Applicants must self-register
      if (data.role === 'applicant') {
        setErrorMessage('Applicants must register themselves through the public registration page. Admin can only create staff accounts (reviewer, inspector, admin, approver).');
        setIsSubmitting(false);
        return;
      }

      const response = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          first_name: data.first_name?.trim() || null,
          last_name: data.last_name?.trim() || null,
          phone: data.phone?.trim() || null,
          role: data.role,
          status: data.status,
          account_type: 'individual', // Staff accounts are always individual
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setErrorMessage(result.message || 'Failed to create user');
        setIsSubmitting(false);
        return;
      }

      // Show success message
      if (result.emailSent) {
        setSuccessMessage(`✅ Staff account created! Invite email sent to ${result.email} with login credentials.`);
      } else {
        setSuccessMessage(`✅ Staff account created for ${result.email}. Email could not be sent - please share credentials manually.`);
      }
      
      await fetchUsers(); // Refresh the users list
      setIsAddDialogOpen(false);
      form.reset();
      
      // Clear success message after 5 seconds
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err) {
      console.error('Error creating user:', err);
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditUser = (user: User) => {
    setOpenDropdownId(null); // Close any open dropdowns
    setSelectedUser(user);
    form.reset({
      email: user.email,
      phone: user.phone || "",
      role: user.role,
      status: user.status,
      account_type: user.account_type,
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      company_name: user.company_name || "",
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdateUser = async (data: UserFormValues) => {
    if (!selectedUser) return;
    
    try {
      // Clean the data based on account type to match database constraints
      const cleanedData = {
        ...data,
        // For individual accounts, ensure first_name and last_name are not empty
        // For organizational accounts, ensure company_name is not empty
        first_name: data.account_type === 'individual' ? (data.first_name?.trim() || null) : (data.first_name?.trim() || null),
        last_name: data.account_type === 'individual' ? (data.last_name?.trim() || null) : (data.last_name?.trim() || null),
        company_name: ['company', 'cooperative', 'organization', 'institution'].includes(data.account_type) 
          ? (data.company_name?.trim() || null) 
          : null, // Set to null for individual accounts
        phone: data.phone?.trim() || null,
      };

      await updateUser(selectedUser.id, cleanedData);
      await fetchUsers(); // Refresh the users list
      setIsEditDialogOpen(false);
      setSelectedUser(null);
      form.reset();
    } catch (err) {
      handleErrorWithBack(err, 'update user');
    }
  };



  const handleSuspendUser = async (userId: string) => {
    try {
      const user = users.find(u => u.id === userId);
      if (!user) return;
      
      const newStatus = user.status === 'suspended' ? 'active' : 'suspended';
      await updateUser(userId, { status: newStatus });
      await fetchUsers(); // Refresh the users list
    } catch (err) {
      handleErrorWithBack(err, 'suspend user');
    }
  };


  // Filter users based on search term and active tab
  const filteredUsers = users.filter(user => {
    const matchesSearch = user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (user.first_name && user.first_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (user.last_name && user.last_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
                         (user.company_name && user.company_name.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesTab = activeTab === "all" || user.role === activeTab;
    
    return matchesSearch && matchesTab;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // Error handling is now done globally with automatic page reload/navigation

  return (
    <div className="space-y-6">
      {/* Success Message */}
      {successMessage && (
        <Alert className="bg-green-50 border-green-200">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-700">{successMessage}</AlertDescription>
        </Alert>
      )}

      {/* User Statistics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
            <p className="text-xs text-muted-foreground">
              Active system users
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Applicants</CardTitle>
            <User className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.filter(u => u.role === "applicant").length}</div>
            <p className="text-xs text-muted-foreground">
              Regular applicants
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Staff</CardTitle>
            <Shield className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter(u => u.role === "reviewer").length + users.filter(u => u.role === "inspector").length + users.filter(u => u.role === "admin").length}
            </div>
            <p className="text-xs text-muted-foreground">
              RWB staff members
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Today</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter(u => u.last_login_at && u.last_login_at.startsWith("2024-03-22")).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Logged in today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* User Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>User Management</CardTitle>
              <CardDescription>
                Add, remove, and manage user roles and permissions
              </CardDescription>
            </div>
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Add User
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add New Staff User</DialogTitle>
                  <DialogDescription>
                    Create a new staff account. An invite email with login credentials will be sent to the user.
                  </DialogDescription>
                </DialogHeader>
                {errorMessage && (
                  <Alert variant="destructive" className="mb-4">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{errorMessage}</AlertDescription>
                  </Alert>
                )}
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleAddUser)} className="space-y-4">
                    <FormField
                      control={form.control}
                      name="first_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>First Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter first name" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="last_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Last Name</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter last name" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input 
                              type="email" 
                              placeholder="Enter email address" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="+250 XXX XXX XXX" 
                              {...field} 
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name="role"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Role</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a role" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="assessor">Assessor</SelectItem>
                              <SelectItem value="inspector">Inspector</SelectItem>
                              <SelectItem value="approver">Approver</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />


                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                              <SelectItem value="suspended">Suspended</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <DialogFooter>
                      <Button 
                        type="button" 
                        variant="outline" 
                        disabled={isSubmitting}
                        onClick={() => {
                          form.reset();
                          setErrorMessage(null);
                          setIsAddDialogOpen(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Creating & Sending Invite...
                          </>
                        ) : (
                          <>
                            <Mail className="mr-2 h-4 w-4" />
                            Create & Send Invite
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center space-x-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="applicant">Applicant</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="inspector">Inspector</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="approver">Approver</SelectItem>
              </SelectContent>
            </Select>
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Users Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Last Login</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center space-x-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={`https://avatar.vercel.sh/${user.email}`} />
                          <AvatarFallback>
                            {user.first_name && user.first_name[0] + (user.last_name ? user.last_name[0] : '')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{user.first_name} {user.last_name}</div>
                          <div className="text-sm text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>{getStatusBadge(user.status)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-sm">
                          <Mail className="h-3 w-3" />
                          {user.email}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {user.phone}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{user.last_login_at ? new Date(user.last_login_at).toLocaleDateString() : "Never"}</div>
                      <div className="text-xs text-muted-foreground">
                        Joined {new Date(user.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {user.applications_count > 0 && `${user.applications_count} applications`}
                        {user.reviews_count > 0 && `${user.reviews_count} reviews`}
                        {user.inspections_count > 0 && `${user.inspections_count} inspections`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu 
                        open={openDropdownId === user.id} 
                        onOpenChange={(open) => setOpenDropdownId(open ? user.id : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button 
                            variant="ghost" 
                            className="h-8 w-8 p-0"
                            aria-label={`Actions for ${user.email}`}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.preventDefault();
                              handleEditUser(user);
                            }}
                          >
                            <Edit className="mr-2 h-4 w-4" />
                            Edit User
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleSuspendUser(user.id)}>
                            <AlertTriangle className="mr-2 h-4 w-4" />
                            {user.status === "suspended" ? "Reactivate" : "Suspend"} User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      {selectedUser && (
        <Dialog 
          open={isEditDialogOpen} 
          onOpenChange={(open) => {
            setIsEditDialogOpen(open);
            if (!open) {
              setSelectedUser(null);
              form.reset();
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit User</DialogTitle>
              <DialogDescription>
                Update user information and role
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleUpdateUser)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name</FormLabel>
                      <FormControl>
                        <Input 
                          id="edit-first-name"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name</FormLabel>
                      <FormControl>
                        <Input 
                          id="edit-last-name"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input 
                          id="edit-email"
                          type="email" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input 
                          id="edit-phone"
                          placeholder="+250 XXX XXX XXX" 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="applicant">Applicant</SelectItem>
                          <SelectItem value="reviewer">Reviewer</SelectItem>
                          <SelectItem value="inspector">Inspector</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="approver">Approver</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="account_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Type</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="individual">Individual</SelectItem>
                          <SelectItem value="company">Company</SelectItem>
                          <SelectItem value="cooperative">Cooperative</SelectItem>
                          <SelectItem value="organization">Organization</SelectItem>
                          <SelectItem value="institution">Institution</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                          <SelectItem value="suspended">Suspended</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company Name</FormLabel>
                      <FormControl>
                        <Input 
                          id="edit-company-name"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                                 <DialogFooter>
                   <Button 
                     variant="outline" 
                     type="button"
                     onClick={() => {
                       setIsEditDialogOpen(false);
                       setSelectedUser(null);
                       form.reset();
                     }}
                   >
                     Cancel
                   </Button>
                   <Button type="submit">
                     Update User
                   </Button>
                 </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      )}

    </div>
  );
} 