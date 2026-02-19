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
import type { ProvinceType } from "@/types/database";

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
  province?: ProvinceType;
}

interface SignUpFormProps {
  onContinue: (data: SignUpFormData) => void;
  initialData?: SignUpFormData | null;
  isLoading?: boolean;
  error?: string;
  onClearError?: () => void;
}

export function SignUpForm({ onContinue, initialData, isLoading = false, error, onClearError }: SignUpFormProps) {
  // #region agent log
  useEffect(() => {
    console.log('🔍 DEBUG SignUpForm mounted - onContinue type:', typeof onContinue, 'hasOnContinue:', !!onContinue);
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

  // Individual fields
  const [firstName, setFirstName] = useState(initialData?.firstName || "");
  const [lastName, setLastName] = useState(initialData?.lastName || "");
  const [dateOfBirth, setDateOfBirth] = useState(initialData?.dateOfBirth || "");
  const [idNumber, setIdNumber] = useState(initialData?.idNumber || "");
  const [idType, setIdType] = useState(initialData?.idType || "nationalId");
  const [phone, setPhone] = useState(initialData?.phone || "");
  const [province, setProvince] = useState<ProvinceType | "">(initialData?.province || "");
  const [nidaEnabled, setNidaEnabled] = useState<boolean>(false);
  const [nidaChecking, setNidaChecking] = useState<boolean>(false);
  const [nidaVerified, setNidaVerified] = useState<boolean>(false);
  const [nidaError, setNidaError] = useState<string>("");

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch('/api/nida/status', { method: 'GET' });
        const json = await res.json().catch(() => null);
        if (!isMounted) return;
        setNidaEnabled(Boolean(json?.enabled));
      } catch {
        // If the status endpoint fails, keep feature off in UI.
        if (!isMounted) return;
        setNidaEnabled(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const parseNidaDobToIso = (dobRaw?: string) => {
    const v = String(dobRaw || "").trim();
    // NIDA UAT observed format: DD/MM/YYYY
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return "";
    const dd = m[1];
    const mm = m[2];
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  };

  const mapNidaProvince = (raw?: string): ProvinceType | "" => {
    const v = String(raw || "").trim().toLowerCase();
    if (!v) return "";
    if (v.includes("kigali") || v.includes("umujyi wa kigali")) return "Kigali";
    if (v.includes("northern") || v.includes("amajyaruguru")) return "Northern";
    if (v.includes("southern") || v.includes("amajyepfo")) return "Southern";
    if (v.includes("eastern") || v.includes("iburasirazuba")) return "Eastern";
    if (v.includes("western") || v.includes("iburengerazuba")) return "Western";
    return "";
  };

  const verifyWithNida = async (docDigits: string) => {
    if (!/^\d{16}$/.test(docDigits)) return;
    setNidaError("");
    setNidaChecking(true);
    setNidaVerified(false);
    try {
      const res = await fetch('/api/nida/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentNumber: docDigits }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        setNidaError(json?.message || 'National ID could not be verified');
        return;
      }

      const data = json?.data as {
        foreName?: string;
        surnames?: string;
        dateOfBirth?: string;
        documentNumber?: string;
        province?: string;
      } | undefined;
      const dobIso = parseNidaDobToIso(data?.dateOfBirth);
      if (!dobIso) {
        setNidaError('NIDA returned an invalid date of birth');
        return;
      }

      setFirstName(String(data?.foreName || '').trim());
      setLastName(String(data?.surnames || '').trim());
      setDateOfBirth(dobIso);
      setProvince(mapNidaProvince(data?.province));
      validateDateOfBirth(dobIso);
      setNidaVerified(true);
    } catch (e: unknown) {
      setNidaError(e instanceof Error ? e.message : 'National ID could not be verified');
    } finally {
      setNidaChecking(false);
    }
  };

  // Validation states
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [dateOfBirthError, setDateOfBirthError] = useState("");
  const [idNumberError, setIdNumberError] = useState("");
  const [companyTINError, setCompanyTINError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [companyPhoneError, setCompanyPhoneError] = useState("");

  const getMaxAdultDob = () => {
    // Use UTC cutoffs to avoid timezone edge-cases around midnight.
    const now = new Date();
    const cutoffUtc = new Date(Date.UTC(
      now.getUTCFullYear() - 18,
      now.getUTCMonth(),
      now.getUTCDate()
    ));
    return cutoffUtc.toISOString().slice(0, 10); // YYYY-MM-DD
  };

  const isAtLeast18 = (dobStr: string) => {
    const v = (dobStr || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    // Parse as UTC midnight for stability
    const dobUtc = new Date(`${v}T00:00:00.000Z`);
    if (Number.isNaN(dobUtc.getTime())) return false;

    const now = new Date();
    const cutoffUtc = new Date(Date.UTC(
      now.getUTCFullYear() - 18,
      now.getUTCMonth(),
      now.getUTCDate()
    ));
    return dobUtc.getTime() <= cutoffUtc.getTime();
  };

  const validateDateOfBirth = (dobStr: string) => {
    if (!dobStr) {
      setDateOfBirthError("Date of birth is required.");
      return false;
    }
    if (!isAtLeast18(dobStr)) {
      setDateOfBirthError("You must be at least 18 years old to register.");
      return false;
    }
    setDateOfBirthError("");
    return true;
  };

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

    // Validate that the ID contains exactly 16 digits
    const digits = idNumber.replace(/\D/g, "");
    if (!/^\d{16}$/.test(digits)) {
      setIdNumberError("ID number must be exactly 16 digits.");
      return false;
    }

    setIdNumberError("");
    return true;
  };

  const validateCompanyTIN = (tin: string) => {
    if (!tin) {
      setCompanyTINError("TIN is required for organisation registration.");
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

  const isValidRwandaPhone = (raw: string) => {
    const v = (raw || "").trim();
    if (!v) return false;
    const digits = v.replace(/\D/g, "");
    // Accepted format:
    // - 07XXXXXXXX (10 digits)
    if (digits.length === 10 && digits.startsWith("07")) return true;
    return false;
  };

  const validateRwandaPhone = (raw: string, setErr: (msg: string) => void) => {
    if (!raw?.trim()) {
      setErr("Phone number is required.");
      return false;
    }
    if (!isValidRwandaPhone(raw)) {
      setErr("Invalid phone number format. Use 07XXXXXXXX (10 digits).");
      return false;
    }
    setErr("");
    return true;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newEmail = e.target.value.toLowerCase();
    setEmail(newEmail);
    validateEmail(newEmail);
    if (error) onClearError?.();
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newPassword = e.target.value;
    setPassword(newPassword);
    validatePassword(newPassword);
    if (error) onClearError?.();
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
        setLocalError("Organisation name is required.");
        return;
      }
      if (!validateCompanyTIN(companyTIN)) {
        return;
      }
      if (!validateRwandaPhone(companyPhone, setCompanyPhoneError)) return;
      if (!companyAddress.trim()) {
        setLocalError("Organisation address is required.");
        return;
      }
    } else {
      if (!firstName.trim() || !lastName.trim()) {
        setLocalError("First name and last name are required.");
        return;
      }
      if (!validateDateOfBirth(dateOfBirth)) {
        setLocalError(dateOfBirthError || "You must be at least 18 years old to register.");
        return;
      }
      if (!validateRwandaPhone(phone, setPhoneError)) return;
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
            province: province || undefined,
          }
      )
    };

    // DEBUG: Log exactly what SignUpForm is passing
    console.log('📤 SignUpForm formData:', JSON.stringify({
      accountType: formData.accountType,
      companyPhone: formData.companyPhone,
      companyPhoneFromState: companyPhone,
      hasAllCompanyFields: !!formData.companyName && !!formData.companyTIN && !!formData.companyPhone && !!formData.companyAddress
    }));
    // #region agent log
    console.log('🔍 DEBUG: onContinue type:', typeof onContinue, 'value:', onContinue);
    // #endregion
    // Pass data to parent component - with safeguard
    if (typeof onContinue === 'function') {
      onContinue(formData);
    } else {
      console.error('❌ onContinue is not a function! Type:', typeof onContinue);
      throw new Error(`onContinue is not a function. Received type: ${typeof onContinue}. Please ensure onContinue prop is passed to SignUpForm.`);
    }
  };

  const companyFormReady =
    !!companyName.trim() &&
    !!companyTIN.trim() &&
    companyTIN.replace(/\D/g, "").length === 9 &&
    !companyTINError &&
    !!companyPhone.trim() &&
    !companyPhoneError &&
    !!companyAddress.trim() &&
    !!email.trim() &&
    !emailError &&
    !!password &&
    !passwordError;

  const individualFormReady =
    // If NIDA is enabled, require successful verification and lock identity fields.
    (!nidaEnabled || nidaVerified) &&
    !!firstName.trim() &&
    !!lastName.trim() &&
    !!dateOfBirth &&
    !dateOfBirthError &&
    (!nidaEnabled || !!province) &&
    !!phone.trim() &&
    !phoneError &&
    !!idNumber.trim() &&
    idNumber.replace(/\D/g, "").length === 16 &&
    !idNumberError &&
    !!email.trim() &&
    !emailError &&
    !!password &&
    !passwordError;

  const handleIdNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Allow digits only, up to 16 digits
    const digits = value.replace(/\D/g, "").slice(0, 16);

    setIdNumber(digits);
    if (error) onClearError?.();
    if (nidaError) setNidaError("");
    if (nidaVerified) setNidaVerified(false);
    if (province) setProvince("");

    // Don't show an "invalid" error while the user is still typing.
    // We validate on blur and on submit.
    if (idNumberError) setIdNumberError("");
  };

  const handleCompanyTINChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    
    // Only allow digits and limit to 9 characters
    const digits = value.replace(/\D/g, '').slice(0, 9);
    
    setCompanyTIN(digits);
    if (error) onClearError?.();
    
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
          {error && (
            <div
              className="mb-4 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md"
              role="alert"
              aria-live="polite"
            >
              <div className="font-medium mb-1">Registration failed</div>
              <div className="text-red-700/90">{error}</div>
              {error.toLowerCase().includes("already exists") && (
                <div className="mt-2">
                  <Link href="/login" className="text-primary underline underline-offset-2 font-medium">
                    Go to login
                  </Link>
                </div>
              )}
            </div>
          )}
          {localError && (
            <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {localError}
            </div>
          )}
          <Tabs 
            defaultValue={accountType} 
            onValueChange={(value) => {
              setAccountType(value as 'individual' | 'company');
              if (error) onClearError?.();
            }} 
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="company">Organisation</TabsTrigger>
              <TabsTrigger value="individual">Individual</TabsTrigger>
            </TabsList>
            
            <TabsContent value="company">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Organisation Name</Label>
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
                  <Label htmlFor="companyPhone">Organisation Phone Number</Label>
                  <Input
                    id="companyPhone"
                    type="tel"
                    placeholder="07XXXXXXXX"
                    required
                    value={companyPhone}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCompanyPhone(v);
                      // Live-validate once the user starts typing
                      if (companyPhoneError) validateRwandaPhone(v, setCompanyPhoneError);
                      else if (v.trim()) validateRwandaPhone(v, setCompanyPhoneError);
                      if (error) onClearError?.();
                    }}
                    className={`transition-all duration-200 focus:ring-2 focus:ring-primary ${
                      companyPhoneError ? 'border-red-500 focus:ring-red-500' : ''
                    }`}
                    disabled={isLoading}
                  />
                  {companyPhoneError && (
                    <p className="text-xs text-red-500 mt-1">{companyPhoneError}</p>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="companyAddress">Organisation Address</Label>
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
                  disabled={isLoading || !companyFormReady}
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
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="07XXXXXXXX"
                    required
                    value={phone}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPhone(v);
                      if (phoneError) validateRwandaPhone(v, setPhoneError);
                      else if (v.trim()) validateRwandaPhone(v, setPhoneError);
                      if (error) onClearError?.();
                    }}
                    className={`transition-all duration-200 focus:ring-2 focus:ring-primary ${
                      phoneError ? 'border-red-500 focus:ring-red-500' : ''
                    }`}
                    disabled={isLoading}
                  />
                  {phoneError && (
                    <p className="text-xs text-red-500 mt-1">{phoneError}</p>
                  )}
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="idType">ID Type</Label>
                    <Select 
                      value={idType} 
                      onValueChange={(v) => {
                        setIdType(v);
                        if (error) onClearError?.();
                      }}
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
                      inputMode="numeric"
                      pattern="\d*"
                      maxLength={16}
                      placeholder="Enter your ID number (16 digits)"
                      required 
                      value={idNumber}
                      onChange={handleIdNumberChange}
                      onBlur={() => {
                        if (idNumber.trim()) validateNationalId(idNumber);
                        if (nidaEnabled && idNumber.replace(/\D/g, "").length === 16) {
                          void verifyWithNida(idNumber.replace(/\D/g, ""));
                        }
                      }}
                      className={`transition-all duration-200 focus:ring-2 focus:ring-primary ${
                        idNumberError ? 'border-red-500 focus:ring-red-500' : ''
                      }`}
                      disabled={isLoading}
                    />
                    {idNumberError && (
                      <p className="text-xs text-red-500 mt-1">{idNumberError}</p>
                    )}
                    {nidaEnabled && nidaError && (
                      <p className="text-xs text-red-500 mt-1">{nidaError}</p>
                    )}
                    {nidaEnabled && !nidaError && nidaChecking && (
                      <p className="text-xs text-muted-foreground mt-1">Verifying National ID with NIDA…</p>
                    )}
                    {nidaEnabled && !nidaError && nidaVerified && (
                      <p className="text-xs text-green-700 mt-1">National ID verified.</p>
                    )}
                    {!idNumberError && idType === "nationalId" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Must be exactly 16 digits ({idNumber.length}/16).
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      placeholder={nidaEnabled ? "Auto-filled after NIDA verification" : ""}
                      required
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                      disabled={isLoading || (nidaEnabled && nidaVerified)}
                      readOnly={nidaEnabled && nidaVerified}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      type="text"
                      placeholder={nidaEnabled ? "Auto-filled after NIDA verification" : ""}
                      required
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                      disabled={isLoading || (nidaEnabled && nidaVerified)}
                      readOnly={nidaEnabled && nidaVerified}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="province">Province</Label>
                  <Input
                    id="province"
                    type="text"
                    placeholder={nidaEnabled ? "Auto-filled after NIDA verification" : ""}
                    value={province}
                    className="transition-all duration-200 focus:ring-2 focus:ring-primary"
                    disabled={isLoading || nidaEnabled}
                    readOnly
                  />
                  {nidaEnabled && nidaVerified && !province && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Province could not be mapped from NIDA response.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    required
                    value={dateOfBirth}
                    max={getMaxAdultDob()}
                    onChange={(e) => {
                      const v = e.target.value;
                      setDateOfBirth(v);
                      validateDateOfBirth(v);
                      if (error) onClearError?.();
                    }}
                    onBlur={() => {
                      if (dateOfBirth) validateDateOfBirth(dateOfBirth);
                    }}
                    className={`transition-all duration-200 focus:ring-2 focus:ring-primary ${
                      dateOfBirthError ? 'border-red-500 focus:ring-red-500' : ''
                    }`}
                    disabled={isLoading || (nidaEnabled && nidaVerified)}
                    readOnly={nidaEnabled && nidaVerified}
                  />
                  {dateOfBirthError && (
                    <p className="text-xs text-red-500 mt-1">{dateOfBirthError}</p>
                  )}
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
                  disabled={isLoading || !individualFormReady}
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
            By registering, you agree to our terms and privacy practices.
          </div>
        </CardFooter>
      </Card>
    </motion.div>
  );
}
