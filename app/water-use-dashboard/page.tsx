"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Activity, Droplets, MapPin, Waves } from "lucide-react";
import {
  usePublicWaterUseDashboardQuery,
  type PublicDashboardBucket,
} from "@/hooks/usePublicWaterUseDashboardQuery";
import {
  getPreferredLanguage,
  subscribeToLanguageChanges,
  type AppLanguage,
} from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

/** Translate a sentence that carries numbers, then substitute them back in. */
function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

/**
 * Public Water Use Dashboard.
 *
 * Reports aggregate figures from the national Permit Registry only: how many
 * permits exist, and how they break down by district, catchment and activity.
 * No individual permit details are shown or fetched — the API behind this page
 * returns counts, nothing else.
 */

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(Math.round(n));
}

function StatTile({
  label,
  value,
  loading,
  tx,
  tone = "muted",
}: {
  label: string;
  value: number;
  loading: boolean;
  tx: (value: string) => string;
  tone?: "muted" | "positive" | "warning" | "danger";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "warning"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "danger"
          ? "text-rose-700 dark:text-rose-400"
          : "text-slate-900 dark:text-slate-100";

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{tx(label)}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <div className={`text-3xl font-semibold tabular-nums ${toneClass}`}>
            {formatNumber(value)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Ranked "label — count — share of total" list. */
function RankedBars({
  rows,
  loading,
  emptyMessage,
  tx,
}: {
  rows: PublicDashboardBucket[];
  loading: boolean;
  emptyMessage: string;
  /**
   * District and catchment names are proper nouns and pass through unchanged;
   * activity categories are in the dictionary and do get translated.
   */
  tx: (value: string) => string;
}) {
  const maxCount = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.count), 0),
    [rows]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{tx(emptyMessage)}</p>;
  }

  return (
    <ol className="space-y-3">
      {rows.map((row, index) => (
        <li key={row.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
              <span className="mr-2 text-xs tabular-nums text-muted-foreground">{index + 1}.</span>
              {tx(row.label)}
            </span>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {formatNumber(row.count)}
              </span>{" "}
              ({row.percentage.toFixed(1)}%)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-sky-600/80 dark:bg-sky-500/80"
              // Bars are scaled to the largest bucket so small ones stay visible.
              style={{ width: `${maxCount > 0 ? (row.count / maxCount) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function WaterUseDashboardPage() {
  const { data, isLoading, error } = usePublicWaterUseDashboardQuery();
  const [tab, setTab] = useState("total");

  // Language is read on the client only (localStorage), so the first render is
  // English and re-renders when the header's EN/RW toggle fires its event.
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = useCallback((value: string) => translateText(value, language), [language]);

  const totals = data?.totals;
  const attribution = data?.catchmentAttribution;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="space-y-8"
      >
        <header className="space-y-3 text-center">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-3">
              <Waves className="h-7 w-7 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{tx("Water Use Dashboard")}</h1>
          <p className="mx-auto max-w-2xl text-muted-foreground">
            {tx("Water use permits issued across Rwanda, as recorded in the national Permit Registry.")}
          </p>
        </header>

        {error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        <Tabs value={tab} onValueChange={setTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="total">{tx("Total Permits")}</TabsTrigger>
            <TabsTrigger value="district">{tx("Per District")}</TabsTrigger>
            <TabsTrigger value="catchment">{tx("Per Catchment")}</TabsTrigger>
            <TabsTrigger value="activity">{tx("Per Activity")}</TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------- Total */}
          <TabsContent value="total" className="space-y-6">
            <Card className="border-0 bg-gradient-to-br from-sky-700 to-sky-900 text-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-white/90">
                  {tx("Total permits in the registry")}
                </CardTitle>
                <CardDescription className="text-white/70">
                  {tx("All water use permits on record, including expired and cancelled ones")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-14 w-40 bg-white/20" />
                ) : (
                  <div className="text-5xl font-semibold tabular-nums">
                    {formatNumber(totals?.total ?? 0)}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Active"
                value={totals?.operational ?? 0}
                loading={isLoading}
                tx={tx}
                tone="positive"
              />
              <StatTile
                label="Expired"
                value={totals?.expired ?? 0}
                loading={isLoading}
                tx={tx}
                tone="danger"
              />
              <StatTile
                label="Cancelled"
                value={totals?.cancelled ?? 0}
                loading={isLoading}
                tx={tx}
              />
              <StatTile
                label="Expiring within 3 months"
                value={totals?.expiringSoon ?? 0}
                loading={isLoading}
                tx={tx}
                tone="warning"
              />
            </div>
          </TabsContent>

          {/* ------------------------------------------------------- District */}
          <TabsContent value="district">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  {tx("Permits per District")}
                </CardTitle>
                <CardDescription>
                  {fillTemplate(tx("Districts ranked by number of permits, out of {total} in total."), {
                    total: formatNumber(totals?.total ?? 0),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RankedBars
                  rows={data?.byDistrict ?? []}
                  loading={isLoading}
                  emptyMessage="No permits recorded yet."
                  tx={tx}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------------ Catchment */}
          <TabsContent value="catchment">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Droplets className="h-4 w-4 text-primary" />
                  {tx("Permits per Catchment")}
                </CardTitle>
                <CardDescription>
                  {tx("Rwanda's nine Level-I river catchments, ranked by number of permits.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <RankedBars
                  rows={data?.byCatchment ?? []}
                  loading={isLoading}
                  emptyMessage="No permits recorded yet."
                  tx={tx}
                />
                {attribution && !isLoading ? (
                  <p className="border-t pt-3 text-xs text-muted-foreground">
                    {fillTemplate(
                      tx(
                        "{coordinates} permits were placed in a catchment from their recorded coordinates, and {estimated} from the district or sector named in the permit — an estimate, since a district can span more than one catchment."
                      ),
                      {
                        coordinates: formatNumber(attribution.fromCoordinates),
                        estimated: formatNumber(attribution.estimatedFromLocation),
                      }
                    )}{" "}
                    {attribution.unattributed > 0
                      ? fillTemplate(
                          tx(
                            "{unattributed} permits do not record a location precise enough to attribute."
                          ),
                          { unattributed: formatNumber(attribution.unattributed) }
                        )
                      : ""}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------------- Activity */}
          <TabsContent value="activity">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  {tx("Permits per Activity")}
                </CardTitle>
                <CardDescription>
                  {tx("The authorised water use recorded on each permit, grouped into activity categories.")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RankedBars
                  rows={data?.byActivity ?? []}
                  loading={isLoading}
                  emptyMessage="No permits recorded yet."
                  tx={tx}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {data?.generatedAt ? (
          <p className="text-center text-xs text-muted-foreground">
            {fillTemplate(
              tx("Source: Rwanda Water Resources Board Permit Registry. Updated {date}."),
              { date: new Date(data.generatedAt).toLocaleString() }
            )}
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}
