import prisma from "../db.server";

/**
 * Public API endpoint for theme extensions to fetch bundle data.
 * GET /api/bundles?shop=mystore.myshopify.com
 * GET /api/bundles/:id?shop=mystore.myshopify.com
 */
export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return Response.json({ error: "shop parameter required" }, { status: 400 });
  }

  const bundles = await prisma.bundle.findMany({
    where: { shop, status: "active" },
    include: {
      products: { orderBy: { position: "asc" } },
      discounts: { where: { isActive: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const response = Response.json({ bundles });
  response.headers.set("Access-Control-Allow-Origin", `https://${shop}`);
  response.headers.set("Access-Control-Allow-Methods", "GET");
  return response;
};
