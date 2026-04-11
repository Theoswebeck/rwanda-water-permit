"use client";

import React, { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  ChevronDown, 
  ChevronUp, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  Info,
  AlertCircle,
  User,
  FileText,
  Shield,
  ClipboardCheck,
  File,
  CreditCard,
  Settings,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AuditLogEntry } from '@/lib/supabase';

interface ActivityTableProps {
  logs: AuditLogEntry[];
  loading: boolean;
}

// Get icon for entity type
function getEntityIcon(entityType: string | null) {
  switch (entityType) {
    case 'user':
      return <User className="h-4 w-4" />;
    case 'application':
      return <FileText className="h-4 w-4" />;
    case 'permit':
      return <Shield className="h-4 w-4" />;
    case 'inspection':
      return <ClipboardCheck className="h-4 w-4" />;
    case 'document':
      return <File className="h-4 w-4" />;
    case 'payment':
      return <CreditCard className="h-4 w-4" />;
    case 'system':
      return <Settings className="h-4 w-4" />;
    default:
      return <Info className="h-4 w-4" />;
  }
}

// Get severity badge styling
function getSeverityBadge(severity: string) {
  switch (severity) {
    case 'critical':
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Critical
        </Badge>
      );
    case 'warning':
      return (
        <Badge variant="outline" className="gap-1 border-yellow-500 text-yellow-600 bg-yellow-50">
          <AlertTriangle className="h-3 w-3" />
          Warning
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="gap-1 border-blue-500 text-blue-600 bg-blue-50">
          <Info className="h-3 w-3" />
          Info
        </Badge>
      );
  }
}

// Get status badge styling
function getStatusBadge(status: string) {
  if (status === 'success') {
    return (
      <Badge variant="outline" className="gap-1 border-green-500 text-green-600 bg-green-50">
        <CheckCircle className="h-3 w-3" />
        Success
      </Badge>
    );
  }
  return (
    <Badge variant="destructive" className="gap-1">
      <XCircle className="h-3 w-3" />
      Failed
    </Badge>
  );
}

// Format action name for display
function formatAction(action: string): string {
  return action
    .split('.')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).replace(/_/g, ' '))
    .join(' - ');
}

// Format timestamp
function formatTimestamp(timestamp: string): { date: string; time: string } {
  const date = new Date(timestamp);
  return {
    date: date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    }),
    time: date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    })
  };
}

// Get user initials
function getUserInitials(user: AuditLogEntry['user']): string {
  if (!user) return '?';
  if (user.first_name && user.last_name) {
    return `${user.first_name[0]}${user.last_name[0]}`.toUpperCase();
  }
  if (user.company_name) {
    return user.company_name.substring(0, 2).toUpperCase();
  }
  return user.email.substring(0, 2).toUpperCase();
}

// Get user display name
function getUserDisplayName(user: AuditLogEntry['user']): string {
  if (!user) return 'System';
  if (user.first_name && user.last_name) {
    return `${user.first_name} ${user.last_name}`;
  }
  if (user.company_name) {
    return user.company_name;
  }
  return user.email;
}

// Expanded row detail component
function ExpandedRowDetail({ log }: { log: AuditLogEntry }) {
  return (
    <div className="p-4 bg-gray-50 border-t">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* User Info */}
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">User Details</h4>
          <div className="space-y-1 text-sm">
            <p><span className="text-gray-500">Email:</span> {log.user?.email || 'N/A'}</p>
            <p><span className="text-gray-500">Role:</span> {log.user?.role || 'N/A'}</p>
          </div>
        </div>

        {/* Action Details */}
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">Action Details</h4>
          <div className="space-y-1 text-sm">
            <p><span className="text-gray-500">Action:</span> {log.action}</p>
            <p><span className="text-gray-500">Table:</span> {log.table_name || 'N/A'}</p>
            <p><span className="text-gray-500">Record ID:</span> {log.record_id || 'N/A'}</p>
          </div>
        </div>

        {/* Request Info */}
        <div>
          <h4 className="text-sm font-medium text-gray-500 mb-2">Request Info</h4>
          <div className="space-y-1 text-sm">
            <p><span className="text-gray-500">IP Address:</span> {log.ip_address || 'N/A'}</p>
            <p><span className="text-gray-500">Request ID:</span> <span className="font-mono text-xs">{log.request_id || 'N/A'}</span></p>
            <p className="truncate"><span className="text-gray-500">User Agent:</span> {log.user_agent || 'N/A'}</p>
          </div>
        </div>

        {/* Old/New Values */}
        {(log.old_values || log.new_values) && (
          <div className="col-span-full">
            <h4 className="text-sm font-medium text-gray-500 mb-2">Value Changes</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {log.old_values && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Previous Value:</p>
                  <pre className="text-xs bg-red-50 p-2 rounded border border-red-200 overflow-auto max-h-32">
                    {JSON.stringify(log.old_values, null, 2)}
                  </pre>
                </div>
              )}
              {log.new_values && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">New Value:</p>
                  <pre className="text-xs bg-green-50 p-2 rounded border border-green-200 overflow-auto max-h-32">
                    {JSON.stringify(log.new_values, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ActivityTable({ logs, loading }: ActivityTableProps) {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-500">
        <Eye className="h-12 w-12 mb-4 text-gray-300" />
        <p className="text-lg font-medium">No activity logs found</p>
        <p className="text-sm">Try adjusting your filters or check back later</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead>
            <TableHead className="w-[180px]">Timestamp</TableHead>
            <TableHead className="w-[200px]">User</TableHead>
            <TableHead className="w-[200px]">Action</TableHead>
            <TableHead className="w-[120px]">Entity</TableHead>
            <TableHead className="w-[320px] max-w-[320px]">Description</TableHead>
            <TableHead className="w-[100px]">Status</TableHead>
            <TableHead className="w-[100px]">Severity</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => {
            const isExpanded = expandedRows.has(log.id);
            const { date, time } = formatTimestamp(log.created_at);
            
            return (
              <React.Fragment key={log.id}>
                <TableRow
                  className={cn(
                    "cursor-pointer hover:bg-gray-50",
                    isExpanded && "bg-gray-50"
                  )}
                  onClick={() => toggleRow(log.id)}
                >
                  <TableCell>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{date}</span>
                      <span className="text-xs text-gray-500">{time}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">
                          {getUserInitials(log.user)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span className="text-sm font-medium truncate max-w-[120px]">
                          {getUserDisplayName(log.user)}
                        </span>
                        <span className="text-xs text-gray-500 capitalize">
                          {log.user?.role || 'System'}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm font-medium">
                      {formatAction(log.action)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">
                        {getEntityIcon(log.entity_type)}
                      </span>
                      <span className="text-sm capitalize">
                        {log.entity_type || 'N/A'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-[320px] align-top">
                    <p className="text-sm text-gray-600 line-clamp-2 whitespace-normal break-words">
                      {log.description || 'No description'}
                    </p>
                  </TableCell>
                  <TableCell>
                    {getStatusBadge(log.status)}
                  </TableCell>
                  <TableCell>
                    {getSeverityBadge(log.severity)}
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <ExpandedRowDetail log={log} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
