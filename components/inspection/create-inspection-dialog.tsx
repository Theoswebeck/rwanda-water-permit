"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertCircle, Check, FileCheck, Loader2, MapPin, Search } from "lucide-react";

type PermitPickRow = {
  id: string;
  permit_number: string;
  status: string;
  issued_date?: string | null;
  expiry_date?: string | null;
  application: {
    id: string;
    application_number?: string | null;
    project_title?: string | null;
    district?: string | null;
    sector?: string | null;
    applicant?: {
      first_name?: string | null;
      last_name?: string | null;
      company_name?: string | null;
      account_type?: string | null;
    } | null;
  } | null;
};

function applicantName(app: PermitPickRow["application"]): string {
  const a = app?.applicant;
  if (!a) return "—";
  const isIndividual = a.account_type === "individual";
  if (isIndividual) {
    const name = `${a.first_name ?? ""} ${a.last_name ?? ""}`.trim();
    return name || "—";
  }
  return a.company_name || "—";
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function getLocation(app: PermitPickRow["application"]): string {
  if (!app) return "—";
  const parts = [app.district, app.sector].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
}

export function CreateInspectionDialog({
  trigger,
}: {
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const { loading: authLoading } = useAuth();

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [permits, setPermits] = useState<PermitPickRow[]>([]);
  const [selected, setSelected] = useState<PermitPickRow | null>(null);

  useEffect(() => {
    if (!open) return;
    if (authLoading) return;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);

        const { data, error: permitsError } = await supabase
          .from("permits")
          .select(
            `
            id,
            permit_number,
            status,
            issued_date,
            expiry_date,
            application:applications(
              id,
              application_number,
              project_title,
              district,
              sector,
              applicant:users!applicant_id(
                first_name,
                last_name,
                company_name,
                account_type
              )
            )
          `
          )
          .eq("status", "active")
          .order("issued_date", { ascending: false });

        if (permitsError) throw permitsError;
        setPermits((data || []) as unknown as PermitPickRow[]);
      } catch (e: any) {
        console.error("❌ Failed to load permits for inspection picker:", e);
        setError(e?.message || "Failed to load permits");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [open, authLoading]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return permits;
    return permits.filter((p) => {
      const permitNo = (p.permit_number || "").toLowerCase();
      const appNo = (p.application?.application_number || "").toLowerCase();
      const title = (p.application?.project_title || "").toLowerCase();
      const applicant = applicantName(p.application).toLowerCase();
      const location = getLocation(p.application).toLowerCase();
      return permitNo.includes(q) || appNo.includes(q) || title.includes(q) || applicant.includes(q) || location.includes(q);
    });
  }, [permits, search]);

  const start = () => {
    const applicationNumber = selected?.application?.application_number || "";
    if (!applicationNumber) {
      setError("Selected permit is missing an application number.");
      return;
    }
    setOpen(false);
    router.push(`/inspection/permit/${applicationNumber}`);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setError(null);
          setSearch("");
          setSelected(null);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger || (
          <Button className="gap-2">
            <FileCheck className="h-4 w-4" />
            Create inspection
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-5xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-8 pt-8 pb-6">
          <DialogTitle className="text-2xl font-semibold">Create inspection</DialogTitle>
          <DialogDescription className="text-muted-foreground text-base mt-2">
            Select the permit you want to inspect. You&apos;ll be taken to the inspection form.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="mx-8 mb-6 flex items-center gap-3 text-sm text-red-600 bg-red-50 dark:bg-red-950/30 px-5 py-4 rounded-xl border border-red-200 dark:border-red-900">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}

        {/* Search bar */}
        <div className="px-8 pb-6">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search permit #, application #, applicant, location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-12 pr-20 h-12 text-base bg-muted/30 border border-border/50 rounded-xl focus-visible:ring-2 focus-visible:ring-primary/20 focus-visible:border-primary"
            />
            <Badge 
              variant="secondary" 
              className="absolute right-4 top-1/2 -translate-y-1/2 bg-background border text-sm font-medium px-3"
            >
              {filtered.length}
            </Badge>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-muted-foreground">
            <Loader2 className="h-10 w-10 animate-spin text-primary/60" />
            <span className="text-base">Loading active permits…</span>
          </div>
        ) : (
          <div className="border-t">
            {/* Table header */}
            <div className="grid grid-cols-[48px_1.2fr_1fr_1fr_1fr_0.9fr_0.9fr] gap-4 px-8 py-4 bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <div></div>
              <div>Permit #</div>
              <div>Application #</div>
              <div>Applicant</div>
              <div>Location</div>
              <div>Issued</div>
              <div>Expires</div>
            </div>

            {/* Table body */}
            <div className="max-h-[400px] overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                  <Search className="h-12 w-12 mb-4 opacity-20" />
                  <p className="text-base font-medium">No active permits found</p>
                  <p className="text-sm mt-1 opacity-70">Try adjusting your search criteria</p>
                </div>
              ) : (
                filtered.map((p) => {
                  const isSelected = selected?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => setSelected(p)}
                      className={`
                        grid grid-cols-[48px_1.2fr_1fr_1fr_1fr_0.9fr_0.9fr] gap-4 px-8 py-4 cursor-pointer
                        border-b last:border-b-0 transition-all duration-200
                        ${isSelected 
                          ? "bg-blue-50 dark:bg-blue-950/40 border-l-4 border-l-blue-500" 
                          : "hover:bg-slate-50 dark:hover:bg-slate-900/50 border-l-4 border-l-transparent"
                        }
                      `}
                    >
                      {/* Selection indicator */}
                      <div className="flex items-center justify-center">
                        <div 
                          className={`
                            w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200
                            ${isSelected 
                              ? "bg-blue-500 border-blue-500 text-white shadow-sm" 
                              : "border-slate-300 dark:border-slate-600 hover:border-slate-400"
                            }
                          `}
                        >
                          {isSelected && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </div>
                      </div>

                      {/* Permit # */}
                      <div className="flex items-center min-w-0">
                        <span className={`font-semibold text-sm truncate ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-foreground"}`}>
                          {p.permit_number}
                        </span>
                      </div>

                      {/* Application # */}
                      <div className="flex items-center min-w-0">
                        <span className="text-sm text-muted-foreground truncate">
                          {p.application?.application_number || "—"}
                        </span>
                      </div>

                      {/* Applicant */}
                      <div className="flex items-center min-w-0">
                        <span className="text-sm text-foreground truncate font-medium">
                          {applicantName(p.application)}
                        </span>
                      </div>

                      {/* Location */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm text-muted-foreground truncate">
                          {getLocation(p.application)}
                        </span>
                      </div>

                      {/* Issued date */}
                      <div className="flex items-center min-w-0">
                        <span className="text-sm text-muted-foreground">
                          {formatDate(p.issued_date)}
                        </span>
                      </div>

                      {/* Expiry date */}
                      <div className="flex items-center min-w-0">
                        <span className="text-sm text-muted-foreground">
                          {formatDate(p.expiry_date)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="px-8 py-5 bg-muted/30 border-t">
          <div className="flex items-center justify-between w-full">
            <div className="text-sm text-muted-foreground">
              {selected ? (
                <span className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-blue-500" />
                  Selected: <span className="font-semibold text-foreground">{selected.permit_number}</span>
                </span>
              ) : (
                <span className="text-muted-foreground/70">Select a permit to continue</span>
              )}
            </div>
            <div className="flex items-center gap-4">
              <Button type="button" variant="ghost" size="lg" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button 
                type="button" 
                disabled={!selected || loading} 
                onClick={start}
                size="lg"
                className="min-w-[160px] bg-primary hover:bg-primary/90"
              >
                Start inspection
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
