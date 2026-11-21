import { useLoaderData, Link } from "react-router";
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
        id
        metafield(namespace: "bundle_app", key: "app_url") {
          value
        }
      }
    }
  `);
  const metafieldJson = await metafieldResponse.json();
  const shopId = metafieldJson.data?.shop?.id;
  let appUrl = metafieldJson.data?.shop?.metafield?.value || "";

  // Auto-sync local dev tunnel URL if running via shopify app dev
  const envAppUrl = process.env.SHOPIFY_APP_URL || "";
  let isAutoConfigured = false;

  if (
    envAppUrl &&
    shopId &&
    envAppUrl !== appUrl &&
    !envAppUrl.includes("example.com")
  ) {
    try {
      await admin.graphql(
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
                value: envAppUrl,
                ownerId: shopId,
              },
            ],
          },
        },
      );
      appUrl = envAppUrl;
      isAutoConfigured = true;
    } catch (err) {
      console.error("Auto-syncing app URL metafield failed:", err);
    }
  } else if (envAppUrl && envAppUrl === appUrl) {
    isAutoConfigured = true;
  }

  return {
    bundleCount,
    activeCount,
    usageCount,
    appUrl,
    envAppUrl,
    isAutoConfigured,
    shop: session.shop,
  };
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const appUrl = formData.get("appUrl");

  if (!appUrl) {
    return { errors: { appUrl: "App URL is required" } };
  }

  // Get shop ID for ownerId
  const shopQuery = await admin.graphql(`#graphql
    query { shop { id } }
  `);
  const shopData = await shopQuery.json();
  const shopId = shopData.data?.shop?.id;

  if (!shopId) {
    return { errors: { appUrl: "Could not retrieve shop ID" } };
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
            ownerId: shopId,
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
  const { bundleCount, activeCount, usageCount } = useLoaderData();

  return (
    <div
      style={{
        maxWidth: 1060,
        margin: "0 auto",
        padding: "24px 20px 48px",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        color: "#1f2937",
      }}
    >
      {/* ─── Hero Banner ───────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, #064e3b 0%, #065f46 55%, #047857 100%)",
          borderRadius: 20,
          padding: "40px 44px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 24,
          boxShadow: "0 10px 25px -5px rgba(6, 78, 59, 0.25)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Left Side: Headline & CTAs */}
        <div style={{ maxWidth: 520, zIndex: 2 }}>
          <h1
            style={{
              color: "#ffffff",
              fontSize: 32,
              fontWeight: 800,
              lineHeight: 1.22,
              margin: "0 0 14px 0",
              letterSpacing: "-0.02em",
            }}
          >
            Sell more with bundles your customers love
          </h1>
          <p
            style={{
              color: "rgba(255, 255, 255, 0.88)",
              fontSize: 15,
              lineHeight: 1.5,
              margin: "0 0 26px 0",
            }}
          >
            Group products together, set a discount, and show it on your storefront. Your bundles are live and being used.
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Link
              to="/app/bundles/new"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                backgroundColor: "#f59e0b",
                color: "#18181b",
                fontSize: 14,
                fontWeight: 700,
                padding: "11px 22px",
                borderRadius: 10,
                textDecoration: "none",
                boxShadow: "0 3px 8px rgba(0,0,0,0.18)",
                transition: "all 0.15s ease",
              }}
            >
              + Create new bundle
            </Link>

            <Link
              to="/app/bundles"
              style={{
                display: "inline-flex",
                alignItems: "center",
                backgroundColor: "rgba(0, 0, 0, 0.28)",
                color: "#ffffff",
                fontSize: 14,
                fontWeight: 600,
                padding: "11px 22px",
                borderRadius: 10,
                border: "1px solid rgba(255, 255, 255, 0.32)",
                textDecoration: "none",
                transition: "all 0.15s ease",
              }}
            >
              Manage bundles
            </Link>
          </div>
        </div>

        {/* Right Side: Product Cards Illustration */}
        <div
          style={{
            position: "relative",
            width: 320,
            height: 190,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Card 1: Product one (coral) */}
          <div
            style={{
              position: "absolute",
              left: 10,
              top: 15,
              transform: "rotate(-10deg)",
              width: 110,
              backgroundColor: "#ffffff",
              borderRadius: 14,
              padding: "10px 10px 12px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
              zIndex: 1,
            }}
          >
            <div
              style={{
                width: "100%",
                height: 72,
                backgroundColor: "#fca5a5",
                borderRadius: 10,
              }}
            />
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1f2937", lineHeight: 1.2 }}>
                Product one
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                $24.00
              </div>
            </div>
          </div>

          {/* Card 2: Product two (mint green - center) */}
          <div
            style={{
              position: "absolute",
              left: 95,
              top: 0,
              transform: "rotate(0deg)",
              width: 118,
              backgroundColor: "#ffffff",
              borderRadius: 14,
              padding: "10px 10px 12px",
              boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
              zIndex: 2,
            }}
          >
            <div
              style={{
                width: "100%",
                height: 78,
                backgroundColor: "#6ee7b7",
                borderRadius: 10,
              }}
            />
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1f2937", lineHeight: 1.2 }}>
                Product two
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                $32.00
              </div>
            </div>
          </div>

          {/* Card 3: Product three (yellow - right) */}
          <div
            style={{
              position: "absolute",
              left: 185,
              top: 20,
              transform: "rotate(10deg)",
              width: 110,
              backgroundColor: "#ffffff",
              borderRadius: 14,
              padding: "10px 10px 12px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.22)",
              zIndex: 1,
            }}
          >
            <div
              style={{
                width: "100%",
                height: 72,
                backgroundColor: "#fde047",
                borderRadius: 10,
              }}
            />
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#1f2937", lineHeight: 1.2 }}>
                Product three
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                $18.00
              </div>
            </div>
          </div>

          {/* Floating Pill: "Bundle & save" */}
          <div
            style={{
              position: "absolute",
              right: 0,
              bottom: 12,
              zIndex: 3,
              background: "linear-gradient(135deg, #ea580c 0%, #dc2626 100%)",
              color: "#ffffff",
              fontSize: 12,
              fontWeight: 800,
              padding: "7px 16px",
              borderRadius: 20,
              boxShadow: "0 4px 14px rgba(220, 38, 38, 0.45)",
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}
          >
            Bundle & save
          </div>
        </div>
      </div>

      {/* ─── Metrics Cards ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 18,
          marginTop: 20,
        }}
      >
        {/* Metric 1: Total bundles */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            padding: "20px 24px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: "#059669",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>
              {bundleCount}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Total bundles
            </div>
          </div>
        </div>

        {/* Metric 2: Active bundles */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            padding: "20px 24px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: "#3b82f6",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>
              {activeCount}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Active bundles
            </div>
          </div>
        </div>

        {/* Metric 3: Total usages */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            padding: "20px 24px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              backgroundColor: "#ea580c",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
              <polyline points="17 6 23 6 23 12"></polyline>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#111827", lineHeight: 1.1 }}>
              {usageCount}
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              Total usages
            </div>
          </div>
        </div>
      </div>

      {/* ─── How It Works ──────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 36 }}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#111827",
            margin: "0 0 16px 0",
          }}
        >
          How it works
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
          }}
        >
          {/* Step 1 */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 14,
              padding: "22px 18px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: "#ecfdf5",
                color: "#059669",
                fontWeight: 800,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              1
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "14px 0 6px 0" }}>
              Create bundles
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>
              Group 2–100 products with a title and description.
            </div>
          </div>

          {/* Step 2 */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 14,
              padding: "22px 18px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: "#ecfdf5",
                color: "#059669",
                fontWeight: 800,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              2
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "14px 0 6px 0" }}>
              Set discounts
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>
              Use a percentage or fixed amount. Limit to one use per customer.
            </div>
          </div>

          {/* Step 3 */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 14,
              padding: "22px 18px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: "#ecfdf5",
                color: "#059669",
                fontWeight: 800,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              3
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "14px 0 6px 0" }}>
              Add to theme
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>
              In the Theme Editor, add the "Bundle Discounts" block to any section.
            </div>
          </div>

          {/* Step 4 */}
          <div
            style={{
              backgroundColor: "#ffffff",
              borderRadius: 14,
              padding: "22px 18px",
              border: "1px solid #e5e7eb",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: "#ecfdf5",
                color: "#059669",
                fontWeight: 800,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              4
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", margin: "14px 0 6px 0" }}>
              Customers save
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.45 }}>
              They copy the discount code and use it at checkout.
            </div>
          </div>
        </div>
      </div>

      {/* ─── Quick Actions ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: 28 }}>
        <h2
          style={{
            fontSize: 18,
            fontWeight: 800,
            color: "#111827",
            margin: "0 0 16px 0",
          }}
        >
          Quick actions
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 16,
          }}
        >
          {/* Manage bundles item */}
          <Link
            to="/app/bundles"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "18px 20px",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              textDecoration: "none",
              backgroundColor: "#ffffff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </div>
            <div>
              <div
                style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}
              >
                Manage bundles
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                Edit, pause or delete
              </div>
            </div>
          </Link>

          {/* Create new bundle item */}
          <Link
            to="/app/bundles/new"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "18px 20px",
              border: "1px solid #e5e7eb",
              borderRadius: 16,
              textDecoration: "none",
              backgroundColor: "#ffffff",
              boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              transition: "transform 0.15s, box-shadow 0.15s",
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 12,
                backgroundColor: "#f87171",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
            </div>
            <div>
              <div
                style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}
              >
                Create new bundle
              </div>
              <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
                Takes about a minute
              </div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
