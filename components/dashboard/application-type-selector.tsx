"use client";

import { motion } from "framer-motion";
import { 
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  FilePlus, 
  ArrowLeftRight,
  FileCheck,
  CheckCircle,
  FileEdit,
  RefreshCw
} from "lucide-react";

export type ApplicationMode = 'new' | 'transfer' | 'modification' | 'renewal';

interface ApplicationTypeSelectorProps {
  onSelect: (mode: ApplicationMode) => void;
  selectedMode?: ApplicationMode;
}

export function ApplicationTypeSelector({ 
  onSelect,
  selectedMode 
}: ApplicationTypeSelectorProps) {
  const options = [
    {
      mode: 'new' as ApplicationMode,
      title: 'New Water Permit Application',
      description: 'Apply for a new water use permit for your project or facility. This is for first-time applications.',
      icon: FilePlus,
      color: 'blue',
    },
    {
      mode: 'renewal' as ApplicationMode,
      title: 'Renew Existing Permit',
      description: 'Renew an expiring or expired water use permit to extend its validity period. Requires water use report and renewal fee.',
      icon: RefreshCw,
      color: 'green',
    },
    {
      mode: 'modification' as ApplicationMode,
      title: 'Modify Existing Permit',
      description: 'Request modifications to your existing water use permit. The permit number remains the same.',
      icon: FileEdit,
      color: 'amber',
    },
    {
      mode: 'transfer' as ApplicationMode,
      title: 'Transfer Existing Permit',
      description: 'Transfer an existing water use permit from another holder to yourself. Requires the current permit holder\'s consent.',
      icon: ArrowLeftRight,
      color: 'purple',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="border-gray-200">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-2xl">
            <FileCheck className="h-6 w-6 text-blue-600" />
            What would you like to do?
          </CardTitle>
          <CardDescription className="text-base">
            Choose the type of application you want to submit
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {options.map((option) => {
              const Icon = option.icon;
              const isSelected = selectedMode === option.mode;
              const colorClasses = option.color === 'blue' 
                ? {
                    border: 'border-blue-500',
                    bg: 'bg-blue-50',
                    ring: 'ring-blue-200',
                    icon: 'text-blue-600 bg-blue-100',
                    check: 'text-blue-600',
                    button: 'bg-blue-600 hover:bg-blue-700',
                  }
                : option.color === 'green'
                ? {
                    border: 'border-green-500',
                    bg: 'bg-green-50',
                    ring: 'ring-green-200',
                    icon: 'text-green-600 bg-green-100',
                    check: 'text-green-600',
                    button: 'bg-green-600 hover:bg-green-700',
                  }
                : option.color === 'amber'
                ? {
                    border: 'border-amber-500',
                    bg: 'bg-amber-50',
                    ring: 'ring-amber-200',
                    icon: 'text-amber-600 bg-amber-100',
                    check: 'text-amber-600',
                    button: 'bg-amber-600 hover:bg-amber-700',
                  }
                : {
                    border: 'border-purple-500',
                    bg: 'bg-purple-50',
                    ring: 'ring-purple-200',
                    icon: 'text-purple-600 bg-purple-100',
                    check: 'text-purple-600',
                    button: 'bg-purple-600 hover:bg-purple-700',
                  };

              return (
                <Card
                  key={option.mode}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    isSelected
                      ? `${colorClasses.border} ring-2 ${colorClasses.ring} ${colorClasses.bg}`
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => onSelect(option.mode)}
                >
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className={`p-3 rounded-lg ${colorClasses.icon}`}>
                        <Icon className="h-6 w-6" />
                      </div>
                      {isSelected && (
                        <CheckCircle className={`h-6 w-6 ${colorClasses.check}`} />
                      )}
                    </div>

                    <div>
                      <h3 className="font-semibold text-lg mb-2">{option.title}</h3>
                      <p className="text-muted-foreground text-sm">
                        {option.description}
                      </p>
                    </div>

                    <Button
                      className={`w-full ${colorClasses.button}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(option.mode);
                      }}
                    >
                      {option.mode === 'new' 
                        ? 'Start New Application' 
                        : option.mode === 'renewal'
                        ? 'Renew a Permit'
                        : option.mode === 'modification'
                        ? 'Modify a Permit'
                        : 'Transfer a Permit'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default ApplicationTypeSelector;
