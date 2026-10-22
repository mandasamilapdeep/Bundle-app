import prisma from "../db.server";

/**
 * POST /api/bundles/track-usage
 * Track when a bundle discount is used at checkout
 * Body: { bundleId, bundleDiscountId, customerEmail, orderId, shop }
 */
export const action = async ({ request }) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { bundleId, bundleDiscountId, customerEmail, orderId, shop } = body;

  if (!bundleId || !shop) {
    return Response.json(
      { error: "bundleId and shop are required" },
      { status: 400 },
    );
  }

  // Check if bundle exists and belongs to shop
  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, shop },
  });

  if (!bundle) {
    return Response.json({ error: "Bundle not found" }, { status: 404 });
  }

  // If one-time use, check if customer already used this discount
  if (bundleDiscountId && customerEmail) {
    const discount = await prisma.bundleDiscount.findUnique({
      where: { id: bundleDiscountId },
    });

    if (discount?.oneTimeUse) {
      const existingUsage = await prisma.bundleUsage.findFirst({
        where: { bundleDiscountId, customerEmail },
      });

      if (existingUsage) {
        return Response.json(
          { error: "Discount already used by this customer", alreadyUsed: true },
          { status: 409 },
        );
      }
    }
  }

  const usage = await prisma.bundleUsage.create({
    data: {
      bundleId,
      bundleDiscountId: bundleDiscountId || null,
      customerEmail: customerEmail || null,
      orderId: orderId || null,
    },
  });

  const response = Response.json({ success: true, usageId: usage.id });
  response.headers.set("Access-Control-Allow-Origin", `https://${shop}`);
  return response;
};

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const customerEmail = url.searchParams.get("customerEmail");
  const bundleDiscountId = url.searchParams.get("bundleDiscountId");

  if (!shop || !customerEmail || !bundleDiscountId) {
    return Response.json(
      { error: "shop, customerEmail, bundleDiscountId required" },
      { status: 400 },
    );
  }

  const usage = await prisma.bundleUsage.findFirst({
    where: { bundleDiscountId, customerEmail },
  });

  const response = Response.json({ hasUsed: !!usage });
  response.headers.set("Access-Control-Allow-Origin", `https://${shop}`);
  return response;
};
