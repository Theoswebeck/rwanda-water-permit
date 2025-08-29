"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check for messages from URL params
    const message = searchParams.get('message');
    const errorParam = searchParams.get('error');
    
    if (message) {
      setSuccess(message);
    }
    
    if (errorParam) {
      switch (errorParam) {
        case 'suspended':
          setError('Your account has been suspended. Please contact support.');
          break;
        case 'inactive':
          setError('Your account is inactive. Please contact support to reactivate.');
          break;
        case 'session_timeout':
          setError('Your session has expired. Please sign in again.');
          break;
        default:
          setError('An authentication error occurred.');
      }
      
      // Clear the URL parameters after showing the error
      setTimeout(() => {
        const url = new URL(window.location.href);
        url.searchParams.delete('error');
        url.searchParams.delete('message');
        window.history.replaceState({}, '', url.toString());
      }, 1000);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) return;
    
    setError("");
    setIsLoading(true);
    
    try {
      console.log("🔄 Attempting login for:", email);
      
      const result = await signIn(email, password);
      
      if (result.error) {
        console.error("❌ Login failed:", result.error);
        setError(result.error);
        return;
      }
      
      console.log("✅ Login successful, redirecting to dashboard");
      router.push("/dashboard");
    } catch (error) {
      console.error("❌ Login error:", error);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="mx-auto max-w-sm">
      <CardHeader>
        <CardTitle className="text-2xl">Login to your account</CardTitle>
        <CardDescription>
          Enter your email below to login to your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="grid gap-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md">
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 text-sm text-green-600 bg-green-50 border border-green-200 rounded-md">
              {success}
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="m@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <div className="grid gap-2">
            <div className="flex items-center">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="ml-auto inline-block text-sm underline"
              >
                Forgot your password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isLoading}
            />
          </div>
          <Button 
            type="submit" 
            className="w-full"
            disabled={isLoading || !email || !password}
          >
            {isLoading ? "Signing in..." : "Login"}
          </Button>
        </form>
        <div className="mt-4 text-center text-sm">
          Don&apos;t have an account?{" "}
          <Link href="/register" className="underline">
            Sign up
          </Link>
        </div>
      </CardContent>
    </Card>
  );
} 