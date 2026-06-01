"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Droplet, User, LogOut, FileText, Settings } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import { translateText } from "@/lib/i18n/translator";
import { AppLanguage, getPreferredLanguage, subscribeToLanguageChanges } from "@/lib/i18n/language";

interface DashboardHeaderProps {
  activeTab: "applications";
  onTabChange: (tab: "applications") => void;
}

export function DashboardHeader({ activeTab, onTabChange }: DashboardHeaderProps) {
  const [language, setLanguage] = useState<AppLanguage>("en");
  useEffect(() => {
    setLanguage(getPreferredLanguage());
    return subscribeToLanguageChanges(setLanguage);
  }, []);
  const tx = (value: string) => translateText(value, language);

  // For demo purposes - in a real app, this would come from auth state
  const user = {
    name: "Jane Doe",
    email: "jane.doe@example.com",
    initials: "JD",
    image: null,
  };

  return (
    <header className="bg-white dark:bg-gray-800 shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <Link href="/">
                <div className="flex items-center">
                  <Droplet className="h-8 w-8 text-primary" />
                  <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white">
                    WaterPermit
                  </span>
                </div>
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              <Button
                variant="default"
                onClick={() => onTabChange("applications")}
                className="inline-flex items-center px-1 pt-1 text-sm font-medium"
              >
                {tx("Applications")}
              </Button>
            </div>
          </div>
          <div className="flex items-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative rounded-full h-10 w-10">
                  <Avatar>
                    <AvatarImage src={user.image || undefined} alt={user.name} />
                    <AvatarFallback>{user.initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="flex items-center justify-start gap-2 p-4">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.image || undefined} alt={user.name} />
                    <AvatarFallback>{user.initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col space-y-1 leading-none">
                    <p className="leading-relaxed [&:not(:first-child)]:mt-6 font-medium">{user.name}</p>
                    <p className="leading-relaxed [&:not(:first-child)]:mt-6 text-sm text-muted-foreground">{user.email}</p>
                  </div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/profile" className="flex items-center cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    <span>{tx("My Profile")}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/applications" className="flex items-center cursor-pointer">
                    <FileText className="mr-2 h-4 w-4" />
                    <span>{tx("My Applications")}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings" className="flex items-center cursor-pointer">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>{tx("Account Settings")}</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/login" className="flex items-center cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>{tx("Log out")}</span>
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  );
} 