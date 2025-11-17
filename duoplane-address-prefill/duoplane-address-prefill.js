// ==UserScript==
// @name         Duoplane Address Form Prefill
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Auto-fills shipping address form on Duoplane with address selection
// @author       Peter
// @match        https://app.duoplane.com/purchase_orders/*/shipping_address/edit
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

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
        const h1Element = document.querySelector('h1');
        if (!h1Element) return '';
        const match = h1Element.textContent.match(/Purchase\s+Order\s+([A-Za-z0-9-]+)/i);
        return match ? match[1] : '';
    }

    function showAddressSelector() {
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

    function fillForm(address) {
        const orderNumber = getOrderNumber();

        // Get current last name and append order number
        const lastNameField = document.getElementById('address_last_name');
        const modifiedLastName = `${lastNameField.value} ${orderNumber}`;

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
