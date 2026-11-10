"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Activity, Droplets, MapPin, Waves, Calendar } from "lucide-react";
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

function fillTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

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
      ? "text-emerald-600 bg-emerald-50 border-emerald-100"
      : tone === "warning"
        ? "text-amber-600 bg-amber-50 border-amber-100"
        : tone === "danger"
          ? "text-rose-600 bg-rose-50 border-rose-100"
          : "text-[#0072bc] bg-blue-50 border-blue-100";

  return (
    <Card className={`border rounded-2xl shadow-xs transition-all hover:shadow-md ${toneClass}`}>
      <CardHeader className="pb-1 pt-4 px-5">
        <CardTitle className="text-xs font-bold uppercase tracking-wider text-gray-500">{tx(label)}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {loading ? (
          <Skeleton className="h-9 w-24 bg-gray-200" />
        ) : (
          <div className="text-3xl font-extrabold tabular-nums">
            {formatNumber(value)}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RankedBars({
  rows,
  loading,
  emptyMessage,
  tx,
}: {
  rows: PublicDashboardBucket[];
  loading: boolean;
  emptyMessage: string;
  tx: (value: string) => string;
}) {
  const maxCount = useMemo(
    () => rows.reduce((max, row) => Math.max(max, row.count), 0),
    [rows]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full bg-gray-100" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500 py-4">{tx(emptyMessage)}</p>;
  }

  return (
    <ol className="space-y-3.5">
      {rows.map((row, index) => (
        <li key={row.key} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold text-gray-800">
              <span className="mr-2 text-xs font-bold tabular-nums text-gray-400">{index + 1}.</span>
              {tx(row.label)}
            </span>
            <span className="shrink-0 text-xs tabular-nums text-gray-500 font-medium">
              <span className="font-bold text-gray-900 text-sm">
                {formatNumber(row.count)}
              </span>{" "}
              ({row.percentage.toFixed(1)}%)
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#0072bc] to-[#37a4de] transition-all duration-500"
              style={{ width: `${maxCount > 0 ? (row.count / maxCount) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}

export function WaterDashboardSection() {
  const { data, isLoading, error } = usePublicWaterUseDashboardQuery();
  const [tab, setTab] = useState("total");

  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = useCallback((value: string) => translateText(value, language), [language]);

  const totals = data?.totals;
  const attribution = data?.catchmentAttribution;

  return (
    <section id="water-dashboard" className="py-20 bg-white border-t border-gray-100 w-full">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        {/* Section Heading */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-200 px-4 py-1.5 text-xs font-bold text-[#0072bc] mb-3">
            <Waves className="h-4 w-4" />
            <span>{tx("Live National Registry Data")}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 tracking-tight">
            {tx("National Water Use Dashboard")}
          </h2>
          <p className="mt-3 text-gray-500 text-sm sm:text-base max-w-2xl mx-auto">
            {tx("Public overview of water permits issued across Rwanda, recorded in real time in the national Permit Registry.")}
          </p>
        </div>

        {error ? (
          <Alert variant="destructive" className="mb-6 rounded-xl">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}

        {/* Tabbed Analytics Interface */}
        <Tabs value={tab} onValueChange={setTab} className="space-y-8">
          <div className="flex justify-center">
            <TabsList className="bg-gray-100 p-1 rounded-xl grid grid-cols-2 sm:grid-cols-4 max-w-2xl w-full">
              <TabsTrigger
                value="total"
                className="rounded-lg font-bold text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-[#0072bc] data-[state=active]:shadow-sm"
              >
                {tx("Total Permits")}
              </TabsTrigger>
              <TabsTrigger
                value="district"
                className="rounded-lg font-bold text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-[#0072bc] data-[state=active]:shadow-sm"
              >
                {tx("Per District")}
              </TabsTrigger>
              <TabsTrigger
                value="catchment"
                className="rounded-lg font-bold text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-[#0072bc] data-[state=active]:shadow-sm"
              >
                {tx("Per Catchment")}
              </TabsTrigger>
              <TabsTrigger
                value="activity"
                className="rounded-lg font-bold text-xs sm:text-sm data-[state=active]:bg-white data-[state=active]:text-[#0072bc] data-[state=active]:shadow-sm"
              >
                {tx("Per Activity")}
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ── Total View ── */}
          <TabsContent value="total" className="space-y-6">
            <Card className="border-0 bg-gradient-to-br from-[#003d6b] via-[#005a96] to-[#0072bc] text-white rounded-2xl shadow-lg p-6 sm:p-8">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-200">
                    {tx("Total Permits in the Registry")}
                  </span>
                  <p className="text-xs text-blue-100/80 mt-1">
                    {tx("All active and archived concessions currently tracked by the RWB")}
                  </p>
                </div>
                <div>
                  {isLoading ? (
                    <Skeleton className="h-14 w-40 bg-white/20 rounded-xl" />
                  ) : (
                    <div className="text-4xl sm:text-5xl font-black tabular-nums tracking-tight">
                      {formatNumber(totals?.total ?? 0)}
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Active Permits"
                value={totals?.operational ?? 0}
                loading={isLoading}
                tx={tx}
                tone="positive"
              />
              <StatTile
                label="Expired Permits"
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
                label="Expiring (3 Months)"
                value={totals?.expiringSoon ?? 0}
                loading={isLoading}
                tx={tx}
                tone="warning"
              />
            </div>
          </TabsContent>

          {/* ── District View ── */}
          <TabsContent value="district">
            <Card className="border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">
              <CardHeader className="p-0 pb-6 border-b border-gray-100 mb-6">
                <CardTitle className="flex items-center gap-2 text-lg text-gray-900 font-bold">
                  <MapPin className="h-5 w-5 text-[#0072bc]" />
                  <span>{tx("Permits per District")}</span>
                </CardTitle>
                <CardDescription className="text-gray-500 text-xs sm:text-sm">
                  {fillTemplate(tx("Districts ranked by number of active permits, out of {total} in total."), {
                    total: formatNumber(totals?.total ?? 0),
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <RankedBars
                  rows={data?.byDistrict ?? []}
                  loading={isLoading}
                  emptyMessage="No permits recorded yet."
                  tx={tx}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Catchment View ── */}
          <TabsContent value="catchment">
            <Card className="border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">
              <CardHeader className="p-0 pb-6 border-b border-gray-100 mb-6">
                <CardTitle className="flex items-center gap-2 text-lg text-gray-900 font-bold">
                  <Droplets className="h-5 w-5 text-[#0072bc]" />
                  <span>{tx("Permits per Catchment")}</span>
                </CardTitle>
                <CardDescription className="text-gray-500 text-xs sm:text-sm">
                  {tx("Rwanda's Level-I hydrological river catchments, ranked by number of concession allocations.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0 space-y-4">
                <RankedBars
                  rows={data?.byCatchment ?? []}
                  loading={isLoading}
                  emptyMessage="No permits recorded yet."
                  tx={tx}
                />
                {attribution && !isLoading ? (
                  <p className="border-t border-gray-100 pt-4 text-xs text-gray-400 leading-relaxed">
                    {fillTemplate(
                      tx(
                        "{coordinates} permits were placed in a catchment from their recorded GIS coordinates, and {estimated} estimated from the district or sector named in the permit."
                      ),
                      {
                        coordinates: formatNumber(attribution.fromCoordinates),
                        estimated: formatNumber(attribution.estimatedFromLocation),
                      }
                    )}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Activity View ── */}
          <TabsContent value="activity">
            <Card className="border border-gray-200 rounded-2xl shadow-sm p-6 sm:p-8">
              <CardHeader className="p-0 pb-6 border-b border-gray-100 mb-6">
                <CardTitle className="flex items-center gap-2 text-lg text-gray-900 font-bold">
                  <Activity className="h-5 w-5 text-[#0072bc]" />
                  <span>{tx("Permits per Activity")}</span>
                </CardTitle>
                <CardDescription className="text-gray-500 text-xs sm:text-sm">
                  {tx("Authorized water use recorded on each permit, categorized by economic sector.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
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
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-8 pt-4 border-t border-gray-100">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              {fillTemplate(
                tx("Source: Rwanda Water Resources Board Permit Registry. Updated {date}."),
                { date: new Date(data.generatedAt).toLocaleString() }
              )}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

