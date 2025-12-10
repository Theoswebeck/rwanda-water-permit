"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// ⚡ PERFORMANCE: Configure React Query for optimal caching
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // ⚡ Data is fresh for 5 minutes - won't refetch during this time
        staleTime: 5 * 60 * 1000,
        // ⚡ Keep data in cache for 30 minutes
        gcTime: 30 * 60 * 1000,
        // ⚡ Don't refetch on window focus (reduces unnecessary requests)
        refetchOnWindowFocus: false,
        // ⚡ Retry failed requests 1 time with exponential backoff
        retry: 1,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (typeof window === "undefined") {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is important to avoid re-creating the client on navigation
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  // NOTE: Avoid useState when initializing the query client if you don't
  //       have a suspense boundary between this and the code that may
  //       suspend because React will throw away the client on the initial
  //       render if it suspends and there is no boundary
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// Export query client for use in hooks that need to invalidate queries
export { getQueryClient };

