import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GigSure AI — Work with confidence. Get paid with trust.",
  description: "GigSure AI is a secure, AI-assisted project collaboration and payment-coordination platform for freelancers, clients, and independent professionals. Built for the Nigerian freelance market.",
  keywords: ["GigSure AI", "freelance", "Nigeria", "project collaboration", "milestone funding", "contracts", "AI assistants"],
  authors: [{ name: "GigSure AI" }],
  icons: {
    icon: [
      { url: "/images/icon.png", type: "image/png", sizes: "32x32" },
      { url: "/images/icon.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/images/icon.png", sizes: "180x180" }],
  },
  openGraph: {
    title: "GigSure AI — Work with confidence. Get paid with trust.",
    description: "A secure, AI-assisted project collaboration and payment-coordination platform for the Nigerian freelance market.",
    siteName: "GigSure AI",
    type: "website",
    images: [{ url: "/images/og-image.png", width: 1344, height: 768, alt: "GigSure AI" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "GigSure AI",
    description: "Work with confidence. Get paid with trust.",
    images: ["/images/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
