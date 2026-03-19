"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Clock, Loader2 } from "lucide-react";

import { getWaterUseReportWorkflowLabel } from "@/types/water-use-report-workflow";

type TimelineEvent = {
  id: string;
  userId: string | null;
  actorName: string;
  actorRole: string;
  avatar: string;
  fromStatus: string | null;
  toStatus: string;
  action: string;
  comment: string | null;
  createdAt: string;
};

function humanizeAction(action: string): string {
  return action
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

interface WaterUseReportWorkflowTimelineProps {
  reportId: string;
  refreshKey?: number;
}

export function WaterUseReportWorkflowTimeline({
  reportId,
  refreshKey,
}: WaterUseReportWorkflowTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTimeline = async () => {
      if (!reportId) return;
      try {
        setLoading(true);
        setError(null);

        const { data, error: fetchErr } = await supabase
          .from("water_use_report_workflow_history")
          .select(
            "id, water_use_report_id, user_id, from_status, to_status, action, comment, created_at"
          )
          .eq("water_use_report_id", reportId)
          .order("created_at", { ascending: false });

        if (fetchErr) throw fetchErr;
        const rows = (data as Record<string, unknown>[]) || [];

        const userIds = Array.from(
          new Set(
            rows
              .map((r) => r.user_id as string | null)
              .filter(Boolean) as string[]
          )
        );
        const usersById = new Map<string, Record<string, string>>();
        if (userIds.length > 0) {
          const { data: usersData, error: usersErr } = await supabase
            .from("users")
            .select("id, first_name, last_name, role")
            .in("id", userIds);
          if (usersErr) throw usersErr;
          (usersData || []).forEach((u: Record<string, string>) =>
            usersById.set(u.id, u)
          );
        }

        const formatted: TimelineEvent[] = rows.map((r) => {
          const actor = r.user_id
            ? usersById.get(r.user_id as string)
            : null;
          const first = actor?.first_name ?? "";
          const last = actor?.last_name ?? "";
          const name = actor
            ? `${first} ${last}`.trim() || "Unknown User"
            : "System";
          const initials = actor
            ? `${first?.[0] || ""}${last?.[0] || ""}`.toUpperCase() || "UU"
            : "SY";

          return {
            id: r.id as string,
            userId: (r.user_id as string) ?? null,
            actorName: name,
            actorRole: (actor?.role as string) || "system",
            avatar: initials,
            fromStatus: (r.from_status as string) ?? null,
            toStatus: r.to_status as string,
            action: r.action as string,
            comment: (r.comment as string) ?? null,
            createdAt: r.created_at as string,
          };
        });

        setEvents(formatted);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to load timeline";
        console.error(
          "❌ Failed to fetch water use report workflow history:",
          e
        );
        setError(msg);
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();
  }, [reportId, refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock className="h-4 w-4 text-muted-foreground" />
          Workflow Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading timeline...
          </div>
        ) : events.length > 0 ? (
          <div className="space-y-4">
            {events.map((evt, idx) => (
              <div key={evt.id} className="relative flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                    {evt.avatar}
                  </div>
                  {idx < events.length - 1 ? (
                    <div className="w-px flex-1 bg-border mt-2" />
                  ) : null}
                </div>

                <div className="flex-1 pb-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium">
                      {evt.actorName}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {evt.actorRole}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(evt.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                    {evt.fromStatus ? (
                      <>
                        <Badge variant="secondary" className="text-xs">
                          {getWaterUseReportWorkflowLabel(evt.fromStatus)}
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </>
                    ) : null}
                    <Badge variant="default" className="text-xs">
                      {getWaterUseReportWorkflowLabel(evt.toStatus)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      ({humanizeAction(evt.action)})
                    </span>
                  </div>

                  {evt.comment ? (
                    <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                      {evt.comment}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground py-4">
            No workflow events yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
