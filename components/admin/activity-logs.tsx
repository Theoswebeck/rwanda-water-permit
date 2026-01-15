"use client";

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  RefreshCw, 
  Download, 
  Activity,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { ActivityFilters, FilterState } from './activity-filters';
import { ActivityTable } from './activity-table';
import { 
  getAuditLogs, 
  getAuditLogStats,
  type AuditLogEntry,
  type AuditEntityType,
  type AuditSeverity,
  type AuditStatus
} from '@/lib/supabase';

const INITIAL_FILTERS: FilterState = {
  user: 'all',
  userRoles: [],
  actionTypes: [],
  entityTypes: [],
  status: 'all',
  severities: [],
};

export function ActivityLogs() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [pagination, setPagination] = useState({ page: 1, limit: 25 });
  const [totalLogs, setTotalLogs] = useState(0);
  const [stats, setStats] = useState({
    totalToday: 0,
    totalThisWeek: 0,
    criticalCount: 0,
    failedCount: 0
  });

  // Fetch logs based on current filters and pagination
  const fetchLogs = useCallback(async (showRefreshing = false) => {
    try {
      if (showRefreshing) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      // Convert filter state to API format
      const apiFilters = {
        user_id: filters.user !== 'all' ? filters.user : undefined,
        user_roles: filters.userRoles.length > 0 ? filters.userRoles : undefined,
        action_types: filters.actionTypes.length > 0 ? filters.actionTypes : undefined,
        entity_types: filters.entityTypes.length > 0 ? filters.entityTypes as AuditEntityType[] : undefined,
        status: filters.status as AuditStatus | 'all',
        severities: filters.severities.length > 0 ? filters.severities as AuditSeverity[] : undefined,
      };

      const { data, total } = await getAuditLogs(apiFilters, pagination);
      setLogs(data);
      setTotalLogs(total);
    } catch (error) {
      console.error('Failed to fetch audit logs:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filters, pagination]);

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const statsData = await getAuditLogStats();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to fetch audit log stats:', error);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchLogs();
    fetchStats();
  }, [fetchLogs, fetchStats]);

  // Handle filter changes
  const handleFiltersChange = (newFilters: FilterState) => {
    setFilters(newFilters);
    setPagination(prev => ({ ...prev, page: 1 })); // Reset to first page on filter change
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchLogs(true);
    fetchStats();
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setPagination(prev => ({ ...prev, page: newPage }));
  };

  // Handle page size change
  const handlePageSizeChange = (newSize: string) => {
    setPagination({ page: 1, limit: parseInt(newSize) });
  };

  // Calculate pagination info
  const totalPages = Math.ceil(totalLogs / pagination.limit);
  const startItem = (pagination.page - 1) * pagination.limit + 1;
  const endItem = Math.min(pagination.page * pagination.limit, totalLogs);

  // Export logs as CSV
  const handleExport = () => {
    if (logs.length === 0) return;

    const headers = [
      'Timestamp',
      'User',
      'Email',
      'Role',
      'Action',
      'Entity Type',
      'Description',
      'Status',
      'Severity',
      'IP Address',
      'Record ID'
    ];

    const rows = logs.map(log => [
      log.created_at,
      log.user ? `${log.user.first_name || ''} ${log.user.last_name || ''}`.trim() || log.user.company_name || log.user.email : 'System',
      log.user?.email || '',
      log.user?.role || '',
      log.action,
      log.entity_type || '',
      log.description || '',
      log.status,
      log.severity,
      log.ip_address || '',
      log.record_id || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `activity-logs-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Activity Logs</h2>
          <p className="text-muted-foreground">
            Monitor and track all system activities
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExport}
            disabled={logs.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalToday}</div>
            <p className="text-xs text-muted-foreground">Events logged today</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalThisWeek}</div>
            <p className="text-xs text-muted-foreground">Events in last 7 days</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Critical Events</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.criticalCount}</div>
            <p className="text-xs text-muted-foreground">Critical severity this week</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Failed Actions</CardTitle>
            <XCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{stats.failedCount}</div>
            <p className="text-xs text-muted-foreground">Failed operations this week</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Card */}
      <Card>
        <CardHeader className="pb-0">
          <CardTitle>Activity Log</CardTitle>
          <CardDescription>
            {totalLogs > 0 
              ? `Showing ${startItem}-${endItem} of ${totalLogs} entries`
              : 'No entries found'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {/* Filters */}
          <ActivityFilters 
            filters={filters} 
            onFiltersChange={handleFiltersChange} 
          />

          {/* Table */}
          <ActivityTable logs={logs} loading={loading} />

          {/* Pagination */}
          {totalLogs > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t">
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">Rows per page:</span>
                <Select 
                  value={pagination.limit.toString()} 
                  onValueChange={handlePageSizeChange}
                >
                  <SelectTrigger className="w-[70px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="25">25</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">
                  Page {pagination.page} of {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(pagination.page + 1)}
                    disabled={pagination.page >= totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
