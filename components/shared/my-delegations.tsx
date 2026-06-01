"use client";

import { useState, useEffect, useCallback } from "react";
import { translateText } from "@/lib/i18n/translator";
import { AppLanguage, getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  UserCheck,
  UserMinus,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  UserPlus,
  ArrowRight,
  Calendar,
  Info,
  RefreshCw,
} from "lucide-react";
import type { RoleDelegationWithUsers } from "@/types/database";
import { useAuth } from "@/contexts/AuthContext";
import { DelegationDialog } from "@/components/admin/delegation-dialog";

export function MyDelegations() {
  const { userProfile } = useAuth();
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  const [delegations, setDelegations] = useState<RoleDelegationWithUsers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isRevokeDialogOpen, setIsRevokeDialogOpen] = useState(false);
  const [selectedDelegation, setSelectedDelegation] = useState<RoleDelegationWithUsers | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [isRevoking, setIsRevoking] = useState(false);

  const isStaffUser = userProfile?.role && 
    ['reviewer', 'verifier', 'approver', 'assessor', 'inspector', 'admin'].includes(userProfile.role);

  const fetchDelegations = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/role-delegations?filter=my");
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to fetch delegations");
      }

      setDelegations(result.data || []);
    } catch (err) {
      console.error("Failed to fetch delegations:", err);
      setError(err instanceof Error ? err.message : "Failed to load delegations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isStaffUser) {
      fetchDelegations();
    } else {
      setLoading(false);
    }
  }, [fetchDelegations, isStaffUser]);

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
      
      await fetchDelegations();
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
            {tx("Active")}
          </Badge>
        );
      case "revoked":
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <XCircle className="w-3 h-3 mr-1" />
            {tx("Revoked")}
          </Badge>
        );
      case "expired":
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            <Clock className="w-3 h-3 mr-1" />
            {tx("Expired")}
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

  // Separate delegations where user is delegator vs delegate
  const delegationsIMade = delegations.filter(d => d.delegator_id === userProfile?.id);
  const delegationsIReceived = delegations.filter(d => d.delegate_id === userProfile?.id);
  
  const activeDelegationsIMade = delegationsIMade.filter(d => d.status === 'active');
  const activeDelegationsIReceived = delegationsIReceived.filter(d => d.status === 'active');

  if (!isStaffUser) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Info className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">{tx("Delegation Not Available")}</h3>
          <p className="text-muted-foreground">
            {tx("Role delegation is only available for staff members (reviewers, verifiers, approvers, etc.)")}
          </p>
        </CardContent>
      </Card>
    );
  }

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
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
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

      {/* Info Banner */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="py-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-blue-800">
              <p className="font-medium mb-1">{tx("About Role Delegation")}</p>
              <p>
                {tx("When you're out of office, you can appoint another staff member to act on your behalf for your role")} ({userProfile?.role}). {tx("They will be able to perform all tasks associated with your role until the delegation ends or is revoked.")}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Acting Roles - Delegations I Received */}
      {activeDelegationsIReceived.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <UserCheck className="h-5 w-5" />
              {tx("You Are Currently Acting As")}
            </CardTitle>
            <CardDescription>
              {tx("You have been delegated the following roles and can perform tasks on behalf of these staff members")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activeDelegationsIReceived.map((delegation) => (
                <div 
                  key={delegation.id} 
                  className="flex items-center justify-between p-4 bg-white rounded-lg border border-emerald-200"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={`https://avatar.vercel.sh/${delegation.delegator?.email}`} />
                      <AvatarFallback>{getUserInitials(delegation.delegator)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{tx("Acting as")} {getRoleBadge(delegation.delegated_role)}</p>
                      <p className="text-sm text-muted-foreground">
                        {tx("On behalf of")} {getUserDisplayName(delegation.delegator)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-muted-foreground">
                      {delegation.end_date ? `${tx("Until")} ${formatDate(delegation.end_date)}` : tx("Indefinite")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* My Delegations - Delegations I Made */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserMinus className="h-5 w-5" />
                {tx("My Role Delegations")}
              </CardTitle>
              <CardDescription>
                {tx("Staff members you have appointed to act on your behalf")}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchDelegations} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                {tx("Refresh")}
              </Button>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                {tx("Appoint Acting Staff")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {delegationsIMade.length === 0 ? (
            <div className="text-center py-8">
              <UserCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">{tx("No Delegations")}</h3>
              <p className="text-muted-foreground mb-4">
                {tx("You haven't appointed anyone to act on your behalf yet.")}
              </p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <UserPlus className="h-4 w-4 mr-2" />
                {tx("Appoint Acting Staff")}
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {delegationsIMade.map((delegation) => (
                <div 
                  key={delegation.id} 
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={`https://avatar.vercel.sh/${delegation.delegate?.email}`} />
                      <AvatarFallback>{getUserInitials(delegation.delegate)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{getUserDisplayName(delegation.delegate)}</p>
                        {getRoleBadge(delegation.delegated_role)}
                        {getStatusBadge(delegation.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {delegation.delegate?.email}
                      </p>
                      {delegation.reason && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {tx("Reason")}: {delegation.reason}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right text-sm">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {formatDate(delegation.start_date)}
                      </div>
                      <p className="text-muted-foreground">
                        {delegation.end_date ? `${tx("to")} ${formatDate(delegation.end_date)}` : tx("Indefinite")}
                      </p>
                    </div>
                    {delegation.status === "active" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => {
                          setSelectedDelegation(delegation);
                          setIsRevokeDialogOpen(true);
                        }}
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        {tx("Revoke")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delegations I Received (History) */}
      {delegationsIReceived.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              {tx("Delegations Received")}
            </CardTitle>
            <CardDescription>
              {tx("Roles that have been delegated to you by other staff members")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {delegationsIReceived.map((delegation) => (
                <div 
                  key={delegation.id} 
                  className="flex items-center justify-between p-4 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={`https://avatar.vercel.sh/${delegation.delegator?.email}`} />
                      <AvatarFallback>{getUserInitials(delegation.delegator)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{getUserDisplayName(delegation.delegator)}</p>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        {getRoleBadge(delegation.delegated_role)}
                        {getStatusBadge(delegation.status)}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {delegation.delegator?.email}
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      {formatDate(delegation.start_date)}
                    </div>
                    <p className="text-muted-foreground">
                      {delegation.end_date ? `${tx("to")} ${formatDate(delegation.end_date)}` : tx("Indefinite")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
              {tx("Revoke Delegation")}
            </DialogTitle>
            <DialogDescription>
              {tx("Are you sure you want to revoke this delegation?")} {getUserDisplayName(selectedDelegation?.delegate || null)} {tx("will no longer be able to act on your behalf.")}
            </DialogDescription>
          </DialogHeader>

          {selectedDelegation && (
            <div className="py-4">
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{tx("Acting Staff")}:</span>
                  <span className="font-medium">{getUserDisplayName(selectedDelegation.delegate)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{tx("Role")}:</span>
                  {getRoleBadge(selectedDelegation.delegated_role)}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{tx("Since")}:</span>
                  <span>{formatDate(selectedDelegation.start_date)}</span>
                </div>
              </div>

              <div className="mt-4">
                <label className="text-sm font-medium mb-2 block">
                  {tx("Revocation Reason (optional)")}
                </label>
                <Input
                  placeholder={tx("e.g., Returned from leave...")}
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
              {tx("Cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleRevokeDelegation}
              disabled={isRevoking}
            >
              {isRevoking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {tx("Revoking...")}
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4 mr-2" />
                  {tx("Revoke Delegation")}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
