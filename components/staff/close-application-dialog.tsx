"use client";

import { useState } from "react";
import { Ban, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ClosureOutcome } from "@/lib/notifications/termination";

const OPTIONS: Record<ClosureOutcome, { label: string; hint: string; placeholder: string }> = {
  rejected: {
    label: "Reject application",
    hint: "The application cannot be granted (e.g. the applicant's category is not eligible). The applicant is told it was rejected and may submit a new application.",
    placeholder: "E.g., The registered category of the applicant is not among the categories eligible for a water use permit...",
  },
  exempted: {
    label: "Exempted water use — no permit required",
    hint: "The water use is exempted (e.g. irrigation on 1 ha or less). The applicant is told no permit is needed and they may proceed.",
    placeholder: "E.g., The declared irrigation covers 0.8 ha, which is below the 1 ha threshold...",
  },
};

/**
 * Terminal "close" action shared by the assessment and review pages:
 * staff pick whether the file is REJECTED or closed as an EXEMPTED use,
 * because the two send the applicant opposite messages.
 */
export function CloseApplicationDialog({
  open,
  onOpenChange,
  loading,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading: boolean;
  onConfirm: (outcome: ClosureOutcome, reason: string) => void;
}) {
  const [outcome, setOutcome] = useState<ClosureOutcome>("rejected");
  const [reason, setReason] = useState("");

  const close = () => {
    onOpenChange(false);
    setOutcome("rejected");
    setReason("");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-red-600" />
            Reject / Close Application
          </DialogTitle>
          <DialogDescription>
            This closes the application permanently — it is NOT a return for correction. Choose the outcome carefully: it decides what the applicant is told.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <RadioGroup value={outcome} onValueChange={(v) => setOutcome(v as ClosureOutcome)} className="space-y-2">
            {(Object.keys(OPTIONS) as ClosureOutcome[]).map((key) => (
              <Label
                key={key}
                htmlFor={`close-outcome-${key}`}
                className="flex cursor-pointer items-start gap-3 rounded-md border p-3 font-normal has-[[data-state=checked]]:border-red-400 has-[[data-state=checked]]:bg-red-50"
              >
                <RadioGroupItem id={`close-outcome-${key}`} value={key} className="mt-0.5" />
                <span className="space-y-1">
                  <span className="block font-medium">{OPTIONS[key].label}</span>
                  <span className="block text-xs text-muted-foreground">{OPTIONS[key].hint}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
          <div className="space-y-2">
            <Label htmlFor="close-reason">{outcome === "rejected" ? "Rejection Reason *" : "Exemption Reason *"}</Label>
            <Textarea
              id="close-reason"
              placeholder={OPTIONS[outcome].placeholder}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={5}
              required
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(outcome, reason.trim())}
            disabled={!reason.trim() || loading}
            className="gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            {loading ? "Submitting..." : outcome === "rejected" ? "Reject Application" : "Close as Exempted"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
