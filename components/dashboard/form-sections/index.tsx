"use client";

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// ⚡ PERFORMANCE: Loading component for lazy-loaded sections
const SectionLoader = () => (
  <div className="flex items-center justify-center py-8">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    <span className="ml-2 text-sm text-muted-foreground">Loading section...</span>
  </div>
);

// ⚡ PERFORMANCE: Lazy load heavy form sections
// These dynamic imports ensure form sections are loaded only when needed

// Note: These components would be extracted from application-form-new.tsx
// For now, we export the lazy loading infrastructure

export { SectionLoader };

// ⚡ PERFORMANCE: Dynamic import helper for form sections
// Usage: const MySection = lazyFormSection(() => import('./my-section'))
export function lazyFormSection<T extends React.ComponentType<any>>(
  importFn: () => Promise<{ default: T } | { [key: string]: T }>,
  componentName?: string
) {
  return dynamic(
    async () => {
      const mod = await importFn();
      // Handle both default and named exports
      if ('default' in mod) {
        return mod.default;
      }
      if (componentName && componentName in mod) {
        return (mod as { [key: string]: T })[componentName];
      }
      throw new Error(`Component not found in module`);
    },
    {
      loading: () => <SectionLoader />,
      ssr: false // Form sections don't need SSR
    }
  );
}

