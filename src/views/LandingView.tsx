"use client";

import { useSession } from "next-auth/react";
import { useNav } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ShieldCheck,
  Users,
  FileText,
  Wallet,
  Scale,
  Bot,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";

const FEATURES = [
  {
    icon: FileText,
    image: "/images/feature-contracts.png",
    title: "Versioned Contracts",
    body: "Draft, propose, and accept client-facing contracts. Accepted versions are preserved — never silently overwritten.",
  },
  {
    icon: Users,
    image: "/images/feature-team.png",
    title: "Secure Collaboration",
    body: "Invite service providers with cryptographically secure, expiring tokens. Roles enforced on the backend.",
  },
  {
    icon: Wallet,
    image: "/images/feature-funding.png",
    title: "Milestone Funding",
    body: "Three funding arrangements (full / milestone / upfront + milestones). Secure payment processing.",
  },
  {
    icon: Scale,
    image: "/images/feature-disputes.png",
    title: "Dispute Resolution",
    body: "Open disputes, upload evidence, assign independent reviewers. Disputed amounts block normal release.",
  },
  {
    icon: Bot,
    image: "/images/feature-ai.png",
    title: "AI Assistants",
    body: "Seven advisory AI tools — Team Planner, Task Planner, Contract, Funding, Risk, Evidence, Progress.",
  },
  {
    icon: ShieldCheck,
    image: "/images/feature-privacy.png",
    title: "Privacy by Design",
    body: "Data export, account deletion, NDPC-aware compliance research. Your data stays yours.",
  },
];

const STEPS = [
  { step: 1, title: "Sign in", body: "Continue with Google or register with email + password." },
  { step: 2, title: "Create a project", body: "Document client requirements, set budget and milestones." },
  { step: 3, title: "Invite service providers", body: "Secure, expiring invitation tokens. Project-specific roles." },
  { step: 4, title: "Draft contracts", body: "Versioned. Accepted terms are preserved. Audit trail recorded." },
  { step: 5, title: "Fund milestones", body: "Idempotent webhooks with signature verification." },
  { step: 6, title: "Resolve disputes", body: "Evidence uploads, reviewer notes, advisory AI summaries." },
];

export function LandingView() {
  const { data: session } = useSession();
  const { navigate } = useNav();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top nav */}
      <header className="border-b sticky top-0 z-30 bg-background/95 backdrop-blur">
        <div className="container mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <button onClick={() => navigate({ view: "landing" })} className="flex items-center gap-2">
            <img src="/images/logo.png" alt="GigSure AI logo" className="h-8 w-8 object-contain" />
            <span className="font-semibold text-lg">GigSure<span className="text-primary"> AI</span></span>
          </button>
          <nav className="flex items-center gap-2">
            {session ? (
              <Button onClick={() => navigate({ view: "dashboard" })}>Go to dashboard <ArrowRight className="ml-1 h-4 w-4" /></Button>
            ) : (
              <>
                <Button variant="ghost" onClick={() => navigate({ view: "login" })}>Sign in</Button>
                <Button onClick={() => navigate({ view: "register" })}>Get started</Button>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="container mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
            <div className="text-center md:text-left">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
                <span className="h-2 w-2 rounded-full bg-primary" /> Built for the Nigerian service provider market
              </div>
              <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
                Work with confidence.
                <br />
                <span className="text-primary">Get paid with trust.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-xl mx-auto md:mx-0 mb-10">
                GigSure AI turns individual client projects into organized, accountable
                workflows — with versioned contracts, milestone funding, dispute
                resolution, and advisory AI. No marketplace, no middlemen.
              </p>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3">
                <Button size="lg" onClick={() => navigate({ view: "register" })}>
                  Create your free account
                </Button>
                <Button size="lg" variant="outline" onClick={() => navigate({ view: "login" })}>
                  I already have an account
                </Button>
              </div>

              <div className="mt-8 flex flex-wrap items-center justify-center md:justify-start gap-6 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Email + Google sign-in</span>
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Secure payment processing</span>
                <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Privacy by design</span>
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-4 bg-primary/5 rounded-3xl blur-2xl" aria-hidden />
              <div className="relative rounded-2xl overflow-hidden border shadow-xl bg-background">
                <img
                  src="/images/hero.png"
                  alt="Nigerian service provider team collaborating on a digital project"
                  className="w-full h-auto"
                  loading="eager"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="container mx-auto max-w-6xl px-4 py-12 md:py-20">
          <h2 className="text-3xl font-semibold text-center mb-3">What GigSure AI gives you</h2>
          <p className="text-muted-foreground text-center mb-12 max-w-2xl mx-auto">Six pillars of trust, collaboration, and accountability — engineered for service providers and clients in Nigeria.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <Card key={f.title} className="overflow-hidden hover:shadow-lg transition-shadow group">
                <div className="aspect-[4/3] overflow-hidden bg-muted/30">
                  <img
                    src={f.image}
                    alt={f.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                </div>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
                      <f.icon className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle>{f.title}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{f.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section className="container mx-auto max-w-6xl px-4 py-12 md:py-20 border-t">
          <h2 className="text-3xl font-semibold text-center mb-12">From handshake to paid</h2>
          <ol className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <li key={s.step} className="relative pl-12">
                <div className="absolute left-0 top-0 h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-semibold">
                  {s.step}
                </div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t py-8 mt-auto">
        <div className="container mx-auto max-w-6xl px-4 text-sm text-muted-foreground flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <img src="/images/logo.png" alt="GigSure AI logo" className="h-6 w-6 object-contain" />
            <span>© {new Date().getFullYear()} GigSure AI. Built for the Nigerian service provider market.</span>
          </div>
          <span>Work with confidence. Get paid with trust.</span>
        </div>
      </footer>
    </div>
  );
}
