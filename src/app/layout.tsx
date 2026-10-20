import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "GigSure AI",
    description: "Work with confidence. Get paid with trust.",
    siteName: "GigSure AI",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GigSure AI",
    description: "Work with confidence. Get paid with trust.",
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
