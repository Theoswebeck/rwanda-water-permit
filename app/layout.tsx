import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { SessionInitializer } from "@/components/auth/session-initializer";
import { ReactQueryProvider } from "@/lib/react-query-provider";
import { KeepWarmHeartbeat } from "@/components/shared/keep-warm-heartbeat";

const inter = Inter({ subsets: ["latin"], display: "swap", preload: false });

export const metadata: Metadata = {
  title: "RWater Permit - Water Concession Application Portal",
  description: "Streamline your water concession permit process through our modern digital platform. Fast, efficient, and transparent.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Warm connections to OSM tile servers so maps load faster */}
        <link rel="dns-prefetch" href="https://a.tile.openstreetmap.org" />
        <link rel="dns-prefetch" href="https://b.tile.openstreetmap.org" />
        <link rel="dns-prefetch" href="https://c.tile.openstreetmap.org" />
        <link rel="preconnect" href="https://a.tile.openstreetmap.org" crossOrigin="" />
        <link rel="preconnect" href="https://b.tile.openstreetmap.org" crossOrigin="" />
        <link rel="preconnect" href="https://c.tile.openstreetmap.org" crossOrigin="" />

        {/* Speed up IremboPay SDK + checkout by warming connections early */}
        <link rel="dns-prefetch" href="https://dashboard.sandbox.irembopay.com" />
        <link rel="preconnect" href="https://dashboard.sandbox.irembopay.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://checkout.sandbox.irembopay.com" />
        <link rel="preconnect" href="https://checkout.sandbox.irembopay.com" crossOrigin="" />

        <link rel="dns-prefetch" href="https://dashboard.irembopay.com" />
        <link rel="preconnect" href="https://dashboard.irembopay.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://checkout.irembopay.com" />
        <link rel="preconnect" href="https://checkout.irembopay.com" crossOrigin="" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          <ReactQueryProvider>
            <AuthProvider>
              <SessionInitializer />
              <KeepWarmHeartbeat />
              <Header />
              <main>{children}</main>
              <Footer />
            </AuthProvider>
          </ReactQueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
