"use client";

import { useState, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, Filter } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { getStaffUsers } from '@/lib/supabase';

export interface FilterState {
  user: string;
  userRoles: string[];
  actionTypes: string[];
  entityTypes: string[];
  status: string;
  severities: string[];
}

interface ActivityFiltersProps {
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

const USER_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'approver', label: 'Approver' },
  { value: 'assessor', label: 'Assessor' },
  { value: 'verifier', label: 'Verifier' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'inspector', label: 'Inspector' },
];

const ACTION_TYPES = [
  { category: 'User Management', items: [
    { value: 'user.created', label: 'User Created' },
    { value: 'user.updated', label: 'User Updated' },
    { value: 'user.role_changed', label: 'Role Changed' },
    { value: 'user.suspended', label: 'User Suspended' },
    { value: 'user.activated', label: 'User Activated' },
    { value: 'user.deleted', label: 'User Deleted' },
    { value: 'user.login', label: 'User Login' },
    { value: 'user.logout', label: 'User Logout' },
    { value: 'user.login_failed', label: 'Login Failed' },
    { value: 'user.password_changed', label: 'Password Changed' },
    { value: 'user.password_reset', label: 'Password Reset' },
  ]},
  { category: 'Application', items: [
    { value: 'application.status_changed', label: 'Status Changed' },
    { value: 'application.assigned', label: 'Assigned' },
    { value: 'application.reassigned', label: 'Reassigned' },
    { value: 'application.approved', label: 'Approved' },
    { value: 'application.rejected', label: 'Rejected' },
    { value: 'application.revision_requested', label: 'Revision Requested' },
    { value: 'application.cancelled', label: 'Cancelled' },
    { value: 'application.comment_added', label: 'Comment Added' },
  ]},
  { category: 'Permit', items: [
    { value: 'permit.issued', label: 'Issued' },
    { value: 'permit.renewed', label: 'Renewed' },
    { value: 'permit.suspended', label: 'Suspended' },
    { value: 'permit.revoked', label: 'Revoked' },
    { value: 'permit.reactivated', label: 'Reactivated' },
    { value: 'permit.transferred', label: 'Transferred' },
    { value: 'permit.conditions_updated', label: 'Conditions Updated' },
  ]},
  { category: 'Inspection', items: [
    { value: 'inspection.scheduled', label: 'Scheduled' },
    { value: 'inspection.started', label: 'Started' },
    { value: 'inspection.completed', label: 'Completed' },
    { value: 'inspection.cancelled', label: 'Cancelled' },
    { value: 'inspection.result_submitted', label: 'Result Submitted' },
    { value: 'inspection.reviewed', label: 'Reviewed' },
  ]},
  { category: 'Review/Assessment', items: [
    { value: 'review.started', label: 'Review Started' },
    { value: 'review.completed', label: 'Review Completed' },
    { value: 'review.recommendation_made', label: 'Recommendation Made' },
    { value: 'assessment.started', label: 'Assessment Started' },
    { value: 'assessment.completed', label: 'Assessment Completed' },
  ]},
  { category: 'Document', items: [
    { value: 'document.verified', label: 'Verified' },
    { value: 'document.rejected', label: 'Rejected' },
    { value: 'document.deleted', label: 'Deleted' },
  ]},
  { category: 'Payment', items: [
    { value: 'payment.completed', label: 'Completed' },
    { value: 'payment.failed', label: 'Failed' },
    { value: 'payment.refunded', label: 'Refunded' },
  ]},
  { category: 'System', items: [
    { value: 'system.settings_updated', label: 'Settings Updated' },
    { value: 'system.bulk_export', label: 'Bulk Export' },
    { value: 'system.report_generated', label: 'Report Generated' },
  ]},
];

const ENTITY_TYPES = [
  { value: 'user', label: 'User' },
  { value: 'application', label: 'Application' },
  { value: 'permit', label: 'Permit' },
  { value: 'inspection', label: 'Inspection' },
  { value: 'document', label: 'Document' },
  { value: 'payment', label: 'Payment' },
];

const SEVERITIES = [
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'critical', label: 'Critical' },
];

interface StaffUser {
  id: string;
  name: string;
  role: string;
}

