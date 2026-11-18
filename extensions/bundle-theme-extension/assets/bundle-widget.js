"use strict";
(function () {
  "use strict";

  function g(t, e) {
    return (e || document).querySelector(t);
  }

  function M(t) {
    var e = parseFloat(t);
    return isNaN(e) ? t : "$" + e.toFixed(2);
  }

  function c(t) {
    return String(t || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function q(t, e) {
    for (var d = null, s = 0; s < t.length; s++) {
      var i = t[s];
      if (
        i.isActive &&
        e >= i.minProducts &&
        (!d || i.minProducts > d.minProducts)
      ) {
        d = i;
      }
    }
    return d;
  }

  function $(selectedProducts, totalRawPrice, activeDiscount) {
    if (!activeDiscount || !selectedProducts || selectedProducts.length === 0) {
      return { savings: 0, finalTotal: totalRawPrice, eligibleCount: 0 };
    }

    var unitPrices = [];
    selectedProducts.forEach(function (prod) {
      var p = parseFloat(prod.price || 0);
      var q = parseInt(prod.qty || 1, 10);
      for (var i = 0; i < q; i++) {
        unitPrices.push(p);
      }
    });

    unitPrices.sort(function (a, b) {
      return b - a;
    });

    // Discount applies strictly to the tier's required quantity (e.g. 2 items)
    var eligibleCount = Math.min(activeDiscount.minProducts, unitPrices.length);
    var discountedSubtotal = 0;
    for (var i = 0; i < eligibleCount; i++) {
      discountedSubtotal += unitPrices[i];
    }

    var savings = 0;
    if (activeDiscount.discountType === "percentage") {
      savings =
        discountedSubtotal * (parseFloat(activeDiscount.discountValue) / 100);
    } else {
      savings = Math.min(
        parseFloat(activeDiscount.discountValue),
        discountedSubtotal,
      );
    }

    savings = Math.round(savings * 100) / 100;
    var finalTotal = Math.max(
      0,
      Math.round((totalRawPrice - savings) * 100) / 100,
    );

    return {
      savings: savings,
      finalTotal: finalTotal,
      eligibleCount: eligibleCount,
    };
  }

  function E(t) {
    return t.discountType === "percentage"
      ? t.discountValue + "% OFF"
      : "$" + t.discountValue.toFixed(2) + " OFF";
  }

  function j(t, e, d) {
    if (!t || t.length === 0) return "";
    var s = t
      .filter(function (n) {
        return n.isActive;
      })
      .sort(function (n, u) {
        return n.minProducts - u.minProducts;
      });
    var i = '<div class="bundle-widget__tiers">';
    i +=
      '<p class="bundle-widget__tiers-label">🎯 Discount Tiers — pick more, save more:</p>';
    i += '<div class="bundle-widget__tiers-list">';
    s.forEach(function (n) {
      i +=
        '<div class="bundle-widget__tier" data-min="' +
        n.minProducts +
        '" style="--accent:' +
        d +
        '"><span class="bundle-widget__tier-pick">Pick any <strong>' +
        n.minProducts +
        '+</strong></span><span class="bundle-widget__tier-arrow">→</span><span class="bundle-widget__tier-value">' +
        E(n) +
        "</span></div>";
    });
    i += "</div></div>";
    return i;
  }

  // Product card renderer with "Add To Box" button and quantity selector [-] qty [+]
  function B(t, e, d, s, addToBoxText) {
    var i = t.imageUrl
      ? '<img class="bundle-widget__product-img" src="' +
        t.imageUrl +
        '" alt="' +
        c(t.title) +
        '" loading="lazy">'
      : '<div class="bundle-widget__product-img bundle-widget__product-img--placeholder"></div>';

    var btnLabel = addToBoxText || "Add To Box";

    return (
      '<div class="bundle-widget__product" data-product-id="' +
      t.productId +
      '" data-variant-id="' +
      (t.variantId || "") +
      '" data-price="' +
      (t.price || "0") +
      '" data-qty="0" style="--accent:' +
      s +
      '">' +
      '<div class="bundle-widget__product-media">' +
      i +
      "</div>" +
      '<div class="bundle-widget__product-info">' +
      '<span class="bundle-widget__product-title">' +
      c(t.title) +
      "</span>" +
      (d
        ? '<span class="bundle-widget__product-price">' +
          M(t.price) +
          "</span>"
        : "") +
      "</div>" +
      '<div class="bundle-widget__product-actions">' +
      '<button type="button" class="bundle-widget__add-box-btn">' +
      c(btnLabel) +
      "</button>" +
      '<div class="bundle-widget__qty-selector" style="display:none;">' +
      '<button type="button" class="bundle-widget__qty-btn bundle-widget__qty-btn--minus" aria-label="Decrease quantity">−</button>' +
      '<span class="bundle-widget__qty-val">1</span>' +
      '<button type="button" class="bundle-widget__qty-btn bundle-widget__qty-btn--plus" aria-label="Increase quantity">+</button>' +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  // Summary rendering: completely hides raw discount codes and supports total item quantities
  function D(
    selectedProducts,
    totalCount,
    totalRawPrice,
    discountTiers,
    btnText,
    badgeColor,
    addToBoxText,
  ) {
    var activeDiscount = q(discountTiers, totalCount);
    var discountCalc = $(selectedProducts, totalRawPrice, activeDiscount);
    var boxBtnLabel = addToBoxText || "Add To Box";

    if (totalCount === 0) {
      return (
        '<div class="bundle-widget__summary">' +
        '<div class="bundle-widget__summary--empty">' +
        "<p>☝️ Click <strong>" +
        c(boxBtnLabel) +
        "</strong> on products above to build your bundle.</p>" +
        "</div>" +
        '<button type="button" class="bundle-widget__atc" disabled style="opacity:0.6;cursor:not-allowed;">' +
        c(btnText || "Add Selected to Cart") +
        " (0 items)</button>" +
        "</div>"
      );
    }

    var nextTier = null;
    var sortedTiers = discountTiers
      .filter(function (p) {
        return p.isActive;
      })
      .sort(function (p, m) {
        return p.minProducts - m.minProducts;
      });

    for (var y = 0; y < sortedTiers.length; y++) {
      if (sortedTiers[y].minProducts > totalCount) {
        nextTier = sortedTiers[y];
        break;
      }
    }

    var r = '<div class="bundle-widget__summary">';

    if (activeDiscount && discountCalc.savings > 0) {
      r +=
        '<div class="bundle-widget__summary-win" style="--badge:' +
        badgeColor +
        '"><span class="bundle-widget__summary-badge">' +
        E(activeDiscount) +
        "</span><span>🎉 " +
        E(activeDiscount) +
        " applied to " +
        discountCalc.eligibleCount +
        " item" +
        (discountCalc.eligibleCount !== 1 ? "s" : "") +
        "!</span></div>";
    }

    if (nextTier) {
      var h = nextTier.minProducts - totalCount;
      r +=
        '<div class="bundle-widget__summary-nudge">Add <strong>' +
        h +
        " more</strong> item" +
        (h !== 1 ? "s" : "") +
        " to unlock <strong>" +
        E(nextTier) +
        "</strong></div>";
    }

    r += '<div class="bundle-widget__summary-prices">';
    r +=
      '<div class="bundle-widget__summary-row"><span>Selected in Box:</span><span>' +
      totalCount +
      " item" +
      (totalCount !== 1 ? "s" : "") +
      "</span></div>";

    if (activeDiscount && discountCalc.savings > 0) {
      r +=
        '<div class="bundle-widget__summary-row"><span>Original:</span><span class="bundle-widget__summary-original">$' +
        totalRawPrice.toFixed(2) +
        "</span></div>";
      r +=
        '<div class="bundle-widget__summary-row bundle-widget__summary-savings"><span>You save:</span><span>-$' +
        discountCalc.savings.toFixed(2) +
        " (" +
        E(activeDiscount) +
        " on " +
        discountCalc.eligibleCount +
        " item" +
        (discountCalc.eligibleCount !== 1 ? "s" : "") +
        ")</span></div>";
      r +=
        '<div class="bundle-widget__summary-row bundle-widget__summary-total"><span>Total:</span><span>$' +
        discountCalc.finalTotal.toFixed(2) +
        "</span></div>";
    } else {
      r +=
        '<div class="bundle-widget__summary-row bundle-widget__summary-total"><span>Total:</span><span>$' +
        totalRawPrice.toFixed(2) +
        "</span></div>";
    }
    r += "</div>";

    var finalPrice = activeDiscount ? discountCalc.finalTotal : totalRawPrice;
    var btnLabel =
      (btnText || "Add Selected to Cart") + " — $" + finalPrice.toFixed(2);
    r +=
      '<button type="button" class="bundle-widget__atc">' +
      c(btnLabel) +
      "</button>";
    r += "</div>";

    return r;
  }

  // Add to cart with exact quantities and automatic per-purchase dynamic discount generation
  function H(
    selectedProducts,
    totalCount,
    atcBtn,
    activeDiscount,
    bundleId,
    appUrl,
    shop,
    redirectTarget,
  ) {
    if (!selectedProducts || selectedProducts.length === 0) {
      alert("Please select at least one product to add to cart.");
      return;
    }

    var items = [];
    selectedProducts.forEach(function (prod) {
      var rawId = prod.variantId || "";
      var cleanId = rawId
        .replace(/^gid:\/\/shopify\/ProductVariant\//, "")
        .replace(/.*\//, "");
      if (cleanId && prod.qty > 0) {
        items.push({
          id: parseInt(cleanId, 10),
          quantity: prod.qty,
        });
      }
    });

    if (items.length === 0) {
      alert(
        "Could not find product variant IDs. Please make sure products are configured in Shopify.",
      );
      return;
    }

    var origText = atcBtn.textContent;
    atcBtn.textContent = "Adding to cart...";
    atcBtn.disabled = true;

    // 1. First empty the cart completely, then add the selected bundle items
    var cartPromise = fetch("/cart/clear.js", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
    })
      .then(function (res) {
        if (!res.ok) {
          console.warn("[Bundle Widget] Cart clear returned status " + res.status);
        }
        return fetch("/cart/add.js", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ items: items }),
        });
      })
      .then(function (res) {
        if (!res.ok) {
          return res.json().then(function (err) {
            throw new Error(
              err.description || err.message || "Cart add failed with status " + res.status,
            );
          });
        }
        return res.json();
      });

    // 2. Auto-generate a unique one-time discount code for THIS purchase
    var discountPromise = Promise.resolve(null);
    if (activeDiscount && appUrl && shop && bundleId) {
      discountPromise = fetch(appUrl + "/api/bundles/generate-discount", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          shop: shop,
          bundleId: bundleId,
          itemCount: totalCount,
          items: selectedProducts.map(function (prod) {
            return {
              variantId: prod.variantId || "",
              productId: prod.productId || "",
              price: parseFloat(prod.price || 0),
              qty: prod.qty || 1,
            };
          }),
        }),
      })
        .then(function (res) {
          if (!res.ok) return null;
          return res.json();
        })
        .catch(function (err) {
          console.warn("[Bundle Widget] Auto-discount generation failed:", err);
          return null;
        });
    }

    Promise.all([cartPromise, discountPromise])
      .then(function (results) {
        var discountResult = results[1];
        var code =
          discountResult && discountResult.discountCode
            ? discountResult.discountCode
            : activeDiscount && activeDiscount.discountCode
              ? activeDiscount.discountCode
              : "";

        var bundlePIds = selectedProducts
          .map(function (prod) {
            var rawId = prod.productId || "";
            return rawId.replace(/^gid:\/\/shopify\/Product\//, "");
          })
          .filter(Boolean);

        return fetch("/cart/update.js", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            discount: code || "",
            attributes: {
              _bundle_discount_code: code || "",
              _bundle_min_qty: String(
                activeDiscount ? activeDiscount.minProducts : 2,
              ),
              _bundle_product_ids: bundlePIds.join(","),
            },
          }),
        })
          .then(function () {
            return code;
          })
          .catch(function () {
            return code;
          });
      })
      .then(function (code) {
        atcBtn.textContent = "✓ Added!";

        try {
          document.dispatchEvent(
            new CustomEvent("cart:updated", { bubbles: true }),
          );
          document.dispatchEvent(
            new CustomEvent("cart:refresh", { bubbles: true }),
          );
        } catch (ign) {}

        var targetDestination = redirectTarget === "cart" ? "/cart" : "/checkout";
        var finalUrl = code
          ? "/discount/" + encodeURIComponent(code) + "?redirect=" + targetDestination
          : targetDestination;

        setTimeout(function () {
          window.location.href = finalUrl;
        }, 300);
      })
      .catch(function (err) {
        console.error("[Bundle Widget] Add to cart error:", err);
        atcBtn.textContent = origText;
        atcBtn.disabled = false;
        alert("Could not add items to cart: " + (err.message || "Please try again."));
      });
  }

  function I(t) {
    var e = (t.dataset.appUrl || "").replace(/\/$/, "");
    var d = t.dataset.shop;
    var s = parseInt(t.dataset.cols, 10) || 3;
    var i = t.dataset.showHeading !== "false";
    var n = t.dataset.heading || "Bundle Deals";
    var u = t.dataset.subheading || "";
    var l = t.dataset.accentColor || "#1a1a1a";
    var w = t.dataset.badgeColor || "#e63946";
    var y = t.dataset.showPrice !== "false";
    var r = t.dataset.buttonText || "Add Selected to Cart";
    var redirectTarget = t.dataset.redirect || "checkout";
    var addToBoxText = t.dataset.addToBoxText || "Add To Box";
    var h = g(".bundle-widget__loader", t);
    var p = g(".bundle-widget__error", t);
    var m = g(".bundle-widget__content", t);

    if (!e || !d) {
      if (h) h.style.display = "none";
      if (p) {
        p.style.display = "block";
        p.innerHTML =
          "<p>⚠️ <strong>Setup required:</strong> Set the App URL in your Shopify admin (Bundle Discount app → App URL).</p>";
      }
      return;
    }

    var N = e + "/api/bundles?shop=" + encodeURIComponent(d);

    fetch(N)
      .then(function (f) {
        if (!f.ok) throw new Error("API " + f.status);
        return f.json();
      })
      .then(function (f) {
        if (h) h.style.display = "none";

        var L = (f.bundles || []).filter(function (a) {
          return a.products && a.products.length >= 2;
        });

        if (L.length === 0) {
          if (m) {
            m.innerHTML =
              '<div class="bundle-widget__empty"><p>No active bundles available at this time.</p></div>';
            m.style.display = "block";
          }
          return;
        }

        var P = "";
        if (i) {
          P +=
            '<div class="bundle-widget__header"><h2 class="bundle-widget__heading">' +
            c(n) +
            "</h2>" +
            (u ? '<p class="bundle-widget__subheading">' + c(u) + "</p>" : "") +
            "</div>";
        }

        L.forEach(function (a) {
          var S = (a.discounts || [])
            .filter(function (_) {
              return _.isActive;
            })
            .sort(function (_, k) {
              return _.minProducts - k.minProducts;
            });

          P +=
            '<div class="bundle-widget__bundle" data-bundle-id="' +
            a.id +
            '"><div class="bundle-widget__bundle-header"><h3>' +
            c(a.title) +
            "</h3>" +
            (a.description ? "<p>" + c(a.description) + "</p>" : "") +
            "</div>" +
            j(S, l, w) +
            '<div class="bundle-widget__products" style="--cols:' +
            s +
            '">' +
            a.products
              .map(function (_) {
                return B(_, s, y, l, addToBoxText);
              })
              .join("") +
            '</div><div class="bundle-widget__summary-wrap"></div></div>';
        });

        if (m) {
          m.innerHTML = P;
          m.style.display = "block";
        }

        var R = m ? m.querySelectorAll(".bundle-widget__bundle") : [];

        R.forEach(function (bundleEl) {
          var bundleId = bundleEl.dataset.bundleId;
          var bundleData = L.find(function (o) {
            return o.id === bundleId;
          });
          if (!bundleData) return;

          var discountTiers = (bundleData.discounts || []).filter(function (o) {
            return o.isActive;
          });

          var summaryWrap = g(".bundle-widget__summary-wrap", bundleEl);
          var tierElements = bundleEl.querySelectorAll(".bundle-widget__tier");
          var productCards = bundleEl.querySelectorAll(".bundle-widget__product");

          function updateSelection() {
            var selectedProducts = [];
            var totalCount = 0;
            var totalRawPrice = 0;

            productCards.forEach(function (card) {
              var qVal = parseInt(card.dataset.qty, 10) || 0;
              if (qVal > 0) {
                var price = parseFloat(card.dataset.price || 0);
                selectedProducts.push({
                  card: card,
                  qty: qVal,
                  price: price,
                  variantId: card.dataset.variantId || "",
                  productId: card.dataset.productId || "",
                });
                totalCount += qVal;
                totalRawPrice += price * qVal;
                card.classList.add("bundle-widget__product--selected");
              } else {
                card.classList.remove("bundle-widget__product--selected");
              }
            });

            var activeDiscount = q(discountTiers, totalCount);

            tierElements.forEach(function (tierEl) {
              var tierMin = parseInt(tierEl.dataset.min, 10);
              if (activeDiscount && tierMin === activeDiscount.minProducts) {
                tierEl.classList.add("bundle-widget__tier--active");
              } else {
                tierEl.classList.remove("bundle-widget__tier--active");
              }
            });

            if (summaryWrap) {
              summaryWrap.innerHTML = D(
                selectedProducts,
                totalCount,
                totalRawPrice,
                discountTiers,
                r,
                w,
                addToBoxText,
              );

              var atcBtn = g(".bundle-widget__atc", summaryWrap);
              if (atcBtn && !atcBtn.disabled) {
                atcBtn.addEventListener("click", function (evt) {
                  evt.stopPropagation();
                  H(
                    selectedProducts,
                    totalCount,
                    atcBtn,
                    activeDiscount,
                    bundleId,
                    e,
                    d,
                    redirectTarget,
                  );
                });
              }
            }
          }

          // Wire up "Add To Box", plus, and minus buttons on each product card
          productCards.forEach(function (card) {
            var addBtn = g(".bundle-widget__add-box-btn", card);
            var qtySelector = g(".bundle-widget__qty-selector", card);
            var minusBtn = g(".bundle-widget__qty-btn--minus", card);
            var plusBtn = g(".bundle-widget__qty-btn--plus", card);
            var qtyVal = g(".bundle-widget__qty-val", card);

            function setQuantity(newQty) {
              var qVal = Math.max(0, parseInt(newQty, 10) || 0);
              card.dataset.qty = String(qVal);

              if (qVal === 0) {
                if (addBtn) addBtn.style.display = "";
                if (qtySelector) qtySelector.style.display = "none";
                card.classList.remove("bundle-widget__product--selected");
              } else {
                if (addBtn) addBtn.style.display = "none";
                if (qtySelector) qtySelector.style.display = "inline-flex";
                if (qtyVal) qtyVal.textContent = String(qVal);
                card.classList.add("bundle-widget__product--selected");
              }
              updateSelection();
            }

            // Click "Add To Box" -> set qty to 1
            if (addBtn) {
              addBtn.addEventListener("click", function (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                setQuantity(1);
              });
            }

            // Click Plus [+] -> increase qty
            if (plusBtn) {
              plusBtn.addEventListener("click", function (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                var current = parseInt(card.dataset.qty, 10) || 0;
                setQuantity(current + 1);
              });
            }

            // Click Minus [-] -> decrease qty (if 1 -> becomes 0 -> shows Add To Box again)
            if (minusBtn) {
              minusBtn.addEventListener("click", function (evt) {
                evt.preventDefault();
                evt.stopPropagation();
                var current = parseInt(card.dataset.qty, 10) || 0;
                setQuantity(current - 1);
              });
            }
          });

          // Wire up clicking on tier badges to auto-fill the box to that minimum number
          tierElements.forEach(function (tierEl) {
            tierEl.style.cursor = "pointer";
            tierEl.addEventListener("click", function (evt) {
              evt.stopPropagation();
              var minCount = parseInt(tierEl.dataset.min, 10) || 2;
              productCards.forEach(function (c, idx) {
                var addBtn = g(".bundle-widget__add-box-btn", c);
                var qtySelector = g(".bundle-widget__qty-selector", c);
                var qtyVal = g(".bundle-widget__qty-val", c);
                var qVal = idx < minCount ? 1 : 0;
                c.dataset.qty = String(qVal);

                if (qVal > 0) {
                  if (addBtn) addBtn.style.display = "none";
                  if (qtySelector) qtySelector.style.display = "inline-flex";
                  if (qtyVal) qtyVal.textContent = String(qVal);
                  c.classList.add("bundle-widget__product--selected");
                } else {
                  if (addBtn) addBtn.style.display = "";
                  if (qtySelector) qtySelector.style.display = "none";
                  c.classList.remove("bundle-widget__product--selected");
                }
              });
              updateSelection();
            });
          });

          // Initial render: cards start with "Add To Box" button (qty = 0)
          updateSelection();
        });
      })
      .catch(function (f) {
        console.error("[Bundle Widget] Error:", f);
        if (h) h.style.display = "none";
        if (p) p.style.display = "block";
      });
  }

  // ─── Cart Page Watcher ──────────────────────────────────────────────────────
  // On the /cart page: if a customer reduces quantity below the minimum required,
  // the bundle discount code is immediately removed and the full price is restored.
  function initCartDiscountWatcher() {
    // Only monitor on the cart page (/cart)
    if (window.location.pathname.indexOf("/cart") === -1) {
      return;
    }

    var isChecking = false;

    function validateCart() {
      if (isChecking) return;
      isChecking = true;

      fetch("/cart.js")
        .then(function (res) {
          if (!res.ok) throw new Error("Cart fetch failed");
          return res.json();
        })
        .then(function (cart) {
          if (!cart) return;

          // Check if a bundle discount code is applied
          var hasBundleDiscount = false;
          var appliedCode = "";

          if (
            cart.cart_level_discount_applications &&
            cart.cart_level_discount_applications.length > 0
          ) {
            cart.cart_level_discount_applications.forEach(function (d) {
              if (
                d.title &&
                (d.title.indexOf("BNDL-") === 0 ||
                  d.title.indexOf("BUNDLE-") === 0)
              ) {
                hasBundleDiscount = true;
                appliedCode = d.title;
              }
            });
          }

          if (!hasBundleDiscount && cart.items && cart.items.length > 0) {
            cart.items.forEach(function (item) {
              if (item.discounts && item.discounts.length > 0) {
                item.discounts.forEach(function (d) {
                  if (
                    d.title &&
                    (d.title.indexOf("BNDL-") === 0 ||
                      d.title.indexOf("BUNDLE-") === 0)
                  ) {
                    hasBundleDiscount = true;
                    appliedCode = d.title;
                  }
                });
              }
            });
          }

          var minQty =
            parseInt(cart.attributes && cart.attributes._bundle_min_qty, 10) ||
            0;
          var productIdsStr =
            (cart.attributes && cart.attributes._bundle_product_ids) || "";
          var bundleProductIds = productIdsStr
            ? productIdsStr.split(",").filter(Boolean)
            : [];

          // If a BNDL- code is applied, default minimum requirement is at least 2 items
          if (hasBundleDiscount && minQty <= 0) {
            minQty = 2;
          }

          if (!hasBundleDiscount || minQty <= 0) {
            return;
          }

          // Count matching bundle items currently in cart
          var eligibleCount = 0;
          if (cart.items && cart.items.length > 0) {
            cart.items.forEach(function (item) {
              var pId = String(item.product_id);
              if (
                bundleProductIds.length === 0 ||
                bundleProductIds.indexOf(pId) !== -1
              ) {
                eligibleCount += parseInt(item.quantity, 10) || 0;
              }
            });
          }

          // If the customer reduced quantity below the minimum required tier:
          if (eligibleCount < minQty) {
            console.warn(
              "[Bundle App] Cart quantity (" +
                eligibleCount +
                ") is below minimum requirement (" +
                minQty +
                "). Removing discount " +
                appliedCode,
            );

            return fetch("/cart/update.js", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
              },
              body: JSON.stringify({
                discount: "",
                attributes: {
                  _bundle_discount_code: "",
                  _bundle_min_qty: "",
                  _bundle_product_ids: "",
                },
              }),
            }).then(function () {
              try {
                document.dispatchEvent(
                  new CustomEvent("cart:updated", { bubbles: true }),
                );
                document.dispatchEvent(
                  new CustomEvent("cart:refresh", { bubbles: true }),
                );
              } catch (ign) {}

              // If on the /cart page, reload so the removed discount and full price appear immediately
              if (window.location.pathname.indexOf("/cart") !== -1) {
                window.location.reload();
              }
            });
          }
        })
        .catch(function () {})
        .finally(function () {
          setTimeout(function () {
            isChecking = false;
          }, 300);
        });
    }

    // 1. Check on initial page load (e.g. when visiting /cart directly)
    validateCart();

    // 2. Listen to standard theme cart events
    document.addEventListener("cart:updated", function () {
      setTimeout(validateCart, 150);
    });
    document.addEventListener("cart:refresh", function () {
      setTimeout(validateCart, 150);
    });

    // 3. Listen to clicks on plus/minus/remove buttons inside the cart
    document.addEventListener("click", function (evt) {
      var target = evt.target;
      if (
        target &&
        (target.matches(
          ".cart__quantity-button, .quantity__button, [name='plus'], [name='minus'], .cart-item__remove, .cart-remove-button, .cart__remove",
        ) ||
          target.closest(
            ".cart__quantity-button, .quantity__button, [name='plus'], [name='minus'], .cart-item__remove, .cart-remove-button, .cart__remove",
          ))
      ) {
        setTimeout(validateCart, 450);
      }
    });

    // 4. Listen to change on cart quantity inputs
    document.addEventListener("change", function (evt) {
      var target = evt.target;
      if (
        target &&
        (target.matches(
          "input[name*='updates'], .quantity__input, .cart__quantity-input",
        ) ||
          target.closest("form[action*='/cart']"))
      ) {
        setTimeout(validateCart, 450);
      }
    });
  }

  function initBundleWidgets() {
    var widgets = document.querySelectorAll(".bundle-widget");
    widgets.forEach(function (widget) {
      I(widget);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      initBundleWidgets();
      initCartDiscountWatcher();
    });
  } else {
    initBundleWidgets();
    initCartDiscountWatcher();
  }

  document.addEventListener("shopify:section:load", function (t) {
    var widget = t.target.querySelector(".bundle-widget");
    if (widget) I(widget);
  });
})();
