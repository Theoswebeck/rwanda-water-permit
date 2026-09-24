"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Upload, RefreshCw } from "lucide-react";
import {
  SITE_CONTENT_DEFAULTS,
  type SiteContact,
  type SiteContent,
} from "@/lib/site-content";

const DOCS: { key: "guidelines_url" | "user_manual_url"; title: string; hint: string }[] = [
  {
    key: "guidelines_url",
    title: "Water Use Guidelines",
    hint: "Upload a new PDF when a new version is issued, or point the link at a document hosted elsewhere.",
  },
  {
    key: "user_manual_url",
    title: "User Manual",
    hint: "Replaces the manual opened from the portal menu.",
  },
];

const EMPTY_CONTACT: SiteContact = { name: "", title: "", phone: "", email: "" };

/**
 * Admin editor for the content the portal shows the public: the guidelines and
 * user-manual PDFs and the contact details in the header, footer and /contact.
 * These were hardcoded, so every new guideline version needed a developer and a
 * deploy — this writes them to `site_content` instead.
 */
export function SiteContentManagement() {
  const [content, setContent] = useState<SiteContent>(SITE_CONTENT_DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/site-content", { cache: "no-store" });
      if (res.ok) setContent(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (updates: Partial<SiteContent>) => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/site-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save.");
      setContent(data);
      setMessage({ kind: "ok", text: "Saved. The portal shows the new content immediately." });
    } catch (e: any) {
      setMessage({ kind: "error", text: e?.message || "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (key: string, file: File) => {
    setSaving(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("key", key);
      form.append("file", file);
      const res = await fetch("/api/admin/site-content", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Upload failed.");
      setContent((prev) => ({ ...prev, [key]: data.value }));
      setMessage({ kind: "ok", text: `${file.name} is now the published document.` });
    } catch (e: any) {
      setMessage({ kind: "error", text: e?.message || "Upload failed." });
    } finally {
      setSaving(false);
      const input = fileInputs.current[key];
      if (input) input.value = "";
    }
  };

  const setContact = (index: number, field: keyof SiteContact, value: string) =>
    setContent((prev) => ({
      ...prev,
      contacts: prev.contacts.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    }));

  return (
    <div className="space-y-4">
      {message && (
        <div
          className={`rounded-md border px-4 py-3 text-sm ${
            message.kind === "ok"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Documents</CardTitle>
          <Button variant="outline" size="sm" onClick={load} disabled={loading || saving}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {DOCS.map((doc) => (
            <div key={doc.key} className="space-y-2">
              <Label>{doc.title}</Label>
              <p className="text-xs text-muted-foreground">{doc.hint}</p>
              <div className="flex flex-col gap-2 md:flex-row md:items-center">
                <Input
                  value={content[doc.key]}
                  onChange={(e) => setContent((prev) => ({ ...prev, [doc.key]: e.target.value }))}
                  placeholder="/uploads/site/… or https://…"
                />
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => save({ [doc.key]: content[doc.key] })} disabled={saving}>
                    Save link
                  </Button>
                  <input
                    ref={(el) => {
                      fileInputs.current[doc.key] = el;
                    }}
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) upload(doc.key, file);
                    }}
                  />
                  <Button onClick={() => fileInputs.current[doc.key]?.click()} disabled={saving}>
                    <Upload className="h-4 w-4" /> Upload PDF
                  </Button>
                </div>
              </div>
              <a
                href={content[doc.key]}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary underline"
              >
                Open the document users currently see
              </a>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Office details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(["address", "email", "phone", "hours"] as const).map((field) => (
              <div key={field} className="space-y-1">
                <Label className="capitalize">{field}</Label>
                <Input
                  value={content.office[field]}
                  onChange={(e) =>
                    setContent((prev) => ({ ...prev, office: { ...prev.office, [field]: e.target.value } }))
                  }
                />
              </div>
            ))}
          </div>
          <Button onClick={() => save({ office: content.office })} disabled={saving}>
            Save office details
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contact persons</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {content.contacts.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No contact persons published yet. Add one to show it on the Contact page.
            </p>
          )}
          {content.contacts.map((contact, index) => (
            <div key={index} className="grid items-end gap-2 md:grid-cols-[1fr_1fr_1fr_1fr_auto]">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input value={contact.name} onChange={(e) => setContact(index, "name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Title</Label>
                <Input value={contact.title} onChange={(e) => setContact(index, "title", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Telephone</Label>
                <Input value={contact.phone} onChange={(e) => setContact(index, "phone", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Email</Label>
                <Input value={contact.email} onChange={(e) => setContact(index, "email", e.target.value)} />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Remove contact"
                onClick={() =>
                  setContent((prev) => ({ ...prev, contacts: prev.contacts.filter((_, i) => i !== index) }))
                }
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setContent((prev) => ({ ...prev, contacts: [...prev.contacts, { ...EMPTY_CONTACT }] }))}
            >
              <Plus className="h-4 w-4" /> Add contact
            </Button>
            <Button onClick={() => save({ contacts: content.contacts })} disabled={saving}>
              Save contacts
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
