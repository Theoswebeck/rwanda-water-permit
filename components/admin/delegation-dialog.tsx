"use client";

import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  UserPlus,
  Loader2,
  AlertTriangle,
  Shield,
  ChevronsUpDown,
  Check,
  Search,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DelegatableRole, UserRole } from "@/types/database";
import { useAuth } from "@/contexts/AuthContext";

interface EligibleDelegate {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
}

// Helper to get today's date in YYYY-MM-DD format
const getTodayString = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

const delegationFormSchema = z.object({
  delegate_id: z.string().min(1, "Please select a delegate"),
  delegated_role: z.enum(["reviewer", "verifier", "approver", "assessor", "inspector"], {
    required_error: "Please select a role to delegate",
  }),
  reason: z.string().max(500, "Reason must be less than 500 characters").optional(),
  start_date: z.string().min(1, "Please select a start date"),
  has_end_date: z.boolean().default(true),
  end_date: z.string().optional(),
}).refine(
  (data) => {
    if (data.has_end_date && data.end_date && data.start_date) {
      return new Date(data.end_date) > new Date(data.start_date);
    }
    return true;
  },
  {
    message: "End date must be after start date",
    path: ["end_date"],
  }
);

type DelegationFormValues = z.infer<typeof delegationFormSchema>;

interface DelegationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function DelegationDialog({ open, onOpenChange, onSuccess }: DelegationDialogProps) {
  const { userProfile } = useAuth();
  const [eligibleDelegates, setEligibleDelegates] = useState<EligibleDelegate[]>([]);
  const [loadingDelegates, setLoadingDelegates] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [delegateSearchOpen, setDelegateSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  // Get user's role - they can only delegate their own role (admin can delegate any)
  const userRole = userProfile?.role as DelegatableRole | undefined;
  const isAdmin = userProfile?.role === 'admin';
  const delegatableRoles: DelegatableRole[] = ['reviewer', 'verifier', 'approver', 'assessor', 'inspector'];
  const canDelegateRole = userRole && delegatableRoles.includes(userRole as DelegatableRole);

  const form = useForm<DelegationFormValues>({
    resolver: zodResolver(delegationFormSchema),
    defaultValues: {
      delegate_id: "",
      delegated_role: canDelegateRole ? (userRole as DelegatableRole) : undefined,
      reason: "",
      start_date: getTodayString(),
      has_end_date: true,
      end_date: "",
    },
  });

  const hasEndDate = form.watch("has_end_date");

  // Fetch eligible delegates when dialog opens
  useEffect(() => {
    if (open) {
      fetchEligibleDelegates();
      // Reset form when dialog opens - auto-set the role to user's own role
      form.reset({
        delegate_id: "",
        delegated_role: canDelegateRole ? (userRole as DelegatableRole) : undefined,
        reason: "",
        start_date: getTodayString(),
        has_end_date: true,
        end_date: "",
      });
      setError(null);
      setSearchQuery(""); // Reset search
      setDelegateSearchOpen(false);
    }
  }, [open, form, userRole, canDelegateRole]);

  const fetchEligibleDelegates = async () => {
    try {
      setLoadingDelegates(true);
      const response = await fetch("/api/role-delegations/eligible-delegates");
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to fetch eligible delegates");
      }

      setEligibleDelegates(result.data || []);
    } catch (err) {
      console.error("Failed to fetch eligible delegates:", err);
      setError("Failed to load staff members. Please try again.");
    } finally {
      setLoadingDelegates(false);
    }
  };

