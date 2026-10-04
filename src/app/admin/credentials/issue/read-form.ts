import "server-only";

/** Shared by review, preview and issue so all three see exactly the same input. */
export function readIssueForm(formData: FormData) {
  const str = (k: string) => String(formData.get(k) ?? "");
  const credentialType = str("credentialType") === "INTERNSHIP_COMPLETION" ? ("INTERNSHIP_COMPLETION" as const) : ("COURSE_COMPLETION" as const);
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
      : { completionDate: str("completionDate") }),
    sendEmail: formData.get("sendEmail") === "on",
    idempotencyKey: str("idempotencyKey"),
  };
}
