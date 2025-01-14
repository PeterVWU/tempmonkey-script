// ==UserScript==
// @name         Create + Print Label Button Shortcut
// @namespace    http://tampermonkey.net/
// @version      0.1
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
            const buttons = document.querySelectorAll('button');
            const targetButton = Array.from(buttons).find(button =>
                button.textContent.trim() === 'Create + Print Label'
            );

            // Click the button if found
            if (targetButton) {
                targetButton.click();
                // Prevent default 'q' key behavior
                event.preventDefault();
            }
        }
    });
})();