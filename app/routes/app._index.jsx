import { useState } from "react";
import { useLoaderData, useActionData, Form, useNavigation } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import prisma from "../db.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  // Get bundle stats
  const bundleCount = await prisma.bundle.count({
    where: { shop: session.shop },
  });
  const activeCount = await prisma.bundle.count({
    where: { shop: session.shop, status: "active" },
  });
  const usageCount = await prisma.bundleUsage.count({
    where: { bundle: { shop: session.shop } },
  });

  // Get current app URL metafield
  const metafieldResponse = await admin.graphql(`#graphql
    query {
      shop {
        metafield(namespace: "bundle_app", key: "app_url") {
          value
        }
      }
    }
  `);
  const metafieldJson = await metafieldResponse.json();
  const appUrl = metafieldJson.data?.shop?.metafield?.value || "";

  return { bundleCount, activeCount, usageCount, appUrl, shop: session.shop };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const appUrl = formData.get("appUrl");

  if (!appUrl) {
    return { errors: { appUrl: "App URL is required" } };
  }

  // Save app URL to shop metafield (used by theme extension)
  const response = await admin.graphql(
    `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { key namespace value }
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            namespace: "bundle_app",
            key: "app_url",
            type: "single_line_text_field",
            value: appUrl,
            ownerId: "SHOP",
          },
        ],
      },
    },
  );

  const json = await response.json();
  const errors = json.data?.metafieldsSet?.userErrors;

  if (errors && errors.length > 0) {
    return { errors: { appUrl: errors[0].message } };
  }

  return { success: true, savedUrl: appUrl };
};

export default function AppIndex() {
  const { bundleCount, activeCount, usageCount, appUrl } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSaving = navigation.state === "submitting";

  const [url, setUrl] = useState(appUrl || "");

  return (
    <s-page heading="Bundle Discount App">
      {actionData?.success && (
        <s-banner tone="success">
          App URL saved! Your theme extension is now connected.
        </s-banner>
      )}

      {/* Stats */}
      <s-section heading="Overview">
        <s-stack direction="inline" gap="loose">
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ minWidth: 120, textAlign: "center" }}>
            <s-stack direction="block" gap="tight" align="center">
              <s-text style={{ fontSize: 32, fontWeight: "bold" }}>{bundleCount}</s-text>
              <s-text tone="subdued">Total Bundles</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ minWidth: 120, textAlign: "center" }}>
            <s-stack direction="block" gap="tight" align="center">
              <s-text style={{ fontSize: 32, fontWeight: "bold", color: "#2a9d4e" }}>{activeCount}</s-text>
              <s-text tone="subdued">Active Bundles</s-text>
            </s-stack>
          </s-box>
          <s-box padding="base" borderWidth="base" borderRadius="base" style={{ minWidth: 120, textAlign: "center" }}>
            <s-stack direction="block" gap="tight" align="center">
              <s-text style={{ fontSize: 32, fontWeight: "bold", color: "#4361ee" }}>{usageCount}</s-text>
              <s-text tone="subdued">Total Usages</s-text>
            </s-stack>
          </s-box>
        </s-stack>
      </s-section>

      {/* Quick Links */}
      <s-section heading="Quick Actions">
        <s-stack direction="inline" gap="base">
          <s-button variant="primary" url="/app/bundles">
            Manage Bundles
          </s-button>
          <s-button url="/app/bundles/new">
            Create New Bundle
          </s-button>
        </s-stack>
      </s-section>

      {/* App URL Config */}
      <s-section heading="Theme Extension Setup">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            To display bundles in your storefront, set your app URL below. This
            is required for the theme extension to fetch bundle data.
          </s-paragraph>
          <s-paragraph>
            Your app URL is the URL shown when you run{" "}
            <code>shopify app dev</code> (e.g.
            <code>https://your-tunnel.trycloudflare.com</code>).
          </s-paragraph>

          {actionData?.errors?.appUrl && (
            <s-banner tone="critical">{actionData.errors.appUrl}</s-banner>
          )}

          <Form method="post">
            <s-stack direction="block" gap="base">
              <s-text-field
                label="App URL"
                name="appUrl"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://your-app-url.trycloudflare.com"
                helpText="Must be HTTPS. Used by theme extension to fetch bundle data."
              />
              <s-button variant="primary" submit loading={isSaving}>
                Save App URL
              </s-button>
            </s-stack>
          </Form>
        </s-stack>
      </s-section>

      <s-section slot="aside" heading="How It Works">
        <s-stack direction="block" gap="base">
          <s-paragraph>
            <s-text fontWeight="bold">1. Create bundles</s-text>
            <br />
            Group 2–100 products together with a bundle title and description.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">2. Set discounts</s-text>
            <br />
            Add percentage or fixed-amount discounts. Enable one-time-use per
            customer to prevent abuse.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">3. Add to theme</s-text>
            <br />
            In your Theme Editor, add the "Bundle Discounts" block to any
            section to show bundles to customers.
          </s-paragraph>
          <s-paragraph>
            <s-text fontWeight="bold">4. Customers save</s-text>
            <br />
            Customers see the discount code and copy it to use at checkout.
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
