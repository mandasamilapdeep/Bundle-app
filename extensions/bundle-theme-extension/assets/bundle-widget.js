"use strict";
(function () {
  "use strict";

  /**
   * Ensures jQuery is loaded and available before running widget code.
   * If jQuery is not found on the storefront theme, it automatically loads it from CDN.
   */
  function runWithJQuery(callback) {
    if (window.jQuery) {
      callback(window.jQuery);
      return;
    }

    var existingScript = document.querySelector('script[src*="jquery"]');
    if (existingScript) {
      var checkInterval = setInterval(function () {
        if (window.jQuery) {
          clearInterval(checkInterval);
          callback(window.jQuery);
        }
      }, 50);
      return;
    }

    var script = document.createElement("script");
    script.src = "https://code.jquery.com/jquery-3.7.1.min.js";
    script.type = "text/javascript";
    script.onload = function () {
      callback(window.jQuery);
    };
    document.head.appendChild(script);
  }

  runWithJQuery(function ($) {
    // ─── Utility Helpers ─────────────────────────────────────────────────────────

    /**
     * Formats a numeric price into a currency string (e.g. 10 -> "$10.00").
     */
    function formatPrice(amount) {
      var numericAmount = parseFloat(amount);
      return isNaN(numericAmount) ? amount : "$" + numericAmount.toFixed(2);
    }

    /**
     * Escapes unsafe HTML characters to prevent XSS injection.
     */
    function escapeHtml(string) {
      return $("<div>").text(string || "").html();
    }

    /**
     * Finds the highest applicable discount tier based on the total quantity of items selected.
     */
    function getActiveDiscountTier(discountTiers, itemCount) {
      var bestTier = null;
      var now = Date.now();
      for (var index = 0; index < discountTiers.length; index++) {
        var tier = discountTiers[index];
        if (tier.endsAt && new Date(tier.endsAt).getTime() <= now) {
          continue;
        }
        if (
          tier.isActive &&
          itemCount >= tier.minProducts &&
          (!bestTier || tier.minProducts > bestTier.minProducts)
        ) {
          bestTier = tier;
        }
      }
      return bestTier;
    }

    /**
     * Calculates total savings and the final price based on selected items and discount tier.
     * Discounts are applied strictly up to the tier's required quantity (highest-priced items first).
     */
    function calculateSavings(selectedProducts, totalRawPrice, activeDiscount) {
      if (!activeDiscount || !selectedProducts || selectedProducts.length === 0) {
        return { savings: 0, finalTotal: totalRawPrice, eligibleCount: 0 };
      }

      var unitPrices = [];
      $.each(selectedProducts, function (_, product) {
        var price = parseFloat(product.price || 0);
        var quantity = parseInt(product.qty || 1, 10);
        for (var count = 0; count < quantity; count++) {
          unitPrices.push(price);
        }
      });

      // Sort descending so the customer gets discount on their highest-priced items
      unitPrices.sort(function (priceA, priceB) {
        return priceB - priceA;
      });

      var eligibleCount = Math.min(activeDiscount.minProducts, unitPrices.length);
      var discountedSubtotal = 0;
      for (var index = 0; index < eligibleCount; index++) {
        discountedSubtotal += unitPrices[index];
      }

      var savings = 0;
      if (activeDiscount.discountType === "percentage") {
        savings =
          discountedSubtotal * (parseFloat(activeDiscount.discountValue) / 100);
      } else {
        savings = Math.min(
          parseFloat(activeDiscount.discountValue),
          discountedSubtotal
        );
      }

      savings = Math.round(savings * 100) / 100;
      var finalTotal = Math.max(
        0,
        Math.round((totalRawPrice - savings) * 100) / 100
      );

      return {
        savings: savings,
        finalTotal: finalTotal,
        eligibleCount: eligibleCount,
      };
    }

    /**
     * Formats discount text for badges and cards (e.g. "15% OFF" or "$5.00 OFF").
     */
    function formatDiscountBadge(discountTier) {
      return discountTier.discountType === "percentage"
        ? discountTier.discountValue + "% OFF"
        : "$" + parseFloat(discountTier.discountValue).toFixed(2) + " OFF";
    }

    /**
     * Formats short discount label for milestone nodes and orange tags (e.g. "15%" or "$5").
     */
    function formatShortTierTag(discountTier) {
      return discountTier.discountType === "percentage"
        ? discountTier.discountValue + "%"
        : "$" + parseFloat(discountTier.discountValue).toFixed(0);
    }

    /**
     * Generates celebratory or encouraging progress message.
     */
    function getProgressMessage(totalCount, sortedTiers, activeDiscount) {
      if (!sortedTiers || sortedTiers.length === 0) return "";
      var firstTier = sortedTiers[0];

      if (totalCount === 0) {
        return (
          "Add " +
          firstTier.minProducts +
          " items to unlock " +
          formatDiscountBadge(firstTier)
        );
      }

      if (totalCount < firstTier.minProducts) {
        var neededFirst = firstTier.minProducts - totalCount;
        return (
          "Add " +
          neededFirst +
          " more for " +
          formatDiscountBadge(firstTier)
        );
      }

      var nextTier = null;
      for (var i = 0; i < sortedTiers.length; i++) {
        if (sortedTiers[i].minProducts > totalCount) {
          nextTier = sortedTiers[i];
          break;
        }
      }

      if (activeDiscount && nextTier) {
        var neededNext = nextTier.minProducts - totalCount;
        return (
          "🎉 " +
          formatDiscountBadge(activeDiscount) +
          " unlocked. Add " +
          neededNext +
          " more for " +
          formatDiscountBadge(nextTier)
        );
      }

      if (activeDiscount && !nextTier) {
        return "🎉 " + formatDiscountBadge(activeDiscount) + " unlocked! Maximum savings reached!";
      }

      return "";
    }

    /**
     * Renders top Tier Cards selector.
     */
    function renderTierCards(activeDiscounts) {
      if (!activeDiscounts || activeDiscounts.length === 0) return "";
      var subtitles = ["Starter box", "Best value", "Max savings", "Super saver"];
      var html = '<div class="bundle-widget__tier-cards">';

      $.each(activeDiscounts, function (index, tier) {
        var sub = subtitles[Math.min(index, subtitles.length - 1)];
        if (activeDiscounts.length === 1) sub = "Best value";
        html +=
          '<div class="bundle-widget__tier-card" data-min="' +
          tier.minProducts +
          '">' +
          '<div class="bundle-widget__tier-card-left">' +
          '<span class="bundle-widget__tier-card-title">Pick any ' +
          tier.minProducts +
          ' +</span>' +
          '<span class="bundle-widget__tier-card-subtitle">' +
          escapeHtml(sub) +
          "</span>" +
          "</div>" +
          '<span class="bundle-widget__tier-card-badge">' +
          formatDiscountBadge(tier) +
          "</span>" +
          "</div>";
      });

      html += "</div>";
      return html;
    }

    /**
     * Renders progress bar and milestone circles.
     */
    function renderProgressSection(activeDiscounts, totalCount) {
      if (!activeDiscounts || activeDiscounts.length === 0) return "";
      var maxTierCount =
        Math.max.apply(
          null,
          $.map(activeDiscounts, function (t) {
            return t.minProducts;
          })
        ) || 5;

      var fillPercent = Math.min(
        100,
        Math.round((totalCount / maxTierCount) * 100)
      );
      var activeDiscount = getActiveDiscountTier(activeDiscounts, totalCount);
      var message = getProgressMessage(totalCount, activeDiscounts, activeDiscount);

      var html = '<div class="bundle-widget__progress-section">';
      html +=
        '<div class="bundle-widget__progress-message">' +
        escapeHtml(message) +
        "</div>";
      html += '<div class="bundle-widget__progress-bar-wrap">';
      html +=
        '<div class="bundle-widget__progress-track" style="height:6px;background:#e2e8f0;border-radius:6px;width:100%;position:relative;overflow:visible;box-sizing:border-box;">';
      html +=
        '<div class="bundle-widget__progress-fill" style="position:absolute;top:0;left:0;height:100%;min-height:6px;background:#0b1329;background-color:#0b1329;border-radius:6px;width:' +
        fillPercent +
        '%;transition:width 0.3s cubic-bezier(0.4, 0, 0.2, 1);z-index:1;display:block;"></div>';
      html += "</div>";
      html += '<div class="bundle-widget__progress-milestones">';

      $.each(activeDiscounts, function (_, tier) {
        var posPercent = Math.min(
          100,
          Math.round((tier.minProducts / maxTierCount) * 100)
        );
        var isReached = totalCount >= tier.minProducts;
        html +=
          '<div class="bundle-widget__milestone' +
          (isReached ? " bundle-widget__milestone--reached" : "") +
          '" style="left: ' +
          posPercent +
          '%;" data-min="' +
          tier.minProducts +
          '">' +
          '<div class="bundle-widget__milestone-circle">' +
          tier.minProducts +
          "</div>" +
          '<span class="bundle-widget__milestone-label">' +
          formatShortTierTag(tier) +
          "</span>" +
          "</div>";
      });

      html += "</div></div></div>";
      return html;
    }

    /**
     * Renders a single product card HTML with clean image media, floating badge, and actions.
     */
    function renderProductCard(product, index, columns, showPrice, addToBoxText) {
      var buttonLabel = addToBoxText || "Add To Box";
      var mediaHtml = product.imageUrl
        ? '<img class="bundle-widget__product-img" src="' +
          product.imageUrl +
          '" alt="' +
          escapeHtml(product.title) +
          '" loading="lazy">'
        : '<div class="bundle-widget__product-img bundle-widget__product-img--placeholder"></div>';

      return (
        '<div class="bundle-widget__product" data-product-id="' +
        product.productId +
        '" data-variant-id="' +
        (product.variantId || "") +
        '" data-price="' +
        (product.price || "0") +
        '" data-title="' +
        escapeHtml(product.title) +
        '" data-image="' +
        (product.imageUrl || "") +
        '" data-qty="0">' +
        '<div class="bundle-widget__product-media">' +
        '<span class="bundle-widget__in-box-badge" style="display: none;">1 in box</span>' +
        mediaHtml +
        "</div>" +
        '<div class="bundle-widget__product-info">' +
        '<span class="bundle-widget__product-title">' +
        escapeHtml(product.title) +
        "</span>" +
        (showPrice
          ? '<span class="bundle-widget__product-price">' +
            formatPrice(product.price) +
            "</span>"
          : "") +
        '<div class="bundle-widget__product-actions">' +
        '<button type="button" class="bundle-widget__add-box-btn">' +
        escapeHtml(buttonLabel) +
        "</button>" +
        '<div class="bundle-widget__qty-selector" style="display:none;">' +
        '<button type="button" class="bundle-widget__qty-btn bundle-widget__qty-btn--minus" aria-label="Decrease quantity">−</button>' +
        '<span class="bundle-widget__qty-val">1</span>' +
        '<button type="button" class="bundle-widget__qty-btn bundle-widget__qty-btn--plus" aria-label="Increase quantity">+</button>' +
        "</div>" +
        "</div>" +
        "</div>" +
        "</div>"
      );
    }

    /**
     * Renders bottom "Your box" section with slots tray, milestone tags, pricing breakdown, and CTA.
     */
    function renderBundleSummary(
      selectedProducts,
      totalCount,
      totalRawPrice,
      discountTiers,
      buttonText
    ) {
      var activeDiscount = getActiveDiscountTier(discountTiers, totalCount);
      var discountCalc = calculateSavings(
        selectedProducts,
        totalRawPrice,
        activeDiscount
      );

      var maxTierCount = 5;
      if (discountTiers && discountTiers.length > 0) {
        maxTierCount =
          Math.max.apply(
            null,
            $.map(discountTiers, function (t) {
              return t.minProducts;
            })
          ) || 5;
      }
      var totalSlotsCount = Math.max(maxTierCount, totalCount, 3);

      // Flatten selected products into individual unit items
      var unitItems = [];
      $.each(selectedProducts, function (_, p) {
        for (var q = 0; q < p.qty; q++) {
          unitItems.push(p);
        }
      });

      // Map tiers by minProducts for orange tags below milestone slots
      var tierByMin = {};
      if (discountTiers && discountTiers.length > 0) {
        $.each(discountTiers, function (_, t) {
          tierByMin[t.minProducts] = t;
        });
      }

      // Build Slots Tray HTML
      var slotsHtml =
        '<div class="bundle-widget__slots-tray" style="display:flex;gap:10px;align-items:flex-start;margin-bottom:20px;flex-wrap:wrap;">';
      for (var slotIdx = 1; slotIdx <= totalSlotsCount; slotIdx++) {
        var hasItem = slotIdx <= unitItems.length;
        var item = hasItem ? unitItems[slotIdx - 1] : null;
        var tierAtSlot = tierByMin[slotIdx];

        slotsHtml +=
          '<div class="bundle-widget__slot-col" style="display:flex;flex-direction:column;align-items:center;gap:6px;min-width:52px;">';
        if (hasItem) {
          slotsHtml +=
            '<div class="bundle-widget__slot bundle-widget__slot--filled" style="width:52px;height:52px;min-width:52px;min-height:52px;border:2px solid #0b1329;border-radius:12px;background:#ffffff;padding:4px;display:flex;align-items:center;justify-content:center;position:relative;box-sizing:border-box;flex-shrink:0;">' +
            '<button type="button" class="bundle-widget__slot-remove" data-product-id="' +
            item.productId +
            '" aria-label="Remove item" style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#0b1329;color:#ffffff;border:none;font-size:11px;font-weight:800;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;padding:0;z-index:3;">×</button>' +
            (item.imageUrl
              ? '<img class="bundle-widget__slot-img" src="' +
                item.imageUrl +
                '" alt="' +
                escapeHtml(item.title) +
                '" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:8px;display:block;">'
              : '<div class="bundle-widget__slot-img" style="background:#e2e8f0;width:100%;height:100%;border-radius:6px;"></div>') +
            "</div>";
        } else {
          slotsHtml +=
            '<div class="bundle-widget__slot bundle-widget__slot--empty" style="width:52px;height:52px;min-width:52px;min-height:52px;border:1.5px dashed #cbd5e1;border-radius:12px;background:#f8fafc;display:flex;align-items:center;justify-content:center;position:relative;box-sizing:border-box;flex-shrink:0;">' +
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.7;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>' +
            "</div>";
        }

        if (tierAtSlot) {
          slotsHtml +=
            '<span class="bundle-widget__slot-tier-tag" style="background:#ea580c;color:#ffffff;font-size:11px;font-weight:700;padding:2px 7px;border-radius:6px;letter-spacing:0.02em;text-align:center;white-space:nowrap;display:inline-block;">' +
            formatShortTierTag(tierAtSlot) +
            "</span>";
        }

        slotsHtml += "</div>";
      }
      slotsHtml += "</div>";

      // Build Pricing HTML
      var pricingHtml = '<div class="bundle-widget__pricing">';
      pricingHtml += '<span class="bundle-widget__total-label">Total</span>';

      var finalPrice =
        totalCount > 0
          ? activeDiscount
            ? discountCalc.finalTotal
            : totalRawPrice
          : 0;

      pricingHtml += '<div class="bundle-widget__total-row">';
      pricingHtml +=
        '<span class="bundle-widget__final-price">' +
        formatPrice(finalPrice) +
        "</span>";
      if (activeDiscount && discountCalc.savings > 0) {
        pricingHtml +=
          '<span class="bundle-widget__original-price">' +
          formatPrice(totalRawPrice) +
          "</span>";
      }
      pricingHtml += "</div>";

      if (activeDiscount && discountCalc.savings > 0) {
        var discountText =
          activeDiscount.discountType === "percentage"
            ? activeDiscount.discountValue + "% off"
            : "$" + parseFloat(activeDiscount.discountValue).toFixed(2) + " off";
        pricingHtml +=
          '<span class="bundle-widget__savings-label">You save ' +
          formatPrice(discountCalc.savings) +
          " (" +
          discountText +
          ")</span>";
      }
      pricingHtml += "</div>";

      // Minimum products required for the first discount tier
      var minRequiredCount = 1;
      if (discountTiers && discountTiers.length > 0) {
        var sortedMins = $.map(discountTiers, function (t) {
          return t.minProducts;
        }).sort(function (a, b) {
          return a - b;
        });
        minRequiredCount = sortedMins[0] || 1;
      }

      // CTA Button
      var countSuffix =
        " (" + totalCount + " item" + (totalCount !== 1 ? "s" : "") + ")";
      var ctaText =
        escapeHtml(buttonText || "Add Selected to Cart") + countSuffix;
      var isCtaDisabled = totalCount < minRequiredCount;

      var html = '<div class="bundle-widget__summary">';
      html += '<div class="bundle-widget__summary-left">';
      html +=
        '<h4 class="bundle-widget__box-header">Your box <span class="bundle-widget__box-count">' +
        countSuffix.trim() +
        "</span></h4>";
      html += slotsHtml;
      html += pricingHtml;
      html += "</div>";
      html += '<div class="bundle-widget__summary-right">';
      html +=
        '<button type="button" class="bundle-widget__atc"' +
        (isCtaDisabled ? ' disabled style="opacity:0.5;cursor:not-allowed;"' : "") +
        ">" +
        ctaText +
        "</button>";
      html += "</div>";
      html += "</div>";

      return html;
    }

    /**
     * Handles adding selected bundle items to cart:
     * 1. Empties any existing items in cart via POST /cart/clear.js.
     * 2. Adds the selected bundle items with their respective quantities via POST /cart/add.js.
     * 3. Generates a scoped bundle discount code via the backend API.
     * 4. Updates cart attributes and applies discount via POST /cart/update.js.
     * 5. Redirects the customer to /cart or /checkout.
     */
    function handleAddToCart(
      selectedProducts,
      totalCount,
      $atcButton,
      activeDiscount,
      bundleId,
      appUrl,
      shopDomain,
      redirectTarget
    ) {
      if (!selectedProducts || selectedProducts.length === 0) {
        alert("Please select at least one product to add to cart.");
        return;
      }

      var itemsToAdd = [];
      $.each(selectedProducts, function (_, product) {
        var rawId = product.variantId || "";
        var cleanId = rawId
          .replace(/^gid:\/\/shopify\/ProductVariant\//, "")
          .replace(/.*\//, "");
        if (cleanId && product.qty > 0) {
          itemsToAdd.push({
            id: parseInt(cleanId, 10),
            quantity: product.qty,
          });
        }
      });

      if (itemsToAdd.length === 0) {
        alert(
          "Could not find product variant IDs. Please make sure products are configured in Shopify."
        );
        return;
      }

      var originalButtonText = $atcButton.text();
      $atcButton.text("Adding to cart...").prop("disabled", true);

      // 1. First empty the cart completely, then add selected bundle items
      var cartPromise = $.ajax({
        url: "/cart/clear.js",
        type: "POST",
        dataType: "json",
      }).then(function () {
        return $.ajax({
          url: "/cart/add.js",
          type: "POST",
          contentType: "application/json",
          data: JSON.stringify({ items: itemsToAdd }),
          dataType: "json",
        });
      });

      // 2. Auto-generate discount code via backend API
      var discountPromise = $.Deferred();
      if (activeDiscount && appUrl && shopDomain && bundleId) {
        var payloadItems = $.map(selectedProducts, function (product) {
          return {
            variantId: product.variantId || "",
            productId: product.productId || "",
            price: parseFloat(product.price || 0),
            qty: product.qty || 1,
          };
        });

        $.ajax({
          url: appUrl + "/api/bundles/generate-discount",
          type: "POST",
          contentType: "application/json",
          data: JSON.stringify({
            shop: shopDomain,
            bundleId: bundleId,
            itemCount: totalCount,
            items: payloadItems,
          }),
          dataType: "json",
        })
          .done(function (response) {
            discountPromise.resolve(response);
          })
          .fail(function (xhr, status, error) {
            console.warn("[Bundle Widget] Auto-discount generation failed:", error);
            discountPromise.resolve(null);
          });
      } else {
        discountPromise.resolve(null);
      }

      $.when(cartPromise, discountPromise)
        .then(function (cartResult, discountResult) {
          var discountCode =
            discountResult && discountResult.discountCode
              ? discountResult.discountCode
              : activeDiscount && activeDiscount.discountCode
              ? activeDiscount.discountCode
              : "";

          var bundleProductIds = $.map(selectedProducts, function (product) {
            var rawId = product.productId || "";
            return rawId.replace(/^gid:\/\/shopify\/Product\//, "");
          }).filter(Boolean);

          return $.ajax({
            url: "/cart/update.js",
            type: "POST",
            contentType: "application/json",
            data: JSON.stringify({
              discount: discountCode || "",
              attributes: {
                _bundle_discount_code: discountCode || "",
                _bundle_min_qty: String(
                  activeDiscount ? activeDiscount.minProducts : 2
                ),
                _bundle_product_ids: bundleProductIds.join(","),
              },
            }),
            dataType: "json",
          })
            .then(function () {
              return discountCode;
            })
            .catch(function () {
              return discountCode;
            });
        })
        .then(function (discountCode) {
          $atcButton.text("✓ Added!");

          // Trigger both jQuery and native theme events
          $(document).trigger("cart:updated");
          $(document).trigger("cart:refresh");
          try {
            document.dispatchEvent(
              new CustomEvent("cart:updated", { bubbles: true })
            );
            document.dispatchEvent(
              new CustomEvent("cart:refresh", { bubbles: true })
            );
          } catch (ignored) {}

          var targetDestination =
            redirectTarget === "cart" ? "/cart" : "/checkout";
          var finalUrl = discountCode
            ? "/discount/" +
              encodeURIComponent(discountCode) +
              "?redirect=" +
              targetDestination
            : targetDestination;

          setTimeout(function () {
            window.location.href = finalUrl;
          }, 300);
        })
        .fail(function (xhr, status, error) {
          console.error("[Bundle Widget] Add to cart error:", error);
          $atcButton.text(originalButtonText).prop("disabled", false);
          var errorMessage = "Please try again.";
          if (xhr && xhr.responseJSON && xhr.responseJSON.description) {
            errorMessage = xhr.responseJSON.description;
          } else if (xhr && xhr.responseJSON && xhr.responseJSON.message) {
            errorMessage = xhr.responseJSON.message;
          }
          alert("Could not add items to cart: " + errorMessage);
        });
    }

    /**
     * Initializes a single bundle widget container on the storefront using jQuery.
     */
    function initSingleBundleWidget(widgetContainer) {
      var $widget = $(widgetContainer);
      var appUrl = ($widget.data("app-url") || "").replace(/\/$/, "");
      var shopDomain = $widget.data("shop");
      var targetBundleId = String($widget.data("bundle-id") || "").trim();
      var columnsDesktop = parseInt($widget.data("cols"), 10) || 4;
      var showHeading =
        $widget.data("show-heading") !== false &&
        $widget.data("show-heading") !== "false";
      var heading = $widget.data("heading") || "Bundle Deals";
      var subheading = $widget.data("subheading") || "";
      var showPrice =
        $widget.data("show-price") !== false &&
        $widget.data("show-price") !== "false";
      var buttonText = $widget.data("button-text") || "Add Selected to Cart";
      var redirectTarget = $widget.data("redirect") || "checkout";
      var addToBoxText = $widget.data("add-to-box-text") || "Add To Box";

      var $loader = $widget.find(".bundle-widget__loader");
      var $error = $widget.find(".bundle-widget__error");
      var $content = $widget.find(".bundle-widget__content");

      if (!appUrl || !shopDomain) {
        $loader.hide();
        $error
          .show()
          .html(
            "<p>⚠️ <strong>Setup required:</strong> Set the App URL in your Shopify admin (Bundle Discount app → App URL).</p>"
          );
        return;
      }

      // ONLY show a bundle if the merchant has entered a Bundle ID in the block settings
      if (!targetBundleId) {
        $loader.hide();
        var isDesignMode = false;
        try {
          isDesignMode = Boolean(window.Shopify && window.Shopify.designMode);
        } catch (ignored) {}

        if (isDesignMode) {
          $content
            .html(
              '<div class="bundle-widget__empty" style="padding: 28px 20px; text-align: center; border: 2px dashed #cbd5e1; border-radius: 14px; background: #f8fafc; margin: 10px 0;">' +
                '<p style="margin: 0 0 6px 0; font-size: 15px; color: #1e293b; font-weight: 700;">' +
                "📦 Bundle Deals Block" +
                "</p>" +
                '<p style="margin: 0; font-size: 13px; color: #64748b;">' +
                "Please paste a <strong>Bundle ID</strong> in the block settings on the right to display a bundle here. (Copy it from your app dashboard under <em>Manage bundles</em>)." +
                "</p>" +
                "</div>"
            )
            .show();
        } else {
          $widget.hide();
        }
        return;
      }

      var apiUrl =
        appUrl +
        "/api/bundles?shop=" +
        encodeURIComponent(shopDomain) +
        "&bundleId=" +
        encodeURIComponent(targetBundleId);

      $.getJSON(apiUrl)
        .done(function (data) {
          $loader.hide();

          var validBundles = $.grep(data.bundles || [], function (bundle) {
            return bundle.products && bundle.products.length >= 2;
          });

          // Match the bundle by ID, title, or discount code
          var matched = $.grep(validBundles, function (bundle) {
            if (bundle.id === targetBundleId) return true;
            if (bundle.discounts && bundle.discounts.length > 0) {
              for (var d = 0; d < bundle.discounts.length; d++) {
                if (
                  bundle.discounts[d].discountCode &&
                  bundle.discounts[d].discountCode.toLowerCase() ===
                    targetBundleId.toLowerCase()
                ) {
                  return true;
                }
              }
            }
            if (
              bundle.title &&
              bundle.title.toLowerCase() === targetBundleId.toLowerCase()
            ) {
              return true;
            }
            return false;
          });

          if (matched.length > 0) {
            validBundles = [matched[0]];
          } else {
            $content
              .html(
                '<div class="bundle-widget__empty" style="padding: 24px 20px; text-align: center; border: 1px dashed #ef4444; border-radius: 12px; background: #fef2f2; margin: 10px 0;">' +
                  '<p style="margin: 0; font-size: 13px; color: #b91c1c; font-weight: 600;">⚠️ No bundle found with ID: <code>' +
                  escapeHtml(targetBundleId) +
                  "</code>. Please verify the Bundle ID in the block settings.</p></div>"
              )
              .show();
            return;
          }

          if (validBundles.length === 0) {
            $content
              .html(
                '<div class="bundle-widget__empty"><p>No active bundles available at this time.</p></div>'
              )
              .show();
            return;
          }

          var fullHtml = "";
          if (showHeading) {
            fullHtml +=
              '<div class="bundle-widget__header"><h2 class="bundle-widget__heading">' +
              escapeHtml(heading) +
              "</h2>" +
              (subheading
                ? '<p class="bundle-widget__subheading">' +
                  escapeHtml(subheading) +
                  "</p>"
                : "") +
              "</div>";
          }

          var now = Date.now();
          $.each(validBundles, function (_, bundle) {
            var activeDiscounts = (bundle.discounts || [])
              .filter(function (discount) {
                if (!discount.isActive) return false;
                if (discount.endsAt && new Date(discount.endsAt).getTime() <= now)
                  return false;
                return true;
              })
              .sort(function (discountA, discountB) {
                return discountA.minProducts - discountB.minProducts;
              });

            fullHtml +=
              '<div class="bundle-widget__bundle" data-bundle-id="' +
              bundle.id +
              '"><div class="bundle-widget__bundle-header"><h3 class="bundle-widget__bundle-title">' +
              escapeHtml(bundle.title) +
              "</h3>" +
              (bundle.description
                ? '<p class="bundle-widget__bundle-description">' +
                  escapeHtml(bundle.description) +
                  "</p>"
                : "") +
              "</div>" +
              renderTierCards(activeDiscounts) +
              renderProgressSection(activeDiscounts, 0) +
              '<div class="bundle-widget__products" style="--cols:' +
              columnsDesktop +
              '">' +
              $.map(bundle.products, function (product, idx) {
                return renderProductCard(
                  product,
                  idx,
                  columnsDesktop,
                  showPrice,
                  addToBoxText
                );
              }).join("") +
              '</div><div class="bundle-widget__summary-wrap"></div></div>';
          });

          $content.html(fullHtml).show();

          var $bundleElements = $content.find(".bundle-widget__bundle");

          $bundleElements.each(function () {
            var $bundleElement = $(this);
            var bundleId = $bundleElement.data("bundle-id");
            var bundleData = null;
            for (var i = 0; i < validBundles.length; i++) {
              if (validBundles[i].id === bundleId) {
                bundleData = validBundles[i];
                break;
              }
            }
            if (!bundleData) return;

            var discountTiers = (bundleData.discounts || [])
              .filter(function (discount) {
                if (!discount.isActive) return false;
                if (discount.endsAt && new Date(discount.endsAt).getTime() <= now)
                  return false;
                return true;
              })
              .sort(function (a, b) {
                return a.minProducts - b.minProducts;
              });

            var maxTierCount = 5;
            if (discountTiers.length > 0) {
              maxTierCount =
                Math.max.apply(
                  null,
                  $.map(discountTiers, function (t) {
                    return t.minProducts;
                  })
                ) || 5;
            }

            var $summaryWrap = $bundleElement.find(
              ".bundle-widget__summary-wrap"
            );
            var $tierCardElements = $bundleElement.find(
              ".bundle-widget__tier-card"
            );
            var $milestoneElements = $bundleElement.find(
              ".bundle-widget__milestone"
            );
            var $progressMessage = $bundleElement.find(
              ".bundle-widget__progress-message"
            );
            var $progressFill = $bundleElement.find(
              ".bundle-widget__progress-fill"
            );
            var $productCards = $bundleElement.find(
              ".bundle-widget__product"
            );

            function updateSelection() {
              var selectedProducts = [];
              var totalCount = 0;
              var totalRawPrice = 0;

              $productCards.each(function () {
                var $card = $(this);
                var quantity = parseInt($card.attr("data-qty"), 10) || 0;
                if (quantity > 0) {
                  var price = parseFloat($card.attr("data-price") || 0);
                  selectedProducts.push({
                    $card: $card,
                    qty: quantity,
                    price: price,
                    title: $card.attr("data-title") || "",
                    imageUrl: $card.attr("data-image") || "",
                    variantId: $card.attr("data-variant-id") || "",
                    productId: $card.attr("data-product-id") || "",
                  });
                  totalCount += quantity;
                  totalRawPrice += price * quantity;
                }
              });

              var activeDiscount = getActiveDiscountTier(
                discountTiers,
                totalCount
              );

              // Update top Tier Cards active state
              $tierCardElements.each(function () {
                var $tc = $(this);
                var min = parseInt($tc.attr("data-min"), 10);
                if (activeDiscount && min === activeDiscount.minProducts) {
                  $tc.addClass("bundle-widget__tier-card--active");
                } else {
                  $tc.removeClass("bundle-widget__tier-card--active");
                }
              });

              // Update Progress Bar message and fill width
              var msg = getProgressMessage(
                totalCount,
                discountTiers,
                activeDiscount
              );
              $progressMessage.text(msg);

              var fillPercent = Math.min(
                100,
                Math.round((totalCount / maxTierCount) * 100)
              );
              $progressFill.css({
                width: fillPercent + "%",
                background: "#0b1329",
                backgroundColor: "#0b1329",
                display: "block",
                minHeight: "6px",
              });

              // Update milestone circles reached state
              $milestoneElements.each(function () {
                var $m = $(this);
                var mMin = parseInt($m.attr("data-min"), 10);
                if (totalCount >= mMin) {
                  $m.addClass("bundle-widget__milestone--reached");
                } else {
                  $m.removeClass("bundle-widget__milestone--reached");
                }
              });

              // Check if maximum discount tier is reached (disable + and Add To Box buttons)
              var isMaxReached =
                discountTiers.length > 0 && totalCount >= maxTierCount;

              $productCards.each(function () {
                var $c = $(this);
                var $add = $c.find(".bundle-widget__add-box-btn");
                var $plus = $c.find(".bundle-widget__qty-btn--plus");
                $add.prop("disabled", isMaxReached);
                $plus.prop("disabled", isMaxReached);
              });

              // Render bottom summary
              $summaryWrap.html(
                renderBundleSummary(
                  selectedProducts,
                  totalCount,
                  totalRawPrice,
                  discountTiers,
                  buttonText
                )
              );

              // Wire up slot remove buttons (clicking "×" decrements 1 qty of that product)
              $summaryWrap
                .find(".bundle-widget__slot-remove")
                .off("click")
                .on("click", function (event) {
                  event.preventDefault();
                  event.stopPropagation();
                  var prodId = $(this).attr("data-product-id");
                  var $targetCard = $productCards.filter(function () {
                    return $(this).attr("data-product-id") === prodId;
                  });
                  if ($targetCard.length) {
                    var cur =
                      parseInt($targetCard.attr("data-qty"), 10) || 0;
                    setProductCardQuantity($targetCard, cur - 1);
                  }
                });

              // Minimum products required for the first discount tier
              var minRequiredCount = 1;
              if (discountTiers && discountTiers.length > 0) {
                var sortedMins = $.map(discountTiers, function (t) {
                  return t.minProducts;
                }).sort(function (a, b) {
                  return a - b;
                });
                minRequiredCount = sortedMins[0] || 1;
              }

              // Wire up Add to Cart CTA button
              var $atcButton = $summaryWrap.find(".bundle-widget__atc");
              if (
                $atcButton.length &&
                !$atcButton.prop("disabled") &&
                totalCount >= minRequiredCount
              ) {
                $atcButton.off("click").on("click", function (event) {
                  event.stopPropagation();
                  handleAddToCart(
                    selectedProducts,
                    totalCount,
                    $atcButton,
                    activeDiscount,
                    bundleId,
                    appUrl,
                    shopDomain,
                    redirectTarget
                  );
                });
              }
            }

            /**
             * Sets a product card's quantity and updates its visual elements.
             */
            function setProductCardQuantity($card, newQuantity) {
              var targetQty = Math.max(0, parseInt(newQuantity, 10) || 0);
              var currentCardQty = parseInt($card.attr("data-qty"), 10) || 0;

              // Prevent increasing if maximum tier requirement is already reached
              if (targetQty > currentCardQty && discountTiers.length > 0) {
                var currentTotal = 0;
                $productCards.each(function () {
                  currentTotal += parseInt($(this).attr("data-qty"), 10) || 0;
                });
                var diff = targetQty - currentCardQty;
                if (currentTotal + diff > maxTierCount) {
                  targetQty =
                    currentCardQty + Math.max(0, maxTierCount - currentTotal);
                  if (targetQty === currentCardQty) {
                    return;
                  }
                }
              }

              $card.attr("data-qty", targetQty);

              var $addButton = $card.find(".bundle-widget__add-box-btn");
              var $qtySelector = $card.find(".bundle-widget__qty-selector");
              var $qtyValueDisplay = $card.find(".bundle-widget__qty-val");
              var $inBoxBadge = $card.find(".bundle-widget__in-box-badge");

              if (targetQty === 0) {
                $addButton.show();
                $qtySelector.hide();
                $inBoxBadge.hide();
                $card.removeClass("bundle-widget__product--selected");
              } else {
                $addButton.hide();
                $qtySelector.css("display", "inline-flex");
                $qtyValueDisplay.text(targetQty);
                $inBoxBadge.text(targetQty + " in box").show();
                $card.addClass("bundle-widget__product--selected");
              }
              updateSelection();
            }

            /**
             * Auto-populates box to meet a target tier requirement when tier card or milestone is clicked.
             */
            function autoFillBox(targetCount) {
              var count = Math.min(
                maxTierCount,
                Math.max(1, parseInt(targetCount, 10) || 1)
              );
              $productCards.each(function () {
                $(this).attr("data-qty", 0);
              });

              var numCards = $productCards.length;
              if (numCards > 0) {
                for (var i = 0; i < count; i++) {
                  var cardIdx = i % numCards;
                  var $targetCard = $productCards.eq(cardIdx);
                  var cur = parseInt($targetCard.attr("data-qty"), 10) || 0;
                  $targetCard.attr("data-qty", cur + 1);
                }
              }

              $productCards.each(function () {
                var $card = $(this);
                var q = parseInt($card.attr("data-qty"), 10) || 0;
                var $addButton = $card.find(".bundle-widget__add-box-btn");
                var $qtySelector = $card.find(".bundle-widget__qty-selector");
                var $qtyValueDisplay = $card.find(".bundle-widget__qty-val");
                var $inBoxBadge = $card.find(".bundle-widget__in-box-badge");

                if (q === 0) {
                  $addButton.show();
                  $qtySelector.hide();
                  $inBoxBadge.hide();
                  $card.removeClass("bundle-widget__product--selected");
                } else {
                  $addButton.hide();
                  $qtySelector.css("display", "inline-flex");
                  $qtyValueDisplay.text(q);
                  $inBoxBadge.text(q + " in box").show();
                  $card.addClass("bundle-widget__product--selected");
                }
              });
              updateSelection();
            }

            // Wire up "Add To Box", plus, and minus buttons on each product card
            $productCards.each(function () {
              var $card = $(this);
              var $addButton = $card.find(".bundle-widget__add-box-btn");
              var $minusButton = $card.find(".bundle-widget__qty-btn--minus");
              var $plusButton = $card.find(".bundle-widget__qty-btn--plus");

              $addButton.off("click").on("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                if ($(this).prop("disabled")) return;
                setProductCardQuantity($card, 1);
              });

              $plusButton.off("click").on("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                if ($(this).prop("disabled")) return;
                var current = parseInt($card.attr("data-qty"), 10) || 0;
                setProductCardQuantity($card, current + 1);
              });

              $minusButton.off("click").on("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                var current = parseInt($card.attr("data-qty"), 10) || 0;
                setProductCardQuantity($card, current - 1);
              });
            });

            // Wire up clicking on tier cards to auto-fill the box
            $tierCardElements.off("click").on("click", function (event) {
              event.stopPropagation();
              var minCount = parseInt($(this).attr("data-min"), 10) || 2;
              autoFillBox(minCount);
            });

            // Wire up clicking on milestone circles to auto-fill the box
            $milestoneElements.off("click").on("click", function (event) {
              event.stopPropagation();
              var minCount = parseInt($(this).attr("data-min"), 10) || 2;
              autoFillBox(minCount);
            });

            // Initial render
            updateSelection();
          });
        })
        .fail(function (xhr, status, error) {
          console.error("[Bundle Widget] Error:", error);
          $loader.hide();
          $error.show();
        });
    }

    // ─── Cart Page Watcher ──────────────────────────────────────────────────────
    function initCartDiscountWatcher() {
      if (window.location.pathname.indexOf("/cart") === -1) {
        return;
      }

      var isChecking = false;

      function validateCart() {
        if (isChecking) return;
        isChecking = true;

        $.getJSON("/cart.js")
          .done(function (cart) {
            if (!cart) return;

            var hasBundleDiscount = false;
            var appliedCode = "";

            if (
              cart.cart_level_discount_applications &&
              cart.cart_level_discount_applications.length > 0
            ) {
              $.each(cart.cart_level_discount_applications, function (_, discountApp) {
                if (
                  discountApp.title &&
                  (discountApp.title.indexOf("BNDL-") === 0 ||
                    discountApp.title.indexOf("BUNDLE-") === 0)
                ) {
                  hasBundleDiscount = true;
                  appliedCode = discountApp.title;
                }
              });
            }

            if (!hasBundleDiscount && cart.items && cart.items.length > 0) {
              $.each(cart.items, function (_, item) {
                if (item.discounts && item.discounts.length > 0) {
                  $.each(item.discounts, function (_, discountApp) {
                    if (
                      discountApp.title &&
                      (discountApp.title.indexOf("BNDL-") === 0 ||
                        discountApp.title.indexOf("BUNDLE-") === 0)
                    ) {
                      hasBundleDiscount = true;
                      appliedCode = discountApp.title;
                    }
                  });
                }
              });
            }

            var minQty =
              parseInt(cart.attributes && cart.attributes._bundle_min_qty, 10) || 0;
            var productIdsStr =
              (cart.attributes && cart.attributes._bundle_product_ids) || "";
            var bundleProductIds = productIdsStr
              ? productIdsStr.split(",").filter(Boolean)
            : [];

            if (hasBundleDiscount && minQty <= 0) {
              minQty = 2;
            }

            if (!hasBundleDiscount || minQty <= 0) {
              return;
            }

            var eligibleCount = 0;
            if (cart.items && cart.items.length > 0) {
              $.each(cart.items, function (_, item) {
                var productId = String(item.product_id);
                if (
                  bundleProductIds.length === 0 ||
                  $.inArray(productId, bundleProductIds) !== -1
                ) {
                  eligibleCount += parseInt(item.quantity, 10) || 0;
                }
              });
            }

            if (eligibleCount < minQty) {
              console.warn(
                "[Bundle App] Cart quantity (" +
                  eligibleCount +
                  ") is below minimum requirement (" +
                  minQty +
                  "). Removing discount " +
                  appliedCode
              );

              $.ajax({
                url: "/cart/update.js",
                type: "POST",
                contentType: "application/json",
                data: JSON.stringify({
                  discount: "",
                  attributes: {
                    _bundle_discount_code: "",
                    _bundle_min_qty: "",
                    _bundle_product_ids: "",
                  },
                }),
                dataType: "json",
              }).done(function () {
                $(document).trigger("cart:updated");
                $(document).trigger("cart:refresh");
                try {
                  document.dispatchEvent(
                    new CustomEvent("cart:updated", { bubbles: true })
                  );
                  document.dispatchEvent(
                    new CustomEvent("cart:refresh", { bubbles: true })
                  );
                } catch (ignored) {}

                if (window.location.pathname.indexOf("/cart") !== -1) {
                  window.location.reload();
                }
              });
            }
          })
          .always(function () {
            setTimeout(function () {
              isChecking = false;
            }, 300);
          });
      }

      validateCart();

      $(document).on("cart:updated cart:refresh", function () {
        setTimeout(validateCart, 150);
      });

      $(document).on(
        "click",
        ".cart__quantity-button, .quantity__button, [name='plus'], [name='minus'], .cart-item__remove, .cart-remove-button, .cart__remove",
        function () {
          setTimeout(validateCart, 450);
        }
      );

      $(document).on(
        "change",
        "input[name*='updates'], .quantity__input, .cart__quantity-input, form[action*='/cart']",
        function () {
          setTimeout(validateCart, 450);
        }
      );
    }

    // ─── Entry Point Initialization ─────────────────────────────────────────────

    function initBundleWidgets() {
      $(".bundle-widget").each(function () {
        initSingleBundleWidget(this);
      });
    }

    initBundleWidgets();
    initCartDiscountWatcher();

    // Re-initialize when Shopify theme customizer section loads or updates
    $(document).on(
      "shopify:section:load shopify:section:reorder shopify:block:select shopify:block:deselect",
      function (event) {
        var $target = $(event.target);
        var $widgets = $target.hasClass("bundle-widget")
          ? $target
          : $target.find(".bundle-widget");
        if ($widgets.length) {
          $widgets.each(function () {
            initSingleBundleWidget(this);
          });
        }
      }
    );
  });
})();
