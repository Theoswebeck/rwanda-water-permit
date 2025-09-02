"use client";

import { useState } from "react";
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

export default function ContactPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
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
      setError('Failed to send message. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const contactCard = {
    icon: MessageSquare,
    title: "General Inquiries",
    description: "Questions about water permits, applications, and general information",
    items: [
      { icon: Phone, label: "+250 782 985 880", href: "tel:+250782985880" },
      { icon: Mail, label: "info@rwb.rw", href: "mailto:info@rwb.rw" },
      { icon: Clock, label: "Mon-Fri: 8:00 AM - 5:00 PM" }
    ],
    color: "bg-blue-50 border-blue-200"
  };

  const officeLocations = [
    {
      title: "Main Office - Kigali",
      address: "KN 3 Ave, Kigali, Rwanda",
      phone: "+250 782 985 880",
      email: "info@rwb.rw"
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
              Contact Us
            </h1>
            <p className="mt-6 text-lg text-primary-foreground/90 leading-relaxed">
              Get in touch with Rwanda Water Board for permits, support, and inquiries. 
              We're here to help you with all your water resource needs.
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
                ✅ <strong>Message sent successfully!</strong> We'll get back to you within 24 hours.
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
                    Send us a message
                  </CardTitle>
                  <CardDescription>
                    Fill out the form below and we'll get back to you as soon as possible.
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
                        <Label htmlFor="name">Full Name *</Label>
                        <Input
                          id="name"
                          required
                          value={formData.name}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          placeholder="Enter your full name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address *</Label>
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
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => handleInputChange('phone', e.target.value)}
                          placeholder="+250 XXX XXX XXX"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="organization">Organization</Label>
                        <Input
                          id="organization"
                          value={formData.organization}
                          onChange={(e) => handleInputChange('organization', e.target.value)}
                          placeholder="Company or organization name"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="category">Category *</Label>
                        <Select value={formData.category} onValueChange={(value) => handleInputChange('category', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select inquiry type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="permit_application">Permit Application</SelectItem>
                            <SelectItem value="permit_renewal">Permit Renewal</SelectItem>
                            <SelectItem value="technical_support">Technical Support</SelectItem>
                            <SelectItem value="billing_payment">Billing & Payment</SelectItem>
                            <SelectItem value="inspection">Inspection Services</SelectItem>
                            <SelectItem value="compliance">Compliance Issues</SelectItem>
                            <SelectItem value="general_inquiry">General Inquiry</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="priority">Priority</Label>
                        <Select value={formData.priority} onValueChange={(value) => handleInputChange('priority', value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select priority" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="subject">Subject *</Label>
                      <Input
                        id="subject"
                        required
                        value={formData.subject}
                        onChange={(e) => handleInputChange('subject', e.target.value)}
                        placeholder="Brief description of your inquiry"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="message">Message *</Label>
                      <Textarea
                        id="message"
                        required
                        value={formData.message}
                        onChange={(e) => handleInputChange('message', e.target.value)}
                        placeholder="Please provide detailed information about your inquiry..."
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
                          Sending Message...
                        </>
                      ) : (
                        <>
                          <MessageSquare className="h-4 w-4 mr-2" />
                          Send Message
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
                    Office Locations
                  </CardTitle>
                  <CardDescription>
                    Visit us at our offices across Rwanda
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


            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
} 