import "server-only";

/** Offer-letter form fields, shared by issue and reissue. Names match the offer schema. */
export const OFFER_FORM_FIELDS = ["offerType", "role", "institution", "startDate", "durationCount", "durationUnit", "mode", "stipendRupees", "stipendPeriod", "greetingName"] as const;

/** Shared by review, preview and issue so all three see exactly the same input. */
export function readIssueForm(formData: FormData) {
  const str = (k: string) => String(formData.get(k) ?? "");
  const raw = str("credentialType");
  const credentialType =
    raw === "INTERNSHIP_COMPLETION" ? ("INTERNSHIP_COMPLETION" as const) : raw === "OFFER_LETTER" ? ("OFFER_LETTER" as const) : ("COURSE_COMPLETION" as const);
  return {
    fullName: str("fullName"),
    email: str("email"),
    courseId: str("courseId"),
    batchId: (formData.get("batchId") as string) || null,
    credentialType,
    ...(credentialType === "INTERNSHIP_COMPLETION"
      ? {
          internship: {
            internshipTitle: str("internshipTitle"),
            department: str("department"),
            startDate: str("startDate"),
            endDate: str("endDate"),
            totalHours: str("totalHours"),
            supervisor: str("supervisor"),
            mode: str("mode"),
            location: str("location"),
          },
        }
      : credentialType === "OFFER_LETTER"
        ? { offer: Object.fromEntries(OFFER_FORM_FIELDS.map((k) => [k, str(k)])) }
        : { completionDate: str("completionDate") }),
    sendEmail: formData.get("sendEmail") === "on",
    idempotencyKey: str("idempotencyKey"),
  };
}
