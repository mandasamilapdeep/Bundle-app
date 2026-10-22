import { useState, useCallback, useEffect } from "react";
import {
  useNavigate,
  useActionData,
  useNavigation,
  useSubmit,
} from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";

// ─── Loader ──────────────────────────────────────────────────────────────────
export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

// ─── Action ──────────────────────────────────────────────────────────────────
export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

  const title = (formData.get("title") || "").trim();
  const description = (formData.get("description") || "").trim();
  const status = formData.get("status") || "active";

  let products = [];
  let discounts = [];
  try { products = JSON.parse(formData.get("products") || "[]"); } catch {}
  try { discounts = JSON.parse(formData.get("discounts") || "[]"); } catch {}

  // Server-side validation
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

  // Create the bundle
  const bundle = await prisma.bundle.create({
    data: {
      shop: session.shop,
      title,
      description: description || null,
      status,
      products: {
        create: products.map((p, index) => ({
          productId: p.productId,
          variantId: p.variantId || null,
          title: p.title,
          imageUrl: p.imageUrl || null,
          price: p.price || "0.00",
          quantity: parseInt(p.quantity) || 1,
          position: index,
        })),
      },
    },
  });

  // Create discount codes
  for (const discount of discounts) {
    const code =
      (discount.discountCode || "").trim() ||
      `BUNDLE-${bundle.id.slice(-6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    let shopifyDiscountId = null;
    try {
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
            basicCodeDiscount: {
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
                items: { all: true },
              },
              customerSelection: { all: true },
              appliesOncePerCustomer:
                discount.oneTimeUse === true || discount.oneTimeUse === "true",
            },
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
        bundleId: bundle.id,
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

  return { success: true, bundleId: bundle.id };
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function NewBundle() {
  const navigate = useNavigate();
  const actionData = useActionData();
  const navigation = useNavigation();
  const shopify = useAppBridge();
  const submit = useSubmit();

  const isSubmitting = navigation.state === "submitting";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [products, setProducts] = useState([]);
  const [discounts, setDiscounts] = useState([
    { discountType: "percentage", discountValue: "10", minProducts: "2", isActive: true, oneTimeUse: true, discountCode: "" },
  ]);
  const [errors, setErrors] = useState({});

  // Redirect on success
  useEffect(() => {
    if (actionData?.success) navigate("/app/bundles");
  }, [actionData?.success, navigate]);

  // Merge server errors
  useEffect(() => {
    if (actionData?.errors) setErrors(actionData.errors);
  }, [actionData?.errors]);

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (!title.trim()) errs.title = "Bundle title is required";
    if (products.length < 2)
      errs.products = "Please add at least 2 products to this bundle";
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

  // ── Submit via useSubmit (keeps App Bridge / React Router in control) ────────
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validate()) return;

    const fd = new FormData();
    fd.set("title", title);
    fd.set("description", description);
    fd.set("status", status);
    fd.set("products", JSON.stringify(products));
    fd.set("discounts", JSON.stringify(discounts));
    submit(fd, { method: "post" });
  };

  // ── Product picker ──────────────────────────────────────────────────────────
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
        setErrors((prev) => { const n = { ...prev }; delete n.products; return n; });
      }
    } catch (err) {
      console.error("Resource picker error:", err);
    }
  }, [shopify, products]);

  const updateProductQty = (index, qty) => {
    const updated = [...products];
    updated[index] = { ...updated[index], quantity: Math.max(1, parseInt(qty) || 1) };
    setProducts(updated);
  };
  const removeProduct = (index) => setProducts((prev) => prev.filter((_, i) => i !== index));

  const addDiscount = () =>
    setDiscounts((prev) => [...prev, { discountType: "percentage", discountValue: "10", minProducts: "2", isActive: true, oneTimeUse: true, discountCode: "" }]);
  const updateDiscount = (index, field, value) =>
    setDiscounts((prev) => { const n = [...prev]; n[index] = { ...n[index], [field]: value }; return n; });
  const removeDiscount = (index) => setDiscounts((prev) => prev.filter((_, i) => i !== index));

  const hasErrors = Object.keys(errors).length > 0;

  // ── Shared styles ──────────────────────────────────────────────────────────
  const fieldStyle = (err) => ({
    width: "100%", padding: "8px 12px", fontSize: 14,
    border: `1px solid ${err ? "#c0392b" : "#ccc"}`,
    borderRadius: 6, boxSizing: "border-box", background: "#fff", outline: "none",
  });
  const labelStyle = (err) => ({
    display: "block", fontWeight: 600, marginBottom: 4, fontSize: 13,
    color: err ? "#c0392b" : "#1a1a1a",
  });
  const errMsg = (msg) =>
    msg ? <p style={{ color: "#c0392b", fontSize: 12, margin: "4px 0 0" }}>⚠ {msg}</p> : null;

  return (
    <s-page heading="Create New Bundle" backAction={{ url: "/app/bundles" }}>
      {/* Error summary banner */}
      {hasErrors && (
        <div style={{ margin: "0 0 16px", padding: "12px 16px", background: "#fdf2f2", border: "1px solid #f5c6cb", borderRadius: 8 }}>
          <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#c0392b", fontSize: 14 }}>Please fix these errors:</p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#c0392b", fontSize: 13 }}>
            {errors.title && <li>{errors.title}</li>}
            {errors.products && <li>{errors.products}</li>}
            {discounts.map((_, i) =>
              errors[`discount_${i}_type`] || errors[`discount_${i}_value`] ? (
                <li key={i}>Discount {i + 1}: {errors[`discount_${i}_type`] || errors[`discount_${i}_value`]}</li>
              ) : null,
            )}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* ── Bundle Details ───────────────────────────────────────────────── */}
        <s-section heading="Bundle Details">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Title */}
            <div>
              <label style={labelStyle(errors.title)}>
                Bundle Title <span style={{ color: "#c0392b" }}>*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  if (e.target.value.trim()) setErrors((p) => { const n = { ...p }; delete n.title; return n; });
                }}
                placeholder="e.g. Summer Starter Pack"
                style={fieldStyle(errors.title)}
              />
              {errMsg(errors.title)}
            </div>

            {/* Description */}
            <div>
              <label style={labelStyle(false)}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what's included in this bundle..."
                rows={3}
                style={{ ...fieldStyle(false), resize: "vertical" }}
              />
            </div>

            {/* Status */}
            <div>
              <label style={labelStyle(false)}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                style={{ padding: "8px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6, background: "#fff", minWidth: 160 }}
              >
                <option value="active">Active</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>
        </s-section>

        {/* ── Bundle Products ──────────────────────────────────────────────── */}
        <s-section heading="Bundle Products">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {errors.products && (
              <div style={{ padding: "10px 14px", background: "#fdf2f2", border: "1px solid #f5c6cb", borderRadius: 6, color: "#c0392b", fontSize: 14 }}>
                ⚠ {errors.products}
              </div>
            )}

            <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
              Select <strong>2–100 products</strong>. Customers must purchase all products in the bundle to receive the discount.
            </p>

            <div>
              <s-button type="button" onClick={handleProductPicker}>
                {products.length > 0 ? `Edit Products (${products.length} selected)` : "Add Products"}
              </s-button>
            </div>

            {products.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {products.map((product, index) => (
                  <div
                    key={product.productId}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa" }}
                  >
                    {product.imageUrl
                      ? <img src={product.imageUrl} alt={product.title} style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
                      : <div style={{ width: 48, height: 48, background: "#e0e0e0", borderRadius: 6, flexShrink: 0 }} />
                    }
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.title}</p>
                      <p style={{ margin: 0, fontSize: 13, color: "#777" }}>${parseFloat(product.price || 0).toFixed(2)}</p>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ fontSize: 13, fontWeight: 500, color: "#555" }}>Qty</label>
                      <input
                        type="number"
                        value={product.quantity}
                        min={1}
                        max={100}
                        onChange={(e) => updateProductQty(index, e.target.value)}
                        style={{ width: 58, padding: "5px 8px", fontSize: 14, border: "1px solid #ccc", borderRadius: 5, textAlign: "center" }}
                      />
                      <button
                        type="button"
                        onClick={() => removeProduct(index)}
                        style={{ padding: "5px 12px", fontSize: 13, background: "#fff", color: "#c0392b", border: "1px solid #c0392b", borderRadius: 5, cursor: "pointer", fontWeight: 500 }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </s-section>

        {/* ── Bundle Discounts ─────────────────────────────────────────────── */}
        <s-section heading="Bundle Discounts">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
              Configure discounts for this bundle. Each discount creates a Shopify discount code.
            </p>

            {discounts.map((discount, index) => (
              <div
                key={index}
                style={{ padding: 16, border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa", display: "flex", flexDirection: "column", gap: 14 }}
              >
                {/* Header row */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <strong style={{ fontSize: 14 }}>Discount {index + 1}</strong>
                  {discounts.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeDiscount(index)}
                      style={{ padding: "4px 10px", fontSize: 13, background: "#fff", color: "#c0392b", border: "1px solid #c0392b", borderRadius: 5, cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  )}
                </div>

                {/* Type */}
                <div>
                  <label style={labelStyle(errors[`discount_${index}_type`])}>
                    Discount Type <span style={{ color: "#c0392b" }}>*</span>
                  </label>
                  <select
                    value={discount.discountType}
                    onChange={(e) => updateDiscount(index, "discountType", e.target.value)}
                    style={{ padding: "8px 12px", fontSize: 14, border: `1px solid ${errors[`discount_${index}_type`] ? "#c0392b" : "#ccc"}`, borderRadius: 6, background: "#fff", minWidth: 200 }}
                  >
                    <option value="percentage">Percentage Off (%)</option>
                    <option value="fixed_amount">Fixed Amount Off ($)</option>
                  </select>
                  {errMsg(errors[`discount_${index}_type`])}
                </div>

                {/* Value */}
                <div>
                  <label style={labelStyle(errors[`discount_${index}_value`])}>
                    {discount.discountType === "percentage" ? "Discount (%)" : "Discount Amount ($)"}{" "}
                    <span style={{ color: "#c0392b" }}>*</span>
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {discount.discountType === "fixed_amount" && <span style={{ fontSize: 15, color: "#555" }}>$</span>}
                    <input
                      type="number"
                      value={discount.discountValue}
                      min={0}
                      max={discount.discountType === "percentage" ? 100 : undefined}
                      step="0.01"
                      onChange={(e) => updateDiscount(index, "discountValue", e.target.value)}
                      style={{ padding: "8px 12px", fontSize: 14, border: `1px solid ${errors[`discount_${index}_value`] ? "#c0392b" : "#ccc"}`, borderRadius: 6, width: 130 }}
                    />
                    {discount.discountType === "percentage" && <span style={{ fontSize: 15, color: "#555" }}>%</span>}
                  </div>
                  {errMsg(errors[`discount_${index}_value`])}
                </div>

                {/* Min products */}
                <div>
                  <label style={labelStyle(false)}>Minimum Products Required</label>
                  <input
                    type="number"
                    value={discount.minProducts}
                    min={2}
                    max={100}
                    onChange={(e) => updateDiscount(index, "minProducts", e.target.value)}
                    style={{ padding: "8px 12px", fontSize: 14, border: "1px solid #ccc", borderRadius: 6, width: 90 }}
                  />
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>Min. products from this bundle that must be in cart</p>
                </div>

                {/* Code */}
                <div>
                  <label style={labelStyle(false)}>
                    Discount Code{" "}
                    <span style={{ fontWeight: 400, color: "#888", fontSize: 12 }}>(optional — auto-generated if blank)</span>
                  </label>
                  <input
                    type="text"
                    value={discount.discountCode}
                    onChange={(e) => updateDiscount(index, "discountCode", e.target.value.toUpperCase())}
                    placeholder="e.g. SUMMER20"
                    style={{ ...fieldStyle(false), fontFamily: "monospace", letterSpacing: "0.05em" }}
                  />
                </div>

                {/* Checkboxes */}
                <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                  <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 14, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={discount.oneTimeUse}
                      onChange={(e) => updateDiscount(index, "oneTimeUse", e.target.checked)}
                      style={{ width: 16, height: 16, marginTop: 2, cursor: "pointer", accentColor: "#1a1a1a" }}
                    />
                    <span>
                      <strong>One-time use per customer</strong>
                      <br />
                      <span style={{ fontSize: 12, color: "#888" }}>Each customer can only redeem this once</span>
                    </span>
                  </label>

                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", userSelect: "none" }}>
                    <input
                      type="checkbox"
                      checked={discount.isActive}
                      onChange={(e) => updateDiscount(index, "isActive", e.target.checked)}
                      style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#1a1a1a" }}
                    />
                    <strong>Active</strong>
                  </label>
                </div>
              </div>
            ))}

            <div>
              <button
                type="button"
                onClick={addDiscount}
                style={{ padding: "8px 16px", fontSize: 14, background: "#fff", color: "#1a1a1a", border: "1px solid #ccc", borderRadius: 6, cursor: "pointer", fontWeight: 500 }}
              >
                + Add Another Discount Tier
              </button>
            </div>
          </div>
        </s-section>

        {/* ── Submit buttons ───────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: 12, padding: "12px 0 20px", alignItems: "center" }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: "10px 28px", fontSize: 15, fontWeight: 700,
              background: isSubmitting ? "#666" : "#1a1a1a",
              color: "#fff", border: "none", borderRadius: 7,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.75 : 1, minWidth: 150,
              transition: "background 0.15s",
            }}
          >
            {isSubmitting ? "Creating Bundle…" : "Create Bundle"}
          </button>

          <button
            type="button"
            onClick={() => navigate("/app/bundles")}
            disabled={isSubmitting}
            style={{ padding: "10px 20px", fontSize: 15, fontWeight: 500, background: "#fff", color: "#444", border: "1px solid #ccc", borderRadius: 7, cursor: "pointer" }}
          >
            Cancel
          </button>

          {isSubmitting && (
            <span style={{ fontSize: 13, color: "#888" }}>Saving your bundle…</span>
          )}
        </div>
      </form>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