function MultiSelectPopover({ 
  label, 
  options, 
  selected, 
  onChange,
  grouped = false 
}: { 
  label: string; 
  options: any[];
  selected: string[];
  onChange: (values: string[]) => void;
  grouped?: boolean;
}) {
  const handleToggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const handleClear = () => {
    onChange([]);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="justify-between w-full">
          <span className="truncate">
            {selected.length > 0 ? `${selected.length} selected` : `Select ${label}`}
          </span>
          <Filter className="h-4 w-4 ml-2 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <div className="max-h-96 overflow-y-auto">
          <div className="p-3 border-b sticky top-0 bg-white z-10">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{label}</span>
              {selected.length > 0 && (
                <Button variant="ghost" size="sm" onClick={handleClear} className="h-auto py-1 px-2">
                  Clear
                </Button>
              )}
            </div>
          </div>
          <div className="p-2">
            {grouped ? (
              options.map((group) => (
                <div key={group.category} className="mb-3">
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {group.category}
                  </div>
                  {group.items.map((item: any) => (
                    <div key={item.value} className="flex items-center space-x-2 px-2 py-2 hover:bg-gray-50 rounded">
                      <Checkbox
                        id={item.value}
                        checked={selected.includes(item.value)}
                        onCheckedChange={() => handleToggle(item.value)}
                      />
                      <label
                        htmlFor={item.value}
                        className="text-sm cursor-pointer flex-1"
                      >
                        {item.label}
                      </label>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              options.map((item) => (
                <div key={item.value} className="flex items-center space-x-2 px-2 py-2 hover:bg-gray-50 rounded">
                  <Checkbox
                    id={item.value}
                    checked={selected.includes(item.value)}
                    onCheckedChange={() => handleToggle(item.value)}
                  />
                  <label
                    htmlFor={item.value}
                    className="text-sm cursor-pointer flex-1"
                  >
                    {item.label}
                  </label>
                </div>
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function ActivityFilters({ filters, onFiltersChange }: ActivityFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [staffUsers, setStaffUsers] = useState<StaffUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Fetch staff users on mount
  useEffect(() => {
    const fetchStaffUsers = async () => {
      try {
        setLoadingUsers(true);
        const users = await getStaffUsers();
        setStaffUsers(users);
      } catch (error) {
        console.error('Failed to fetch staff users:', error);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchStaffUsers();
  }, []);

  const updateFilter = (key: keyof FilterState, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const hasActiveFilters = 
    filters.user !== 'all' ||
    filters.userRoles.length > 0 ||
    filters.actionTypes.length > 0 ||
    filters.entityTypes.length > 0 ||
    filters.status !== 'all' ||
    filters.severities.length > 0;

  const handleClearAll = () => {
    onFiltersChange({
      user: 'all',
      userRoles: [],
      actionTypes: [],
      entityTypes: [],
      status: 'all',
      severities: [],
    });
  };

  return (
    <div className="border-b border-gray-200 bg-gray-50">
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h3 className="font-medium text-gray-900">Filters</h3>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setIsExpanded(!isExpanded)}
              className="sm:hidden"
            >
              {isExpanded ? 'Hide' : 'Show'}
            </Button>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClearAll} className="text-blue-600 hover:text-blue-700">
              Clear all
            </Button>
          )}
        </div>
        
        <div className={cn(
          "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4",
          !isExpanded && "hidden sm:grid"
        )}>
          {/* User */}
          <div className="space-y-2">
            <Label htmlFor="user-filter">User</Label>
            <Select value={filters.user} onValueChange={(value) => updateFilter('user', value)}>
              <SelectTrigger id="user-filter">
                <SelectValue placeholder={loadingUsers ? "Loading..." : "Select user"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {staffUsers.map((user) => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.name} ({user.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* User Role */}
          <div className="space-y-2">
            <Label>User Role</Label>
            <MultiSelectPopover
              label="User Roles"
              options={USER_ROLES}
              selected={filters.userRoles}
              onChange={(values) => updateFilter('userRoles', values)}
            />
          </div>

          {/* Action Type */}
          <div className="space-y-2">
            <Label>Action Type</Label>
            <MultiSelectPopover
              label="Action Types"
              options={ACTION_TYPES}
              selected={filters.actionTypes}
              onChange={(values) => updateFilter('actionTypes', values)}
              grouped={true}
            />
          </div>

          {/* Entity Type */}
          <div className="space-y-2">
            <Label>Entity Type</Label>
            <MultiSelectPopover
              label="Entity Types"
              options={ENTITY_TYPES}
              selected={filters.entityTypes}
              onChange={(values) => updateFilter('entityTypes', values)}
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <Label htmlFor="status-filter">Status</Label>
            <Select value={filters.status} onValueChange={(value) => updateFilter('status', value)}>
              <SelectTrigger id="status-filter">
                <SelectValue placeholder="Select status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Severity */}
          <div className="space-y-2">
            <Label>Severity</Label>
            <MultiSelectPopover
              label="Severities"
              options={SEVERITIES}
              selected={filters.severities}
              onChange={(values) => updateFilter('severities', values)}
            />
          </div>
        </div>

        {/* Active Filter Tags */}
        {hasActiveFilters && (
          <div className="mt-4 flex flex-wrap gap-2">
            {filters.user !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                User: {staffUsers.find(u => u.id === filters.user)?.name || filters.user}
                <X className="h-3 w-3 cursor-pointer" onClick={() => updateFilter('user', 'all')} />
              </Badge>
            )}
            {filters.userRoles.map((role) => (
              <Badge key={role} variant="secondary" className="gap-1">
                Role: {USER_ROLES.find(r => r.value === role)?.label}
                <X className="h-3 w-3 cursor-pointer" onClick={() => updateFilter('userRoles', filters.userRoles.filter(r => r !== role))} />
              </Badge>
            ))}
            {filters.actionTypes.map((action) => {
              const allActions = ACTION_TYPES.flatMap(g => g.items);
              const actionLabel = allActions.find(a => a.value === action)?.label;
              return (
                <Badge key={action} variant="secondary" className="gap-1">
                  Action: {actionLabel}
                  <X className="h-3 w-3 cursor-pointer" onClick={() => updateFilter('actionTypes', filters.actionTypes.filter(a => a !== action))} />
                </Badge>
              );
            })}
            {filters.entityTypes.map((entity) => (
              <Badge key={entity} variant="secondary" className="gap-1">
                Entity: {ENTITY_TYPES.find(e => e.value === entity)?.label}
                <X className="h-3 w-3 cursor-pointer" onClick={() => updateFilter('entityTypes', filters.entityTypes.filter(e => e !== entity))} />
              </Badge>
            ))}
            {filters.status !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                Status: {filters.status}
                <X className="h-3 w-3 cursor-pointer" onClick={() => updateFilter('status', 'all')} />
              </Badge>
            )}
            {filters.severities.map((severity) => (
              <Badge key={severity} variant="secondary" className="gap-1">
                Severity: {SEVERITIES.find(s => s.value === severity)?.label}
                <X className="h-3 w-3 cursor-pointer" onClick={() => updateFilter('severities', filters.severities.filter(s => s !== severity))} />
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
