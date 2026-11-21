import prisma from "../db.server";

/**
 * Public API endpoint for theme extensions to fetch bundle data.
 * GET /api/bundles?shop=mystore.myshopify.com
 * GET /api/bundles?shop=mystore.myshopify.com&bundleId=cm...
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const bundleId = (
    url.searchParams.get("bundleId") ||
    url.searchParams.get("id") ||
    ""
  ).trim();

  if (!shop) {
    return Response.json({ error: "shop parameter required" }, { status: 400 });
  }

  const whereClause = { shop, status: "active" };
  if (bundleId) {
    whereClause.OR = [
      { id: bundleId },
      { title: bundleId },
      { discounts: { some: { discountCode: bundleId } } },
    ];
  }

  const now = new Date();
  const bundles = await prisma.bundle.findMany({
    where: whereClause,
    include: {
      products: { orderBy: { position: "asc" } },
      discounts: {
        where: {
          isActive: true,
          OR: [
            { endsAt: null },
            { endsAt: { gt: now } },
          ],
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const response = Response.json({ bundles });
  response.headers.set("Access-Control-Allow-Origin", `https://${shop}`);
  response.headers.set("Access-Control-Allow-Methods", "GET");
  return response;
};
