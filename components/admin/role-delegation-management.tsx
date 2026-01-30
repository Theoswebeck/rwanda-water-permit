"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  UserCheck,
  UserMinus,
  Search,
  MoreHorizontal,
  RefreshCw,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  UserPlus,
  ArrowRight,
  Calendar,
  Shield,
} from "lucide-react";
import type { RoleDelegationWithUsers, DelegatableRole } from "@/types/database";
import { DelegationDialog } from "./delegation-dialog";

interface DelegationStats {
  totalActive: number;
  totalRevoked: number;
  totalExpired: number;
  byRole: Record<string, number>;
}

export function RoleDelegationManagement() {
  const [delegations, setDelegations] = useState<RoleDelegationWithUsers[]>([]);
  const [stats, setStats] = useState<DelegationStats>({
    totalActive: 0,
    totalRevoked: 0,
    totalExpired: 0,
    byRole: {},
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "revoked" | "expired">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | DelegatableRole>("all");

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
  const [selectedDelegation, setSelectedDelegation] = useState<RoleDelegationWithUsers | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);

  const fetchDelegations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.append("status", statusFilter);
      }

      const response = await fetch(`/api/role-delegations?${params.toString()}`);
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to fetch delegations");
      }

      setDelegations(result.data || []);

      // Calculate stats
      const delegationData = result.data as RoleDelegationWithUsers[];
      const newStats: DelegationStats = {
        totalActive: 0,
        totalRevoked: 0,
        totalExpired: 0,
        byRole: {},
      };

      delegationData.forEach((d) => {
        if (d.status === "active") {
          newStats.totalActive++;
          newStats.byRole[d.delegated_role] = (newStats.byRole[d.delegated_role] || 0) + 1;
        } else if (d.status === "revoked") {
          newStats.totalRevoked++;
        } else if (d.status === "expired") {
          newStats.totalExpired++;
        }
      });

      setStats(newStats);
    } catch (err) {
      console.error("Failed to fetch delegations:", err);
      setError(err instanceof Error ? err.message : "Failed to load delegations");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchDelegations();
  }, [fetchDelegations]);

  const handleRevokeDelegation = async () => {
    if (!selectedDelegation) return;

    try {
      setIsRevoking(true);
      setError(null);

      const response = await fetch(`/api/role-delegations/${selectedDelegation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", reason: revokeReason || undefined }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to revoke delegation");
      }

      setSuccessMessage("✅ Delegation revoked successfully");
      setIsRevokeDialogOpen(false);
      setSelectedDelegation(null);
      setRevokeReason("");
      
      // Refresh the list
      await fetchDelegations();

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Failed to revoke delegation:", err);
      setError(err instanceof Error ? err.message : "Failed to revoke delegation");
    } finally {
      setIsRevoking(false);
    }
  };

  const handleDelegationCreated = () => {
    setSuccessMessage("✅ Delegation created successfully");
    fetchDelegations();
    setTimeout(() => setSuccessMessage(null), 3000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Active
          </Badge>
        );
      case "revoked":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="w-3 h-3 mr-1" />
            Revoked
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            <Clock className="w-3 h-3 mr-1" />
            Expired
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    const roleColors: Record<string, string> = {
      reviewer: "bg-blue-50 text-blue-700 border-blue-200",
      verifier: "bg-cyan-50 text-cyan-700 border-cyan-200",
      approver: "bg-purple-50 text-purple-700 border-purple-200",
      assessor: "bg-orange-50 text-orange-700 border-orange-200",
      inspector: "bg-green-50 text-green-700 border-green-200",
    };
    return (
      <Badge variant="outline" className={roleColors[role] || "bg-gray-50 text-gray-700"}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getUserDisplayName = (user: { first_name?: string; last_name?: string; email: string } | null) => {
    if (!user) return "Unknown";
    const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
    return name || user.email;
  };

  const getUserInitials = (user: { first_name?: string; last_name?: string; email: string } | null) => {
    if (!user) return "?";
    const firstInitial = user.first_name?.[0] || user.email[0] || "";
    const lastInitial = user.last_name?.[0] || "";
    return (firstInitial + lastInitial).toUpperCase();
  };

  // Filter delegations
  const filteredDelegations = delegations.filter((d) => {
    const matchesSearch =
      searchTerm === "" ||
      getUserDisplayName(d.delegator).toLowerCase().includes(searchTerm.toLowerCase()) ||
      getUserDisplayName(d.delegate).toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.delegator?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.delegate?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.delegated_role.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesRole = roleFilter === "all" || d.delegated_role === roleFilter;

    return matchesSearch && matchesRole;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Success/Error Messages */}
      {successMessage && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Alert className="bg-emerald-50 border-emerald-200">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <AlertDescription className="text-emerald-700">{successMessage}</AlertDescription>
          </Alert>
        </motion.div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Delegations</CardTitle>
            <UserCheck className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalActive}</div>
            <p className="text-xs text-muted-foreground">Currently active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Revoked</CardTitle>
            <UserMinus className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalRevoked}</div>
            <p className="text-xs text-muted-foreground">Manually revoked</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <Clock className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalExpired}</div>
            <p className="text-xs text-muted-foreground">Naturally expired</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">By Role</CardTitle>
            <Shield className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {Object.entries(stats.byRole).length > 0 ? (
                Object.entries(stats.byRole).map(([role, count]) => (
                  <Badge key={role} variant="secondary" className="text-xs">
                    {role}: {count}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">No active delegations</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Delegation Management Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Role Delegations
              </CardTitle>
              <CardDescription>
                Manage acting staff assignments when users are out of office
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchDelegations} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                New Delegation
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, email, or role..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as typeof roleFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="reviewer">Reviewer</SelectItem>
                <SelectItem value="verifier">Verifier</SelectItem>
                <SelectItem value="approver">Approver</SelectItem>
                <SelectItem value="assessor">Assessor</SelectItem>
                <SelectItem value="inspector">Inspector</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Delegations Table */}
          {filteredDelegations.length === 0 ? (
            <div className="text-center py-12">
              <UserCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No delegations found</h3>
              <p className="text-muted-foreground mb-4">
                {searchTerm || statusFilter !== "all" || roleFilter !== "all"
                  ? "Try adjusting your filters"
                  : "Create a new delegation to get started"}
              </p>
              {!searchTerm && statusFilter === "all" && roleFilter === "all" && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create First Delegation
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Delegator</TableHead>
                    <TableHead className="text-center">
                      <ArrowRight className="h-4 w-4 inline" />
                    </TableHead>
                    <TableHead>Delegate (Acting)</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDelegations.map((delegation) => (
                    <TableRow key={delegation.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={`https://avatar.vercel.sh/${delegation.delegator?.email}`} />
                            <AvatarFallback className="text-xs">
                              {getUserInitials(delegation.delegator)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">
                              {getUserDisplayName(delegation.delegator)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {delegation.delegator?.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-center">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={`https://avatar.vercel.sh/${delegation.delegate?.email}`} />
                            <AvatarFallback className="text-xs">
                              {getUserInitials(delegation.delegate)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium text-sm">
                              {getUserDisplayName(delegation.delegate)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {delegation.delegate?.email}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{getRoleBadge(delegation.delegated_role)}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3 text-muted-foreground" />
                            {formatDate(delegation.start_date)}
                          </div>
                          {delegation.end_date ? (
                            <div className="text-xs text-muted-foreground">
                              to {formatDate(delegation.end_date)}
                            </div>
                          ) : (
                            <div className="text-xs text-muted-foreground">Indefinite</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{getStatusBadge(delegation.status)}</TableCell>
                      <TableCell>
                        <div className="max-w-[150px] truncate text-sm text-muted-foreground">
                          {delegation.reason || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {delegation.status === "active" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  setSelectedDelegation(delegation);
                                  setIsRevokeDialogOpen(true);
                                }}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Revoke Delegation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                        {delegation.status === "revoked" && delegation.revoked_at && (
                          <div className="text-xs text-muted-foreground">
                            Revoked: {formatDateTime(delegation.revoked_at)}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Delegation Dialog */}
      <DelegationDialog
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        onSuccess={handleDelegationCreated}
      />

      {/* Revoke Confirmation Dialog */}
      <Dialog open={isRevokeDialogOpen} onOpenChange={setIsRevokeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="h-5 w-5" />
              Revoke Delegation
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke this role delegation? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {selectedDelegation && (
            <div className="py-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Delegator:</span>
                  <span className="font-medium">{getUserDisplayName(selectedDelegation.delegator)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Delegate:</span>
                  <span className="font-medium">{getUserDisplayName(selectedDelegation.delegate)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Role:</span>
                  {getRoleBadge(selectedDelegation.delegated_role)}
                </div>
              </div>

              <div className="mt-4">
                <label className="text-sm font-medium mb-2 block">
                  Revocation Reason (optional)
                </label>
                <Input
                  placeholder="Enter reason for revocation..."
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsRevokeDialogOpen(false);
                setSelectedDelegation(null);
                setRevokeReason("");
              }}
              disabled={isRevoking}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeDelegation}
              disabled={isRevoking}
            >
              {isRevoking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Revoking...
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  Revoke Delegation
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
