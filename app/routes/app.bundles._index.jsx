import { useState, useMemo } from "react";
import { useLoaderData, useNavigate, useSubmit, Link } from "react-router";
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
  const submit = useSubmit();

  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState(null);

  const activeCount = useMemo(
    () => bundles.filter((b) => b.status === "active").length,
    [bundles],
  );
  const inactiveCount = useMemo(
    () => bundles.filter((b) => b.status !== "active").length,
    [bundles],
  );

  const filteredBundles = useMemo(() => {
    return bundles.filter((b) => {
      // Filter status
      if (filter === "active" && b.status !== "active") return false;
      if (filter === "inactive" && b.status === "active") return false;

      // Filter search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesTitle = (b.title || "").toLowerCase().includes(q);
        const matchesDesc = (b.description || "").toLowerCase().includes(q);
        const matchesProduct = (b.products || []).some((p) =>
          (p.title || "").toLowerCase().includes(q),
        );
        return matchesTitle || matchesDesc || matchesProduct;
      }

      return true;
    });
  }, [bundles, filter, searchQuery]);

  const handleDelete = (id) => {
    if (confirm("Are you sure you want to delete this bundle?")) {
      const formData = new FormData();
      formData.set("intent", "delete");
      formData.set("id", id);
      submit(formData, { method: "post" });
    }
  };

  const handleToggle = (id, currentStatus) => {
    const formData = new FormData();
    formData.set("intent", "toggle_status");
    formData.set("id", id);
    formData.set("status", currentStatus);
    submit(formData, { method: "post" });
  };

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
      {/* ─── Top Breadcrumbs ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
        }}
      >
        <Link
          to="/app"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            border: "1px solid #e5e7eb",
            backgroundColor: "#ffffff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            color: "#374151",
            fontSize: 14,
            fontWeight: 700,
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
          }}
        >
          ‹
        </Link>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "#4b5563",
          }}
        >
          <Link
            to="/app"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              textDecoration: "none",
              color: "#111827",
            }}
          >
            <span
              style={{
                padding: "0 4px",
                height: 20,
                borderRadius: 5,
                backgroundColor: "#059669",
                color: "#ffffff",
                fontWeight: 800,
                fontSize: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              MS
            </span>
            <span style={{ fontWeight: 600, color: "#111827" }}>
              MS Bundle discount
            </span>
          </Link>
          <span style={{ color: "#9ca3af" }}>/</span>
          <span style={{ color: "#6b7280" }}>Bundles</span>
        </div>
      </div>

      {/* ─── Header & Primary CTA ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: "#111827",
              margin: 0,
              letterSpacing: "-0.02em",
            }}
          >
            Manage bundles
          </h1>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "6px 0 0 0" }}>
            Edit, pause or remove the bundles shown on your storefront.
          </p>
        </div>

        <Link
          to="/app/bundles/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            backgroundColor: "#059669",
            color: "#ffffff",
            fontSize: 14,
            fontWeight: 700,
            padding: "10px 22px",
            borderRadius: 10,
            textDecoration: "none",
            boxShadow: "0 3px 8px rgba(5, 150, 105, 0.3)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          + Create bundle
        </Link>
      </div>

      {/* ─── Main 2-Column Content ────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 310px",
          gap: 22,
          alignItems: "flex-start",
        }}
      >
        {/* Left Column: Bundles Table Card */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
            overflow: "hidden",
          }}
        >
          {/* Top Filter Tabs & Search Bar */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "16px 20px",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            {/* Filter Pills */}
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                type="button"
                onClick={() => setFilter("all")}
                style={{
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor: filter === "all" ? "#d1fae5" : "transparent",
                  color: filter === "all" ? "#059669" : "#6b7280",
                  transition: "all 0.15s ease",
                }}
              >
                All {bundles.length}
              </button>

              <button
                type="button"
                onClick={() => setFilter("active")}
                style={{
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor:
                    filter === "active" ? "#d1fae5" : "transparent",
                  color: filter === "active" ? "#059669" : "#6b7280",
                  transition: "all 0.15s ease",
                }}
              >
                Active {activeCount}
              </button>

              <button
                type="button"
                onClick={() => setFilter("inactive")}
                style={{
                  border: "none",
                  cursor: "pointer",
                  borderRadius: 20,
                  padding: "6px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  backgroundColor:
                    filter === "inactive" ? "#d1fae5" : "transparent",
                  color: filter === "inactive" ? "#059669" : "#6b7280",
                  transition: "all 0.15s ease",
                }}
              >
                Inactive {inactiveCount}
              </button>
            </div>

            {/* Search Input */}
            <div>
              <input
                type="text"
                placeholder="Search bundles"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  backgroundColor: "#f3f4f6",
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  padding: "7px 14px",
                  fontSize: 13,
                  color: "#374151",
                  width: 170,
                  outline: "none",
                }}
              />
            </div>
          </div>

          {/* Table Headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2.3fr 1fr 1fr 1fr 90px",
              padding: "11px 20px",
              backgroundColor: "#f9fafb",
              borderTop: "1px solid #f3f4f6",
              borderBottom: "1px solid #f3f4f6",
              fontSize: 12,
              fontWeight: 600,
              color: "#6b7280",
            }}
          >
            <div>Bundle</div>
            <div>Discount</div>
            <div>Status</div>
            <div>Usage</div>
            <div style={{ textAlign: "right" }}></div>
          </div>

          {/* Table Rows */}
          {filteredBundles.map((bundle) => {
            const activeDiscount = bundle.discounts.find((d) => d.isActive);
            const discountLabel = activeDiscount
              ? activeDiscount.discountType === "percentage"
                ? `${activeDiscount.discountValue}% off`
                : `$${activeDiscount.discountValue} off`
              : "No discount";

            const usagesCount = bundle.usages.length;
            const isActive = bundle.status === "active";

            return (
              <div
                key={bundle.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "2.3fr 1fr 1fr 1fr 90px",
                  padding: "18px 20px",
                  alignItems: "center",
                  borderBottom: "1px solid #f3f4f6",
                }}
              >
                {/* Bundle Column */}
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 10,
                      backgroundColor: "#059669",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#ffffff"
                      strokeWidth="2"
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
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#111827",
                      }}
                    >
                      {bundle.title}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "#6b7280",
                        marginTop: 2,
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                      }}
                    >
                      <span>
                        {bundle.products.length} product
                        {bundle.products.length !== 1 ? "s" : ""}
                      </span>
                      <span style={{ color: "#d1d5db" }}>•</span>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 5,
                          backgroundColor: "#f3f4f6",
                          border: "1px solid #e5e7eb",
                          borderRadius: 5,
                          padding: "1px 7px",
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "#4b5563",
                        }}
                      >
                        <span>ID: {bundle.id}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (navigator?.clipboard) {
                              navigator.clipboard.writeText(bundle.id);
                            }
                            setCopiedId(bundle.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          title="Click to copy Bundle ID"
                          style={{
                            background: "none",
                            border: "none",
                            padding: "0 2px",
                            cursor: "pointer",
                            color: copiedId === bundle.id ? "#059669" : "#6b7280",
                            fontWeight: 700,
                            display: "inline-flex",
                            alignItems: "center",
                            fontSize: 11,
                          }}
                        >
                          {copiedId === bundle.id ? (
                            <span style={{ color: "#059669", fontWeight: 700 }}>
                              ✓ Copied
                            </span>
                          ) : (
                            <svg
                              width="12"
                              height="12"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <rect
                                x="9"
                                y="9"
                                width="13"
                                height="13"
                                rx="2"
                                ry="2"
                              ></rect>
                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                            </svg>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Discount Column */}
                <div>
                  <span
                    style={{
                      backgroundColor: "#ea580c",
                      color: "#ffffff",
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "4px 10px",
                      borderRadius: 20,
                      display: "inline-block",
                    }}
                  >
                    {discountLabel}
                  </span>
                  {activeDiscount?.endsAt && (
                    <div
                      style={{
                        fontSize: 11,
                        color:
                          new Date(activeDiscount.endsAt).getTime() <= Date.now()
                            ? "#dc2626"
                            : "#6b7280",
                        marginTop: 4,
                        fontWeight:
                          new Date(activeDiscount.endsAt).getTime() <= Date.now()
                            ? 600
                            : 400,
                      }}
                    >
                      {new Date(activeDiscount.endsAt).getTime() <= Date.now()
                        ? "Expired"
                        : `Expires ${new Date(activeDiscount.endsAt).toLocaleDateString()}`}
                    </div>
                  )}
                </div>

                {/* Status Column */}
                <div>
                  <span
                    style={{
                      backgroundColor: isActive ? "#d1fae5" : "#f3f4f6",
                      color: isActive ? "#059669" : "#6b7280",
                      fontSize: 12,
                      fontWeight: 700,
                      padding: "4px 12px",
                      borderRadius: 20,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <span style={{ fontSize: 8 }}>●</span>
                    {isActive ? "Active" : "Inactive"}
                  </span>
                </div>

                {/* Usage Column */}
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: "#111827",
                    }}
                  >
                    {usagesCount} time{usagesCount !== 1 ? "s" : ""}
                  </div>
                </div>

                {/* Actions Column */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: 6,
                  }}
                >
                  <Link
                    to={`/app/bundles/${bundle.id}/edit`}
                    style={{
                      backgroundColor: "#ffffff",
                      border: "1px solid #e5e7eb",
                      borderRadius: 6,
                      padding: "4px 12px",
                      width: 94,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#111827",
                      textDecoration: "none",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                      display: "inline-block",
                      textAlign: "center",
                      boxSizing: "border-box",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleToggle(bundle.id, bundle.status)}
                    style={{
                      backgroundColor: "#ffffff",
                      border: `1px solid ${isActive ? "#dc2626" : "#059669"}`,
                      borderRadius: 6,
                      padding: "4px 12px",
                      width: 94,
                      fontSize: 12,
                      fontWeight: 600,
                      color: isActive ? "#dc2626" : "#059669",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                      display: "inline-block",
                      textAlign: "center",
                      boxSizing: "border-box",
                      transition: "all 0.15s ease",
                    }}
                  >
                    {isActive ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(bundle.id)}
                    style={{
                      backgroundColor: "#dc2626",
                      border: "1px solid #dc2626",
                      borderRadius: 6,
                      padding: "4px 12px",
                      width: 94,
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#ffffff",
                      cursor: "pointer",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                      display: "inline-block",
                      textAlign: "center",
                      boxSizing: "border-box",
                      transition: "all 0.15s ease",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}

          {/* Empty state when no bundles exist or match search */}
          {filteredBundles.length === 0 && (
            <div
              style={{
                padding: "48px 24px",
                textAlign: "center",
                color: "#6b7280",
              }}
            >
              <p
                style={{
                  margin: "0 0 12px 0",
                  fontSize: 15,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                No bundles found
              </p>
              <Link
                to="/app/bundles/new"
                style={{
                  display: "inline-block",
                  backgroundColor: "#059669",
                  color: "#ffffff",
                  padding: "9px 18px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Create a bundle
              </Link>
            </div>
          )}
        </div>

        {/* Right Column: "About bundles" Card */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            padding: "22px 20px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
          }}
        >
          <h3
            style={{
              fontSize: 16,
              fontWeight: 800,
              color: "#111827",
              margin: "0 0 20px 0",
            }}
          >
            About bundles
          </h3>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Feature 1 */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: "#d1fae5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "#059669",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                  <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                </svg>
              </div>
              <div>
                <div
                  style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}
                >
                  Group products
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    lineHeight: 1.45,
                    marginTop: 2,
                  }}
                >
                  Combine 2–100 products and offer a special discount on the
                  full bundle.
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: "#d1fae5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "#059669",
                  fontWeight: 800,
                  fontSize: 12,
                }}
              >
                1x
              </div>
              <div>
                <div
                  style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}
                >
                  One use per customer
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    lineHeight: 1.45,
                    marginTop: 2,
                  }}
                >
                  Turn on one-time use to prevent coupon abuse.
                </div>
              </div>
            </div>

            {/* Feature 3 */}
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  backgroundColor: "#d1fae5",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                  color: "#059669",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <line x1="9" y1="3" x2="9" y2="21"></line>
                </svg>
              </div>
              <div>
                <div
                  style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}
                >
                  Show it in your theme
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    lineHeight: 1.45,
                    marginTop: 2,
                  }}
                >
                  Add the "Bundle Deals" app block in your theme editor. Paste any Bundle ID into the block settings to show only that specific bundle!
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};

