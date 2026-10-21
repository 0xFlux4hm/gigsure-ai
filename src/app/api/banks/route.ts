/**
 * List Nigerian banks supported for payouts.
 *
 * Sources banks from the configured default provider (Monnify / OPay / Mock)
 * via provider.listBanks(), caches them in the Bank table (24h refresh),
 * and returns them sorted alphabetically.
 *
 * Endpoint is public — bank list is not sensitive.
 */
import { db } from "@/lib/db";
import { apiRoute } from "@/lib/api";
import { getDefaultProvider } from "@/lib/payments/registry";
import { logSecurityEvent } from "@/lib/auth/audit";

export const dynamic = "force-dynamic";

export const GET = apiRoute(async () => {
  // Return cached banks from DB if fresh (< 24h old).
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const cached = await db.bank.findMany({
    where: { isActive: true, fetchedAt: { gt: oneDayAgo } },
    orderBy: { name: "asc" },
  });

  if (cached.length > 0) {
    return {
      banks: cached.map((b) => ({
        code: b.code,
        name: b.name,
        shortName: b.shortName,
        provider: b.provider,
      })),
      source: "cache",
    };
  }

  // Fetch fresh from provider.
  try {
    const provider = await getDefaultProvider();
    if (!provider.listBanks) {
      // Provider doesn't implement listBanks — fall back to whatever's in DB.
      const fallback = await db.bank.findMany({
        where: { isActive: true },
        orderBy: { name: "asc" },
      });
      return {
        banks: fallback.map((b) => ({
          code: b.code,
          name: b.name,
          shortName: b.shortName,
          provider: b.provider,
        })),
        source: "db-fallback",
      };
    }

    const banks = await provider.listBanks();

    // Upsert into DB for caching.
    await db.$transaction(
      banks.map((b) =>
        db.bank.upsert({
          where: { code: b.code },
          create: {
            code: b.code,
            name: b.name,
            shortName: b.shortName,
            provider: provider.name,
            fetchedAt: new Date(),
          },
          update: {
            name: b.name,
            shortName: b.shortName,
            provider: provider.name,
            isActive: true,
            fetchedAt: new Date(),
          },
        }),
      ),
    );

    return {
      banks: banks.sort((a, b) => a.name.localeCompare(b.name)),
      source: "provider",
      provider: provider.name,
    };
  } catch (err) {
    logSecurityEvent("error", "banks.fetch_failed", {
      message: (err as Error)?.message,
    });

    // Last-ditch fallback: return whatever's in DB regardless of age.
    const fallback = await db.bank.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
    });
    return {
      banks: fallback.map((b) => ({
        code: b.code,
        name: b.name,
        shortName: b.shortName,
        provider: b.provider,
      })),
      source: "db-stale",
    };
  }
});
