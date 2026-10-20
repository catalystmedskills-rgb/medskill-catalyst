import { createHmac, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test, vi } from "vitest";

// External services are replaced; everything else (Prisma, routes, service) is real.
const sent: { to: string | string[]; text?: string }[] = [];
vi.mock("@/src/lib/email", () => ({
  sendEmail: vi.fn(async (m: { to: string | string[]; text?: string }) => {
    sent.push(m);
    return { ok: true, id: `re_${sent.length}` };
  }),
}));
let orderSeq = 0;
vi.mock("@/src/lib/razorpay", async (orig) => ({
  ...(await orig<typeof import("@/src/lib/razorpay")>()),
  createRazorpayOrder: vi.fn(async (o: { amountPaise: number }) => ({
    id: `order_test_${++orderSeq}_${randomUUID().slice(0, 6)}`,
    amount: o.amountPaise,
    entity: "order",
    amount_paid: 0,
    amount_due: o.amountPaise,
    currency: "INR",
    status: "created",
  })),
}));
vi.mock("next/server", async (orig) => ({
  ...(await orig<typeof import("next/server")>()),
  after: () => {}, // no request scope in tests
}));

const SECRET = "rzp_test_secret_for_tests";
const WEBHOOK_SECRET = "rzp_webhook_secret_for_tests";

beforeAll(() => {
  Object.assign(process.env, {
    MASTERCLASS_REGISTRATION_OPEN: "true",
    MASTERCLASS_ZOOM_JOIN_URL: "https://us06web.zoom.us/j/81234567890?pwd=test",
    MASTERCLASS_START_TIME_IST: "18:00",
    RESEND_API_KEY: "re_test",
    RAZORPAY_KEY_ID: "rzp_test_key",
    RAZORPAY_KEY_SECRET: SECRET,
    RAZORPAY_WEBHOOK_SECRET: WEBHOOK_SECRET,
  });
});

const { db } = await import("@/src/lib/db");
const service = await import("@/src/modules/masterclass/service");
const { registrationRequestSchema } = await import("@/src/modules/masterclass/schema");
const verifyRoute = await import("@/src/app/api/masterclass/verify/route");
const webhookRoute = await import("@/src/app/api/webhooks/razorpay/route");

const PAID = { phase: "paid" as const, amountPaise: 99_900, freeUntil: new Date("2026-10-22T18:29:00Z") };
const FREE = { phase: "free" as const, amountPaise: 0, freeUntil: null };

let phoneSeq = 0;
function input() {
  const n = String(++phoneSeq).padStart(4, "0");
  return registrationRequestSchema.parse({
    fullName: "Pay Tester",
    email: `pay-${randomUUID().slice(0, 8)}@example.test`,
    phone: `98111${n}0`.slice(0, 10),
    university: "Anna University",
    universitySource: "directory",
    academicStatus: "GRADUATE",
    consent: true,
    attribution: {},
  });
}

const sign = (order: string, payment: string) =>
  createHmac("sha256", SECRET).update(`${order}|${payment}`).digest("hex");

function verifyRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/masterclass/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("masterclass payments", () => {
  test("after the free offer a registration is held as PENDING and gets no Zoom email", async () => {
    const reg = await service.registerForMasterclass(input(), PAID);
    expect(reg.paymentStatus).toBe("PENDING");
    expect(reg.amountPaise).toBe(99_900);
    const before = sent.length;
    expect(await service.deliverConfirmation(reg.id, { force: true })).toBe("PENDING");
    await service.processDueConfirmations(50);
    expect(sent.length).toBe(before);
  });

  test("free registrations are never charged, even if re-submitted after the deadline", async () => {
    const i = input();
    const first = await service.registerForMasterclass(i, FREE);
    expect(first.paymentStatus).toBe("NOT_REQUIRED");
    const again = await service.registerForMasterclass(i, PAID);
    expect(again.kind).toBe("duplicate");
    expect(again.paymentStatus).toBe("NOT_REQUIRED");
    await expect(service.createMasterclassOrder(first.id)).rejects.toThrow(/does not need a payment/);
  });

  test("verified checkout marks PAID once and sends the email with the payment line", async () => {
    const reg = await service.registerForMasterclass(input(), PAID);
    const order = await service.createMasterclassOrder(reg.id);
    expect(order.amountPaise).toBe(99_900);
    const paymentId = `pay_${randomUUID().slice(0, 10)}`;
    const body = {
      registrationId: reg.id,
      razorpay_order_id: order.orderId,
      razorpay_payment_id: paymentId,
      razorpay_signature: sign(order.orderId, paymentId),
    };

    const res = await verifyRoute.POST(verifyRequest(body));
    expect(res.status).toBe(200);
    expect((await res.json()).emailStatus).toBe("SENT");
    const row = await db.masterclassRegistration.findUniqueOrThrow({ where: { id: reg.id } });
    expect(row.payment_status).toBe("PAID");
    expect(row.razorpay_payment_id).toBe(paymentId);
    expect(sent.at(-1)!.text).toContain(`Payment ID ${paymentId}`);

    // A second callback (refresh, double click) changes nothing and sends nothing.
    const count = sent.length;
    const again = await verifyRoute.POST(verifyRequest(body));
    expect(again.status).toBe(200);
    expect(sent.length).toBe(count);
  });

  test("a forged signature or someone else's order is rejected", async () => {
    const reg = await service.registerForMasterclass(input(), PAID);
    const order = await service.createMasterclassOrder(reg.id);
    const forged = await verifyRoute.POST(
      verifyRequest({
        registrationId: reg.id,
        razorpay_order_id: order.orderId,
        razorpay_payment_id: "pay_forged0001",
        razorpay_signature: "0".repeat(64),
      }),
    );
    expect(forged.status).toBe(400);

    const other = await service.registerForMasterclass(input(), PAID);
    const mismatched = await verifyRoute.POST(
      verifyRequest({
        registrationId: other.id,
        razorpay_order_id: order.orderId,
        razorpay_payment_id: "pay_real00001",
        razorpay_signature: sign(order.orderId, "pay_real00001"),
      }),
    );
    expect(mismatched.status).toBe(400);
    const row = await db.masterclassRegistration.findUniqueOrThrow({ where: { id: reg.id } });
    expect(row.payment_status).toBe("PENDING");
  });

  test("the webhook settles a payment when the browser never comes back", async () => {
    const reg = await service.registerForMasterclass(input(), PAID);
    const order = await service.createMasterclassOrder(reg.id);
    const raw = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: `pay_${randomUUID().slice(0, 10)}`, order_id: order.orderId, status: "captured" } } },
    });
    const req = new Request("http://localhost/api/webhooks/razorpay", {
      method: "POST",
      headers: {
        "x-razorpay-signature": createHmac("sha256", WEBHOOK_SECRET).update(raw).digest("hex"),
        "x-razorpay-event-id": `evt_${randomUUID()}`,
      },
      body: raw,
    });
    const before = sent.length;
    const res = await webhookRoute.POST(req);
    expect(res.status).toBe(200);
    const row = await db.masterclassRegistration.findUniqueOrThrow({ where: { id: reg.id } });
    expect(row.payment_status).toBe("PAID");
    expect(row.email_status).toBe("SENT");
    expect(sent.length).toBe(before + 1);
  });

  test("a failed payment can be retried with a new order", async () => {
    const reg = await service.registerForMasterclass(input(), PAID);
    const first = await service.createMasterclassOrder(reg.id);
    expect(await service.markMasterclassPaymentFailed(first.orderId)).toBe(true);
    const retry = await service.createMasterclassOrder(reg.id);
    expect(retry.orderId).not.toBe(first.orderId);
    const row = await db.masterclassRegistration.findUniqueOrThrow({ where: { id: reg.id } });
    expect(row.payment_status).toBe("PENDING");
    expect(row.razorpay_order_id).toBe(retry.orderId);
  });

  test("orders that aren't masterclass orders are left to the enrollment handler", async () => {
    expect(await service.settleMasterclassPayment({ orderId: "order_not_ours", paymentId: "pay_x" })).toBeNull();
    expect(await service.markMasterclassPaymentFailed("order_not_ours")).toBe(false);
  });
});
