"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { 
  History, 
  ArrowRight, 
  Eye,
  X
} from "lucide-react";

interface ModifiedFieldMarkerProps {
  fieldName: string;
  fieldLabel: string;
  previousValue: any;
  currentValue: any;
  isStaffView?: boolean;
}

// Format value for display
function formatValueForDisplay(value: any): string {
  if (value === null || value === undefined || value === '') {
    return '(empty)';
  }
  
  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) return '(none)';
    // Handle array of strings (e.g., intended activities)
    return value.map(v => {
      if (typeof v === 'string') {
        // Format activity codes to readable text
        return v.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      }
      return String(v);
    }).join(', ');
  }
  
  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }
  
  return String(value);
}

export function ModifiedFieldMarker({
  fieldName,
  fieldLabel,
  previousValue,
  currentValue,
  isStaffView = false,
}: ModifiedFieldMarkerProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Only show for staff views
  if (!isStaffView) {
    return null;
  }

  const formattedPrevious = formatValueForDisplay(previousValue);
  const formattedCurrent = formatValueForDisplay(currentValue);

  return (
    <TooltipProvider>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 ml-1 inline-flex items-center justify-center text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsOpen(!isOpen);
                }}
              >
                <History className="h-3.5 w-3.5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            <p>Field was modified - click to see previous value</p>
          </TooltipContent>
        </Tooltip>

        <PopoverContent 
          className="w-80 p-0" 
          side="right" 
          align="start"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 rounded-t-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-amber-900 text-sm">
                  Modified Field
                </span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 text-amber-600 hover:text-amber-800 hover:bg-amber-100"
                onClick={() => setIsOpen(false)}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-amber-700 mt-1">{fieldLabel}</p>
          </div>
          
          <div className="p-3 space-y-3">
            {/* Previous Value */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                  Previous
                </Badge>
              </div>
              <div className="bg-red-50 border border-red-100 rounded-md p-2 text-sm text-red-800 break-words">
                {formattedPrevious}
              </div>
            </div>

            {/* Arrow */}
            <div className="flex justify-center">
              <ArrowRight className="h-4 w-4 text-gray-400 rotate-90" />
            </div>

            {/* Current Value */}
            <div className="space-y-1">
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                  Current
                </Badge>
              </div>
              <div className="bg-green-50 border border-green-100 rounded-md p-2 text-sm text-green-800 break-words">
                {formattedCurrent}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

// Badge to show at the top of a modification application
export function ModificationBadge({ 
  changesCount 
}: { 
  changesCount: number 
}) {
  return (
    <Badge className="bg-amber-100 text-amber-800 border-amber-200 gap-1.5">
      <History className="h-3.5 w-3.5" />
      <span>Modification Request</span>
      {changesCount > 0 && (
        <span className="bg-amber-600 text-white text-xs px-1.5 py-0.5 rounded-full ml-1">
          {changesCount} {changesCount === 1 ? 'change' : 'changes'}
        </span>
      )}
    </Badge>
  );
}

// Summary component showing all modifications
export function ModificationChangesSummary({
  changes,
  fieldLabels,
}: {
  changes: Record<string, { previous: any; current: any }>;
  fieldLabels: Record<string, string>;
}) {
  const changeEntries = Object.entries(changes);
  
  if (changeEntries.length === 0) {
    return null;
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="h-5 w-5 text-amber-600" />
        <h3 className="font-semibold text-amber-900">Modification Summary</h3>
        <Badge className="bg-amber-600 text-white">
          {changeEntries.length} {changeEntries.length === 1 ? 'field' : 'fields'} modified
        </Badge>
      </div>
      
      <p className="text-sm text-amber-700 mb-4">
        This application is a modification request. The following fields were changed from the original permit:
      </p>

      <div className="space-y-2 max-h-60 overflow-y-auto">
        {changeEntries.map(([fieldName, change]) => (
          <div 
            key={fieldName} 
            className="bg-white border border-amber-100 rounded-md p-3"
          >
            <div className="font-medium text-sm text-amber-900 mb-2">
              {fieldLabels[fieldName] || fieldName}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-red-600 font-medium">Previous: </span>
                <span className="text-gray-700">
                  {formatValueForDisplay(change.previous)}
                </span>
              </div>
              <div>
                <span className="text-green-600 font-medium">Current: </span>
                <span className="text-gray-700">
                  {formatValueForDisplay(change.current)}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default ModifiedFieldMarker;
