"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, AlertCircle, Shield, Calendar } from "lucide-react";
import { Permit } from "./permits-list";
import { translateText } from "@/lib/i18n/translator";
import { AppLanguage, getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";

interface PermitStatusProps {
  permits: Permit[];
}

export function PermitStatus({ permits }: PermitStatusProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  const getDaysUntilExpiry = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const active = permits.filter(permit => {
    const daysUntilExpiry = getDaysUntilExpiry(permit.expiryDate);
    return permit.status === "active" && daysUntilExpiry > 30;
  }).length;
  
  const expiringSoon = permits.filter(permit => {
    const daysUntilExpiry = getDaysUntilExpiry(permit.expiryDate);
    return permit.status === "active" && daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  }).length;
  
  const total = permits.length;

  // Calculate recent activity (issued this year)
  const currentYear = new Date().getFullYear();
  const thisYearPermits = permits.filter(permit => {
    const issueDate = new Date(permit.issueDate);
    return issueDate.getFullYear() === currentYear;
  }).length;
  
  const statusItems = [
    {
      title: tx("Active Permits"),
      value: active.toString(),
      description: tx("Currently valid permits"),
      detail: tx("In good standing and operational"),
      icon: <CheckCircle className="h-5 w-5" />,
    },
    {
      title: tx("Expiring Soon"),
      value: expiringSoon.toString(),
      description: tx("Permits expiring within 30 days"),
      detail: tx("Renewal action required"),
      icon: <AlertCircle className="h-5 w-5" />,
    },
    {
      title: tx("Total Permits"),
      value: total.toString(),
      description: tx("All permits issued to you"),
      detail: tx("Complete permit portfolio"),
      icon: <Shield className="h-5 w-5" />,
    },
    {
      title: tx("Issued This Year"),
      value: thisYearPermits.toString(),
      description: tx("Permits issued in current year"),
      detail: tx("Recent permit activity"),
      icon: <Calendar className="h-5 w-5" />,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {statusItems.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className="h-full"
          >
            <Card className="h-full border border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow duration-200">
              <CardContent className="p-6 h-full flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-600 mb-2">{item.title}</p>
                    <p className="text-3xl font-bold text-gray-900">{item.value}</p>
                  </div>
                  <div className="text-gray-400 ml-4 mt-1">
                    {item.icon}
                  </div>
                </div>
                <div className="mt-auto">
                  <p className="text-sm font-medium text-gray-700 mb-1">{item.description}</p>
                  <p className="text-xs text-gray-500">{item.detail}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

    </div>
  );
} 