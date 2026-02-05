"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

export interface ClickableStatsCardProps {
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  badgeText?: string;
  badgeClassName?: string;
  isLoading?: boolean;
  isSelected?: boolean;
  onClick?: () => void;
  filterStatuses?: string[];
  /** Whether this card represents the next workflow stage (shows visual indicator) */
  isNextStage?: boolean;
}

export function ClickableStatsCard({
  title,
  value,
  description,
  icon: Icon,
  iconColor,
  badgeText,
  badgeClassName,
  isLoading = false,
  isSelected = false,
  onClick,
  isNextStage = false,
}: ClickableStatsCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.15 }}
    >
      <Card
        className={cn(
          "transition-all duration-200 cursor-pointer relative overflow-hidden",
          "hover:shadow-lg hover:border-primary/50",
          isSelected && "ring-2 ring-primary border-primary shadow-lg bg-primary/5",
          !isSelected && "hover:bg-accent/50",
          isNextStage && !isSelected && "border-dashed border-2 border-slate-300 dark:border-slate-600"
        )}
        onClick={onClick}
      >
        {/* Selected indicator */}
        {isSelected && (
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-primary/80 to-primary" />
        )}
        
        {/* Next stage indicator */}
        {isNextStage && !isSelected && (
          <div className="absolute top-2 right-2">
            <Badge variant="outline" className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5">
              Next Stage
            </Badge>
          </div>
        )}
        
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className={cn(
            "text-sm font-medium transition-colors",
            isSelected ? "text-primary" : "text-muted-foreground"
          )}>
            {title}
          </CardTitle>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {isLoading ? (
              <div className="h-8 w-12 bg-gray-200 rounded animate-pulse" />
            ) : (
              value
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
          {!isLoading && badgeText && (
            <div className="flex items-center mt-2">
              <Badge
                variant="outline"
                className={cn("text-xs", badgeClassName)}
              >
                {badgeText}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export interface StatsConfig {
  id: string;
  title: string;
  value: number;
  description: string;
  icon: LucideIcon;
  iconColor: string;
  filterStatuses: string[];
  targetTab?: string;
  badgeText?: string;
  badgeClassName?: string;
  isNextStage?: boolean;
}

interface ClickableStatsGridProps {
  stats: StatsConfig[];
  selectedStatId: string | null;
  onStatClick: (statId: string | null, filterStatuses: string[], targetTab?: string) => void;
  isLoading?: boolean;
  columns?: 2 | 3 | 4;
}

export function ClickableStatsGrid({
  stats,
  selectedStatId,
  onStatClick,
  isLoading = false,
  columns = 4,
}: ClickableStatsGridProps) {
  const gridCols = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-2 lg:grid-cols-4",
  };

  const handleCardClick = (stat: StatsConfig) => {
    if (selectedStatId === stat.id) {
      // Deselect if clicking the same card
      onStatClick(null, [], undefined);
    } else {
      onStatClick(stat.id, stat.filterStatuses, stat.targetTab);
    }
  };

  return (
    <div className="space-y-2">
      <div className={cn("grid gap-4", gridCols[columns])}>
        {stats.map((stat) => (
          <ClickableStatsCard
            key={stat.id}
            title={stat.title}
            value={stat.value}
            description={stat.description}
            icon={stat.icon}
            iconColor={stat.iconColor}
            badgeText={stat.badgeText}
            badgeClassName={stat.badgeClassName}
            isLoading={isLoading}
            isSelected={selectedStatId === stat.id}
            onClick={() => handleCardClick(stat)}
            isNextStage={stat.isNextStage}
          />
        ))}
      </div>
      {selectedStatId && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center pt-2"
        >
          <Badge 
            variant="secondary" 
            className="cursor-pointer hover:bg-secondary/80 transition-colors"
            onClick={() => onStatClick(null, [], undefined)}
          >
            ✕ Clear filter: {stats.find(s => s.id === selectedStatId)?.title}
          </Badge>
        </motion.div>
      )}
    </div>
  );
}
