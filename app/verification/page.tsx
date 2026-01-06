"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
// import { ProtectedRoute } from "@/components/auth/protected-route"; // TEMPORARY: Disabled for testing
import { DashboardLayout } from "@/components/dashboard/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, FileCheck, Eye } from "lucide-react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { Application, ApplicationStatus } from "@/types/database";

interface VerificationApplication extends Application {
  applicant?: { first_name?: string; last_name?: string; company_name?: string };
}

export default function VerificationDashboard() {
  const [applications, setApplications] = useState<VerificationApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error } = await supabase
          .from("applications")
          .select(
            `
            *,
            applicant:users!applicant_id(first_name, last_name, company_name)
          `
          )
          .eq("status", "pending_verification")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setApplications((data || []) as VerificationApplication[]);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load verification queue";
        console.error("❌ Failed to load verification queue:", e);
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchApps();
  }, []);

  const pendingCount = applications.length;

  const getStatusBadge = (status: ApplicationStatus) => {
    const config: Record<string, { label: string; className: string }> = {
      pending_verification: { label: "Pending Verification", className: "bg-blue-100 text-blue-700 border-blue-200" },
      pending_review: { label: "Pending Review", className: "bg-amber-100 text-amber-700 border-amber-200" },
      pending_final_approval: { label: "Pending Approval", className: "bg-purple-100 text-purple-700 border-purple-200" },
      approved_pending_permit: { label: "Approved - Permit Pending", className: "bg-green-100 text-green-700 border-green-200" },
      rejected: { label: "Rejected", className: "bg-red-100 text-red-700 border-red-200" },
    };
    const c = config[status] || { label: status.replace(/_/g, " ").toUpperCase(), className: "bg-slate-100 text-slate-700 border-slate-200" };
    return (
      <Badge variant="outline" className={c.className}>
        {c.label}
      </Badge>
    );
  };

  const getApplicantName = (a: VerificationApplication) => {
    const applicant = a.applicant;
    return (
      applicant?.company_name ||
      (applicant?.first_name && applicant?.last_name ? `${applicant.first_name} ${applicant.last_name}` : "Unknown Applicant")
    );
  };

  const rows = useMemo(() => applications, [applications]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto px-6 py-8 space-y-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="flex flex-col space-y-4 md:flex-row md:items-center md:justify-between md:space-y-0 mb-6">
            <div>
              <h1 className="text-primary leading-tighter max-w-2xl text-4xl font-semibold tracking-tight text-balance lg:leading-[1.1] lg:font-semibold xl:text-5xl xl:tracking-tighter">
                Verifier Dashboard
              </h1>
              <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-muted-foreground">
                Verification stage review before final approval
              </p>
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Verification</CardTitle>
                <FileCheck className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{pendingCount}</div>
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileCheck className="h-5 w-5" />
                Verification Queue
              </CardTitle>
              <CardDescription>Applications waiting for verification</CardDescription>
            </CardHeader>
            <CardContent>
              {error && <div className="text-sm text-destructive">{error}</div>}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Application #</TableHead>
                      <TableHead>Applicant</TableHead>
                      <TableHead>Project</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-10">
                          No applications pending verification.
                        </TableCell>
                      </TableRow>
                    ) : (
                      rows.map((app) => (
                        <TableRow key={app.id}>
                          <TableCell className="font-mono">{app.application_number}</TableCell>
                          <TableCell>{getApplicantName(app)}</TableCell>
                          <TableCell className="max-w-[420px] truncate">{app.project_title}</TableCell>
                          <TableCell>{getStatusBadge(app.status)}</TableCell>
                          <TableCell className="text-right">
                            <Link href={`/verification/application/${app.application_number}`}>
                              <Button size="sm" variant="outline" className="gap-2">
                                <Eye className="h-4 w-4" />
                                Open
                              </Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}


