"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  CheckCircle,
  AlertCircle,
  MessageSquare,
  FileText
} from "lucide-react";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";

export function ContactSection() {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [lastSubmitted, setLastSubmitted] = useState<{ inquiryNumber: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    organization: "",
    subject: "",
    category: "",
    message: "",
    priority: "normal"
  });

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.category) {
      setError(tx('Please select an inquiry category.'));
      return;
    }
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/public/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || tx('Failed to send message. Please try again.'));
      }
      setSuccess(true);
      setLastSubmitted(
        result.inquiryNumber
          ? { inquiryNumber: String(result.inquiryNumber), email: formData.email }
          : null
      );
      setFormData({
        name: "",
        email: "",
        phone: "",
        organization: "",
        subject: "",
        category: "",
        message: "",
        priority: "normal"
      });
      setTimeout(() => setSuccess(false), 20000);
    } catch (err) {
      setError(err instanceof Error ? err.message : tx('Failed to send message. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section id="contact" className="py-20 bg-[#f3f5fa] border-t border-gray-200/70">
      <div className="max-w-6xl mx-auto px-4 sm:px-8">
        <div className="text-center mb-12">
          <span className="text-[#0072bc] text-xs font-bold uppercase tracking-widest bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
            {tx("Get In Touch")}
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mt-3">
            {tx("Send Us a Message & Inquiries")}
          </h2>
          <p className="text-gray-500 mt-2 max-w-xl mx-auto text-sm sm:text-base">
            {tx("Have questions regarding water permits, concession fees, or technical requirements? Reach out to our regulatory team.")}
          </p>
        </div>

        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <strong>{tx("Message sent successfully! We'll get back to you as soon as possible.")}</strong>
                  {lastSubmitted?.inquiryNumber && (
                    <p className="text-xs text-green-700 mt-1">
                      {tx("Tracking ID")}: <span className="font-mono font-bold bg-white/80 px-1.5 py-0.5 rounded border border-green-200">{lastSubmitted.inquiryNumber}</span>
                    </p>
                  )}
                </div>
                {lastSubmitted?.inquiryNumber && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      window.dispatchEvent(
                        new CustomEvent("rwb:open-inquiry-chat", {
                          detail: {
                            inquiryNumber: lastSubmitted.inquiryNumber,
                            email: lastSubmitted.email,
                          },
                        })
                      )
                    }
                    className="border-green-300 bg-white text-green-800 hover:bg-green-100 shrink-0"
                  >
                    <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                    {tx("Open in Chat Panel")}
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <div>
          <Card className="border border-gray-200 shadow-sm bg-white rounded-2xl overflow-hidden">
              <CardHeader className="border-b border-gray-100 pb-5">
                <CardTitle className="flex items-center gap-2 text-xl text-gray-900 font-bold">
                  <FileText className="h-5 w-5 text-[#0072bc]" />
                  <span>{tx("Send us a message")}</span>
                </CardTitle>
                <CardDescription className="text-gray-500 text-sm">
                  {tx("Fill out the form below and we'll get back to you as soon as possible.")}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                {error && (
                  <Alert variant="destructive" className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name" className="text-xs font-semibold text-gray-700">{tx("Full Name *")}</Label>
                      <Input
                        id="name"
                        required
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        placeholder={tx("Enter your full name")}
                        className="rounded-lg border-gray-200 focus:border-[#0072bc]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email" className="text-xs font-semibold text-gray-700">{tx("Email Address *")}</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => handleInputChange('email', e.target.value)}
                        placeholder="your.email@example.com"
                        className="rounded-lg border-gray-200 focus:border-[#0072bc]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="phone" className="text-xs font-semibold text-gray-700">{tx("Phone Number")}</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => handleInputChange('phone', e.target.value)}
                        placeholder="+250 XXX XXX XXX"
                        className="rounded-lg border-gray-200 focus:border-[#0072bc]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="organization" className="text-xs font-semibold text-gray-700">{tx("Organization")}</Label>
                      <Input
                        id="organization"
                        value={formData.organization}
                        onChange={(e) => handleInputChange('organization', e.target.value)}
                        placeholder={tx("Company or organization name")}
                        className="rounded-lg border-gray-200 focus:border-[#0072bc]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="category" className="text-xs font-semibold text-gray-700">{tx("Category *")}</Label>
                      <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                        <SelectTrigger className="rounded-lg border-gray-200">
                          <SelectValue placeholder={tx("Select inquiry type")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="permit_application">{tx("Permit Application")}</SelectItem>
                          <SelectItem value="permit_renewal">{tx("Permit Renewal")}</SelectItem>
                          <SelectItem value="technical_support">{tx("Technical Support")}</SelectItem>
                          <SelectItem value="billing_payment">{tx("Billing & Payment")}</SelectItem>
                          <SelectItem value="inspection">{tx("Inspection Services")}</SelectItem>
                          <SelectItem value="compliance">{tx("Compliance Issues")}</SelectItem>
                          <SelectItem value="general_inquiry">{tx("General Inquiry")}</SelectItem>
                          <SelectItem value="other">{tx("Other")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="priority" className="text-xs font-semibold text-gray-700">{tx("Priority")}</Label>
                      <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                        <SelectTrigger className="rounded-lg border-gray-200">
                          <SelectValue placeholder={tx("Select priority")} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">{tx("Low")}</SelectItem>
                          <SelectItem value="normal">{tx("Normal")}</SelectItem>
                          <SelectItem value="high">{tx("High")}</SelectItem>
                          <SelectItem value="urgent">{tx("Urgent")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="subject" className="text-xs font-semibold text-gray-700">{tx("Subject *")}</Label>
                    <Input
                      id="subject"
                      required
                      value={formData.subject}
                      onChange={(e) => handleInputChange('subject', e.target.value)}
                      placeholder={tx("Brief description of your inquiry")}
                      className="rounded-lg border-gray-200 focus:border-[#0072bc]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="message" className="text-xs font-semibold text-gray-700">{tx("Message *")}</Label>
                    <Textarea
                      id="message"
                      required
                      value={formData.message}
                      onChange={(e) => handleInputChange('message', e.target.value)}
                      placeholder={tx("Please provide detailed information about your inquiry...")}
                      rows={5}
                      className="rounded-lg border-gray-200 focus:border-[#0072bc]"
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-[#0072bc] hover:bg-[#005a96] text-white font-bold h-12 rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer"
                    size="lg"
                  >
                    {isLoading ? (
                      <span className="flex items-center gap-2">
                        <i className="fa fa-spinner fa-spin" />
                        <span>{tx("Sending Message...")}</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        <span>{tx("Send Message")}</span>
                      </span>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
        </div>
      </div>
    </section>
  );
}

