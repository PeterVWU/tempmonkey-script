// ==UserScript==
// @name         Duoplane Address Form Prefill
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Auto-fills shipping address form on Duoplane with address selection
// @author       Peter
// @match        https://app.duoplane.com/purchase_orders/*/shipping_address/edit
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Cloudflare Worker proxy URL - update this after deploying your worker
    const PROXY_URL = 'https://duoplane-proxy.info-ba2.workers.dev';

    // Cached original address - captured once when the form loads
    let cachedOriginalAddress = null;

    // Address configuration - add or modify addresses here
    const addresses = [
        {
            label: 'Las Vegas Warehouse',
            company_name: '',
            address_1: '5828 Spring Mountain Rd.',
            address_2: 'Suite 314',
            city: 'Las Vegas',
            province: 'Nevada',
            post_code: '89146',
            country: 'US'
        },
        {
            label: 'VaporDNA Warehouse',
            company_name: '',
            address_1: '160 E Freedom Ave',
            address_2: '',
            city: 'Anaheim',
            province: 'CA',
            post_code: '92801',
            country: 'US'
        },
        // Add more addresses here following the same format
        // Example:
        // {
        //     label: 'NYC Distribution Center',
        //     company_name: 'ABC Corp',
        //     address_1: '123 Main St.',
        //     address_2: 'Floor 2',
        //     city: 'New York',
        //     province: 'New York',
        //     post_code: '10001',
        //     country: 'US'
        // }
    ];

    // Wait for the form to be loaded
    const checkForm = setInterval(() => {
        const form = document.querySelector('form');
        if (form) {
            clearInterval(checkForm);
            showAddressSelector();
        }
    }, 500);

    function getOrderNumber() {
        // Try h1 first (Purchase Order page)
        // const h1Element = document.querySelector('h1');
        // if (h1Element) {
        //     const match = h1Element.textContent.match(/Purchase\s+Order\s+([A-Za-z0-9-]+)/i);
        //     if (match) return match[1];
        // }

        // Try h4 inside .controls.well (Shipping address section)
        const h4Element = document.querySelector('.controls.well h4');
        if (h4Element) {
            const match = h4Element.textContent.match(/Orders?\s+([^:]+):/i);
            if (match) return match[1].trim();
        }

        return '';
    }

    function getPurchaseOrderNumber() {
        const h1Element = document.querySelector('h1');
        if (h1Element) {
            const match = h1Element.textContent.match(/Purchase\s+Order\s+([A-Za-z0-9-]+)/i);
            if (match) return match[1].trim();
        }
        return '';
    }

    function getOriginalAddress() {
        // Read address directly from form input fields
        const getValue = (id) => {
            const el = document.getElementById(id);
            return el ? el.value || null : null;
        };

        const address = {
            first_name: getValue('address_first_name'),
            last_name: getValue('address_last_name'),
            company_name: getValue('address_company_name'),
            address_1: getValue('address_address_1'),
            address_2: getValue('address_address_2'),
            city: getValue('address_city'),
            province: getValue('address_province'),
            post_code: getValue('address_post_code'),
            country: getValue('address_country'),
            phone: getValue('address_phone'),
            email: getValue('address_email')
        };

        console.log('[Duoplane Prefill] Extracted original address:', address);
        return address;
    }

    async function getOrderId(orderNumber) {
        const url = `${PROXY_URL}/orders?order_number=${orderNumber}`;
        console.log('[Duoplane Prefill] Looking up order ID via proxy:', url);

        try {
            const response = await fetch(url);
            const data = await response.json();
            console.log('[Duoplane Prefill] Order lookup response:', data);

            if (data.order_id) {
                console.log('[Duoplane Prefill] Found order_id:', data.order_id);
                return data.order_id;
            }
            return null;
        } catch (error) {
            console.error('[Duoplane Prefill] Error:', error);
            return null;
        }
    }

    const COMMENT_USER = 'reship_original_address';

    async function getComments(orderId) {
        const url = `${PROXY_URL}/orders/${orderId}/comments`;
        console.log('[Duoplane Prefill] Fetching comments:', url);

        try {
            const response = await fetch(url);
            const data = await response.json();
            console.log('[Duoplane Prefill] Comments response:', data);
            return data.comments || [];
        } catch (error) {
            console.error('[Duoplane Prefill] Failed to get comments:', error);
            return [];
        }
    }

    async function saveAddressComment(orderId, addressJson) {
        const commentBody = JSON.stringify({ shipping_address: addressJson }, null, 4);

        // Check for existing comment from our user
        const comments = await getComments(orderId);
        const existingComment = comments.find(c => c.commenter && c.commenter.full_name === COMMENT_USER);

        if (existingComment) {
            // Update existing comment
            console.log('[Duoplane Prefill] Found existing comment, updating:', existingComment.id);
            const url = `${PROXY_URL}/orders/${orderId}/comments/${existingComment.id}`;
            try {
                const response = await fetch(url, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ comment_body: commentBody })
                });
                const data = await response.json();
                console.log('[Duoplane Prefill] Update comment response:', data);
                return data.success === true;
            } catch (error) {
                console.error('[Duoplane Prefill] Failed to update comment:', error);
                return false;
            }
        } else {
            // Create new comment
            console.log('[Duoplane Prefill] No existing comment, creating new one');
            const url = `${PROXY_URL}/orders/${orderId}/comments`;
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ comment_body: commentBody })
                });
                const data = await response.json();
                console.log('[Duoplane Prefill] Create comment response:', data);
                return data.success === true;
            } catch (error) {
                console.error('[Duoplane Prefill] Failed to create comment:', error);
                return false;
            }
        }
    }

    function showNotification(message, isSuccess) {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 4px;
            color: white;
            font-size: 14px;
            z-index: 10001;
            background: ${isSuccess ? '#28a745' : '#dc3545'};
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        `;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    function showAddressSelector() {
        // Capture original address ONCE when page loads
        cachedOriginalAddress = getOriginalAddress();
        console.log('[Duoplane Prefill] Cached original address:', cachedOriginalAddress);

        // Create container for address selector
        const container = document.createElement('div');
        container.id = 'address-selector-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: white;
            padding: 15px;
            border-radius: 6px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            z-index: 10000;
            min-width: 200px;
        `;

        // Create title
        const title = document.createElement('h4');
        title.textContent = 'Shipping Address';
        title.style.cssText = `
            margin: 0 0 10px 0;
            font-size: 14px;
            font-weight: 600;
            color: #333;
        `;
        container.appendChild(title);

        // Create button for each address
        addresses.forEach((address, index) => {
            const button = document.createElement('button');
            button.textContent = address.label;
            button.dataset.addressIndex = index;
            button.style.cssText = `
                display: block;
                width: 100%;
                padding: 10px;
                margin-bottom: 8px;
                background: #007bff;
                color: white;
                border: 2px solid transparent;
                border-radius: 4px;
                font-size: 13px;
                cursor: pointer;
                transition: all 0.2s;
            `;
            button.onclick = () => {
                // Remove active state from all buttons
                container.querySelectorAll('button').forEach(btn => {
                    btn.style.background = '#007bff';
                    btn.style.borderColor = 'transparent';
                });
                // Set active state for clicked button
                button.style.background = '#0056b3';
                button.style.borderColor = '#28a745';
                fillForm(address);
            };
            button.onmouseover = () => {
                if (button.style.borderColor !== 'rgb(40, 167, 69)') {
                    button.style.background = '#0056b3';
                }
            };
            button.onmouseout = () => {
                if (button.style.borderColor !== 'rgb(40, 167, 69)') {
                    button.style.background = '#007bff';
                }
            };
            container.appendChild(button);
        });

        // Add container to page
        document.body.appendChild(container);
    }

    async function fillForm(address) {
        // Use the cached original address (captured when page loaded)
        const originalAddress = cachedOriginalAddress;
        const orderNumber = getOrderNumber();

        console.log('[Duoplane Prefill] Order Number:', orderNumber);
        console.log('[Duoplane Prefill] Selected address:', address.label);

        // Post comment with original address first
        if (!originalAddress || !orderNumber) {
            showNotification('Could not extract address or order number', false);
            return;
        }

        // Look up the order ID from the order number
        const orderId = await getOrderId(orderNumber);
        if (!orderId) {
            showNotification('Failed to find order ID', false);
            return;
        }

        const success = await saveAddressComment(orderId, originalAddress);
        if (!success) {
            showNotification('Failed to save address comment', false);
            return;
        }

        // Only fill the form after comment is successfully posted
        showNotification('Original address saved as comment', true);

        // Get current last name and append purchase order number
        const lastNameField = document.getElementById('address_last_name');
        const purchaseOrderNumber = getPurchaseOrderNumber();
        const modifiedLastName = `${lastNameField.value} ${purchaseOrderNumber}`;
        console.log('[Duoplane Prefill] Purchase Order Number:', purchaseOrderNumber);

        // Map of field IDs to values from selected address
        const fieldValues = {
            'address_last_name': modifiedLastName,
            'address_company_name': address.company_name,
            'address_address_1': address.address_1,
            'address_address_2': address.address_2,
            'address_city': address.city,
            'address_province': address.province,
            'address_post_code': address.post_code,
            'address_country': address.country,
        };

        // Fill each field
        Object.entries(fieldValues).forEach(([id, value]) => {
            const field = document.getElementById(id);
            if (field) {
                field.value = value;
                // Trigger change event to ensure form validation updates
                field.dispatchEvent(new Event('change', { bubbles: true }));
                field.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });
    }
})();
