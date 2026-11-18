import { useState, useCallback, useEffect } from "react";
import {
  useLoaderData,
  useNavigate,
  useActionData,
  useNavigation,
  useSubmit,
  Link,
} from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const bundle = await prisma.bundle.findUnique({
    where: { id: params.id, shop: session.shop },
    include: {
      products: { orderBy: { position: "asc" } },
      discounts: true,
      usages: true,
    },
  });

  if (!bundle) throw new Response("Bundle not found", { status: 404 });
  return { bundle };
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent !== "update") return null;

  const title = (formData.get("title") || "").trim();
  const description = (formData.get("description") || "").trim();
  const status = formData.get("status") || "active";

  let products = [];
  let discounts = [];
  try { products = JSON.parse(formData.get("products") || "[]"); } catch {}
  try { discounts = JSON.parse(formData.get("discounts") || "[]"); } catch {}

  const errors = {};
  if (!title) errors.title = "Bundle title is required";
  if (products.length < 2)
    errors.products = "Please add at least 2 products to this bundle";
  discounts.forEach((d, i) => {
    const v = parseFloat(d.discountValue);
    if (!d.discountType) errors[`discount_${i}_type`] = "Discount type is required";
    if (isNaN(v) || v <= 0) errors[`discount_${i}_value`] = "Enter a value greater than 0";
    if (d.discountType === "percentage" && v > 100)
      errors[`discount_${i}_value`] = "Percentage cannot exceed 100%";
  });
  if (Object.keys(errors).length > 0) return { errors };

  await prisma.bundle.update({
    where: { id: params.id, shop: session.shop },
    data: { title, description: description || null, status },
  });

  await prisma.bundleProduct.deleteMany({ where: { bundleId: params.id } });
  await prisma.bundleProduct.createMany({
    data: products.map((p, index) => ({
      bundleId: params.id,
      productId: p.productId,
      variantId: p.variantId || null,
      title: p.title,
      imageUrl: p.imageUrl || null,
      price: p.price || "0.00",
      quantity: parseInt(p.quantity) || 1,
      position: index,
    })),
  });

  const existingIds = discounts.filter((d) => d.id).map((d) => d.id);
  await prisma.bundleDiscount.deleteMany({
    where: { bundleId: params.id, id: { notIn: existingIds } },
  });

  const bundleProductGids = products
    .map((p) => p.productId)
    .filter(Boolean)
    .map((id) => (id.startsWith("gid://") ? id : `gid://shopify/Product/${id}`));

  for (const discount of discounts) {
    const code =
      (discount.discountCode || "").trim() ||
      `BUNDLE-${params.id.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    if (discount.id) {
      await prisma.bundleDiscount.update({
        where: { id: discount.id },
        data: {
          discountType: discount.discountType,
          discountValue: parseFloat(discount.discountValue),
          minProducts: parseInt(discount.minProducts) || 2,
          isActive: discount.isActive !== false && discount.isActive !== "false",
          oneTimeUse: discount.oneTimeUse === true || discount.oneTimeUse === "true",
          discountCode: code,
        },
      });
    } else {
      let shopifyDiscountId = null;
      try {
        const discountInput = {
          title: `${title} - Bundle Discount`,
          code,
          startsAt: new Date().toISOString(),
          customerGets: {
            value:
              discount.discountType === "percentage"
                ? { percentage: parseFloat(discount.discountValue) / 100 }
                : {
                    discountAmount: {
                      amount: String(parseFloat(discount.discountValue)),
                      appliesOnEachItem: false,
                    },
                  },
            items:
              bundleProductGids.length > 0
                ? { products: { productsToAdd: bundleProductGids } }
                : { all: true },
          },
          minimumRequirement: {
            quantity: {
              greaterThanOrEqualToQuantity: String(parseInt(discount.minProducts) || 2),
            },
          },
          customerSelection: { all: true },
          appliesOncePerCustomer:
            discount.oneTimeUse === true || discount.oneTimeUse === "true",
        };

        const res = await admin.graphql(
          `#graphql
          mutation discountCodeBasicCreate($basicCodeDiscount: DiscountCodeBasicInput!) {
            discountCodeBasicCreate(basicCodeDiscount: $basicCodeDiscount) {
              codeDiscountNode { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              basicCodeDiscount: discountInput,
            },
          },
        );
        const j = await res.json();
        const node = j.data?.discountCodeBasicCreate?.codeDiscountNode;
        if (node?.id) shopifyDiscountId = node.id;
      } catch (e) {
        console.error("Shopify discount creation failed:", e);
      }

      await prisma.bundleDiscount.create({
        data: {
          bundleId: params.id,
          discountType: discount.discountType,
          discountValue: parseFloat(discount.discountValue),
          minProducts: parseInt(discount.minProducts) || 2,
          isActive: discount.isActive !== false && discount.isActive !== "false",
          oneTimeUse: discount.oneTimeUse === true || discount.oneTimeUse === "true",
          discountCode: code,
          shopifyDiscountId,
        },
      });
    }
  }

  return { success: true };
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function EditBundle() {
  const { bundle } = useLoaderData();
  const navigate = useNavigate();
  const actionData = useActionData();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const submit = useSubmit();

  const isSubmitting = navigation.state === "submitting";

  const [title, setTitle] = useState(bundle.title);
  const [description, setDescription] = useState(bundle.description || "");
  const [status, setStatus] = useState(bundle.status);
  const [products, setProducts] = useState(
    bundle.products.map((p) => ({
      productId: p.productId,
      variantId: p.variantId,
      title: p.title,
      imageUrl: p.imageUrl,
      price: p.price,
      quantity: p.quantity,
    })),
  );
  const [discounts, setDiscounts] = useState(
    bundle.discounts.length > 0
      ? bundle.discounts.map((d) => ({
          id: d.id,
          discountType: d.discountType,
          discountValue: String(d.discountValue),
          minProducts: String(d.minProducts),
          isActive: d.isActive,
          oneTimeUse: d.oneTimeUse,
          discountCode: d.discountCode || "",
        }))
      : [
          {
            discountType: "percentage",
            discountValue: "10",
            minProducts: "2",
            isActive: true,
            oneTimeUse: true,
            discountCode: "",
          },
        ],
  );
  const [errors, setErrors] = useState({});
  const [savedBanner, setSavedBanner] = useState(false);

  useEffect(() => {
    if (actionData?.success) {
      setSavedBanner(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setSavedBanner(false), 4000);
    }
    if (actionData?.errors) setErrors(actionData.errors);
  }, [actionData]);

  const validate = () => {
    const errs = {};
    if (!title.trim()) errs.title = "Bundle title is required";
    if (products.length < 2)
      errs.products = "Select 2–100 products. Customers must buy all of them to get the discount.";
    discounts.forEach((d, i) => {
      if (!d.discountType) errs[`discount_${i}_type`] = "Discount type is required";
      const v = parseFloat(d.discountValue);
      if (isNaN(v) || v <= 0) errs[`discount_${i}_value`] = "Enter a value greater than 0";
      if (d.discountType === "percentage" && v > 100)
        errs[`discount_${i}_value`] = "Percentage cannot exceed 100%";
    });
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!validate()) return;

    const fd = new FormData();
    fd.set("intent", "update");
    fd.set("title", title);
    fd.set("description", description);
    fd.set("status", status);
    fd.set("products", JSON.stringify(products));
    fd.set("discounts", JSON.stringify(discounts));
    submit(fd, { method: "post" });
  };

  const handleProductPicker = useCallback(async () => {
    try {
      const selection = await shopify.resourcePicker({
        type: "product",
        multiple: true,
        selectionIds: products.map((p) => ({ id: p.productId })),
      });
      if (selection) {
        const picked = selection.map((product) => {
          const variant = product.variants?.[0];
          return {
            productId: product.id,
            variantId: variant?.id || "",
            title: product.title,
            imageUrl: product.images?.[0]?.originalSrc || "",
            price: variant?.price || "0.00",
            quantity: products.find((p) => p.productId === product.id)?.quantity || 1,
          };
        });
        setProducts(picked);
        setErrors((prev) => {
          const n = { ...prev };
          delete n.products;
          return n;
        });
      }
    } catch (err) {
      console.error("Resource picker error:", err);
    }
  }, [shopify, products]);

  const removeProduct = (index) =>
    setProducts((prev) => prev.filter((_, i) => i !== index));

  const addDiscount = () =>
    setDiscounts((prev) => [
      ...prev,
      {
        discountType: "percentage",
        discountValue: "10",
        minProducts: "2",
        isActive: true,
        oneTimeUse: true,
        discountCode: "",
      },
    ]);

  const updateDiscount = (index, field, value) =>
    setDiscounts((prev) => {
      const n = [...prev];
      n[index] = { ...n[index], [field]: value };
      return n;
    });

  const removeDiscount = (index) =>
    setDiscounts((prev) => prev.filter((_, i) => i !== index));

  const swatchColors = ["#fca5a5", "#86efac", "#93c5fd", "#fde047", "#c4b5fd", "#fdba74"];

  return (
    <div
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "24px 20px 60px",
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
          to="/app/bundles"
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
          <span style={{ color: "#6b7280" }}>Edit: {bundle.title}</span>
        </div>
      </div>

      {/* ─── Saved Banner Notification ────────────────────────────────────────── */}
      {savedBanner && (
        <div
          style={{
            marginBottom: 20,
            padding: "12px 18px",
            backgroundColor: "#ecfdf5",
            border: "1px solid #a7f3d0",
            borderRadius: 10,
            color: "#065f46",
            fontWeight: 600,
            fontSize: 14,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span>✅</span>
          <span>Bundle saved successfully!</span>
        </div>
      )}

      {/* ─── Page Header & Action Buttons ──────────────────────────────────────── */}
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
              fontSize: 26,
              fontWeight: 800,
              color: "#111827",
              margin: "0 0 4px 0",
              letterSpacing: "-0.02em",
            }}
          >
            Edit bundle
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: "#6b7280" }}>
            Group products and reward customers who buy them together.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            onClick={() => navigate("/app/bundles")}
            disabled={isSubmitting}
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid #e5e7eb",
              borderRadius: 8,
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              color: "#374151",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              transition: "all 0.15s ease",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            style={{
              backgroundColor: isSubmitting ? "#6ee7b7" : "#059669",
              border: "none",
              borderRadius: 8,
              padding: "8px 22px",
              fontSize: 13,
              fontWeight: 700,
              color: "#ffffff",
              cursor: isSubmitting ? "not-allowed" : "pointer",
              boxShadow: "0 1px 3px rgba(5,150,105,0.25)",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              transition: "all 0.15s ease",
            }}
          >
            {isSubmitting ? "Saving…" : "Save bundle"}
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {/* ─── Card 1: Bundle details ────────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            padding: "24px 28px",
            marginBottom: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                backgroundColor: "#d1fae5",
                color: "#059669",
                fontWeight: 800,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              1
            </div>
            <div>
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#111827",
                  margin: 0,
                }}
              >
                Bundle details
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  margin: "2px 0 0 0",
                }}
              >
                Name your bundle and choose whether it's live.
              </p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {/* Title */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#111827",
                  marginBottom: 6,
                }}
              >
                Bundle title <span style={{ color: "#dc2626" }}>*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (e.target.value.trim()) {
                    setErrors((prev) => {
                      const n = { ...prev };
                      delete n.title;
                      return n;
                    });
                  }
                }}
                placeholder="e.g. Summer Starter Pack"
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: 13,
                  border: `1px solid ${errors.title ? "#dc2626" : "#e5e7eb"}`,
                  borderRadius: 8,
                  backgroundColor: "#f9fafb",
                  color: "#111827",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {errors.title && (
                <p
                  style={{
                    margin: "4px 0 0",
                    fontSize: 12,
                    color: "#dc2626",
                  }}
                >
                  {errors.title}
                </p>
              )}
            </div>

            {/* Description */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#111827",
                  marginBottom: 6,
                }}
              >
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what's included in this bundle..."
                rows={4}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  fontSize: 13,
                  border: "1px solid #e5e7eb",
                  borderRadius: 8,
                  backgroundColor: "#f9fafb",
                  color: "#111827",
                  outline: "none",
                  boxSizing: "border-box",
                  resize: "vertical",
                }}
              />
            </div>

            {/* Status (Segmented Pill) */}
            <div>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#111827",
                  marginBottom: 6,
                }}
              >
                Status
              </label>
              <div
                style={{
                  display: "inline-flex",
                  backgroundColor: "#f3f4f6",
                  padding: 3,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb",
                  gap: 2,
                }}
              >
                <button
                  type="button"
                  onClick={() => setStatus("active")}
                  style={{
                    backgroundColor:
                      status === "active" ? "#ffffff" : "transparent",
                    color: status === "active" ? "#059669" : "#6b7280",
                    fontWeight: status === "active" ? 700 : 500,
                    borderRadius: 6,
                    padding: "6px 20px",
                    fontSize: 12,
                    border:
                      status === "active"
                        ? "1px solid #e5e7eb"
                        : "none",
                    boxShadow:
                      status === "active"
                        ? "0 1px 2px rgba(0,0,0,0.06)"
                        : "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("draft")}
                  style={{
                    backgroundColor:
                      status !== "active" ? "#ffffff" : "transparent",
                    color: status !== "active" ? "#111827" : "#6b7280",
                    fontWeight: status !== "active" ? 700 : 500,
                    borderRadius: 6,
                    padding: "6px 20px",
                    fontSize: 12,
                    border:
                      status !== "active"
                        ? "1px solid #e5e7eb"
                        : "none",
                    boxShadow:
                      status !== "active"
                        ? "0 1px 2px rgba(0,0,0,0.06)"
                        : "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  Inactive
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ─── Card 2: Bundle products ───────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            padding: "24px 28px",
            marginBottom: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              marginBottom: 18,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                backgroundColor: "#d1fae5",
                color: "#059669",
                fontWeight: 800,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              2
            </div>
            <div>
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#111827",
                  margin: 0,
                }}
              >
                Bundle products
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  margin: "2px 0 0 0",
                }}
              >
                Select 2–100 products. Customers must buy all of them to get the discount.
              </p>
            </div>
          </div>

          {/* Usage Badge (if bundle was used) */}
          {bundle.usages.length > 0 && (
            <div
              style={{
                marginBottom: 16,
                padding: "8px 14px",
                backgroundColor: "#eff6ff",
                border: "1px solid #dbeafe",
                borderRadius: 8,
                fontSize: 13,
                color: "#1e40af",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <span>📊</span>
              <span>
                This bundle has been used{" "}
                <strong>{bundle.usages.length}</strong> time
                {bundle.usages.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Selected Product Chips */}
          {products.length > 0 && (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                marginBottom: 16,
              }}
            >
              {products.map((p, index) => {
                const swatchColor = swatchColors[index % swatchColors.length];

                return (
                  <div
                    key={p.productId || index}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 12px",
                      backgroundColor: "#f9fafb",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#111827",
                    }}
                  >
                    {p.imageUrl ? (
                      <img
                        src={p.imageUrl}
                        alt=""
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 4,
                          objectFit: "cover",
                          flexShrink: 0,
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 4,
                          backgroundColor: swatchColor,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <span>{p.title}</span>
                    <button
                      type="button"
                      onClick={() => removeProduct(index)}
                      title="Remove product"
                      style={{
                        background: "none",
                        border: "none",
                        color: "#9ca3af",
                        cursor: "pointer",
                        fontSize: 16,
                        lineHeight: 1,
                        padding: "0 0 0 2px",
                        display: "flex",
                        alignItems: "center",
                      }}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Products Button & Counter */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              onClick={handleProductPicker}
              style={{
                backgroundColor: "#ffffff",
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                padding: "7px 16px",
                fontSize: 13,
                fontWeight: 600,
                color: "#111827",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                transition: "all 0.15s ease",
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>+</span>
              <span>Edit products</span>
            </button>

            {products.length > 0 && (
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#6b7280",
                }}
              >
                {products.length} selected
              </span>
            )}
          </div>

          {errors.products && (
            <p
              style={{
                margin: "10px 0 0",
                fontSize: 12,
                color: "#dc2626",
              }}
            >
              {errors.products}
            </p>
          )}
        </div>

        {/* ─── Card 3: Bundle discounts ──────────────────────────────────────── */}
        <div
          style={{
            backgroundColor: "#ffffff",
            borderRadius: 16,
            border: "1px solid #e5e7eb",
            padding: "24px 28px",
            marginBottom: 20,
            boxShadow: "0 1px 3px rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "flex-start",
              marginBottom: 18,
            }}
          >
            <div
              style={{
                width: 26,
                height: 26,
                borderRadius: 6,
                backgroundColor: "#d1fae5",
                color: "#059669",
                fontWeight: 800,
                fontSize: 13,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              3
            </div>
            <div>
              <h2
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "#111827",
                  margin: 0,
                }}
              >
                Bundle discounts
              </h2>
              <p
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  margin: "2px 0 0 0",
                }}
              >
                Each discount creates a Shopify discount code.
              </p>
            </div>
          </div>

          {/* Discount Tiers */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
              marginBottom: 16,
            }}
          >
            {discounts.map((discount, index) => (
              <div
                key={index}
                style={{
                  backgroundColor: "#f9fafb",
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  padding: "20px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#111827",
                      }}
                    >
                      Discount {index + 1}
                    </div>
                    {discount.discountCode && (
                      <span
                        style={{
                          backgroundColor: "#eff6ff",
                          color: "#1d4ed8",
                          border: "1px solid #bfdbfe",
                          padding: "2px 8px",
                          borderRadius: 100,
                          fontSize: 11,
                          fontFamily: "monospace",
                          fontWeight: 700,
                        }}
                      >
                        {discount.discountCode}
                      </span>
                    )}
                  </div>

                  {discounts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDiscount(index)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#dc2626",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: "2px 6px",
                      }}
                    >
                      Remove tier
                    </button>
                  )}
                </div>

                {/* Row 1: Type + Value */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  {/* Type */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#111827",
                        marginBottom: 6,
                      }}
                    >
                      Discount type <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <select
                      value={discount.discountType}
                      onChange={(e) =>
                        updateDiscount(index, "discountType", e.target.value)
                      }
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        fontSize: 13,
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        backgroundColor: "#ffffff",
                        color: "#111827",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    >
                      <option value="percentage">Percentage off (%)</option>
                      <option value="fixed_amount">Fixed amount off ($)</option>
                    </select>
                  </div>

                  {/* Value */}
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#111827",
                        marginBottom: 6,
                      }}
                    >
                      {discount.discountType === "percentage"
                        ? "Discount (%)"
                        : "Discount ($)"}{" "}
                      <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <div style={{ position: "relative", width: "100%" }}>
                      <input
                        type="number"
                        value={discount.discountValue}
                        min={0}
                        max={
                          discount.discountType === "percentage"
                            ? 100
                            : undefined
                        }
                        step="0.01"
                        onChange={(e) =>
                          updateDiscount(index, "discountValue", e.target.value)
                        }
                        style={{
                          width: "100%",
                          padding: "10px 32px 10px 14px",
                          fontSize: 13,
                          border: `1px solid ${
                            errors[`discount_${index}_value`]
                              ? "#dc2626"
                              : "#e5e7eb"
                          }`,
                          borderRadius: 8,
                          backgroundColor: "#ffffff",
                          color: "#111827",
                          outline: "none",
                          boxSizing: "border-box",
                        }}
                      />
                      <span
                        style={{
                          position: "absolute",
                          right: 14,
                          top: "50%",
                          transform: "translateY(-50%)",
                          color: "#6b7280",
                          fontSize: 13,
                          fontWeight: 600,
                          pointerEvents: "none",
                        }}
                      >
                        {discount.discountType === "percentage" ? "%" : "$"}
                      </span>
                    </div>
                    {errors[`discount_${index}_value`] && (
                      <p
                        style={{
                          margin: "4px 0 0",
                          fontSize: 12,
                          color: "#dc2626",
                        }}
                      >
                        {errors[`discount_${index}_value`]}
                      </p>
                    )}
                  </div>
                </div>

                {/* Row 2: Min products + Code */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 16,
                  }}
                >
                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#111827",
                        marginBottom: 6,
                      }}
                    >
                      Minimum products required
                    </label>
                    <input
                      type="number"
                      value={discount.minProducts}
                      min={2}
                      max={100}
                      onChange={(e) =>
                        updateDiscount(index, "minProducts", e.target.value)
                      }
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        fontSize: 13,
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        backgroundColor: "#ffffff",
                        color: "#111827",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 11,
                        color: "#6b7280",
                      }}
                    >
                      Min. products from this bundle that must be in the cart
                    </p>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontSize: 12,
                        fontWeight: 600,
                        color: "#111827",
                        marginBottom: 6,
                      }}
                    >
                      Discount code{" "}
                      <span style={{ fontWeight: 400, color: "#6b7280" }}>
                        (optional)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={discount.discountCode}
                      onChange={(e) =>
                        updateDiscount(
                          index,
                          "discountCode",
                          e.target.value.toUpperCase(),
                        )
                      }
                      placeholder="e.g. SUMMER20"
                      style={{
                        width: "100%",
                        padding: "10px 14px",
                        fontSize: 13,
                        border: "1px solid #e5e7eb",
                        borderRadius: 8,
                        backgroundColor: "#ffffff",
                        color: "#111827",
                        outline: "none",
                        boxSizing: "border-box",
                        fontFamily: "monospace",
                      }}
                    />
                    <p
                      style={{
                        margin: "4px 0 0",
                        fontSize: 11,
                        color: "#6b7280",
                      }}
                    >
                      Auto-generated if left blank
                    </p>
                  </div>
                </div>

                {/* Toggles */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    borderTop: "1px solid #e5e7eb",
                    paddingTop: 14,
                  }}
                >
                  {/* One time use toggle */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111827",
                        }}
                      >
                        One-time use per customer
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#6b7280",
                          marginTop: 2,
                        }}
                      >
                        Each customer can only redeem this once
                      </div>
                    </div>
                    <div
                      onClick={() =>
                        updateDiscount(
                          index,
                          "oneTimeUse",
                          !discount.oneTimeUse,
                        )
                      }
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: discount.oneTimeUse
                          ? "#059669"
                          : "#e5e7eb",
                        position: "relative",
                        cursor: "pointer",
                        transition: "background-color 0.2s ease",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          backgroundColor: "#ffffff",
                          position: "absolute",
                          top: 2,
                          left: discount.oneTimeUse ? 22 : 2,
                          transition: "left 0.2s ease",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </div>
                  </div>

                  {/* Active toggle */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: "#111827",
                        }}
                      >
                        Active
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#6b7280",
                          marginTop: 2,
                        }}
                      >
                        Turn off to pause this discount
                      </div>
                    </div>
                    <div
                      onClick={() =>
                        updateDiscount(index, "isActive", !discount.isActive)
                      }
                      style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: discount.isActive
                          ? "#059669"
                          : "#e5e7eb",
                        position: "relative",
                        cursor: "pointer",
                        transition: "background-color 0.2s ease",
                        flexShrink: 0,
                      }}
                    >
                      <div
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: "50%",
                          backgroundColor: "#ffffff",
                          position: "absolute",
                          top: 2,
                          left: discount.isActive ? 22 : 2,
                          transition: "left 0.2s ease",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Add Another Tier Button (Dashed) */}
          <button
            type="button"
            onClick={addDiscount}
            style={{
              width: "100%",
              padding: "12px",
              border: "1px dashed #6ee7b7",
              borderRadius: 10,
              backgroundColor: "#ffffff",
              color: "#059669",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              textAlign: "center",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              transition: "all 0.15s ease",
            }}
          >
            <span style={{ fontSize: 15, fontWeight: 700 }}>+</span>
            <span>Add another discount tier</span>
          </button>
        </div>
      </form>
    </div>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
