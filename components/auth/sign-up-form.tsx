"use client";

import { useState } from "react";
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

  // Validation states
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [companyPhoneError, setCompanyPhoneError] = useState("");

  const validateEmail = (email: string) => {
    if (!email) {
      setEmailError("Email is required.");
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError("Invalid email address.");
      return false;
    }
    setEmailError("");
    return true;
  };

  const validatePassword = (password: string) => {
    if (!password) {
      setPasswordError("Password is required.");
      return false;
    }
    if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters long.");
      return false;
    }
    setPasswordError("");
    return true;
  };

  const validatePhone = (phone: string, isCompany = false) => {
    if (!phone) {
      const error = "Phone number is required.";
      isCompany ? setCompanyPhoneError(error) : setPhoneError(error);
      return false;
    }
    const phoneRegex = /^(\+250|0)7\d{8}$/;
    if (!phoneRegex.test(phone)) {
      const error = "Invalid Rwandan phone number format.";
      isCompany ? setCompanyPhoneError(error) : setPhoneError(error);
      return false;
    }
    isCompany ? setCompanyPhoneError("") : setPhoneError("");
    return true;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value;
    setEmail(newEmail);
    validateEmail(newEmail);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    validatePassword(newPassword);
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, isCompany = false) => {
    const newPhone = e.target.value;
    if (isCompany) {
      setCompanyPhone(newPhone);
      validatePhone(newPhone, true);
    } else {
      setPhone(newPhone);
      validatePhone(newPhone, false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isCompanyPhoneValid = accountType === 'company' ? validatePhone(companyPhone, true) : true;
    const isPersonPhoneValid = accountType === 'individual' ? validatePhone(phone, false) : true;

    if (!isEmailValid || !isPasswordValid || !isCompanyPhoneValid || !isPersonPhoneValid) {
      return; // Stop submission if validation fails
    }
    
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

  const handleIdNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only format National ID
    const digits = value.replace(/\D/g, '').slice(0, 16); // Limit to 16 digits for National ID
    
    let formatted = '';
    if (digits.length <= 1) {
      formatted = digits;
    } else if (digits.length <= 4) {
      formatted = `${digits.slice(0, 1)} ${digits.slice(1)}`; // 1 19XX
    } else if (digits.length <= 6) {
      formatted = `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5)}`; // 1 19XX X
    } else if (digits.length <= 13) {
      formatted = `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 6)} ${digits.slice(6)}`; // 1 19XX X XXXXXXX
    } else if (digits.length <= 14) {
      formatted = `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 6)} ${digits.slice(6, 13)} ${digits.slice(13)}`; // 1 19XX X XXXXXXX X
    } else {
      formatted = `${digits.slice(0, 1)} ${digits.slice(1, 5)} ${digits.slice(5, 6)} ${digits.slice(6, 13)} ${digits.slice(13, 14)} ${digits.slice(14, 16)}`; // 1 19XX X XXXXXXX X XX
    }
    
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
                    onChange={(e) => handlePhoneChange(e, true)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    disabled={isLoading}
                  />
                  {companyPhoneError && <p className="text-xs text-red-500 mt-1">{companyPhoneError}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input 
                    id="email" 
                    type="email" 
                    placeholder="" 
                    required 
                    value={email}
                    onChange={handleEmailChange}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    disabled={isLoading}
                  />
                  {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Input 
                      id="password" 
                      type={showPassword ? "text" : "password"}
                      required 
                      value={password}
                      onChange={handlePasswordChange}
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
                  {passwordError && <p className="text-xs text-red-500 mt-1">{passwordError}</p>}
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
                      onChange={(e) => handlePhoneChange(e, false)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    />
                    {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="idType">ID Type</Label>
                    <Select 
                      value={idType} 
                      onValueChange={setIdType}
                      defaultValue="nationalId"
                    >
                      <SelectTrigger id="idType" className="w-full">
                        <SelectValue placeholder="National ID" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nationalId">National ID</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="idNumber">ID Number</Label>
                    <Input 
                      id="idNumber" 
                      type="text" 
                      placeholder="Enter your National ID number"
                      required 
                      value={idNumber}
                      onChange={handleIdNumberChange}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    />
                    {idType === "nationalId" && (
                      <p className="text-xs text-muted-foreground mt-1">Format: 1 19XX X XXXXXXX X XX</p>
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
                    onChange={handleEmailChange}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                  />
                  {emailError && <p className="text-xs text-red-500 mt-1">{emailError}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="personPassword">Password</Label>
                  <div className="relative">
                    <Input 
                      id="personPassword" 
                      type={showPassword ? "text" : "password"}
                      required 
                      value={password}
                      onChange={handlePasswordChange}
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
                  {passwordError && <p className="text-xs text-red-500 mt-1">{passwordError}</p>}
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