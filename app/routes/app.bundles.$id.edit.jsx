import { useState, useCallback, useEffect } from "react";
import {
  useLoaderData,
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
      : [{ discountType: "percentage", discountValue: "10", minProducts: "2", isActive: true, oneTimeUse: true, discountCode: "" }],
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
    if (products.length < 2) errs.products = "Please add at least 2 products to this bundle";
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
    e.preventDefault();
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
    <s-page heading={`Edit: ${bundle.title}`} backAction={{ url: "/app/bundles" }}>
      {savedBanner && (
        <div style={{ margin: "0 0 16px", padding: "12px 16px", background: "#f0faf0", border: "1px solid #b7dfb7", borderRadius: 8, color: "#2a7a2a", fontWeight: 600, fontSize: 14 }}>
          ✅ Bundle saved successfully!
        </div>
      )}

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
        {/* ── Bundle Details ─── */}
        <s-section heading="Bundle Details">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
                style={fieldStyle(errors.title)}
              />
              {errMsg(errors.title)}
            </div>

            <div>
              <label style={labelStyle(false)}>Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                style={{ ...fieldStyle(false), resize: "vertical" }}
              />
            </div>

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

        {/* ── Bundle Products ─── */}
        <s-section heading="Bundle Products">
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {bundle.usages.length > 0 && (
              <div style={{ padding: "10px 14px", background: "#f0f7ff", border: "1px solid #b3d4f5", borderRadius: 6, fontSize: 14, color: "#1a6ea8" }}>
                📊 This bundle has been used <strong>{bundle.usages.length}</strong> time{bundle.usages.length !== 1 ? "s" : ""}
              </div>
            )}

            {errors.products && (
              <div style={{ padding: "10px 14px", background: "#fdf2f2", border: "1px solid #f5c6cb", borderRadius: 6, color: "#c0392b", fontSize: 14 }}>
                ⚠ {errors.products}
              </div>
            )}

            <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
              Select <strong>2–100 products</strong> to include in this bundle.
            </p>

            <div>
              <s-button type="button" onClick={handleProductPicker}>
                Edit Products ({products.length} selected)
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
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.title}</p>
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

        {/* ── Discounts ─── */}
        <s-section heading="Bundle Discounts">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <p style={{ margin: 0, fontSize: 14, color: "#555" }}>
              Configure one-time-use discounts. Each creates a Shopify discount code.
            </p>

            {discounts.map((discount, index) => (
              <div
                key={index}
                style={{ padding: 16, border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa", display: "flex", flexDirection: "column", gap: 14 }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <strong style={{ fontSize: 14 }}>Discount {index + 1}</strong>
                    {discount.discountCode && (
                      <span style={{ background: "#e8f4fd", color: "#1a6ea8", fontSize: 12, padding: "2px 8px", borderRadius: 100, fontFamily: "monospace", fontWeight: 600 }}>
                        {discount.discountCode}
                      </span>
                    )}
                  </div>
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
                  <p style={{ margin: "4px 0 0", fontSize: 12, color: "#888" }}>Min. bundle products required in cart</p>
                </div>

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

        {/* ── Action Buttons ─── */}
        <div style={{ display: "flex", gap: 12, padding: "12px 0 20px", alignItems: "center" }}>
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              padding: "10px 28px", fontSize: 15, fontWeight: 700,
              background: isSubmitting ? "#666" : "#1a1a1a",
              color: "#fff", border: "none", borderRadius: 7,
              cursor: isSubmitting ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.75 : 1, minWidth: 140,
            }}
          >
            {isSubmitting ? "Saving…" : "Save Bundle"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/app/bundles")}
            disabled={isSubmitting}
            style={{ padding: "10px 20px", fontSize: 15, fontWeight: 500, background: "#fff", color: "#444", border: "1px solid #ccc", borderRadius: 7, cursor: "pointer" }}
          >
            Cancel
          </button>
          {isSubmitting && <span style={{ fontSize: 13, color: "#888" }}>Saving your bundle…</span>}
        </div>
      </form>
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
