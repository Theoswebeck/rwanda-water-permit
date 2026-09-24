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
  Phone,
  Mail,
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  FileText
} from "lucide-react";
import { getPreferredLanguage, subscribeToLanguageChanges, type AppLanguage } from "@/lib/i18n/language";
import { translateText } from "@/lib/i18n/translator";
import { useSiteContent } from "@/lib/use-site-content";

export default function ContactPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);

  const tx = (value: string) => translateText(value, language);

  // Form state
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
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('📧 Contact form submitted:', formData);
      setSuccess(true);

      // Reset form
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

      // Hide success message after 5 seconds
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(tx('Failed to send message. Please try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  // Office details and contact persons are published from the admin panel
  // (Content tab), so RWB updates them without a code change.
  const { office, contacts } = useSiteContent();

  const contactCard = {
    icon: MessageSquare,
    title: tx("General Inquiries"),
    description: tx("Questions about water permits, applications, and general information"),
    items: [
      { icon: Phone, label: `${tx("Toll Free Line:")} ${office.phone}`, href: `tel:${office.phone}` },
      { icon: Mail, label: office.email, href: `mailto:${office.email}` },
      { icon: Clock, label: tx(office.hours) }
    ],
    color: "bg-blue-50 border-blue-200"
  };

  const officeLocations = [
    {
      title: tx("Main Office - Kigali"),
      address: office.address,
      phone: office.phone,
      email: office.email
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary to-primary/80 text-white py-16 lg:py-24">
        <div className="container mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <h1 className="text-primary-foreground leading-tighter text-4xl font-semibold tracking-tight lg:text-5xl xl:text-6xl">
              {tx("Contact Us")}
            </h1>
            <p className="mt-6 text-lg text-primary-foreground/90 leading-relaxed">
              {tx("Get in touch with Rwanda Water Resources Board for permits, support, and inquiries. We're here to help you with all your water resource needs.")}
            </p>
          </motion.div>
        </div>
      </section>

      <div className="container mx-auto px-4 py-12">
        {/* Success Alert */}
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8"
          >
            <Alert className="border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                ✅ <strong>{tx("Message sent successfully! We'll get back to you within 24 hours.")}</strong>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* Contact Form */}
          <div className="lg:col-span-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    {tx("Send us a message")}
                  </CardTitle>
                  <CardDescription>
                    {tx("Fill out the form below and we'll get back to you as soon as possible.")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {error && (
                    <Alert variant="destructive" className="mb-6">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">{tx("Full Name *")}</Label>
                        <Input
                          id="name"
                          required
                          value={formData.name}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          placeholder={tx("Enter your full name")}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">{tx("Email Address *")}</Label>
                        <Input
                          id="email"
                          type="email"
                          required
                          value={formData.email}
                          onChange={(e) => handleInputChange('email', e.target.value)}
                          placeholder="your.email@example.com"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="phone">{tx("Phone Number")}</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => handleInputChange('phone', e.target.value)}
                          placeholder="+250 XXX XXX XXX"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="organization">{tx("Organization")}</Label>
                        <Input
                          id="organization"
                          value={formData.organization}
                          onChange={(e) => handleInputChange('organization', e.target.value)}
                          placeholder={tx("Company or organization name")}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="category">{tx("Category *")}</Label>
                        <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                          <SelectTrigger>
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
                      <div className="space-y-2">
                        <Label htmlFor="priority">{tx("Priority")}</Label>
                        <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                          <SelectTrigger>
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

                    <div className="space-y-2">
                      <Label htmlFor="subject">{tx("Subject *")}</Label>
                      <Input
                        id="subject"
                        required
                        value={formData.subject}
                        onChange={(e) => handleInputChange('subject', e.target.value)}
                        placeholder={tx("Brief description of your inquiry")}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">{tx("Message *")}</Label>
                      <Textarea
                        id="message"
                        required
                        value={formData.message}
                        onChange={(e) => handleInputChange('message', e.target.value)}
                        placeholder={tx("Please provide detailed information about your inquiry...")}
                        rows={6}
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={isLoading}
                      className="w-full"
                      size="lg"
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin h-4 w-4 border-2 border-background border-t-transparent rounded-full mr-2" />
                          {tx("Sending Message...")}
                        </>
                      ) : (
                        <>
                          <MessageSquare className="h-4 w-4 mr-2" />
                          {tx("Send Message")}
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          </div>

          {/* Contact Info & Office Locations */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="space-y-6"
            >
              {/* Contact Card */}
              <Card className={`transition-all duration-300 hover:shadow-lg ${contactCard.color}`}>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-white rounded-lg shadow-sm">
                      <contactCard.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-lg">{contactCard.title}</CardTitle>
                  </div>
                  <CardDescription>{contactCard.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {contactCard.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                        {item.href ? (
                          <a
                            href={item.href}
                            className="text-sm hover:text-primary transition-colors"
                          >
                            {item.label}
                          </a>
                        ) : (
                          <span className="text-sm text-muted-foreground">{item.label}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    {tx("Office Locations")}
                  </CardTitle>
                  <CardDescription>
                    {tx("Visit us at our offices across Rwanda")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {officeLocations.map((office, index) => (
                      <div key={index} className="border-b border-border last:border-b-0 pb-4 last:pb-0">
                        <h4 className="font-semibold text-sm mb-2">{office.title}</h4>
                        <div className="space-y-2 text-sm text-muted-foreground">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                            <span>{office.address}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 flex-shrink-0" />
                            <a href={`tel:${office.phone}`} className="hover:text-primary transition-colors">
                              {office.phone}
                            </a>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 flex-shrink-0" />
                            <a href={`mailto:${office.email}`} className="hover:text-primary transition-colors">
                              {office.email}
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {contacts.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-5 w-5" />
                      {tx("Contact Persons")}
                    </CardTitle>
                    <CardDescription>
                      {tx("Reach the officer responsible for your request directly")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-6">
                      {contacts.map((person, index) => (
                        <div key={index} className="border-b border-border last:border-b-0 pb-4 last:pb-0">
                          <h4 className="font-semibold text-sm">{person.name}</h4>
                          {person.title && (
                            <p className="text-xs text-muted-foreground mb-2">{person.title}</p>
                          )}
                          <div className="space-y-2 text-sm text-muted-foreground">
                            {person.phone && (
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 flex-shrink-0" />
                                <a href={`tel:${person.phone}`} className="hover:text-primary transition-colors">
                                  {person.phone}
                                </a>
                              </div>
                            )}
                            {person.email && (
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 flex-shrink-0" />
                                <a href={`mailto:${person.email}`} className="hover:text-primary transition-colors">
                                  {person.email}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
