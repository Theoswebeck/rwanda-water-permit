"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle } from "lucide-react";

interface SuccessConfirmationProps {
  email: string;
  title?: string;
  message?: string;
  redirectUrl?: string;
  redirectLabel?: string;
  showPrimaryButton?: boolean;
  showApplyButton?: boolean;
  onComplete?: () => void;
}

export function SuccessConfirmation({ 
  email, 
  title = "Email Verified!", 
  message = "Your account has been successfully created and your email has been verified.",
  redirectUrl = "/dashboard",
  redirectLabel = "Go to Dashboard",
  showPrimaryButton = true,
  showApplyButton = true,
  onComplete
}: SuccessConfirmationProps) {
  const router = useRouter();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full"
    >
      <Card>
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-2">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ 
                duration: 0.5,
                type: "spring",
                stiffness: 200
              }}
            >
              <CheckCircle className="h-16 w-16 text-green-500" />
            </motion.div>
          </div>
          <CardTitle className="text-2xl font-bold text-center">{title}</CardTitle>
          <CardDescription className="text-center">
            {message.includes("{email}") 
              ? message.replace("{email}", `<span class="font-medium">${email}</span>`) 
              : message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-muted p-4 rounded-lg border border-border">
            <h3 className="font-medium mb-2">What's next?</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-start">
                <span className="mr-2">1.</span>
                <span>Complete your profile and provide additional information</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">2.</span>
                <span>Apply for a new water permit or manage existing ones</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">3.</span>
                <span>Track application status through your dashboard</span>
              </li>
            </ul>
          </div>
          <div className="flex flex-col gap-2">
            {showPrimaryButton && (
              onComplete ? (
                <Button onClick={onComplete}>
                  {redirectLabel}
                </Button>
              ) : (
                <Button asChild>
                  <Link href={redirectUrl}>
                    {redirectLabel}
                  </Link>
                </Button>
              )
            )}
            {showApplyButton && (
              <Button variant="outline" asChild>
                <Link href="/dashboard/new-application">
                  Start New Application
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
        <CardFooter className="text-xs text-center text-muted-foreground">
          You can now access all the features of the Rwanda Water Board permit application system.
        </CardFooter>
      </Card>
    </motion.div>
  );
} 