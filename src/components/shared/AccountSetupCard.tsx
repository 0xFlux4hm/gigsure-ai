"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Check,
  ArrowRight,
  ShieldCheck,
  Building2,
  type LucideIcon,
} from "lucide-react";

export interface SetupStep {
  id: string;
  /** The icon shown inside the status indicator. */
  icon: LucideIcon;
  /** Short, action-oriented title. */
  title: string;
  /** One-line description explaining the value/why. */
  description: string;
  /** Whether this step has been completed. */
  done: boolean;
  /** Where to navigate when the user taps the CTA. */
  ctaLabel: string;
  onCtaClick: () => void;
}

interface AccountSetupCardProps {
  steps: SetupStep[];
}

/**
 * Premium onboarding checklist that consolidates setup tasks (KYC, bank
 * account, etc.) into a single, visually distinct card.
 *
 * Design rationale (UI/UX):
 *  - One card instead of N stacked amber alerts → less visual noise.
 *  - Progress bar + "X of Y complete" → motivates users to finish.
 *  - Pending steps use amber indicator, completed steps use emerald + a
 *    small check badge → status readable at a glance.
 *  - CTA only renders for pending steps → no dead buttons.
 *  - The whole card auto-hides when every step is done (caller decides).
 */
export function AccountSetupCard({ steps }: AccountSetupCardProps) {
  const total = steps.length;
  const completed = steps.filter((s) => s.done).length;
  const remaining = total - completed;
  const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <section
      className="premium-checklist page-enter"
      aria-label="Account setup"
      role="region"
    >
      {/* Header: title + progress summary */}
      <header className="flex items-center justify-between gap-4 px-5 pt-5 pb-3 border-b border-border/40">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold tracking-tight">
              Account setup
            </h2>
            {remaining > 0 && (
              <span className="inline-flex items-center rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
                Action needed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {remaining > 0
              ? `Complete ${remaining} ${remaining === 1 ? "step" : "steps"} to unlock payouts.`
              : "Your account is fully set up."}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {completed}<span className="text-muted-foreground font-normal"> of {total}</span>
          </div>
          <div className="text-[10px] text-muted-foreground/70 uppercase tracking-wide">
            complete
          </div>
        </div>
      </header>

      {/* Progress bar */}
      <div className="px-5 pt-3">
        <Progress
          value={progress}
          className="h-1.5 bg-muted [&>div]:bg-gradient-to-r [&>div]:from-emerald-500 [&>div]:to-emerald-400"
        />
      </div>

      {/* Steps list */}
      <ol className="divide-y divide-border/40 px-2 py-2">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li
              key={step.id}
              className="checklist-row"
              data-state={step.done ? "done" : "pending"}
            >
              {/* Status indicator with optional completion badge */}
              <div
                className="checklist-indicator"
                data-state={step.done ? "done" : "pending"}
                aria-hidden="true"
              >
                <Icon className="h-4 w-4" />
                {step.done && (
                  <span className="checklist-complete-badge">
                    <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  </span>
                )}
              </div>

              {/* Title + description */}
              <div className="flex-1 min-w-0 py-0.5">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium leading-tight">
                    {step.title}
                  </h3>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                      step.done
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-amber-500/10 text-amber-700 dark:text-amber-400"
                    )}
                  >
                    {step.done ? "Verified" : "Pending"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {step.description}
                </p>

                {/* CTA — only for pending steps. Solid amber to convey
                    urgency and primary action status. */}
                {!step.done && (
                  <Button
                    size="sm"
                    className="mt-2.5 h-8 gap-1.5 text-xs font-medium bg-amber-500 text-white border-amber-500 hover:bg-amber-600 hover:border-amber-600 shadow-sm"
                    onClick={step.onCtaClick}
                  >
                    {step.ctaLabel}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * Convenience factory for the standard GigSure setup steps (KYC + bank
 * account). Caller passes the completion flags and an `onNavigate` callback
 * that takes the target view name (typed loosely to avoid coupling this
 * shared component to the app's `ViewName` union).
 */
export function buildStandardSetupSteps(params: {
  kycVerified: boolean;
  bankAccountAdded: boolean;
  onKycClick: () => void;
  onBankAccountClick: () => void;
}): SetupStep[] {
  const { kycVerified, bankAccountAdded, onKycClick, onBankAccountClick } = params;
  return [
    {
      id: "kyc",
      icon: ShieldCheck,
      title: "Verify your identity (KYC)",
      description:
        "Complete NIN + selfie verification to fund milestones and unlock payouts.",
      done: kycVerified,
      ctaLabel: "Verify now",
      onCtaClick: onKycClick,
    },
    {
      id: "bank-account",
      icon: Building2,
      title: "Add a bank account",
      description:
        "Add a Nigerian bank account to receive milestone payouts via Monnify or OPay.",
      done: bankAccountAdded,
      ctaLabel: "Add bank account",
      onCtaClick: onBankAccountClick,
    },
  ];
}
