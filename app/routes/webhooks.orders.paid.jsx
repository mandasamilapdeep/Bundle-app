import { authenticate } from "../shopify.server";
import prisma from "../db.server";

/**
 * Webhook: orders/paid
 * Tracks bundle discount usage when an order is paid.
 * Checks applied discount codes against known bundle discount codes.
 */
export const action = async ({ request }) => {
  const { payload, shop } = await authenticate.webhook(request);

  const order = payload;
  const discountCodes = (order.discount_codes || []).map((d) => d.code);
  const customerEmail = order.email || order.customer?.email;
  const orderId = String(order.id);

  if (discountCodes.length === 0) {
    return new Response("No discount codes", { status: 200 });
  }

  // Find bundle discounts matching the applied codes
  const matchedDiscounts = await prisma.bundleDiscount.findMany({
    where: {
      discountCode: { in: discountCodes },
      bundle: { shop },
    },
    include: { bundle: true },
  });

  for (const discount of matchedDiscounts) {
    // Record usage
    await prisma.bundleUsage.create({
      data: {
        bundleId: discount.bundleId,
        bundleDiscountId: discount.id,
        customerEmail: customerEmail || null,
        orderId,
      },
    });
  }

  return new Response("OK", { status: 200 });
};