  const onSubmit = async (data: DelegationFormValues) => {
    try {
      setIsSubmitting(true);
      setError(null);

      const payload = {
        delegate_id: data.delegate_id,
        delegated_role: data.delegated_role,
        reason: data.reason || undefined,
        start_date: new Date(data.start_date).toISOString(),
        end_date: data.has_end_date && data.end_date ? new Date(data.end_date).toISOString() : null,
      };

      const response = await fetch("/api/role-delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.message || "Failed to create delegation");
      }

      // Close dialog and notify parent
      onOpenChange(false);
      onSuccess?.();
    } catch (err) {
      console.error("Failed to create delegation:", err);
      setError(err instanceof Error ? err.message : "Failed to create delegation");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getDelegateDisplayName = (delegate: EligibleDelegate) => {
    const name = [delegate.first_name, delegate.last_name].filter(Boolean).join(" ");
    return name || delegate.email;
  };

  // Filter delegates based on search query (name or email)
  const filteredDelegates = useMemo(() => {
    if (!searchQuery.trim()) return eligibleDelegates;
    
    const query = searchQuery.toLowerCase();
    return eligibleDelegates.filter((delegate) => {
      const fullName = `${delegate.first_name || ''} ${delegate.last_name || ''}`.toLowerCase();
      const email = delegate.email.toLowerCase();
      return fullName.includes(query) || email.includes(query);
    });
  }, [eligibleDelegates, searchQuery]);

  // Watch delegate_id for selected delegate info
  const selectedDelegateId = form.watch("delegate_id");
  
  // Get selected delegate info
  const selectedDelegate = useMemo(() => {
    return eligibleDelegates.find(d => d.id === selectedDelegateId);
  }, [eligibleDelegates, selectedDelegateId]);

  const getRoleLabel = (role: DelegatableRole) => {
    const labels: Record<DelegatableRole, string> = {
      reviewer: "Reviewer",
      verifier: "Verifier",
      approver: "Approver",
      assessor: "Assessor",
      inspector: "Inspector",
    };
    return labels[role];
  };

  const getRoleDescription = (role: DelegatableRole) => {
    const descriptions: Record<DelegatableRole, string> = {
      reviewer: "Reviews applications and provides recommendations",
      verifier: "Verifies application documents and information",
      approver: "Makes final approval decisions on applications",
      assessor: "Conducts technical assessments of applications",
      inspector: "Performs on-site inspections",
    };
    return descriptions[role];
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Create Role Delegation
          </DialogTitle>
          <DialogDescription>
            Appoint an acting staff member to perform your role while you are out of office.
            The delegation can be revoked at any time.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Role Display - Users can only delegate their own role */}
            {isAdmin ? (
              // Admin can select any role to delegate
              <FormField
                control={form.control}
                name="delegated_role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role to Delegate</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select the role to delegate" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(["reviewer", "verifier", "approver", "assessor", "inspector"] as DelegatableRole[]).map(
                          (role) => (
                            <SelectItem key={role} value={role}>
                              <div className="flex items-center gap-2">
                                <Shield className="h-4 w-4 text-muted-foreground" />
                                <div>
                                  <span className="font-medium">{getRoleLabel(role)}</span>
                                  <span className="text-xs text-muted-foreground ml-2">
                                    - {getRoleDescription(role)}
                                  </span>
                                </div>
                              </div>
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      As admin, you can delegate any staff role
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            ) : (
              // Non-admin users can only delegate their own role (shown as fixed badge)
              <div className="space-y-2">
                <FormLabel>Role to Delegate</FormLabel>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                  <Shield className="h-5 w-5 text-primary" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{getRoleLabel(userRole as DelegatableRole)}</span>
                      <Badge variant="secondary" className="text-xs">Your Role</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {getRoleDescription(userRole as DelegatableRole)}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  You can only delegate your own role to another staff member
                </p>
              </div>
            )}

            {/* Delegate Selection with Search */}
            <FormField
              control={form.control}
              name="delegate_id"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Acting Staff (Delegate)</FormLabel>
                  <Popover open={delegateSearchOpen} onOpenChange={setDelegateSearchOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={delegateSearchOpen}
                          disabled={loadingDelegates}
                          className={cn(
                            "w-full justify-between h-auto min-h-10 py-2",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {loadingDelegates ? (
                            <div className="flex items-center gap-2">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Loading staff members...</span>
                            </div>
                          ) : selectedDelegate ? (
                            <div className="flex items-center gap-2 text-left">
                              <User className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="flex flex-col items-start">
                                <span className="font-medium">{getDelegateDisplayName(selectedDelegate)}</span>
                                <span className="text-xs text-muted-foreground">
                                  {selectedDelegate.email} • {selectedDelegate.role}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Search className="h-4 w-4" />
                              <span>Search by name or email...</span>
                            </div>
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput 
                          placeholder="Search by name or email..." 
                          value={searchQuery}
                          onValueChange={setSearchQuery}
                        />
                        <CommandList>
                          <CommandEmpty>
                            <div className="py-6 text-center text-sm">
                              <User className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                              <p className="text-muted-foreground">No staff member found.</p>
                              <p className="text-xs text-muted-foreground mt-1">Try a different search term</p>
                            </div>
                          </CommandEmpty>
                          <CommandGroup heading={`Staff Members (${filteredDelegates.length})`}>
                            {filteredDelegates.map((delegate) => (
                              <CommandItem
                                key={delegate.id}
                                value={delegate.id}
                                onSelect={() => {
                                  field.onChange(delegate.id);
                                  setDelegateSearchOpen(false);
                                  setSearchQuery("");
                                }}
                                className="cursor-pointer"
                              >
                                <div className="flex items-center gap-3 w-full">
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                                    <User className="h-4 w-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">{getDelegateDisplayName(delegate)}</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {delegate.email} • <Badge variant="outline" className="text-[10px] px-1 py-0">{delegate.role}</Badge>
                                    </p>
                                  </div>
                                  <Check
                                    className={cn(
                                      "h-4 w-4 shrink-0",
                                      field.value === delegate.id ? "opacity-100 text-primary" : "opacity-0"
                                    )}
                                  />
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    This person will act on your behalf for the selected role
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Start Date */}
            <FormField
              control={form.control}
              name="start_date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Date</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      min={getTodayString()}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>When the delegation becomes active</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* End Date Toggle */}
            <FormField
              control={form.control}
              name="has_end_date"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Set an end date</FormLabel>
                    <FormDescription>
                      If unchecked, the delegation will be indefinite until manually revoked
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />

            {/* End Date */}
            {hasEndDate && (
              <FormField
                control={form.control}
                name="end_date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        min={form.getValues("start_date") || getTodayString()}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>When the delegation automatically expires</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Reason */}
            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g., Annual leave, Medical leave, Conference attendance..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Brief explanation for the delegation
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || loadingDelegates}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create Delegation
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
