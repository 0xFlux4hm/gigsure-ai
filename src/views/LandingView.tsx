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
    title: "Versioned Contracts",
    body: "Draft, propose, and accept client-facing contracts. Accepted versions are preserved — never silently overwritten.",
  },
  {
    icon: Users,
    title: "Secure Collaboration",
    body: "Invite collaborators with cryptographically secure, expiring tokens. Roles enforced on the backend.",
  },
  {
    icon: Wallet,
    title: "Milestone Funding",
    body: "Three funding arrangements (full / milestone / upfront + milestones). Simulated payments clearly labelled.",
  },
  {
    icon: Scale,
    title: "Dispute Resolution",
    body: "Open disputes, upload evidence, assign independent reviewers. Disputed amounts block normal release.",
  },
  {
    icon: Bot,
    title: "AI Assistants",
    body: "Seven advisory AI tools — Team Planner, Task Planner, Contract, Funding, Risk, Evidence, Progress.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy by Design",
    body: "Data export, account deletion, NDPC-aware compliance research. Your data stays yours.",
  },
];

const STEPS = [
  { step: 1, title: "Sign in", body: "Continue with Google or register with email + password." },
  { step: 2, title: "Create a project", body: "Document client requirements, set budget and milestones." },
  { step: 3, title: "Invite collaborators", body: "Secure, expiring invitation tokens. Project-specific roles." },
  { step: 4, title: "Draft contracts", body: "Versioned. Accepted terms are preserved. Audit trail recorded." },
  { step: 5, title: "Fund milestones", body: "Mock provider simulates confirmations. Idempotent webhooks." },
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
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">GigSure<span className="text-primary"> AI</span></span>
          </div>
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
        <section className="container mx-auto max-w-6xl px-4 py-16 md:py-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium mb-6">
            <span className="h-2 w-2 rounded-full bg-primary" /> Built for the Nigerian freelance market
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Work with confidence.
            <br />
            <span className="text-primary">Get paid with trust.</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            GigSure AI turns individual client projects into organized, accountable
            workflows — with versioned contracts, milestone funding, dispute
            resolution, and advisory AI. No marketplace, no middlemen.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" onClick={() => navigate({ view: "register" })}>
              Create your free account
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate({ view: "login" })}>
              I already have an account
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Email + Google sign-in</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Simulated payments clearly labelled</span>
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Privacy by design</span>
          </div>
        </section>

        {/* Features grid */}
        <section className="container mx-auto max-w-6xl px-4 py-12 md:py-20">
          <h2 className="text-3xl font-semibold text-center mb-12">What GigSure AI gives you</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((f) => (
              <Card key={f.title} className="border-border">
                <CardHeader>
                  <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center mb-2">
                    <f.icon className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle>{f.title}</CardTitle>
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

        {/* Trust callout */}
        <section className="container mx-auto max-w-6xl px-4 py-12 md:py-20 border-t">
          <Card className="bg-muted/30">
            <CardContent className="p-6 md:p-10">
              <div className="grid md:grid-cols-2 gap-8 items-center">
                <div>
                  <h2 className="text-2xl font-semibold mb-3">Honest about what we are — and aren&apos;t</h2>
                  <p className="text-muted-foreground mb-4">
                    GigSure AI is a project collaboration and payment-coordination
                    platform. It is <strong>not</strong> a marketplace, a bank, or
                    an escrow provider. We don&apos;t hold your money. We coordinate
                    milestones, contracts, and disputes — and we tell you clearly
                    which features are simulated versus verified.
                  </p>
                  <p className="text-muted-foreground text-sm">
                    Real payment provider integration requires verified
                    provider arrangements and Nigerian regulatory review —
                    see <code>docs/PRIVACY_AND_COMPLIANCE.md</code> for status.
                  </p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Simulated transactions are labelled</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> No live financial transfers in this build</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> AI cannot authorize money movement</div>
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Account deletion follows documented retention</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>

      <footer className="border-t py-8 mt-auto">
        <div className="container mx-auto max-w-6xl px-4 text-sm text-muted-foreground flex flex-col md:flex-row items-center justify-between gap-3">
          <span>© {new Date().getFullYear()} GigSure AI. Built for the Nigerian freelance market.</span>
          <span>Work with confidence. Get paid with trust.</span>
        </div>
      </footer>
    </div>
  );
}
