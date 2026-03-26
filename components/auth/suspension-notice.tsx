"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { 
  ShieldX, 
  Mail, 
  Phone, 
  AlertTriangle, 
  Clock,
  LogOut,
  MessageCircle
} from "lucide-react";

import type { User } from '@/types/database';

interface SuspensionNoticeProps {
  user: User;
  onLogout?: () => void;
  onContactSupport?: () => void;
}

export function SuspensionNotice({ user, onLogout, onContactSupport }: SuspensionNoticeProps) {
  const displayName = user.first_name && user.last_name 
    ? `${user.first_name} ${user.last_name}`
    : user.company_name || 'User';

  const userInitials = user.first_name?.[0] || user.company_name?.[0] || user.email[0];

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      // Fallback logout action
      window.location.href = '/login';
    }
  };

  const handleContactSupport = () => {
    if (onContactSupport) {
      onContactSupport();
    } else {
      // Default action - mailto or redirect to contact page
      window.open('https://waterpermit.rwb.rw/contact', '_blank');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-orange-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        <Card className="border-red-200 shadow-lg">
          <CardHeader className="text-center pb-4">
            {/* Suspended Icon */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="mx-auto mb-4"
            >
              <div className="relative">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                  <ShieldX className="w-10 h-10 text-red-600" />
                </div>
                <div className="absolute -top-1 -right-1 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-3 h-3 text-white" />
                </div>
              </div>
            </motion.div>

            {/* User Info */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <Avatar className="w-12 h-12">
                <AvatarFallback className="bg-gray-100 text-gray-600 font-medium">
                  {userInitials?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="text-left">
                <h3 className="font-semibold text-gray-900">{displayName}</h3>
                <p className="text-sm text-gray-600">{user.email}</p>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* Main Message */}
            <div className="text-center">
              <h2 className="text-xl font-bold text-red-800 mb-2">
                Account Suspended
              </h2>
              <p className="text-gray-700 text-sm leading-relaxed">
                Your account has been temporarily suspended. You cannot access the Rwanda Water Resources Board portal at this time.
              </p>
            </div>

            {/* Status Info */}
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-red-800 mb-1">Suspension Status</h4>
                  <p className="text-sm text-red-700">
                    Access to all system features has been restricted pending review.
                  </p>
                </div>
              </div>
            </div>

            {/* What to do */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="font-medium text-blue-800 mb-2">What you can do:</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4" />
                  Contact our support team for assistance
                </li>
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4" />
                  Check your email for additional information
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  Call us at +250 252 123 456
                </li>
              </ul>
            </div>

            {/* Actions */}
            <div className="space-y-3">
              <Button 
                onClick={handleContactSupport}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                <MessageCircle className="w-4 h-4 mr-2" />
                Contact Support
              </Button>
              
              <Button 
                onClick={handleLogout}
                variant="outline"
                className="w-full border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Log Out
              </Button>
            </div>

            {/* Footer */}
            <div className="text-center pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Rwanda Water Resources Board Portal
              </p>
              <p className="text-xs text-gray-500 mt-1">
                For assistance: info@rwb.rw
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
} 