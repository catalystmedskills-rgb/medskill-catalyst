/**
 * Create the offer letter program (owner decision 2026-10-12): "MedSkills Offer
 * Letters", code OFR, credential type OFFER_LETTER. Idempotent: re-running
 * reports the existing row and changes nothing. No price, no cohort, so it never
 * appears as an enrollable course (public enrollment needs a programme page and a cohort).
 *
 *   ACTOR_EMAIL=info@medskillscatalyst.com npx tsx --conditions=react-server scripts/create-offer-letter-program.ts
 */
import { db } from "../src/lib/db";

const SLUG = "offer-letters";

async function main() {
  const email = process.env.ACTOR_EMAIL;
  if (!email) throw new Error("Set ACTOR_EMAIL to an individual ADMIN staff email.");
  const actor = await db.staffUser.findFirstOrThrow({ where: { email, role: "ADMIN", is_active: true } });

  const existing = (await db.course.findUnique({ where: { slug: SLUG } })) ?? (await db.course.findUnique({ where: { code: "OFR" } }));
  if (existing) {
    console.log({ created: false, id: existing.id, slug: existing.slug, code: existing.code, credential_type: existing.credential_type, name: existing.name });
    if (existing.credential_type !== "OFFER_LETTER" || existing.code !== "OFR") throw new Error("A program with this slug or code exists but is not the offer letter program. Stopping.");
    return;
  }
  const course = await db.course.create({
    data: {
      name: "MedSkills Offer Letters",
      slug: SLUG,
      description: "Offer letters for incoming interns and campus ambassadors. Not an enrollable course.",
      base_price_paise: 0,
      code: "OFR",
      credential_type: "OFFER_LETTER",
      validity_months: null,
      is_active: true,
    },
  });
  await db.auditLog.create({
    data: {
      actor_id: actor.id,
      action: "PROGRAM_CREATED",
      entity_type: "course",
      entity_id: course.id,
      after: { name: course.name, slug: course.slug, code: course.code, credential_type: course.credential_type },
    },
  });
  console.log({ created: true, id: course.id, slug: course.slug, code: course.code, credential_type: course.credential_type });
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
