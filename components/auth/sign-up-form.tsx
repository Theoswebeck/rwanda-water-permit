"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface SignUpFormProps {
  onSubmit: (email: string, password: string, accountType: string, details: any) => void;
  error?: string;
  isLoading?: boolean;
}

export function SignUpForm({ onSubmit, error, isLoading = false }: SignUpFormProps) {
  // Common fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState("company");
  
  // Company fields
  const [companyName, setCompanyName] = useState("");
  const [companyTIN, setCompanyTIN] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");

  // Person fields
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [idType, setIdType] = useState("nationalId");
  const [idPlaceholder, setIdPlaceholder] = useState("1 19XX X XXXXXXX X XX");

  // Update ID placeholder based on selected ID type
  useEffect(() => {
    if (idType === "nationalId") {
      setIdPlaceholder("1 19XX X XXXXXXX X XX");
    } else if (idType === "driverLicense") {
      setIdPlaceholder("1 19XXXXXXXXXX");
    } else if (idType === "passport") {
      setIdPlaceholder("PCXXXXXX");
    } else {
      setIdPlaceholder("Enter ID number");
    }
  }, [idType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const details = accountType === "company" 
      ? { companyName, companyTIN, companyAddress, companyPhone }
      : { 
          firstName, 
          lastName, 
          dateOfBirth, 
          phone,
          identification: {
            type: idType,
            number: idNumber
          }
        };
    
    // Simulate API call delay
    setTimeout(() => {
      onSubmit(email, password, accountType, details);
    }, 1000);
  };

  const formatRwandaIdNumber = (value: string) => {
    if (!value) return value;
    
    // Format for National ID with specific spacing pattern: 1 19XX X XXXXXXX X XX
    if (idType === "nationalId") {
      // Remove all non-digits
      const digits = value.replace(/\D/g, '');
      
      // Apply the spacing pattern for Rwanda National ID
      if (digits.length <= 1) {
        return digits; // Just the first digit
      } else if (digits.length <= 5) {
        return `${digits.slice(0, 1)} ${digits.slice(1)}`; // 1 19XX
      } else if (digits.length <= 6) {
        return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5)}`; // 1 19XX X
      } else if (digits.length <= 13) {
        return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 6)} ${digits.slice(6)}`; // 1 19XX X XXXXXXX
      } else if (digits.length <= 14) {
        return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 6)} ${digits.slice(6, 13)} ${digits.slice(13)}`; // 1 19XX X XXXXXXX X
      } else {
        return `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 6)} ${digits.slice(6, 13)} ${digits.slice(13, 14)} ${digits.slice(14, 16)}`; // 1 19XX X XXXXXXX X XX
      }
    } else if (idType === "driverLicense") {
      // Simplified format for driver's license
      const digits = value.replace(/\D/g, '');
      
      if (digits.length <= 1) {
        return digits;
      } else if (digits.length <= 3) {
        return `${digits.slice(0, 1)} ${digits.slice(1)}`;
      } else {
        return `${digits.slice(0, 1)} ${digits.slice(1, 3)}${digits.slice(3)}`;
      }
    }
    
    return value;
  };

  const handleIdNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatRwandaIdNumber(e.target.value);
    setIdNumber(formatted);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold text-center">Create an account</CardTitle>
          <CardDescription className="text-center">
            Enter your details below to create your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          <Tabs defaultValue="company" onValueChange={setAccountType} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="company">Company</TabsTrigger>
              <TabsTrigger value="individual">Person</TabsTrigger>
            </TabsList>
            
            <TabsContent value="company">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input 
                    id="companyName" 
                    type="text" 
                    placeholder="" 
                    required 
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    disabled={isLoading}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="companyTIN">Tax Identification Number (TIN)</Label>
                  <Input 
                    id="companyTIN" 
                    type="text" 
                    placeholder="XX-XXXXXXX" 
                    required 
                    value={companyTIN}
                    onChange={(e) => setCompanyTIN(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    disabled={isLoading}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="companyAddress">Company Address</Label>
                  <Input 
                    id="companyAddress" 
                    type="text" 
                    placeholder="KN 3 AV Avenue" 
                    required
                    value={companyAddress}
                    onChange={(e) => setCompanyAddress(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    disabled={isLoading}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="companyPhone">Company Phone</Label>
                  <Input 
                    id="companyPhone" 
                    type="tel" 
                    placeholder="+250 XXX XXX XXX" 
                    required
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    disabled={isLoading}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    disabled={isLoading}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input 
                      id="password" 
                      type={showPassword ? "text" : "password"}
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10 transition-all duration-200 focus:ring-2 focus:ring-primary"
                      disabled={isLoading}
                    />
                    <button 
                      type="button" 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                >
                  {isLoading ? "Creating account..." : "Create Company Account"}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="individual">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input 
                      id="firstName" 
                      type="text" 
                      placeholder="" 
                      required 
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                      disabled={isLoading}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input 
                      id="lastName" 
                      type="text" 
                      placeholder="" 
                      required 
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                      disabled={isLoading}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="dateOfBirth">Date of Birth</Label>
                    <Input 
                      id="dateOfBirth" 
                      type="date" 
                      required 
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input 
                      id="phone" 
                      type="tel" 
                      placeholder="(+250) XXX XXX XXX" 
                      required 
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="idType">ID Type</Label>
                    <Select 
                      value={idType} 
                      onValueChange={setIdType}
                    >
                      <SelectTrigger id="idType" className="w-full">
                        <SelectValue placeholder="Select ID Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nationalId">National ID</SelectItem>
                        <SelectItem value="driverLicense">Driver's License</SelectItem>
                        <SelectItem value="passport">Passport</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="idNumber">ID Number</Label>
                    <Input 
                      id="idNumber" 
                      type="text" 
                      placeholder={idPlaceholder}
                      required 
                      value={idNumber}
                      onChange={handleIdNumberChange}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    />
                    {idType === "nationalId" && (
                      <p className="text-xs text-muted-foreground mt-1">Format: 1 19XX X XXXXXXX X XX</p>
                    )}
                    {idType === "driverLicense" && (
                      <p className="text-xs text-muted-foreground mt-1">Format: 1 19XXXXXXXXXX</p>
                    )}
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="personEmail">Email</Label>
                  <Input 
                    id="personEmail" 
                    type="email" 
                    placeholder="" 
                    required 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="personPassword">Password</Label>
                  <div className="relative">
                    <Input 
                      id="personPassword" 
                      type={showPassword ? "text" : "password"}
                      required 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pr-10 transition-all duration-200 focus:ring-2 focus:ring-primary"
                    />
                    <button 
                      type="button" 
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                >
                  {isLoading ? "Creating account..." : "Create Personal Account"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex flex-col space-y-4">
          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                OR CONTINUE WITH
              </span>
            </div>
          </div>
          <div className="flex items-center justify-center">
            <span className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Login
              </Link>
            </span>
          </div>
          <div className="text-xs text-center text-muted-foreground">
            By registering, you agree to our{" "}
            <Link href="/terms" className="hover:underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="hover:underline">
              Privacy Policy
            </Link>
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
} 