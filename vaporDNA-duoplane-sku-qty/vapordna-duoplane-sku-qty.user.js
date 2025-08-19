// ==UserScript==
// @name         VaporDNA Duoplane SKU Inventory Display
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Display Shopify inventory levels for VaporDNA products on Duoplane purchase orders
// @author       You
// @match        https://app.duoplane.com/purchase_orders/*
// @connect      vapordna9686.myshopify.com
// @connect      *.myshopify.com
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(function () {
    'use strict';

    // Configuration - Update these values with your Shopify store details
    const SHOPIFY_CONFIG = {
        store: 'vapordna9686.myshopify.com', // Replace with your store URL (without https://)
        accessToken: 'SHOPIY_ACCESS_CODE', // Replace with your access token
        graphqlEndpoint: function () {
            return `https://${this.store}/admin/api/unstable/graphql.json`;
        }
    };

    // Global variables for summary tracking
    let lowStockSummary = null;
    let lowStockItems = [];

    // Check if we're on a purchase order page and it's for VaporDNA
    function shouldRunScript() {
        // Check URL pattern
        const urlPattern = /^https:\/\/app\.duoplane\.com\/purchase_orders\/\d+/;
        if (!urlPattern.test(window.location.href)) {
            return false;
        }

        // Check if vendor is VaporDNA
        const subheading = document.querySelector('.subheading');
        if (!subheading || !subheading.textContent.includes('VaporDNA')) {
            return false;
        }

        return true;
    }

    // Create summary section for low stock items
    function createLowStockSummary() {
        const purchaseOrderItems = document.querySelector('.purchase_order_items');
        if (!purchaseOrderItems) {
            return null;
        }

        // Create summary container
        const summaryContainer = document.createElement('div');
        summaryContainer.id = 'low-stock-summary';
        summaryContainer.style.cssText = `
            background-color: #f8f9fa;
            border: 1px solid #dee2e6;
            border-radius: 8px;
            padding: 15px;
            margin-bottom: 20px;
            font-family: Arial, sans-serif;
        `;

        // Create title
        const title = document.createElement('h3');
        title.textContent = 'Items with Low or No Stock';
        title.style.cssText = `
            margin: 0 0 15px 0;
            color: #dc3545;
            font-size: 18px;
            font-weight: bold;
        `;

        // Create items container
        const itemsContainer = document.createElement('div');
        itemsContainer.id = 'low-stock-items';
        itemsContainer.style.cssText = `
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            min-height: 20px;
        `;

        // Create loading message
        const loadingMessage = document.createElement('div');
        loadingMessage.id = 'summary-loading';
        loadingMessage.textContent = 'Checking inventory levels...';
        loadingMessage.style.cssText = `
            color: #6c757d;
            font-style: italic;
        `;

        summaryContainer.appendChild(title);
        summaryContainer.appendChild(itemsContainer);
        summaryContainer.appendChild(loadingMessage);

        // Insert before the purchase order items table
        purchaseOrderItems.parentNode.insertBefore(summaryContainer, purchaseOrderItems);

        return {
            container: summaryContainer,
            itemsContainer: itemsContainer,
            loadingMessage: loadingMessage
        };
    }

    // Add item to low stock summary
    function addToLowStockSummary(product, inventory) {
        if (!lowStockSummary) return;

        const isLowStock = inventory <= 0 || inventory < product.orderedQuantity;
        if (!isLowStock) return;

        // Create item element
        const itemElement = document.createElement('div');
        itemElement.style.cssText = `
            display: inline-block;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
            cursor: pointer;
            ${inventory <= 0 ?
                'background-color: #dc3545; color: white;' :
                'background-color: #ffc107; color: #212529;'
            }
        `;

        itemElement.innerHTML = `
            <div style="font-weight: bold;">${product.vendorSku}</div>
            <div style="font-size: 10px; margin-top: 2px;">
                Stock: ${inventory} | Ordered: ${product.orderedQuantity}
            </div>
        `;

        // Add hover effect
        itemElement.addEventListener('mouseenter', () => {
            itemElement.style.transform = 'scale(1.05)';
            itemElement.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
        });

        itemElement.addEventListener('mouseleave', () => {
            itemElement.style.transform = 'scale(1)';
            itemElement.style.boxShadow = 'none';
        });

        // Add click handler to scroll to item
        itemElement.addEventListener('click', () => {
            if (product.row) {
                product.row.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center'
                });

                // Highlight the row briefly
                const originalBackground = product.row.style.backgroundColor;
                product.row.style.backgroundColor = '#fff3cd';
                product.row.style.transition = 'background-color 0.3s ease';

                setTimeout(() => {
                    product.row.style.backgroundColor = originalBackground;
                }, 2000);
            }
        });

        lowStockItems.push(itemElement);
        lowStockSummary.itemsContainer.appendChild(itemElement);
    }

    // Update summary completion
    function updateSummaryCompletion() {
        if (!lowStockSummary) return;

        // Remove loading message
        if (lowStockSummary.loadingMessage) {
            lowStockSummary.loadingMessage.remove();
        }

        // Show message if no low stock items
        if (lowStockItems.length === 0) {
            const noIssuesMessage = document.createElement('div');
            noIssuesMessage.textContent = '✅ All items have sufficient stock!';
            noIssuesMessage.style.cssText = `
                color: #28a745;
                font-weight: bold;
                padding: 10px;
            `;
            lowStockSummary.itemsContainer.appendChild(noIssuesMessage);
        } else {
            // Add count to title
            const title = lowStockSummary.container.querySelector('h3');
            title.textContent = `Items with Low or No Stock (${lowStockItems.length} items)`;
        }
    }

    // Extract vendor SKUs from the product table
    function extractProductData() {
        const products = [];
        const purchaseOrderItems = document.querySelector('.purchase_order_items');

        if (!purchaseOrderItems) {
            console.log('Purchase order items table not found');
            return products;
        }

        const productRows = purchaseOrderItems.querySelectorAll('tbody[data-order-item-id]');
        console.log("productRows", productRows)

        productRows.forEach(row => {
            const orderItemId = row.getAttribute('data-order-item-id');

            // Find vendor SKU using text content search
            const allDivs = row.querySelectorAll('div');
            let vendorSku = null;
            let targetRow = null;

            for (let div of allDivs) {
                if (div.textContent.includes('Vendor SKU:')) {
                    const skuText = div.textContent.trim();
                    vendorSku = skuText.replace('Vendor SKU:', '').trim();
                    targetRow = row.querySelector('tr:first-child td[data-col-title="Item name"]');
                    break;
                }
            }

            // Extract ordered quantity
            let orderedQuantity = 0;
            const quantityElement = row.querySelector('.highlight_quantity strong');
            if (quantityElement) {
                orderedQuantity = parseInt(quantityElement.textContent.trim()) || 0;
            }

            if (vendorSku && targetRow) {
                products.push({
                    orderItemId,
                    vendorSku,
                    orderedQuantity,
                    targetElement: targetRow,
                    row: row
                });
                console.log(`Found product: ${vendorSku} (ordered: ${orderedQuantity}) for order item ${orderItemId}`);
            }
        });

        return products;
    }

    // GraphQL query to get product variants and inventory by SKU
    function buildInventoryQuery(sku) {
        return {
            query: `
                query getProductVariantsBySku($query: String!) {
                    productVariants(first: 10, query: $query) {
                        nodes {
                            id
                            title
                            sku
                            inventoryItem {
                                id
                                tracked
                                inventoryLevels(first: 250) {
                                    edges {
                                        node {
                                            id
                                            available
                                            location {
                                                id
                                                name
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            `,
            variables: {
                query: `sku:${sku}`
            }
        };
    }

    // Make GraphQL request to Shopify
    function queryShopifyInventory(sku) {
        return new Promise((resolve, reject) => {
            const queryData = buildInventoryQuery(sku);

            GM_xmlhttpRequest({
                method: 'POST',
                url: SHOPIFY_CONFIG.graphqlEndpoint(),
                headers: {
                    'Content-Type': 'application/json',
                    'X-Shopify-Access-Token': SHOPIFY_CONFIG.accessToken
                },
                data: JSON.stringify(queryData),
                onload: function (response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.errors) {
                            console.error('GraphQL errors:', data.errors);
                            reject(new Error('GraphQL query failed'));
                            return;
                        }
                        resolve(data.data);
                    } catch (error) {
                        console.error('Failed to parse response:', error);
                        reject(error);
                    }
                },
                onerror: function (error) {
                    console.error('Request failed:', error);
                    reject(error);
                }
            });
        });
    }

    // Calculate total inventory across all locations
    function calculateTotalInventory(productData) {
        if (!productData.productVariants || !productData.productVariants.nodes) {
            return 0;
        }

        let totalInventory = 0;

        productData.productVariants.nodes.forEach(variant => {
            if (variant.inventoryItem && variant.inventoryItem.tracked) {
                variant.inventoryItem.inventoryLevels.edges.forEach(levelEdge => {
                    const level = levelEdge.node;
                    totalInventory += level.available || 0;
                });
            }
        });

        return totalInventory;
    }

    // Create and insert inventory display element
    function displayInventory(product, inventory) {
        // Determine background color based on inventory levels
        let backgroundColor;
        let textColor = 'white';

        if (inventory <= 0) {
            // Red for 0 or negative stock
            backgroundColor = '#dc3545';
        } else if (inventory < product.orderedQuantity) {
            // Yellow if stock is less than ordered quantity
            backgroundColor = '#ffc107';
            textColor = '#212529'; // Dark text for better contrast on yellow
        } else {
            // Green if stock is sufficient
            backgroundColor = '#28a745';
        }

        // Create inventory display element
        const inventoryElement = document.createElement('div');
        inventoryElement.style.cssText = `
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 12px;
            margin-left: 10px;
            color: ${textColor};
            background-color: ${backgroundColor};
        `;
        inventoryElement.textContent = `Stock: ${inventory}`;
        inventoryElement.title = `Available: ${inventory} | Ordered: ${product.orderedQuantity} | Total inventory across all locations`;

        // Insert into the product name cell
        if (product.targetElement) {
            product.targetElement.appendChild(inventoryElement);
        }
    }

    // Show loading indicator
    function showLoadingIndicator(product) {
        const loadingElement = document.createElement('div');
        loadingElement.style.cssText = `
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            margin-left: 10px;
            background-color: #6c757d;
            color: white;
        `;
        loadingElement.textContent = 'Loading inventory...';
        loadingElement.className = 'inventory-loading';

        if (product.targetElement) {
            product.targetElement.appendChild(loadingElement);
        }
    }

    // Remove loading indicator
    function removeLoadingIndicator(product) {
        const loadingElement = product.targetElement.querySelector('.inventory-loading');
        if (loadingElement) {
            loadingElement.remove();
        }
    }

    // Show error indicator
    function showErrorIndicator(product, error) {
        const errorElement = document.createElement('div');
        errorElement.style.cssText = `
            display: inline-block;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            margin-left: 10px;
            background-color: #ffc107;
            color: #212529;
        `;
        errorElement.textContent = 'Inventory: Error';
        errorElement.title = `Failed to fetch inventory: ${error.message}`;

        if (product.targetElement) {
            product.targetElement.appendChild(errorElement);
        }
    }

    // Process all products and fetch their inventory
    async function processProducts(products) {
        console.log(`Processing ${products.length} products for inventory data`);

        for (const product of products) {
            showLoadingIndicator(product);

            try {
                console.log(`Fetching inventory for SKU: ${product.vendorSku}`);
                const inventoryData = await queryShopifyInventory(product.vendorSku);
                const totalInventory = calculateTotalInventory(inventoryData);

                removeLoadingIndicator(product);
                displayInventory(product, totalInventory);

                console.log(`SKU ${product.vendorSku}: ${totalInventory} units available`);

                // Add small delay to avoid overwhelming the API
                await new Promise(resolve => setTimeout(resolve, 100));

                // Check if product is low stock
                if (totalInventory <= 0 || totalInventory < product.orderedQuantity) {
                    addToLowStockSummary(product, totalInventory);
                }

            } catch (error) {
                console.error(`Failed to fetch inventory for SKU ${product.vendorSku}:`, error);
                removeLoadingIndicator(product);
                showErrorIndicator(product, error);
            }
        }

        // Update summary completion
        updateSummaryCompletion();
    }

    // Configuration validation
    function validateConfiguration() {
        if (SHOPIFY_CONFIG.store === 'your-store.myshopify.com' ||
            SHOPIFY_CONFIG.accessToken === 'your-access-token-here') {

            console.warn('⚠️ Shopify configuration not set up. Please update SHOPIFY_CONFIG in the script.');

            // Show notification to user
            const notification = document.createElement('div');
            notification.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background-color: #ffc107;
                color: #212529;
                padding: 15px;
                border-radius: 5px;
                z-index: 10000;
                max-width: 300px;
                font-family: Arial, sans-serif;
                font-size: 14px;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            `;
            notification.innerHTML = `
                <strong>VaporDNA Inventory Script</strong><br>
                Please configure your Shopify store details in the Tampermonkey script.
                <button onclick="this.parentElement.remove()" style="float: right; margin-left: 10px; background: none; border: none; font-size: 18px; cursor: pointer;">&times;</button>
            `;
            document.body.appendChild(notification);

            // Auto-remove notification after 10 seconds
            setTimeout(() => {
                if (notification.parentElement) {
                    notification.remove();
                }
            }, 10000);

            return false;
        }
        return true;
    }

    // Main function
    function main() {
        // Check if we should run on this page
        if (!shouldRunScript()) {
            console.log('Script conditions not met - not running');
            return;
        }

        console.log('VaporDNA Duoplane inventory script starting...');

        // Validate configuration
        if (!validateConfiguration()) {
            return;
        }

        // Reset tracking variables
        lowStockItems = [];

        // Remove existing summary if present
        const existingSummary = document.getElementById('low-stock-summary');
        if (existingSummary) {
            existingSummary.remove();
        }

        // Wait for page to be fully loaded
        const checkTable = () => {
            const products = extractProductData();

            if (products.length === 0) {
                console.log('No products found, retrying in 1 second...');
                setTimeout(checkTable, 1000);
                return;
            }

            console.log(`Found ${products.length} products with vendor SKUs`);
            products.forEach(p => console.log(`- ${p.vendorSku}`));

            // Create low stock summary section
            lowStockSummary = createLowStockSummary();

            // Process all products
            processProducts(products);
        };

        // Start checking for products
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkTable);
        } else {
            setTimeout(checkTable, 500); // Small delay to ensure DOM is ready
        }
    }

    // Run the script
    main();

    // Also run when navigating via AJAX (common in modern web apps)
    let currentUrl = window.location.href;
    const observer = new MutationObserver(() => {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            setTimeout(main, 1000); // Delay to allow new page to load
        }
    });

    observer.observe(document.body, { childList: true, subtree: true });

})(); 