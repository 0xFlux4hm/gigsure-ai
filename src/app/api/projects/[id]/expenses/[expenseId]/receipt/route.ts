/**
 * Upload a receipt for a released expense (proof of purchase).
 * Body: { receiptUrl }
 */
import { apiRoute, parseJsonBody, fail } from "@/lib/api";
import { requireUserId } from "@/lib/auth/session";
import { uploadExpenseReceipt } from "@/lib/payments/expense-service";
import { z } from "zod";

export const dynamic = "force-dynamic";

const Schema = z.object({
  receiptUrl: z.string().url().max(2048),
});

export const POST = apiRoute(async (req, { params }) => {
  const userId = await requireUserId();
  const body = await parseJsonBody<unknown>(req);
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return fail("Valid receipt URL is required", 422);

  try {
    await uploadExpenseReceipt(params.expenseId, userId, parsed.data.receiptUrl);
    return { uploaded: true, message: "Receipt uploaded. The client will be notified." };
  } catch (err) {
    return fail((err as Error).message ?? "Failed to upload receipt", 400);
  }
});
