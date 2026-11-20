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
      for (var index = 0; index < discountTiers.length; index++) {
        var tier = discountTiers[index];
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
     * Formats discount text for badges and messages (e.g. "10% OFF" or "$5.00 OFF").
     */
    function formatDiscountBadge(discountTier) {
      return discountTier.discountType === "percentage"
        ? discountTier.discountValue + "% OFF"
        : "$" + parseFloat(discountTier.discountValue).toFixed(2) + " OFF";
    }

    /**
     * Renders discount tiers header pills above the product list.
     */
    function renderDiscountTiers(discountTiers, accentColor, badgeColor) {
      if (!discountTiers || discountTiers.length === 0) return "";
      var activeTiers = discountTiers
        .filter(function (tier) {
          return tier.isActive;
        })
        .sort(function (tierA, tierB) {
          return tierA.minProducts - tierB.minProducts;
        });

      var html = '<div class="bundle-widget__tiers">';
      html +=
        '<p class="bundle-widget__tiers-label">🎯 Discount Tiers — pick more, save more:</p>';
      html += '<div class="bundle-widget__tiers-list">';
      $.each(activeTiers, function (_, tier) {
        html +=
          '<div class="bundle-widget__tier" data-min="' +
          tier.minProducts +
          '" style="--accent:' +
          accentColor +
          '"><span class="bundle-widget__tier-pick">Pick any <strong>' +
          tier.minProducts +
          '+</strong></span><span class="bundle-widget__tier-arrow">→</span><span class="bundle-widget__tier-value">' +
          formatDiscountBadge(tier) +
          "</span></div>";
      });
      html += "</div></div>";
      return html;
    }

    /**
     * Renders a single product card HTML with "Add To Box" button and quantity selector [-] qty [+].
     */
    function renderProductCard(product, columns, showPrice, accentColor, addToBoxText) {
      var mediaHtml = product.imageUrl
        ? '<img class="bundle-widget__product-img" src="' +
          product.imageUrl +
          '" alt="' +
          escapeHtml(product.title) +
          '" loading="lazy">'
        : '<div class="bundle-widget__product-img bundle-widget__product-img--placeholder"></div>';

      var buttonLabel = addToBoxText || "Add To Box";

      return (
        '<div class="bundle-widget__product" data-product-id="' +
        product.productId +
        '" data-variant-id="' +
        (product.variantId || "") +
        '" data-price="' +
        (product.price || "0") +
        '" data-qty="0" style="--accent:' +
        accentColor +
        '">' +
        '<div class="bundle-widget__product-media">' +
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
        "</div>" +
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
        "</div>"
      );
    }

    /**
     * Renders the summary section: shows selected item count, original price, savings, and total price.
     */
    function renderBundleSummary(
      selectedProducts,
      totalCount,
      totalRawPrice,
      discountTiers,
      buttonText,
      badgeColor,
      addToBoxText
    ) {
      var activeDiscount = getActiveDiscountTier(discountTiers, totalCount);
      var discountCalc = calculateSavings(selectedProducts, totalRawPrice, activeDiscount);
      var boxButtonLabel = addToBoxText || "Add To Box";

      if (totalCount === 0) {
        return (
          '<div class="bundle-widget__summary">' +
          '<div class="bundle-widget__summary--empty">' +
          "<p>☝️ Click <strong>" +
          escapeHtml(boxButtonLabel) +
          "</strong> on products above to build your bundle.</p>" +
          "</div>" +
          '<button type="button" class="bundle-widget__atc" disabled style="opacity:0.6;cursor:not-allowed;">' +
          escapeHtml(buttonText || "Add Selected to Cart") +
          " (0 items)</button>" +
          "</div>"
        );
      }

      var nextTier = null;
      var sortedTiers = discountTiers
        .filter(function (tier) {
          return tier.isActive;
        })
        .sort(function (tierA, tierB) {
          return tierA.minProducts - tierB.minProducts;
        });

      for (var index = 0; index < sortedTiers.length; index++) {
        if (sortedTiers[index].minProducts > totalCount) {
          nextTier = sortedTiers[index];
          break;
        }
      }

      var html = '<div class="bundle-widget__summary">';

      if (activeDiscount && discountCalc.savings > 0) {
        html +=
          '<div class="bundle-widget__summary-win" style="--badge:' +
          badgeColor +
          '"><span class="bundle-widget__summary-badge">' +
          formatDiscountBadge(activeDiscount) +
          "</span><span>🎉 " +
          formatDiscountBadge(activeDiscount) +
          " applied to " +
          discountCalc.eligibleCount +
          " item" +
          (discountCalc.eligibleCount !== 1 ? "s" : "") +
          "!</span></div>";
      }

      if (nextTier) {
        var itemsNeeded = nextTier.minProducts - totalCount;
        html +=
          '<div class="bundle-widget__summary-nudge">Add <strong>' +
          itemsNeeded +
          " more</strong> item" +
          (itemsNeeded !== 1 ? "s" : "") +
          " to unlock <strong>" +
          formatDiscountBadge(nextTier) +
          "</strong></div>";
      }

      html += '<div class="bundle-widget__summary-prices">';
      html +=
        '<div class="bundle-widget__summary-row"><span>Selected in Box:</span><span>' +
        totalCount +
        " item" +
        (totalCount !== 1 ? "s" : "") +
        "</span></div>";

      if (activeDiscount && discountCalc.savings > 0) {
        html +=
          '<div class="bundle-widget__summary-row"><span>Original:</span><span class="bundle-widget__summary-original">$' +
          totalRawPrice.toFixed(2) +
          "</span></div>";
        html +=
          '<div class="bundle-widget__summary-row bundle-widget__summary-savings"><span>You save:</span><span>-$' +
          discountCalc.savings.toFixed(2) +
          " (" +
          formatDiscountBadge(activeDiscount) +
          " on " +
          discountCalc.eligibleCount +
          " item" +
          (discountCalc.eligibleCount !== 1 ? "s" : "") +
          ")</span></div>";
        html +=
          '<div class="bundle-widget__summary-row bundle-widget__summary-total"><span>Total:</span><span>$' +
          discountCalc.finalTotal.toFixed(2) +
          "</span></div>";
      } else {
        html +=
          '<div class="bundle-widget__summary-row bundle-widget__summary-total"><span>Total:</span><span>$' +
          totalRawPrice.toFixed(2) +
          "</span></div>";
      }
      html += "</div>";

      var finalPrice = activeDiscount ? discountCalc.finalTotal : totalRawPrice;
      var checkoutButtonText =
        (buttonText || "Add Selected to Cart") + " — $" + finalPrice.toFixed(2);
      html +=
        '<button type="button" class="bundle-widget__atc">' +
        escapeHtml(checkoutButtonText) +
        "</button>";
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
      var columnsDesktop = parseInt($widget.data("cols"), 10) || 3;
      var showHeading =
        $widget.data("show-heading") !== false &&
        $widget.data("show-heading") !== "false";
      var heading = $widget.data("heading") || "Bundle Deals";
      var subheading = $widget.data("subheading") || "";
      var accentColor = $widget.data("accent-color") || "#1a1a1a";
      var badgeColor = $widget.data("badge-color") || "#e63946";
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
        $error.show().html(
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
                'Please paste a <strong>Bundle ID</strong> in the block settings on the right to display a bundle here. (Copy it from your app dashboard under <em>Manage bundles</em>).' +
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
            validBundles = [matched[0]]; // Strictly display ONLY this one bundle
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

          $.each(validBundles, function (_, bundle) {
            var activeDiscounts = (bundle.discounts || [])
              .filter(function (discount) {
                return discount.isActive;
              })
              .sort(function (discountA, discountB) {
                return discountA.minProducts - discountB.minProducts;
              });

            fullHtml +=
              '<div class="bundle-widget__bundle" data-bundle-id="' +
              bundle.id +
              '"><div class="bundle-widget__bundle-header"><h3>' +
              escapeHtml(bundle.title) +
              "</h3>" +
              (bundle.description
                ? "<p>" + escapeHtml(bundle.description) + "</p>"
                : "") +
              "</div>" +
              renderDiscountTiers(activeDiscounts, accentColor, badgeColor) +
              '<div class="bundle-widget__products" style="--cols:' +
              columnsDesktop +
              '">' +
              $.map(bundle.products, function (product) {
                return renderProductCard(
                  product,
                  columnsDesktop,
                  showPrice,
                  accentColor,
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

            var discountTiers = (bundleData.discounts || []).filter(function (discount) {
              return discount.isActive;
            });

            var $summaryWrap = $bundleElement.find(".bundle-widget__summary-wrap");
            var $tierElements = $bundleElement.find(".bundle-widget__tier");
            var $productCards = $bundleElement.find(".bundle-widget__product");

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
                    variantId: $card.attr("data-variant-id") || "",
                    productId: $card.attr("data-product-id") || "",
                  });
                  totalCount += quantity;
                  totalRawPrice += price * quantity;
                  $card.addClass("bundle-widget__product--selected");
                } else {
                  $card.removeClass("bundle-widget__product--selected");
                }
              });

              var activeDiscount = getActiveDiscountTier(discountTiers, totalCount);

              $tierElements.each(function () {
                var $tier = $(this);
                var tierMin = parseInt($tier.attr("data-min"), 10);
                if (activeDiscount && tierMin === activeDiscount.minProducts) {
                  $tier.addClass("bundle-widget__tier--active");
                } else {
                  $tier.removeClass("bundle-widget__tier--active");
                }
              });

              $summaryWrap.html(
                renderBundleSummary(
                  selectedProducts,
                  totalCount,
                  totalRawPrice,
                  discountTiers,
                  buttonText,
                  badgeColor,
                  addToBoxText
                )
              );

              var $atcButton = $summaryWrap.find(".bundle-widget__atc");
              if ($atcButton.length && !$atcButton.prop("disabled")) {
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

            // Wire up "Add To Box", plus, and minus buttons on each product card
            $productCards.each(function () {
              var $card = $(this);
              var $addButton = $card.find(".bundle-widget__add-box-btn");
              var $qtySelector = $card.find(".bundle-widget__qty-selector");
              var $minusButton = $card.find(".bundle-widget__qty-btn--minus");
              var $plusButton = $card.find(".bundle-widget__qty-btn--plus");
              var $qtyValueDisplay = $card.find(".bundle-widget__qty-val");

              function setQuantity(newQuantity) {
                var quantity = Math.max(0, parseInt(newQuantity, 10) || 0);
                $card.attr("data-qty", quantity);

                if (quantity === 0) {
                  $addButton.show();
                  $qtySelector.hide();
                  $card.removeClass("bundle-widget__product--selected");
                } else {
                  $addButton.hide();
                  $qtySelector.css("display", "inline-flex");
                  $qtyValueDisplay.text(quantity);
                  $card.addClass("bundle-widget__product--selected");
                }
                updateSelection();
              }

              $addButton.off("click").on("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                setQuantity(1);
              });

              $plusButton.off("click").on("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                var current = parseInt($card.attr("data-qty"), 10) || 0;
                setQuantity(current + 1);
              });

              $minusButton.off("click").on("click", function (event) {
                event.preventDefault();
                event.stopPropagation();
                var current = parseInt($card.attr("data-qty"), 10) || 0;
                setQuantity(current - 1);
              });
            });

            // Wire up clicking on tier badges to auto-fill the box
            $tierElements.each(function () {
              var $tier = $(this);
              $tier.css("cursor", "pointer");
              $tier.off("click").on("click", function (event) {
                event.stopPropagation();
                var minCount = parseInt($tier.attr("data-min"), 10) || 2;
                $productCards.each(function (index) {
                  var $card = $(this);
                  var $addButton = $card.find(".bundle-widget__add-box-btn");
                  var $qtySelector = $card.find(".bundle-widget__qty-selector");
                  var $qtyValueDisplay = $card.find(".bundle-widget__qty-val");
                  var quantity = index < minCount ? 1 : 0;
                  $card.attr("data-qty", quantity);

                  if (quantity > 0) {
                    $addButton.hide();
                    $qtySelector.css("display", "inline-flex");
                    $qtyValueDisplay.text(quantity);
                    $card.addClass("bundle-widget__product--selected");
                  } else {
                    $addButton.show();
                    $qtySelector.hide();
                    $card.removeClass("bundle-widget__product--selected");
                  }
                });
                updateSelection();
              });
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
