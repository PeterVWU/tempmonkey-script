// ==UserScript==
// @name         Shopify PO Fill Variants
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Add "Fill All Variants" button to apply same quantity and cost to all variants of a product on Shopify PO creation page
// @match        https://admin.shopify.com/store/*/purchase_orders*
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const BUTTON_MARKER = 'data-fill-variants-btn';
  const ROW_SELECTOR = 'tr[class*="PurchaseOrderLineItem"]';
  const PRODUCT_CELL_SELECTOR = 'td[class*="ItemDetails"]';
  const QUANTITY_CELL_SELECTOR = 'td[class*="Received"]';
  const COST_CELL_SELECTOR = 'td[class*="Cost"]';

  /**
   * Set an input value in a React-compatible way.
   */
  function setReactInputValue(input, value) {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  /**
   * Extract the product ID from a row's product link href.
   * Href format: /store/{store}/products/{PRODUCT_ID}/variants/{VARIANT_ID}
   */
  function getProductId(row) {
    const link = row.querySelector('s-internal-link[href*="/products/"]');
    if (!link) return null;
    const match = link.getAttribute('href').match(/\/products\/(\d+)/);
    return match ? match[1] : null;
  }

  /**
   * Get the quantity input from a row.
   */
  function getQuantityInput(row) {
    const cell = row.querySelector(QUANTITY_CELL_SELECTOR);
    return cell ? cell.querySelector('input[type="number"]') : null;
  }

  /**
   * Get the cost input from a row.
   */
  function getCostInput(row) {
    const cell = row.querySelector(COST_CELL_SELECTOR);
    if (!cell) return null;
    const largeScreen = cell.querySelector('span[class*="LargeScreen"] input');
    return largeScreen || cell.querySelector('input');
  }

  /**
   * Group table rows by product ID.
   * Returns a Map of productId -> [row, row, ...]
   */
  function groupRowsByProduct() {
    const rows = document.querySelectorAll(ROW_SELECTOR);
    const groups = new Map();
    rows.forEach((row) => {
      const productId = getProductId(row);
      if (!productId) return;
      if (!groups.has(productId)) {
        groups.set(productId, []);
      }
      groups.get(productId).push(row);
    });
    return groups;
  }

  /**
   * Create the "Fill All Variants" button element.
   */
  function createFillButton(productId) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(BUTTON_MARKER, 'true');
    btn.textContent = '\u2B07 Fill All Variants';
    btn.style.cssText = [
      'display: block',
      'margin-top: 6px',
      'padding: 3px 8px',
      'font-size: 12px',
      'background: #f1f1f1',
      'border: 1px solid #ccc',
      'border-radius: 4px',
      'cursor: pointer',
      'color: #333',
    ].join(';');

    btn.addEventListener('mouseenter', () => {
      btn.style.background = '#e0e0e0';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.background = '#f1f1f1';
    });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Re-query rows fresh at click time to avoid stale React DOM references
      const allRows = document.querySelectorAll(ROW_SELECTOR);
      const productRows = Array.from(allRows).filter(
        (row) => getProductId(row) === productId
      );
      if (productRows.length < 2) return;

      const firstRow = productRows[0];
      const quantityInput = getQuantityInput(firstRow);
      const costInput = getCostInput(firstRow);

      const quantity = quantityInput ? quantityInput.value : '';
      const cost = costInput ? costInput.value : '';

      for (let i = 1; i < productRows.length; i++) {
        const rowQty = getQuantityInput(productRows[i]);
        const rowCost = getCostInput(productRows[i]);
        if (rowQty && quantity) setReactInputValue(rowQty, quantity);
        if (rowCost && cost) setReactInputValue(rowCost, cost);
      }

      // Flash feedback
      const originalText = btn.textContent;
      btn.textContent = '\u2705 Done!';
      btn.style.background = '#d4edda';
      btn.style.borderColor = '#28a745';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.background = '#f1f1f1';
        btn.style.borderColor = '#ccc';
      }, 1200);
    });

    return btn;
  }

  /**
   * Scan the table, group rows by product, and inject buttons.
   */
  function injectButtons() {
    const groups = groupRowsByProduct();
    groups.forEach((rows) => {
      if (rows.length < 2) return;

      const firstRow = rows[0];
      const productCell = firstRow.querySelector(PRODUCT_CELL_SELECTOR);
      if (!productCell) return;

      // Don't add duplicate buttons
      if (productCell.querySelector(`[${BUTTON_MARKER}]`)) return;

      const btn = createFillButton(getProductId(rows[0]));
      productCell.appendChild(btn);
    });
  }

  /**
   * Check if the current URL is a PO creation/edit page.
   */
  function isPOPage() {
    return /\/purchase_orders\/(new|\d+)/.test(location.pathname);
  }

  /**
   * Observe the page for table changes and inject buttons.
   * Uses debouncing so we inject AFTER React finishes rendering,
   * not during its reconciliation cycle.
   * Watches for SPA navigation since Shopify doesn't do full page reloads.
   */
  function init() {
    let debounceTimer = null;
    let observer = null;

    function debouncedInject() {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(injectButtons, 300);
    }

    function startObserver() {
      if (observer) return;
      observer = new MutationObserver(debouncedInject);
      observer.observe(document.body, { childList: true, subtree: true });
      debouncedInject();
    }

    function stopObserver() {
      if (!observer) return;
      observer.disconnect();
      observer = null;
      clearTimeout(debounceTimer);
    }

    function checkURL() {
      if (isPOPage()) {
        startObserver();
      } else {
        stopObserver();
      }
    }

    // Intercept pushState/replaceState to detect SPA navigation
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function () {
        const result = original.apply(this, arguments);
        checkURL();
        return result;
      };
    }
    window.addEventListener('popstate', checkURL);

    checkURL();
  }

  init();
})();
