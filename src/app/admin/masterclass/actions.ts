"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff, AuthError } from "@/src/lib/auth";
import { StaffRole } from "@/src/generated/prisma/enums";
import { deliverConfirmation } from "@/src/modules/masterclass/service";

/** Re-send one registration's confirmation email now, ignoring the backoff wait. */
export async function retryConfirmationAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  let notice = "";
  try {
    await requireStaff(StaffRole.COUNSELOR);
    if (!/^[a-z0-9]{20,40}$/.test(id)) throw new Error("Invalid registration id");
    const status = await deliverConfirmation(id, { force: true });
    notice = status === "SENT" ? "Email sent." : `Email not sent (status: ${status}).`;
  } catch (err) {
    if (!(err instanceof AuthError)) console.error("[admin masterclass] retry failed:", err);
    notice = err instanceof AuthError ? err.message : "Retry failed — see server logs.";
  }
  revalidatePath("/admin/masterclass");
  redirect(`/admin/masterclass?notice=${encodeURIComponent(notice)}`);
}
