import { unauthenticated } from "../shopify.server";
import prisma from "../db.server";

function corsHeaders(shop) {
  const origin = shop ? `https://${shop}` : "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
  };
}

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(shop),
    });
  }

  return Response.json(
    { error: "Use POST to generate dynamic discount" },
    { status: 405, headers: corsHeaders(shop) },
  );
};

export const action = async ({ request }) => {
  let shop = null;

  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(shop),
    });
  }

  if (request.method !== "POST") {
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: corsHeaders(shop) },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Invalid JSON" },
      { status: 400, headers: corsHeaders(shop) },
    );
  }

  shop = body.shop;
  const { bundleId, itemCount } = body;

  if (!shop || !bundleId) {
    return Response.json(
      { error: "shop and bundleId are required" },
      { status: 400, headers: corsHeaders(shop) },
    );
  }

  // Find the bundle and active discounts
  const now = new Date();
  const bundle = await prisma.bundle.findFirst({
    where: { id: bundleId, shop },
    include: {
      products: true,
      discounts: {
        where: {
          isActive: true,
          OR: [
            { endsAt: null },
            { endsAt: { gt: now } },
          ],
        },
        orderBy: { minProducts: "desc" },
      },
    },
  });

  if (!bundle) {
    return Response.json(
      { error: "Bundle not found" },
      { status: 404, headers: corsHeaders(shop) },
    );
  }

  const count = parseInt(itemCount, 10) || 0;
  // Find highest tier where count >= minProducts
  const matchingTier = (bundle.discounts || []).find(
    (d) => count >= d.minProducts,
  );

  if (!matchingTier) {
    // Customer selected items, but did not reach minimum discount tier
    return Response.json(
      { success: false, discountCode: null, message: "No discount tier reached" },
      { status: 200, headers: corsHeaders(shop) },
    );
  }

  // Extract Shopify Product GIDs to restrict discount ONLY to bundle items
  const bundleProductGids = Array.from(
    new Set(
      (bundle.products || [])
        .map((p) => p.productId)
        .filter(Boolean)
        .map((id) =>
          id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`,
        ),
    ),
  );

  // Calculate discount ONLY on the tier's required number of items (e.g. 2 items)
  let unitPrices = [];
  if (Array.isArray(body.items) && body.items.length > 0) {
    body.items.forEach((it) => {
      const p = parseFloat(it.price || 0);
      const q = parseInt(it.qty || 1, 10);
      for (let i = 0; i < q; i++) {
        unitPrices.push(p);
      }
    });
  } else {
    (bundle.products || []).forEach((p) => {
      unitPrices.push(parseFloat(p.price || 0));
    });
  }
  unitPrices.sort((a, b) => b - a);

  const eligibleCount = Math.min(matchingTier.minProducts, unitPrices.length);
  let discountedSubtotal = 0;
  for (let i = 0; i < eligibleCount; i++) {
    discountedSubtotal += unitPrices[i];
  }

  let calculatedSavings = 0;
  if (matchingTier.discountType === "percentage") {
    calculatedSavings =
      discountedSubtotal * (parseFloat(matchingTier.discountValue) / 100);
  } else {
    calculatedSavings = Math.min(
      parseFloat(matchingTier.discountValue),
      discountedSubtotal,
    );
  }
  calculatedSavings = Math.max(0.01, Math.round(calculatedSavings * 100) / 100);

  // Generate unique, fresh code for THIS specific purchase
  // Format: BNDL-XXXXXXXX (random 8 chars timestamp + hex)
  const timePart = Date.now().toString(36).slice(-4).toUpperCase();
  const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  const uniqueCode = `BNDL-${timePart}-${randomPart}`;

  try {
    const { admin } = await unauthenticated.admin(shop);

    const customerGetsValue =
      matchingTier.discountType === "percentage"
        ? {
            percentage: parseFloat(matchingTier.discountValue) / 100,
          }
        : {
            discountAmount: {
              amount: calculatedSavings.toFixed(2),
              appliesOnEachItem: false,
            },
          };

    const itemsRestriction =
      bundleProductGids.length > 0
        ? { products: { productsToAdd: bundleProductGids } }
        : { all: true };

    let effectiveEndsAt = null;
    if (matchingTier.expire24Hours) {
      const hours = parseInt(matchingTier.expireAfterHours, 10) || 24;
      effectiveEndsAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    }
    if (matchingTier.endsAt) {
      const fixedEndsAt = new Date(matchingTier.endsAt);
      if (!effectiveEndsAt || fixedEndsAt < effectiveEndsAt) {
        effectiveEndsAt = fixedEndsAt;
      }
    }

    const basicCodeDiscount = {
      title: `${bundle.title} (${uniqueCode})`,
      code: uniqueCode,
      startsAt: new Date().toISOString(),
      ...(effectiveEndsAt
        ? { endsAt: effectiveEndsAt.toISOString() }
        : {}),
      usageLimit: 1, // STRICTLY ONE-TIME USE PER UNIQUE PURCHASE
      appliesOncePerCustomer: true,
      customerGets: {
        value: customerGetsValue,
        items: itemsRestriction,
      },
      customerSelection: { all: true },
      minimumRequirement: {
        quantity: {
          greaterThanOrEqualToQuantity: String(matchingTier.minProducts || 2),
        },
      },
      combinesWith: {
        orderDiscounts: false, // Disallow stacking with other order discounts (enforces ONLY 1 discount at checkout)
        productDiscounts: false, // Disallow stacking with other product discounts
        shippingDiscounts: false,
      },
    };

    const graphqlResponse = await admin.graphql(
      `#graphql
      mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
        discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
          codeDiscountNode {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: { basicCodeDiscount },
      },
    );

    const resultJson = await graphqlResponse.json();
    const userErrors = resultJson.data?.discountCodeBasicCreate?.userErrors;
    const graphqlErrors = resultJson.errors;

    if (
      (userErrors && userErrors.length > 0) ||
      (graphqlErrors && graphqlErrors.length > 0)
    ) {
      console.error(
        "Shopify discount creation error:",
        JSON.stringify(userErrors || graphqlErrors),
      );
      // Fallback to static code if one exists in database
      const fallbackCode = matchingTier.discountCode || null;
      return Response.json(
        {
          success: !!fallbackCode,
          discountCode: fallbackCode,
          fallback: true,
          error:
            (userErrors && userErrors[0]?.message) ||
            (graphqlErrors && graphqlErrors[0]?.message),
        },
        { status: 200, headers: corsHeaders(shop) },
      );
    }

    if (userErrors && userErrors.length > 0) {
      console.error(
        "Shopify discount creation userErrors:",
        JSON.stringify(userErrors),
      );
      // Fallback to static code if one exists in database
      const fallbackCode = matchingTier.discountCode || null;
      return Response.json(
        {
          success: true,
          discountCode: fallbackCode,
          fallback: true,
        },
        { status: 200, headers: corsHeaders(shop) },
      );
    }

    // Record usage intent
    await prisma.bundleUsage.create({
      data: {
        bundleId: bundle.id,
        bundleDiscountId: matchingTier.id,
      },
    });

    return Response.json(
      {
        success: true,
        discountCode: uniqueCode,
        discountType: matchingTier.discountType,
        discountValue: matchingTier.discountValue,
      },
      { status: 200, headers: corsHeaders(shop) },
    );
  } catch (err) {
    console.error("Error creating dynamic Shopify discount:", err);
    // If Shopify API call fails, return static fallback code so purchase flow never breaks
    const fallbackCode = matchingTier.discountCode || null;
    return Response.json(
      {
        success: true,
        discountCode: fallbackCode,
        error: String(err),
      },
      { status: 200, headers: corsHeaders(shop) },
    );
  }
};
