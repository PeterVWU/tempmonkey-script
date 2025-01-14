// ==UserScript==
// @name         Whitelist Utah Customers
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Automate adding addresses to whitelist
// @author       Your name
// @match        https://a.vapewholesaleusa.com/admin_SqwOPu4tsRle/amasty_shiprestriction/rule/edit/id/327/key/5ebd4990fe227546989ea1b871d96104f74b7988da83f9bae3e111116354bea3/
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Helper function to create delays
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    // Function to click the Add button
    async function clickAddButton() {
        const addButton = document.querySelector('.rule-param-add');
        if (addButton) {
            addButton.click();
            await delay(1000); // Wait after clicking
        }
    }

    // Function to select address option from dropdown
    async function selectAddressOption() {
        const select = document.querySelector('#conditions__1--2__new_child');
        if (select) {
            // Set value to the address condition option
            select.value = 'Amasty\\Conditions\\Model\\Rule\\Condition\\Address|shipping_address_line';
            // Trigger change event
            select.dispatchEvent(new Event('change'));
            await delay(1000); // Wait after selection
        }
    }

    async function fillAddress(address, i) {
        // const selector = document.evaluate("//ul//li//ul//a[contains(., '...')]", document, null, XPathResult.ANY_TYPE, null)
        // const dotlink = selector.iterateNext();
        // dotlink.click();
        const input = document.querySelector(`#conditions__1--2--${1 + i}__value`);
        await input.setValue(address);
        await input.dispatchEvent(new Event('change'));
        await delay(1000); // Wait after filling address
    }

    // Add button to trigger the automation
    async function addAutomationButton() {
        const button = document.createElement('button');
        button.textContent = 'Add Address Rule';
        button.style.position = 'fixed';
        button.style.top = '10px';
        button.style.right = '10px';
        button.style.zIndex = '9999';

        button.addEventListener('click', async () => {
            // Using for...of instead of forEach for sequential execution
            for (let i = 0; i < addresslist.length; i++) {
                let address = addresslist[i];
                address = address.slice(0, address.indexOf('\n'))
                await clickAddButton();
                await selectAddressOption();
                await fillAddress(address, i);
                await delay(500); // Additional delay between iterations
            }
        });

        document.body.appendChild(button);
    }

    // Initialize
    window.addEventListener('load', async () => {
        await addAutomationButton();
    });

    let addresslist = [
        "42 N 500 W Apt 701",
        "3857 s 700 w apt 21",
        "10608 N 5370 W",
        "163 West 1700 South",
        "6011 North 2250 East",
    ]
})();
