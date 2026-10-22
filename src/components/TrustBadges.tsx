"use client";

import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Star } from "lucide-react";

type Badge = {
  type: string;
  label: string;
  description: string;
};

export function TrustBadges({ badges }: { badges: Badge[] }) {
  if (!badges || badges.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {badges.map((badge) => (
        <Badge
          key={badge.type}
          variant="default"
          className="text-xs gap-1"
          title={badge.description}
        >
          {badge.type === "TOP_SERVICE_PROVIDER" ? (
            <Star className="h-3 w-3 fill-current" />
          ) : (
            <ShieldCheck className="h-3 w-3" />
          )}
          {badge.label}
        </Badge>
      ))}
    </div>
  );
}
