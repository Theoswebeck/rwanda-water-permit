"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Shield, CheckCircle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { PhoneVerificationDialog } from "@/components/auth/phone-verification-dialog";
import { usePhoneVerification } from "@/hooks/usePhoneVerification";

interface SignUpFormProps {
  onSubmit?: (email: string, password: string, accountType: string, details: any) => void;
  error?: string;
  isLoading?: boolean;
}

export function SignUpForm({ onSubmit, error: propError, isLoading: propLoading = false }: SignUpFormProps) {
  const router = useRouter();
  const { signUp } = useAuth();
  
  // Common fields
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [accountType, setAccountType] = useState("company");
  
  // Local state
  const [localError, setLocalError] = useState<string>("");
  const [localLoading, setLocalLoading] = useState(false);
  
  // Phone verification state
  const [showPhoneVerification, setShowPhoneVerification] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [verificationRequestId, setVerificationRequestId] = useState<number | undefined>();
  const [currentPhoneForVerification, setCurrentPhoneForVerification] = useState("");
  
  // Use prop values or local state
  const error = propError || localError;
  const isLoading = propLoading || localLoading;
  
  // Phone verification hook
  const { sendVerificationCode, verifyCode, isLoading: phoneVerificationLoading } = usePhoneVerification();
  
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

    // Basic format validation - can be enhanced with checksum if needed
    const tinPattern = /^\d{9}$/;
    if (!tinPattern.test(digits)) {
      setCompanyTINError("Invalid TIN format. Expected: 9 digits (e.g., 123456789)");
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

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, isCompany = false) => {
    const newPhone = e.target.value;
    if (isCompany) {
      setCompanyPhone(newPhone);
      validatePhone(newPhone, true);
      // Reset verification status when phone changes
      if (phoneVerified && currentPhoneForVerification !== newPhone) {
        setPhoneVerified(false);
      }
    } else {
      setPhone(newPhone);
      validatePhone(newPhone, false);
      // Reset verification status when phone changes
      if (phoneVerified && currentPhoneForVerification !== newPhone) {
        setPhoneVerified(false);
      }
    }
  };

  const handleVerifyPhone = async (phoneNumber: string) => {
    setCurrentPhoneForVerification(phoneNumber);
    const result = await sendVerificationCode(phoneNumber);
    
    if (result.success) {
      setVerificationRequestId(result.requestId);
      setShowPhoneVerification(true);
    } else {
      setLocalError(result.message);
    }
  };

  const handlePhoneVerificationComplete = () => {
    setPhoneVerified(true);
    setShowPhoneVerification(false);
    setLocalError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    const isEmailValid = validateEmail(email);
    const isPasswordValid = validatePassword(password);
    const isCompanyPhoneValid = accountType === 'company' ? validatePhone(companyPhone, true) : true;
    const isPersonPhoneValid = accountType === 'individual' ? validatePhone(phone, false) : true;
    const isIdValid = accountType === 'individual' ? validateNationalId(idNumber) : true;
    const isTINValid = accountType === 'company' ? validateCompanyTIN(companyTIN) : true;

    if (!isEmailValid || !isPasswordValid || !isCompanyPhoneValid || !isPersonPhoneValid || !isIdValid || !isTINValid) {
      return; // Stop submission if validation fails
    }

    // Check if phone verification is required and completed
    const currentPhone = accountType === 'company' ? companyPhone : phone;
    if (!phoneVerified || currentPhoneForVerification !== currentPhone) {
      setLocalError("Please verify your phone number before creating an account");
      return;
    }

    // If onSubmit prop is provided, use it (for external handling)
    if (onSubmit) {
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
      
      setTimeout(() => {
        onSubmit(email, password, accountType, details);
      }, 1000);
      return;
    }

    // Otherwise, handle signup internally
    setLocalLoading(true);

    try {
      const signUpData = {
        email,
        password,
        accountType: accountType as 'individual' | 'company',
        ...(accountType === 'company' 
          ? { 
              companyName, 
              companyTIN, 
              companyAddress, 
              companyPhone 
            }
          : { 
              firstName, 
              lastName, 
              phone,
              identification: {
                type: idType,
                number: idNumber
              }
            }
        )
      };

      const result = await signUp(signUpData);
      
      if (result.error) {
        setLocalError(result.error);
      } else {
        // Success - redirect to login or dashboard
        router.push("/login?message=Account created successfully! Please sign in.");
      }
    } catch (err) {
      setLocalError("An unexpected error occurred during signup");
    } finally {
      setLocalLoading(false);
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
                  <div className="flex gap-2">
                    <Input 
                      id="companyPhone" 
                      type="tel" 
                      placeholder="+250 XXX XXX XXX" 
                      required
                      value={companyPhone}
                      onChange={(e) => handlePhoneChange(e, true)}
                      className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-primary"
                      disabled={isLoading}
                    />
                    <Button
                      type="button"
                      variant={phoneVerified && currentPhoneForVerification === companyPhone ? "default" : "outline"}
                      size="sm"
                      onClick={() => handleVerifyPhone(companyPhone)}
                      disabled={!companyPhone || companyPhoneError !== "" || phoneVerificationLoading || isLoading}
                      className="whitespace-nowrap"
                    >
                      {phoneVerified && currentPhoneForVerification === companyPhone ? (
                        <>
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Verified
                        </>
                      ) : (
                        <>
                          <Shield className="h-4 w-4 mr-1" />
                          Verify
                        </>
                      )}
                    </Button>
                  </div>
                  {companyPhoneError && <p className="text-xs text-red-500 mt-1">{companyPhoneError}</p>}
                  {phoneVerified && currentPhoneForVerification === companyPhone && (
                    <div className="flex items-center gap-1 text-green-600 text-xs">
                      <CheckCircle className="h-3 w-3" />
                      Phone number verified
                    </div>
                  )}
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
                    <div className="flex gap-2">
                      <Input 
                        id="phone" 
                        type="tel" 
                        placeholder="(+250) XXX XXX XXX" 
                        required 
                        value={phone}
                        onChange={(e) => handlePhoneChange(e, false)}
                        className="flex-1 transition-all duration-200 focus:ring-2 focus:ring-primary"
                        disabled={isLoading}
                      />
                      <Button
                        type="button"
                        variant={phoneVerified && currentPhoneForVerification === phone ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleVerifyPhone(phone)}
                        disabled={!phone || phoneError !== "" || phoneVerificationLoading || isLoading}
                        className="whitespace-nowrap"
                      >
                        {phoneVerified && currentPhoneForVerification === phone ? (
                          <>
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Verified
                          </>
                        ) : (
                          <>
                            <Shield className="h-4 w-4 mr-1" />
                            Verify
                          </>
                        )}
                      </Button>
                    </div>
                    {phoneError && <p className="text-xs text-red-500 mt-1">{phoneError}</p>}
                    {phoneVerified && currentPhoneForVerification === phone && (
                      <div className="flex items-center gap-1 text-green-600 text-xs">
                        <CheckCircle className="h-3 w-3" />
                        Phone number verified
                      </div>
                    )}
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
                      className={`transition-all duration-200 focus:ring-2 focus:ring-primary ${
                        idNumberError ? 'border-red-500 focus:ring-red-500' : ''
                      }`}
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

      {/* Phone Verification Dialog */}
      <PhoneVerificationDialog
        open={showPhoneVerification}
        onOpenChange={setShowPhoneVerification}
        phoneNumber={currentPhoneForVerification}
        onVerificationComplete={handlePhoneVerificationComplete}
        onSendCode={() => sendVerificationCode(currentPhoneForVerification)}
        onVerifyCode={verifyCode}
        requestId={verificationRequestId}
      />
    </motion.div>
  );
} 