"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, FileText, Loader2, Save, ScrollText } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { buildDiffEntries } from "./diff";
import { SaveDiffDialog } from "./save-diff-dialog";
import { SlotRow } from "./slot-row";
import type {
  ClientDocumentKind,
  ClientResolvedSlot,
  EditorPayload,
} from "./types";

export interface DocumentTextEditorProps {
  applicationId: string;
  /** Bumped by the parent (e.g. when the assessor saves a structured field
   *  via another editor) to force a refetch of the slot list. */
  refreshKey?: number;
  readOnly?: boolean;
  /** Called after every successful save so the parent can refresh the PDF
   *  preview iframe. */
  onSaved?: () => void;
}

type FetchState =
  | { status: "loading" }
  | { status: "ready"; payload: EditorPayload }
  | { status: "error"; message: string };

export function DocumentTextEditor({
  applicationId,
  refreshKey = 0,
  readOnly,
  onSaved,
}: DocumentTextEditorProps) {
  const [activeDoc, setActiveDoc] = useState<ClientDocumentKind>("permit");
  const [activeLang, setActiveLang] = useState<"en" | "rw">("en");
  const [drafts, setDrafts] = useState<Map<string, string | null>>(new Map());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [fetchState, setFetchState] = useState<FetchState>({ status: "loading" });

  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const refetch = useCallback(async () => {
    setFetchState({ status: "loading" });
    try {
      const res = await fetch(
        `/api/staff/applications/${applicationId}/document-text-overrides`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const message = body?.message || `Request failed (${res.status})`;
        setFetchState({ status: "error", message });
        return;
      }
      const body = (await res.json()) as EditorPayload;
      setFetchState({ status: "ready", payload: body });
    } catch (err) {
      setFetchState({
        status: "error",
        message: err instanceof Error ? err.message : "Network error",
      });
    }
  }, [applicationId]);

  useEffect(() => {
    refetch();
  }, [refetch, refreshKey]);

  // Warn before leaving with unsaved drafts.
  useEffect(() => {
    if (drafts.size === 0) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [drafts.size]);

  const handleChange = useCallback((slotId: string, text: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(slotId, text);
      return next;
    });
  }, []);

  const handleReset = useCallback((slotId: string) => {
    setDrafts((prev) => {
      const next = new Map(prev);
      next.set(slotId, null);
      return next;
    });
  }, []);

  const allSlots = useMemo<ClientResolvedSlot[]>(() => {
    if (fetchState.status !== "ready") return [];
    return [...fetchState.payload.permitSlots, ...fetchState.payload.contractSlots];
  }, [fetchState]);

  const diffEntries = useMemo(
    () => buildDiffEntries(allSlots, drafts),
    [allSlots, drafts],
  );

  const performSave = useCallback(async () => {
    if (fetchState.status !== "ready" || diffEntries.length === 0) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      const patches = diffEntries.map((e) => ({
        slotId: e.slotId,
        text: e.kind === "reset" ? null : e.after,
      }));
      const res = await fetch(
        `/api/staff/applications/${applicationId}/document-text-overrides`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ifVersion: fetchState.payload.envelope.version,
            patches,
          }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (res.status === 409 && body?.currentEnvelope) {
          setErrorMessage(
            "Somebody else saved while you were editing. Reloading the latest version — please re-apply your changes.",
          );
          await refetch();
          return;
        }
        setErrorMessage(body?.message || `Save failed (${res.status})`);
        return;
      }
      // Success — clear drafts, refetch, notify parent.
      setDrafts(new Map());
      setConfirmOpen(false);
      await refetch();
      onSaved?.();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Network error");
    } finally {
      setSaving(false);
    }
  }, [applicationId, diffEntries, fetchState, onSaved, refetch]);

  if (fetchState.status === "loading") {
    return (
      <Card>
        <CardContent className="flex items-center justify-center gap-3 py-10 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading editable text…
        </CardContent>
      </Card>
    );
  }
  if (fetchState.status === "error") {
    return (
      <Card>
        <CardContent className="space-y-3 py-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{fetchState.message}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={refetch}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const payload = fetchState.payload;
  const hardMax = payload.hardMaxLength;

  const docSlots = activeDoc === "permit" ? payload.permitSlots : payload.contractSlots;
  const overriddenInDoc = docSlots.filter((s) => s.overrideText).length;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-muted/30">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4" /> Document text editor
          </CardTitle>
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            {payload.variant.replaceAll("_", " ")}
          </Badge>
          {payload.envelope.updatedAt && (
            <span className="text-xs text-muted-foreground">
              Last save v{payload.envelope.version}
              {payload.envelope.updatedBy ? ` by ${payload.envelope.updatedBy.name}` : ""}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {drafts.size > 0 && (
              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                {drafts.size} unsaved
              </Badge>
            )}
            <Button
              size="sm"
              disabled={readOnly || diffEntries.length === 0 || saving}
              onClick={() => setConfirmOpen(true)}
            >
              <Save className="mr-2 h-4 w-4" />
              Save{diffEntries.length > 0 ? `… (${diffEntries.length})` : ""}
            </Button>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Every editable text on the permit and contract is below. Changes update the live
          preview immediately and are stored as overrides — you can reset any field back to
          its computed default at any time.
        </p>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <Tabs value={activeDoc} onValueChange={(v) => setActiveDoc(v as ClientDocumentKind)}>
          <TabsList>
            <TabsTrigger value="permit" className="gap-2">
              <FileText className="h-4 w-4" /> Permit
              <SlotCounter slots={payload.permitSlots} />
            </TabsTrigger>
            <TabsTrigger value="contract" className="gap-2">
              <FileText className="h-4 w-4" /> Contract
              <SlotCounter slots={payload.contractSlots} />
            </TabsTrigger>
          </TabsList>

          {(["permit", "contract"] as const).map((doc) => (
            <TabsContent key={doc} value={doc} className="pt-4">
              <DocumentSlotPane
                slots={doc === "permit" ? payload.permitSlots : payload.contractSlots}
                drafts={drafts}
                onChange={handleChange}
                onReset={handleReset}
                hardMax={hardMax}
                readOnly={readOnly}
                activeLang={activeLang}
                onLangChange={setActiveLang}
              />
            </TabsContent>
          ))}
        </Tabs>

        {overriddenInDoc === 0 && drafts.size === 0 && (
          <p className="rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Tip — every row below is fully editable. Edits stay visible on the preview and
            require approver re-confirmation before issuance. Click <strong>Reset to
            default</strong> on any row to revert to the computed text.
          </p>
        )}
      </CardContent>

      <SaveDiffDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!saving) setConfirmOpen(open);
        }}
        entries={diffEntries}
        saving={saving}
        errorMessage={errorMessage}
        onConfirm={performSave}
      />
    </Card>
  );
}

