"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Form data interface for passing to parent
export interface SignUpFormData {
  email: string;
  password: string;
  accountType: 'individual' | 'company';
  // Company fields
  companyName?: string;
  companyTIN?: string;
  companyAddress?: string;
  companyPhone?: string;
  // Individual fields
  firstName?: string;
  lastName?: string;
  dateOfBirth?: string;
  idNumber?: string;
  idType?: string;
  phone?: string;
}

interface SignUpFormProps {
  onContinue: (data: SignUpFormData) => void;
  initialData?: SignUpFormData | null;
  isLoading?: boolean;
}

export function SignUpForm({ onContinue, initialData, isLoading = false }: SignUpFormProps) {
  // #region agent log
  useEffect(() => {
    console.log('🔍 DEBUG SignUpForm mounted - onContinue type:', typeof onContinue, 'hasOnContinue:', !!onContinue);
  }, [onContinue]);
  // #endregion
  // #region agent log
  useEffect(() => {
    try {
      // NDJSON log (workaround if ingest server isn't reachable)
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      fetch('/api/debug/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'components/auth/sign-up-form.tsx:SignUpForm',
          message: 'mounted',
          data: { onContinueType: typeof onContinue, hasOnContinue: !!onContinue },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'ONCONTINUE'
        })
      }).catch(() => {});
    } catch {}
  }, [onContinue]);
  // #endregion
  // Common fields
  const [email, setEmail] = useState(initialData?.email || "");
  const [password, setPassword] = useState(initialData?.password || "");
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState<'individual' | 'company'>(initialData?.accountType || "company");
  
  // Local state
  const [localError, setLocalError] = useState<string>("");
  
  // Company fields
  const [companyName, setCompanyName] = useState(initialData?.companyName || "");
  const [companyTIN, setCompanyTIN] = useState(initialData?.companyTIN || "");
  const [companyAddress, setCompanyAddress] = useState(initialData?.companyAddress || "");
  const [companyPhone, setCompanyPhone] = useState(initialData?.companyPhone || "");

  // Person fields
  const [firstName, setFirstName] = useState(initialData?.firstName || "");
  const [lastName, setLastName] = useState(initialData?.lastName || "");
  const [dateOfBirth, setDateOfBirth] = useState(initialData?.dateOfBirth || "");
  const [idNumber, setIdNumber] = useState(initialData?.idNumber || "");
  const [idType, setIdType] = useState(initialData?.idType || "nationalId");
  const [phone, setPhone] = useState(initialData?.phone || "");

  // Validation states
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [idNumberError, setIdNumberError] = useState("");
  const [companyTINError, setCompanyTINError] = useState("");

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

  const validateNationalId = (idNumber: string) => {
    if (!idNumber) {
      setIdNumberError("National ID is required.");
      return false;
    }

    // Remove spaces and validate format: 1 19XX X XXXXXXX X XX
    const digits = idNumber.replace(/\s/g, '');
    
    // Check if it has exactly 16 digits
    if (digits.length !== 16) {
      setIdNumberError("National ID must have exactly 16 digits.");
      return false;
    }

    // Check if all characters are digits
    if (!/^\d{16}$/.test(digits)) {
      setIdNumberError("National ID must contain only numbers.");
      return false;
    }

    // Validate format: 1 19XX X XXXXXXX X XX
    // First digit must be 1
    if (digits[0] !== '1') {
      setIdNumberError("National ID must start with 1.");
      return false;
    }

    // Second and third digits must be 19 (birth year prefix)
    if (digits.slice(1, 3) !== '19') {
      setIdNumberError("Invalid birth year format. Must start with 19.");
      return false;
    }

    // Validate year (1900-1999)
    const year = parseInt(digits.slice(1, 5));
    if (year < 1900 || year > 1999) {
      setIdNumberError("Invalid birth year. Must be between 1900-1999.");
      return false;
    }

    // Validate that the format matches: 1 19XX X XXXXXXX X XX
    const formattedPattern = /^1 19\d{2} \d \d{7} \d \d{2}$/;
    if (!formattedPattern.test(idNumber)) {
      setIdNumberError("Invalid National ID format. Expected: 1 19XX X XXXXXXX X XX");
      return false;
    }

    setIdNumberError("");
    return true;
  };

  const validateCompanyTIN = (tin: string) => {
    if (!tin) {
      setCompanyTINError("TIN is required for company registration.");
      return false;
    }

    // Remove any non-digit characters
    const digits = tin.replace(/\D/g, '');
    
    // Rwanda TIN format: 9 digits
    if (digits.length !== 9) {
      setCompanyTINError("TIN must be exactly 9 digits.");
      return false;
    }

    // Check if all characters are digits
    if (!/^\d{9}$/.test(digits)) {
      setCompanyTINError("TIN must contain only numbers.");
      return false;
    }

    setCompanyTINError("");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    // Validate common fields
    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);

    if (!isEmailValid || !isPasswordValid) {
      return;
    }

    // Validate account-specific fields
    if (accountType === 'company') {
      if (!companyName.trim()) {
        setLocalError("Company name is required.");
        return;
      }
      if (!validateCompanyTIN(companyTIN)) {
        return;
      }
      if (!companyPhone.trim()) {
        setLocalError("Company phone number is required.");
        return;
      }
      if (!companyAddress.trim()) {
        setLocalError("Company address is required.");
        return;
      }
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        setLocalError("First name and last name are required.");
        return;
      }
      if (!dateOfBirth) {
        setLocalError("Date of birth is required.");
        return;
      }
      if (!phone.trim()) {
        setLocalError("Phone number is required.");
        return;
      }
      if (!validateNationalId(idNumber)) {
        return;
      }
    }

    // Build form data
    const formData: SignUpFormData = {
      email,
      password,
      accountType,
      ...(accountType === 'company' 
        ? { 
            companyName, 
            companyTIN, 
            companyPhone,
            companyAddress,
          }
        : { 
            firstName, 
            lastName, 
            dateOfBirth,
            idNumber,
            idType,
            phone,
          }
      )
    };

    // #region agent log
    console.log('🔍 DEBUG: onContinue type:', typeof onContinue, 'value:', onContinue);
    // #endregion
    // #region agent log
    try {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      fetch('/api/debug/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location: 'components/auth/sign-up-form.tsx:handleSubmit',
          message: 'before onContinue call',
          data: { onContinueType: typeof onContinue, hasOnContinue: !!onContinue, accountType: formData.accountType },
          timestamp: Date.now(),
          sessionId: 'debug-session',
          runId: 'pre-fix',
          hypothesisId: 'ONCONTINUE'
        })
      }).catch(() => {});
    } catch {}
    // #endregion
    // Pass data to parent component - with safeguard
    if (typeof onContinue === 'function') {
      onContinue(formData);
    } else {
      console.error('❌ onContinue is not a function! Type:', typeof onContinue);
      throw new Error(`onContinue is not a function. Received type: ${typeof onContinue}. Please ensure onContinue prop is passed to SignUpForm.`);
    }
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
    
    // Validate if the field is complete (16 digits)
    if (digits.length === 16) {
      validateNationalId(formatted);
    } else if (idNumberError) {
      // Clear error if user is still typing
      setIdNumberError("");
    }
  };

  const handleCompanyTINChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only allow digits and limit to 9 characters
    const digits = value.replace(/\D/g, '').slice(0, 9);
    
    setCompanyTIN(digits);
    
    // Validate if the field is complete (9 digits)
    if (digits.length === 9) {
      validateCompanyTIN(digits);
    } else if (companyTINError) {
      // Clear error if user is still typing
      setCompanyTINError("");
    }
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
            Enter your details below to get started
          </CardDescription>
        </CardHeader>
        <CardContent>
          {localError && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {localError}
            </div>
          )}
          <Tabs 
            defaultValue={accountType} 
            onValueChange={(value) => setAccountType(value as 'individual' | 'company')} 
            className="w-full"
          >
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
                    placeholder="123456789" 
                    required 
                    value={companyTIN}
                    onChange={handleCompanyTINChange}
                    className={`transition-all duration-200 focus:ring-2 focus:ring-primary ${
                      companyTINError ? 'border-red-500 focus:ring-red-500' : ''
                    }`}
                    disabled={isLoading}
                  />
                  {companyTINError && (
                    <p className="text-xs text-red-500 mt-1">{companyTINError}</p>
                  )}
                  {!companyTINError && (
                    <p className="text-xs text-muted-foreground mt-1">Format: 9 digits (e.g., 123456789)</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyPhone">Company Phone Number</Label>
                  <Input
                    id="companyPhone"
                    type="tel"
                    placeholder="+2507XXXXXXXX or 07XXXXXXXX"
                    required
                    value={companyPhone}
                    onChange={(e) => setCompanyPhone(e.target.value)}
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
                  {isLoading ? "Please wait..." : (
                    <>
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
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
                
                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input 
                    id="dateOfBirth" 
                    type="date" 
                    required 
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    disabled={isLoading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="+2507XXXXXXXX or 07XXXXXXXX"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    disabled={isLoading}
                  />
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="idType">ID Type</Label>
                    <Select 
                      value={idType} 
                      onValueChange={setIdType}
                      defaultValue="nationalId"
                      disabled={isLoading}
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
                      className={`transition-all duration-200 focus:ring-2 focus:ring-primary ${
                        idNumberError ? 'border-red-500 focus:ring-red-500' : ''
                      }`}
                      disabled={isLoading}
                    />
                    {idNumberError && (
                      <p className="text-xs text-red-500 mt-1">{idNumberError}</p>
                    )}
                    {!idNumberError && idType === "nationalId" && (
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
                    disabled={isLoading}
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
                  {isLoading ? "Please wait..." : (
                    <>
                      Continue
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </>
                  )}
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
