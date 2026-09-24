"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Send, 
  MessageCircle,
  ArrowLeft,
  CheckCircle,
  Loader2
} from "lucide-react";
import Link from "next/link";

import { BackToDashboardButton } from "@/components/ui/back-button";
function ContactUsContent() {
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    category: "",
    message: "",
    permitNumber: ""
  });

  // Pre-fill form data from URL parameters
  useEffect(() => {
    const permitNumber = searchParams.get('permit');
    const category = searchParams.get('category');
    
    if (permitNumber || category) {
      setFormData(prev => ({
        ...prev,
        permitNumber: permitNumber || prev.permitNumber,
        category: category || prev.category,
        subject: permitNumber ? `Question about permit ${permitNumber}` : prev.subject
      }));
    }
  }, [searchParams]);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    // Simulate form submission
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setIsSubmitting(false);
    setIsSubmitted(true);
    
    // Reset form after 5 seconds
    setTimeout(() => {
      setIsSubmitted(false);
      setFormData({
        name: "",
        email: "",
        phone: "",
        subject: "",
        category: "",
        message: "",
        permitNumber: ""
      });
    }, 5000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <BackToDashboardButton size="sm" className="flex items-center gap-2" />
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-2xl font-bold text-gray-900">Contact Support</h1>
            </div>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
              Rwanda Water Resources Board
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Hero Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              We're Here to Help
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Have questions about your water permit or need assistance? Our support team is ready to help you.
            </p>
          </motion.div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Contact Information */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="lg:col-span-1"
            >
              <div className="space-y-6">
                {/* Contact Details Card */}
                <Card className="border-blue-200 bg-blue-50/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-blue-900">
                      <MessageCircle className="h-5 w-5" />
                      Contact Information
                    </CardTitle>
                    <CardDescription>
                      Reach out to us through any of these channels
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-100 rounded-full">
                        <Phone className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Phone</p>
                        <p className="text-gray-600 font-bold">
                          <a href="tel:9977" className="hover:underline">Toll Free Line: 9977</a>
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-green-100 rounded-full">
                        <Mail className="h-4 w-4 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Email</p>
                        <p className="text-gray-600">support@rwb.gov.rw</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-100 rounded-full">
                        <MapPin className="h-4 w-4 text-purple-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Office</p>
                        <p className="text-gray-600">Kigali, Rwanda</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-full">
                        <Clock className="h-4 w-4 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Hours</p>
                        <p className="text-gray-600">Mon - Fri: 8:00 AM - 5:00 PM</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Help */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-gray-900">Quick Help</CardTitle>
                    <CardDescription>
                      Common questions and resources
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button variant="outline" className="w-full justify-start">
                      📋 Application Status Guide
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      💰 Payment Information
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      📄 Document Requirements
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      🔄 Permit Renewal Process
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </motion.div>

            {/* Contact Form */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="lg:col-span-2"
            >
              <Card className="border-gray-200">
                <CardHeader>
                  <CardTitle className="text-2xl text-gray-900">Send us a Message</CardTitle>
                  <CardDescription>
                    Fill out the form below and we'll get back to you as soon as possible.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isSubmitted ? (
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-center py-12"
                    >
                      <div className="p-4 bg-green-100 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                        <CheckCircle className="h-8 w-8 text-green-600" />
                      </div>
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">
                        Message Sent Successfully!
                      </h3>
                      <p className="text-gray-600 mb-4">
                        Thank you for contacting us. We'll respond within 24 hours.
                      </p>
                      <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                        Reference: MSG-{Date.now().toString().slice(-6)}
                      </Badge>
                    </motion.div>
                  ) : (
                    <>
                      {/* Show helpful notice if form is pre-filled */}
                      {(searchParams.get('permit') || searchParams.get('category')) && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg"
                        >
                          <div className="flex items-center gap-2">
                            <div className="p-1 bg-blue-100 rounded">
                              <MessageCircle className="h-4 w-4 text-blue-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-blue-900">
                                Pre-filled Information
                              </p>
                              <p className="text-sm text-blue-700">
                                We've automatically filled in some details to help us assist you better.
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      
                      <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="name">Full Name *</Label>
                            <Input
                              id="name"
                              type="text"
                              placeholder="Your full name"
                              value={formData.name}
                              onChange={(e) => handleInputChange("name", e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="email">Email Address *</Label>
                            <Input
                              id="email"
                              type="email"
                              placeholder="your.email@example.com"
                              value={formData.email}
                              onChange={(e) => handleInputChange("email", e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="phone">Phone Number</Label>
                            <Input
                              id="phone"
                              type="tel"
                              placeholder="+250 7XX XXX XXX"
                              value={formData.phone}
                              onChange={(e) => handleInputChange("phone", e.target.value)}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="permit-number">Permit/Application Number</Label>
                            <Input
                              id="permit-number"
                              type="text"
                              placeholder="RWB-2024-000001 (if applicable)"
                              value={formData.permitNumber}
                              onChange={(e) => handleInputChange("permitNumber", e.target.value)}
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="category">Category *</Label>
                          <Select value={formData.category} onValueChange={(value) => handleInputChange("category", value)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="application">Application Support</SelectItem>
                              <SelectItem value="permit">Permit Questions</SelectItem>
                              <SelectItem value="payment">Payment Issues</SelectItem>
                              <SelectItem value="technical">Technical Problems</SelectItem>
                              <SelectItem value="renewal">Permit Renewal</SelectItem>
                              <SelectItem value="general">General Inquiry</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="subject">Subject *</Label>
                          <Input
                            id="subject"
                            type="text"
                            placeholder="Brief description of your inquiry"
                            value={formData.subject}
                            onChange={(e) => handleInputChange("subject", e.target.value)}
                            required
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="message">Message *</Label>
                          <Textarea
                            id="message"
                            placeholder="Please provide details about your question or issue..."
                            className="min-h-[120px]"
                            value={formData.message}
                            onChange={(e) => handleInputChange("message", e.target.value)}
                            required
                          />
                        </div>

                        <Button
                          type="submit"
                          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3"
                          disabled={isSubmitting}
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Sending Message...
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4 mr-2" />
                              Send Message
                            </>
                          )}
                        </Button>
                      </form>
                    </>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Loading fallback
function ContactUsLoading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-cyan-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-3">Loading...</span>
        </div>
      </div>
    </div>
  );
}

// Main export with Suspense
export default function ContactUsPage() {
  return (
    <Suspense fallback={<ContactUsLoading />}>
      <ContactUsContent />
    </Suspense>
  );
} 