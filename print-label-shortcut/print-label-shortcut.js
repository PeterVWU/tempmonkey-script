// ==UserScript==
// @name         Create + Print Label Button Shortcut
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Press 'Q' to click the Create + Print Label button
// @match        https://ship15.shipstation.com/orders/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    console.log('script starts');

    document.addEventListener('keyup', function (event) {
        // Check if the pressed key is 'q' or 'Q'
        if (event.key.toLowerCase() === 'q') {
            // Find the button by its text content

            let targetButton = null;
            const rateSection = document.querySelector('[aria-label="Rate section"]');

            if (rateSection) {
                // Then, find all button elements within that parent
                const buttons = rateSection.querySelectorAll('button');

                // Look for the button with the exact text
                buttons.forEach(btn => {
                    if (btn.textContent.trim() === "Create + Print Label") {
                        targetButton = btn;
                    }
                });
            }

            // Click the button if found
            if (targetButton) {
                targetButton.click();
                // Prevent default 'q' key behavior
                event.preventDefault();
            }
        }
    });
})();