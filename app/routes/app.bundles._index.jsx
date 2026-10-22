import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const bundles = await prisma.bundle.findMany({
    where: { shop: session.shop },
    include: {
      products: true,
      discounts: true,
      usages: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return { bundles };
};

export const action = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const id = formData.get("id");
    await prisma.bundle.delete({ where: { id, shop: session.shop } });
    return { success: true };
  }

  if (intent === "toggle_status") {
    const id = formData.get("id");
    const status = formData.get("status");
    await prisma.bundle.update({
      where: { id, shop: session.shop },
      data: { status: status === "active" ? "draft" : "active" },
    });
    return { success: true };
  }

  return null;
};

export default function BundlesIndex() {
  const { bundles } = useLoaderData();
  const navigate = useNavigate();

  const handleDelete = (id) => {
    const form = document.createElement("form");
    form.method = "post";
    const intentInput = document.createElement("input");
    intentInput.name = "intent";
    intentInput.value = "delete";
    const idInput = document.createElement("input");
    idInput.name = "id";
    idInput.value = id;
    form.appendChild(intentInput);
    form.appendChild(idInput);
    document.body.appendChild(form);
    form.submit();
  };

  const handleToggle = (id, status) => {
    const form = document.createElement("form");
    form.method = "post";
    const intentInput = document.createElement("input");
    intentInput.name = "intent";
    intentInput.value = "toggle_status";
    const idInput = document.createElement("input");
    idInput.name = "id";
    idInput.value = id;
    const statusInput = document.createElement("input");
    statusInput.name = "status";
    statusInput.value = status;
    form.appendChild(intentInput);
    form.appendChild(idInput);
    form.appendChild(statusInput);
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <s-page heading="Bundle Discounts">
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={() => navigate("/app/bundles/new")}
      >
        Create Bundle
      </s-button>

      {bundles.length === 0 ? (
        <s-section>
          <s-stack direction="block" gap="base" align="center">
            <s-icon name="bundle" />
            <s-heading>No bundles yet</s-heading>
            <s-paragraph>
              Create your first product bundle with a discount to boost your
              sales.
            </s-paragraph>
            <s-button
              variant="primary"
              onClick={() => navigate("/app/bundles/new")}
            >
              Create your first bundle
            </s-button>
          </s-stack>
        </s-section>
      ) : (
        <s-section>
          <s-data-table>
            <s-data-table-header>
              <s-data-table-row>
                <s-data-table-cell>Bundle Name</s-data-table-cell>
                <s-data-table-cell>Products</s-data-table-cell>
                <s-data-table-cell>Discount</s-data-table-cell>
                <s-data-table-cell>Status</s-data-table-cell>
                <s-data-table-cell>Usage</s-data-table-cell>
                <s-data-table-cell>Actions</s-data-table-cell>
              </s-data-table-row>
            </s-data-table-header>
            <s-data-table-body>
              {bundles.map((bundle) => {
                const activeDiscount = bundle.discounts.find(
                  (d) => d.isActive,
                );
                const discountLabel = activeDiscount
                  ? activeDiscount.discountType === "percentage"
                    ? `${activeDiscount.discountValue}% off`
                    : `$${activeDiscount.discountValue} off`
                  : "No discount";

                return (
                  <s-data-table-row key={bundle.id}>
                    <s-data-table-cell>
                      <s-stack direction="block" gap="tight">
                        <s-text fontWeight="bold">{bundle.title}</s-text>
                        {bundle.description && (
                          <s-text tone="subdued">{bundle.description}</s-text>
                        )}
                      </s-stack>
                    </s-data-table-cell>
                    <s-data-table-cell>
                      {bundle.products.length} products
                    </s-data-table-cell>
                    <s-data-table-cell>{discountLabel}</s-data-table-cell>
                    <s-data-table-cell>
                      <s-badge
                        tone={
                          bundle.status === "active" ? "success" : "subdued"
                        }
                      >
                        {bundle.status}
                      </s-badge>
                    </s-data-table-cell>
                    <s-data-table-cell>
                      {bundle.usages.length} times
                    </s-data-table-cell>
                    <s-data-table-cell>
                      <s-stack direction="inline" gap="tight">
                        <s-button
                          size="slim"
                          onClick={() =>
                            navigate(`/app/bundles/${bundle.id}/edit`)
                          }
                        >
                          Edit
                        </s-button>
                        <s-button
                          size="slim"
                          tone={
                            bundle.status === "active" ? "critical" : "success"
                          }
                          onClick={() =>
                            handleToggle(bundle.id, bundle.status)
                          }
                        >
                          {bundle.status === "active"
                            ? "Deactivate"
                            : "Activate"}
                        </s-button>
                        <s-button
                          size="slim"
                          tone="critical"
                          onClick={() => handleDelete(bundle.id)}
                        >
                          Delete
                        </s-button>
                      </s-stack>
                    </s-data-table-cell>
                  </s-data-table-row>
                );
              })}
            </s-data-table-body>
          </s-data-table>
        </s-section>
      )}

      <s-section slot="aside" heading="About Bundles">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            Bundle discounts let you group 2–100 products together and offer a
            special discount when customers purchase the full bundle.
          </s-paragraph>
          <s-paragraph>
            Each discount can be set to{" "}
            <s-text fontWeight="bold">one-time use per customer</s-text>,
            preventing coupon abuse.
          </s-paragraph>
          <s-paragraph>
            Add the bundle snippet to your theme to display bundles on your
            storefront.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

