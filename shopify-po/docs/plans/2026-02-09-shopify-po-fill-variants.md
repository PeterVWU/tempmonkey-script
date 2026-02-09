# Shopify PO Fill Variants Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a Tampermonkey script that adds a "Fill All Variants" button to Shopify's Purchase Order creation page, allowing users to apply the same quantity and cost to all variants of a product with one click.

**Architecture:** Single Tampermonkey userscript that observes the PO table DOM, groups rows by product ID (extracted from variant hrefs), injects a button on the first row of each multi-variant product group, and copies quantity/cost values using React-compatible input setting.

**Tech Stack:** Vanilla JavaScript, Tampermonkey userscript API, MutationObserver

---

### Task 1: Create the Tampermonkey script skeleton

**Files:**
- Create: `shopify-po-fill-variants.user.js`

**Step 1: Write the script with Tampermonkey metadata and entry point**

```javascript
// ==UserScript==
// @name         Shopify PO Fill Variants
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Add "Fill All Variants" button to apply same quantity and cost to all variants of a product on Shopify PO creation page
// @match        https://admin.shopify.com/store/*/purchase_orders/new
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
    const link = row.querySelector('a[href*="/products/"]');
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
    return cell ? cell.querySelector('input') : null;
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
  function createFillButton(productRows) {
    const btn = document.createElement('button');
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

      const btn = createFillButton(rows);
      productCell.appendChild(btn);
    });
  }

  /**
   * Observe the page for table changes and inject buttons.
   */
  function init() {
    // Initial injection (with delay for React render)
    setTimeout(injectButtons, 2000);

    // Re-inject on DOM changes (products added/removed)
    const observer = new MutationObserver(() => {
      injectButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  init();
})();
```

**Step 2: Verify the script installs in Tampermonkey**

- Open Tampermonkey dashboard in browser
- Create new script, paste contents
- Verify it appears in the scripts list and is enabled
- Navigate to a Shopify PO creation page (`purchase_orders/new`)
- Confirm the "Fill All Variants" buttons appear on multi-variant products

**Step 3: Commit**

```bash
git add shopify-po-fill-variants.user.js
git commit -m "feat: add Shopify PO fill variants Tampermonkey script"
```
