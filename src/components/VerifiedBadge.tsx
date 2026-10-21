"use client";

import { Badge } from "@/components/ui/badge";
import { ShieldCheck } from "lucide-react";

/**
 * KYC verified badge — shown next to user names when they've completed
 * identity verification (NIN + selfie liveness).
 *
 * Usage:
 *   <VerifiedBadge />
 *   <VerifiedBadge size="sm" />
 *   <VerifiedBadge showLabel={false} />
 */
export function VerifiedBadge({
  size = "default",
  showLabel = true,
}: {
  size?: "sm" | "default";
  showLabel?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1 text-primary border-primary/30 bg-primary/5 ${
        size === "sm" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5"
      }`}
      title="Identity verified (NIN + liveness check)"
    >
      <ShieldCheck className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"} />
      {showLabel && <span>Verified</span>}
    </Badge>
  );
}
