/**
 * Bundle App - Theme Extension JavaScript
 * Fetches bundles from the app API and renders them in the storefront.
 */

(function () {
  "use strict";

  // ─── Utilities ───────────────────────────────────────────────────────────────

  function formatMoney(cents, currency) {
    var amount = (cents / 100).toFixed(2);
    return (currency || "$") + amount;
  }

  function formatPrice(priceStr) {
    var num = parseFloat(priceStr);
    return isNaN(num) ? priceStr : "$" + num.toFixed(2);
  }

  function copyToClipboard(text, btn) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () {
        var orig = btn.textContent;
        btn.textContent = "Copied!";
        btn.disabled = true;
        setTimeout(function () {
          btn.textContent = orig;
          btn.disabled = false;
        }, 2000);
      });
    } else {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  // ─── Bundle HTML Renderer ────────────────────────────────────────────────────

  function renderBundleCard(bundle, settings) {
    var activeDiscount = null;
    for (var i = 0; i < bundle.discounts.length; i++) {
      if (bundle.discounts[i].isActive) {
        activeDiscount = bundle.discounts[i];
        break;
      }
    }

    var totalOriginalPrice = bundle.products.reduce(function (sum, p) {
      return sum + parseFloat(p.price || 0) * (p.quantity || 1);
    }, 0);

    var savings = 0;
    var discountedPrice = totalOriginalPrice;
    var discountLabel = "";
    if (activeDiscount) {
      if (activeDiscount.discountType === "percentage") {
        savings = totalOriginalPrice * (activeDiscount.discountValue / 100);
        discountedPrice = totalOriginalPrice - savings;
        discountLabel = activeDiscount.discountValue + "% OFF";
      } else {
        savings = activeDiscount.discountValue;
        discountedPrice = Math.max(0, totalOriginalPrice - savings);
        discountLabel = "$" + activeDiscount.discountValue.toFixed(2) + " OFF";
      }
    }

    var productsHtml = bundle.products
      .map(function (product) {
        var imageHtml = product.imageUrl
          ? '<img src="' +
            product.imageUrl +
            '" alt="' +
            escapeHtml(product.title) +
            '" class="bundle-product__image" loading="lazy">'
          : '<div class="bundle-product__image bundle-product__image--placeholder"></div>';

        return (
          '<div class="bundle-product">' +
          imageHtml +
          '<div class="bundle-product__info">' +
          '<span class="bundle-product__title">' +
          escapeHtml(product.title) +
          "</span>" +
          (product.quantity > 1
            ? '<span class="bundle-product__qty">x' + product.quantity + "</span>"
            : "") +
          (settings.showOriginalPrice
            ? '<span class="bundle-product__price">' +
              formatPrice(product.price) +
              "</span>"
            : "") +
          "</div>" +
          "</div>"
        );
      })
      .join('<span class="bundle-separator">+</span>');

    var discountCodeHtml = "";
    if (settings.showDiscountCode && activeDiscount && activeDiscount.discountCode) {
      discountCodeHtml =
        '<div class="bundle-discount-code">' +
        '<span class="bundle-discount-code__label">Use code at checkout:</span>' +
        '<div class="bundle-discount-code__wrapper">' +
        '<code class="bundle-discount-code__code">' +
        escapeHtml(activeDiscount.discountCode) +
        "</code>" +
        '<button class="bundle-discount-code__copy" data-code="' +
        escapeHtml(activeDiscount.discountCode) +
        '">Copy Code</button>' +
        "</div>" +
        (activeDiscount.oneTimeUse
          ? '<span class="bundle-discount-code__note">⚡ One-time use per customer</span>'
          : "") +
        "</div>";
    }

    var savingsHtml = "";
    if (settings.showSavings && savings > 0) {
      savingsHtml =
        '<div class="bundle-savings">' +
        "You save: <strong>$" +
        savings.toFixed(2) +
        "</strong>" +
        "</div>";
    }

    var priceHtml =
      '<div class="bundle-price">' +
      (settings.showOriginalPrice && savings > 0
        ? '<span class="bundle-price__original">$' +
          totalOriginalPrice.toFixed(2) +
          "</span>"
        : "") +
      (activeDiscount
        ? '<span class="bundle-price__discounted">$' +
          discountedPrice.toFixed(2) +
          "</span>"
        : '<span class="bundle-price__total">$' +
          totalOriginalPrice.toFixed(2) +
          "</span>") +
      "</div>";

    return (
      '<div class="bundle-card" style="background:' +
      (settings.cardBackground || "#fff") +
      ";border-color:" +
      (settings.cardBorderColor || "#e1e1e1") +
      '">' +
      '<div class="bundle-card__header">' +
      (discountLabel
        ? '<span class="bundle-badge" style="background:' +
          (settings.discountBadgeColor || "#e63946") +
          '">' +
          discountLabel +
          "</span>"
        : "") +
      '<h3 class="bundle-card__title">' +
      escapeHtml(bundle.title) +
      "</h3>" +
      (bundle.description
        ? '<p class="bundle-card__description">' +
          escapeHtml(bundle.description) +
          "</p>"
        : "") +
      "</div>" +
      '<div class="bundle-products">' +
      productsHtml +
      "</div>" +
      priceHtml +
      savingsHtml +
      discountCodeHtml +
      "</div>"
    );
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ─── Main Bundle App ─────────────────────────────────────────────────────────

  var BundleApp = {
    // Initialize full bundle display block
    init: function (container, settings) {
      var loadingEl = container.querySelector(".bundle-display__loading");
      var contentEl = container.querySelector(".bundle-display__content");
      var errorEl = container.querySelector(".bundle-display__error");

      var apiUrl = this._buildApiUrl(settings.appUrl, settings.shop);

      fetch(apiUrl)
        .then(function (res) {
          if (!res.ok) throw new Error("API error");
          return res.json();
        })
        .then(function (data) {
          if (loadingEl) loadingEl.style.display = "none";

          var bundles = data.bundles || [];
          if (bundles.length === 0) {
            contentEl.style.display = "none";
            return;
          }

          var html =
            '<div class="bundle-section">' +
            (settings.heading
              ? '<h2 class="bundle-section__heading">' +
                escapeHtml(settings.heading) +
                "</h2>"
              : "") +
            (settings.subheading
              ? '<p class="bundle-section__subheading">' +
                escapeHtml(settings.subheading) +
                "</p>"
              : "") +
            '<div class="bundle-grid" style="--products-per-row:' +
            (settings.productsPerRow || 3) +
            '">' +
            bundles
              .map(function (b) {
                return renderBundleCard(b, settings);
              })
              .join("") +
            "</div>" +
            "</div>";

          contentEl.innerHTML = html;
          contentEl.style.display = "block";

          // Attach copy handlers
          BundleApp._attachCopyHandlers(contentEl);
        })
        .catch(function (err) {
          console.error("Bundle app error:", err);
          if (loadingEl) loadingEl.style.display = "none";
          if (errorEl) errorEl.style.display = "block";
        });
    },

    // Initialize product page snippet
    initSnippet: function (container, opts) {
      var settings = window.__bundleAppSettings || {};
      var apiUrl = this._buildApiUrl(
        settings.appUrl || opts.appUrl,
        opts.shop,
      );

      fetch(apiUrl)
        .then(function (res) {
          return res.json();
        })
        .then(function (data) {
          var bundles = (data.bundles || []).filter(function (b) {
            return b.products.some(function (p) {
              return p.productId === opts.productId;
            });
          });

          if (bundles.length === 0) {
            container.style.display = "none";
            return;
          }

          var loadingEl = container.querySelector(".bundle-snippet__loading");
          var contentEl = container.querySelector(".bundle-snippet__content");
          if (loadingEl) loadingEl.style.display = "none";

          var html =
            '<div class="bundle-snippet__inner">' +
            '<h4 class="bundle-snippet__heading">Also available as part of a bundle:</h4>' +
            bundles
              .map(function (b) {
                return renderBundleCard(b, settings);
              })
              .join("") +
            "</div>";

          contentEl.innerHTML = html;
          contentEl.style.display = "block";
          BundleApp._attachCopyHandlers(contentEl);
        })
        .catch(function () {
          container.style.display = "none";
        });
    },

    _buildApiUrl: function (appUrl, shop) {
      // appUrl is the app's base URL; the API endpoint is /api/bundles
      var base = appUrl || "";
      // Remove trailing slash
      base = base.replace(/\/$/, "");
      return base + "/api/bundles?shop=" + encodeURIComponent(shop);
    },

    _attachCopyHandlers: function (container) {
      var btns = container.querySelectorAll(".bundle-discount-code__copy");
      btns.forEach(function (btn) {
        btn.addEventListener("click", function () {
          copyToClipboard(btn.dataset.code, btn);
        });
      });
    },
  };

  window.BundleApp = BundleApp;
  document.dispatchEvent(new CustomEvent("bundle-app-ready"));
})();

