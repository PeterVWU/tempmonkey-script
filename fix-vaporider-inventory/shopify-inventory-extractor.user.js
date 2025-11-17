// ==UserScript==
// @name         Shopify Inventory History Extractor
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Extract on-hand quantities from Shopify inventory history pages for Odoo connector entries
// @author       You
// @match        https://admin.shopify.com/*
// @match        https://*.myshopify.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Storage functions
    const STORAGE_KEY = 'shopify-inventory-data';

    window.saveInventoryData = function(inventoryArray) {
        const storageData = {
            data: inventoryArray,
            timestamp: new Date().toISOString(),
            count: inventoryArray.length
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(storageData));
        console.log(`Saved ${inventoryArray.length} inventory items to localStorage`);
        return storageData;
    };

    window.loadInventoryData = function() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const storageData = JSON.parse(stored);
            console.log(`Loaded ${storageData.count} inventory items from localStorage (saved: ${storageData.timestamp})`);
            return storageData;
        }
        console.log('No inventory data found in localStorage');
        return null;
    };

    window.clearInventoryData = function() {
        localStorage.removeItem(STORAGE_KEY);
        console.log('Cleared inventory data from localStorage');
    };

    window.exportInventoryData = function() {
        const data = window.loadInventoryData();
        if (data) {
            const blob = new Blob([JSON.stringify(data.data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `shopify-inventory-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            console.log('Inventory data exported to file');
        }
    };

    // Main function to process inventory array
    window.processInventoryHistory = async function(inventoryArray) {
        console.log('Starting inventory processing for', inventoryArray.length, 'items');

        const results = [];

        for (let i = 0; i < inventoryArray.length; i++) {
            const item = { ...inventoryArray[i] };
            console.log(`Processing item ${i + 1}/${inventoryArray.length}: ${item.sku}`);

            try {
                const quantity = await processInventoryItem(item);
                item.onhand = quantity;
                results.push(item);
                console.log(`✓ ${item.sku}: ${quantity !== null ? quantity : 'not found'}`);
            } catch (error) {
                console.error(`✗ Error processing ${item.sku}:`, error);
                item.onhand = "";
                results.push(item);
            }
        }

        console.log('Processing complete. Results:', results);

        // Auto-save results to localStorage
        const savedData = window.saveInventoryData(results);
        console.log('Results automatically saved to browser storage');

        return results;
    };

    // Process a single inventory item
    async function processInventoryItem(item) {
        if (!item.inventoryhistoryurl) {
            console.warn(`No URL provided for ${item.sku}`);
            return null;
        }

        // If we're already on the target page, extract directly
        if (window.location.href === item.inventoryhistoryurl) {
            return extractOnHandQuantity();
        }

        // Navigate to the URL and wait for page load
        return new Promise((resolve, reject) => {
            const originalUrl = window.location.href;

            // Set up a listener for when we return to process the page
            const checkInterval = setInterval(() => {
                if (window.location.href === item.inventoryhistoryurl) {
                    clearInterval(checkInterval);

                    // Wait a bit for the page to fully load
                    setTimeout(() => {
                        try {
                            const quantity = extractOnHandQuantity();
                            resolve(quantity);
                        } catch (error) {
                            reject(error);
                        }
                    }, 2000);
                }
            }, 500);

            // Navigate to the URL
            window.location.href = item.inventoryhistoryurl;

            // Timeout after 30 seconds
            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('Timeout waiting for page load'));
            }, 30000);
        });
    }

    // Extract on-hand quantity from the current page
    function extractOnHandQuantity() {
        console.log('Extracting on-hand quantity from current page');

        // Find all table rows
        const rows = document.querySelectorAll('div[role="row"].Polaris-Table-TableRow');
        console.log(`Found ${rows.length} table rows`);

        // Find rows created by "Odoo shopify connector"
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const createdByCell = row.querySelector('div[role="cell"][aria-colindex="3"] .Polaris-Table-TableCell__TableCellContent');

            if (createdByCell && createdByCell.textContent.includes('Odoo shopify connector')) {
                console.log(`Found Odoo connector row at index ${i}`);

                // Get the next row
                const nextRow = rows[i + 1];
                if (nextRow && nextRow.matches('div[role="row"]')) {
                    console.log('Found next row, extracting quantity');

                    // Extract the on-hand quantity from the next row
                    const onHandCell = nextRow.querySelector('div[role="cell"][aria-colindex="7"]');
                    if (onHandCell) {
                        // Look for the final quantity value (not the change amount)
                        const quantityElements = onHandCell.querySelectorAll('div[aria-hidden="true"] span.Polaris-Text--root:not(.Polaris-Text--subdued)');
                        if (quantityElements.length > 0) {
                            const quantity = quantityElements[quantityElements.length - 1].textContent.trim();
                            console.log(`Extracted quantity: ${quantity}`);
                            return quantity;
                        }
                    }
                } else {
                    console.log('No next row found after Odoo connector row');
                }
            }
        }

        console.log('No Odoo connector row found or no quantity extracted');
        return null;
    }

    // Add UI with storage management
    function addInventoryUI() {
        // Only add UI if we're on a Shopify admin page
        if (!window.location.hostname.includes('shopify.com')) {
            return;
        }

        // Create container
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '10px';
        container.style.right = '10px';
        container.style.zIndex = '9999';
        container.style.backgroundColor = 'white';
        container.style.border = '2px solid #007cba';
        container.style.borderRadius = '8px';
        container.style.padding = '15px';
        container.style.fontFamily = 'Arial, sans-serif';
        container.style.fontSize = '14px';
        container.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        container.style.minWidth = '250px';

        // Title
        const title = document.createElement('h3');
        title.textContent = 'Inventory Extractor';
        title.style.margin = '0 0 10px 0';
        title.style.color = '#007cba';
        container.appendChild(title);

        // Status display
        const statusDiv = document.createElement('div');
        statusDiv.style.marginBottom = '10px';
        statusDiv.style.padding = '8px';
        statusDiv.style.backgroundColor = '#f8f9fa';
        statusDiv.style.borderRadius = '4px';
        statusDiv.style.fontSize = '12px';
        updateStorageStatus(statusDiv);
        container.appendChild(statusDiv);

        // Button styles
        const buttonStyle = {
            padding: '8px 12px',
            margin: '3px',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            minWidth: '100px'
        };

        // Test button
        const testButton = document.createElement('button');
        testButton.textContent = 'Test Extractor';
        Object.assign(testButton.style, buttonStyle);
        testButton.style.backgroundColor = '#28a745';
        testButton.style.color = 'white';
        testButton.onclick = function() {
            const testArray = [{
                sku: "test-sku-1",
                inventoryhistoryurl: window.location.href,
                onhand: ""
            }];

            window.processInventoryHistory(testArray).then(results => {
                updateStorageStatus(statusDiv);
                alert(`Test completed. Check console for details.`);
            });
        };
        container.appendChild(testButton);

        // Load data button
        const loadButton = document.createElement('button');
        loadButton.textContent = 'Load Data';
        Object.assign(loadButton.style, buttonStyle);
        loadButton.style.backgroundColor = '#007cba';
        loadButton.style.color = 'white';
        loadButton.onclick = function() {
            const data = window.loadInventoryData();
            if (data) {
                console.log('Loaded data:', data.data);
                alert(`Loaded ${data.count} items from ${data.timestamp}`);
            } else {
                alert('No data found in storage');
            }
        };
        container.appendChild(loadButton);

        // Export button
        const exportButton = document.createElement('button');
        exportButton.textContent = 'Export Data';
        Object.assign(exportButton.style, buttonStyle);
        exportButton.style.backgroundColor = '#ffc107';
        exportButton.style.color = 'black';
        exportButton.onclick = function() {
            window.exportInventoryData();
        };
        container.appendChild(exportButton);

        // Clear button
        const clearButton = document.createElement('button');
        clearButton.textContent = 'Clear Storage';
        Object.assign(clearButton.style, buttonStyle);
        clearButton.style.backgroundColor = '#dc3545';
        clearButton.style.color = 'white';
        clearButton.onclick = function() {
            if (confirm('Are you sure you want to clear all stored inventory data?')) {
                window.clearInventoryData();
                updateStorageStatus(statusDiv);
                alert('Storage cleared');
            }
        };
        container.appendChild(clearButton);

        // Toggle button to collapse/expand
        const toggleButton = document.createElement('button');
        toggleButton.textContent = '−';
        toggleButton.style.position = 'absolute';
        toggleButton.style.top = '5px';
        toggleButton.style.right = '5px';
        toggleButton.style.width = '20px';
        toggleButton.style.height = '20px';
        toggleButton.style.border = 'none';
        toggleButton.style.backgroundColor = '#007cba';
        toggleButton.style.color = 'white';
        toggleButton.style.borderRadius = '50%';
        toggleButton.style.cursor = 'pointer';
        toggleButton.style.fontSize = '12px';

        let collapsed = false;
        toggleButton.onclick = function() {
            collapsed = !collapsed;
            if (collapsed) {
                container.style.height = '35px';
                container.style.overflow = 'hidden';
                toggleButton.textContent = '+';
            } else {
                container.style.height = 'auto';
                container.style.overflow = 'visible';
                toggleButton.textContent = '−';
            }
        };
        container.appendChild(toggleButton);

        document.body.appendChild(container);
    }

    // Update storage status display
    function updateStorageStatus(statusDiv) {
        const data = window.loadInventoryData();
        if (data) {
            const date = new Date(data.timestamp).toLocaleDateString();
            const time = new Date(data.timestamp).toLocaleTimeString();
            statusDiv.innerHTML = `<strong>Storage:</strong> ${data.count} items<br><small>Saved: ${date} ${time}</small>`;
            statusDiv.style.color = '#28a745';
        } else {
            statusDiv.innerHTML = '<strong>Storage:</strong> Empty';
            statusDiv.style.color = '#6c757d';
        }
    }

    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addInventoryUI);
    } else {
        addInventoryUI();
    }

    console.log('Shopify Inventory History Extractor loaded');
})();