function SlotCounter({ slots }: { slots: ClientResolvedSlot[] }) {
  const overridden = slots.filter((s) => s.overrideText).length;
  if (slots.length === 0) {
    return (
      <Badge variant="secondary" className="ml-1 text-[10px]">
        soon
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="ml-1 text-[10px]">
      {overridden}/{slots.length}
    </Badge>
  );
}

interface DocumentSlotPaneProps {
  slots: ClientResolvedSlot[];
  drafts: Map<string, string | null>;
  onChange: (slotId: string, text: string) => void;
  onReset: (slotId: string) => void;
  hardMax: number;
  readOnly?: boolean;
  activeLang: "en" | "rw";
  onLangChange: (lang: "en" | "rw") => void;
}

function DocumentSlotPane({
  slots,
  drafts,
  onChange,
  onReset,
  hardMax,
  readOnly,
  activeLang,
  onLangChange,
}: DocumentSlotPaneProps) {
  if (slots.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-muted/20 p-6 text-center text-sm text-muted-foreground">
        This document is not yet wired into the text editor. Slots will appear here once
        the catalogue is populated.
      </div>
    );
  }

  const bilingual = slots.filter((s) => s.slot.language === "bilingual");
  const en = slots.filter((s) => s.slot.language === "en");
  const rw = slots.filter((s) => s.slot.language === "rw");

  return (
    <div className="space-y-6">
      {bilingual.length > 0 && (
        <SlotGroupSection
          title="Bilingual signatures & shared lines"
          description="These rows render exactly as written in both English and Kinyarwanda."
          slots={bilingual}
          drafts={drafts}
          onChange={onChange}
          onReset={onReset}
          hardMax={hardMax}
          readOnly={readOnly}
        />
      )}

      <Tabs value={activeLang} onValueChange={(v) => onLangChange(v as "en" | "rw")}>
        <TabsList>
          <TabsTrigger value="en">English ({en.length})</TabsTrigger>
          <TabsTrigger value="rw">Kinyarwanda ({rw.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="en" className="pt-4">
          <SlotGroups
            slots={en}
            drafts={drafts}
            onChange={onChange}
            onReset={onReset}
            hardMax={hardMax}
            readOnly={readOnly}
          />
        </TabsContent>
        <TabsContent value="rw" className="pt-4">
          <SlotGroups
            slots={rw}
            drafts={drafts}
            onChange={onChange}
            onReset={onReset}
            hardMax={hardMax}
            readOnly={readOnly}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SlotGroups(props: {
  slots: ClientResolvedSlot[];
  drafts: Map<string, string | null>;
  onChange: (slotId: string, text: string) => void;
  onReset: (slotId: string) => void;
  hardMax: number;
  readOnly?: boolean;
}) {
  const groups = useMemo(() => groupByGroup(props.slots), [props.slots]);
  if (groups.length === 0) {
    return (
      <p className="rounded-md border border-dashed bg-muted/10 px-4 py-6 text-center text-sm text-muted-foreground">
        No slots in this language for the current variant.
      </p>
    );
  }
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <div className="space-y-6">
        {groups.map(([group, slots]) => (
          <SlotGroupSection
            key={group}
            title={group}
            slots={slots}
            drafts={props.drafts}
            onChange={props.onChange}
            onReset={props.onReset}
            hardMax={props.hardMax}
            readOnly={props.readOnly}
          />
        ))}
      </div>
    </AnimatePresence>
  );
}

function SlotGroupSection(props: {
  title: string;
  description?: string;
  slots: ClientResolvedSlot[];
  drafts: Map<string, string | null>;
  onChange: (slotId: string, text: string) => void;
  onReset: (slotId: string) => void;
  hardMax: number;
  readOnly?: boolean;
}) {
  return (
    <motion.section layout className="space-y-2">
      <div className="flex items-end justify-between gap-3 border-b pb-1">
        <div>
          <h4 className="text-sm font-semibold">{props.title}</h4>
          {props.description && (
            <p className="text-xs text-muted-foreground">{props.description}</p>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground">
          {props.slots.length} {props.slots.length === 1 ? "row" : "rows"}
        </span>
      </div>
      <div className="space-y-2">
        {props.slots.map((s) => (
          <SlotRow
            key={s.slot.id}
            resolved={s}
            draft={props.drafts.get(s.slot.id)}
            onChange={(text) => props.onChange(s.slot.id, text)}
            onReset={() => props.onReset(s.slot.id)}
            hardMaxLength={props.hardMax}
            readOnly={props.readOnly}
          />
        ))}
      </div>
    </motion.section>
  );
}

function groupByGroup(
  slots: ClientResolvedSlot[],
): [string, ClientResolvedSlot[]][] {
  const map = new Map<string, ClientResolvedSlot[]>();
  for (const s of slots) {
    const arr = map.get(s.slot.group) ?? [];
    arr.push(s);
    map.set(s.slot.group, arr);
  }
  return Array.from(map.entries());
}
