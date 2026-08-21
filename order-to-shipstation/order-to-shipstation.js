// ==UserScript==
// @name         QC Order to ShipStation
// @namespace    vapordna-qc-shipstation
// @version      1.0.2
// @description  Sends the open QC order number to ShipStation, searches for it, and opens the exact result.
// @match        https://vapordna.limitlessdigitaltech.com/inventory/order*
// @match        https://ship14.shipstation.com/orders*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    const MESSAGE_KEY = 'qc-order-message';
    const MAX_MESSAGE_AGE_MS = 2 * 60 * 1000;
    const RESULT_TIMEOUT_MS = 20 * 1000;
    const log = (...values) => console.log('[QC → ShipStation]', ...values);

    if (location.hostname === 'vapordna.limitlessdigitaltech.com') {
        publishQcOrder();
        return;
    }

    if (location.hostname === 'ship14.shipstation.com') {
        startShipStationReceiver();
    }

    function normalizeOrderNumber(value) {
        const orderNumber = String(value ?? '').trim().replace(/^#\s*/, '');
        return /^[A-Za-z0-9-]+$/.test(orderNumber) ? orderNumber : null;
    }

    function publishQcOrder() {
        // The order detail page displays its primary order number in this H1.
        const heading = document.querySelector('.wl-detail h1.wl-mono');
        const orderNumber = normalizeOrderNumber(heading?.textContent);

        if (!orderNumber) {
            log('No valid order heading found; nothing was sent.');
            return;
        }

        const message = {
            orderNumber,
            sentAt: Date.now(),
            sourceUrl: location.href,
        };

        GM_setValue(MESSAGE_KEY, message);
        log('Sent order', orderNumber);
    }

    function startShipStationReceiver() {
        let lastHandledSentAt = 0;
        let activeSearchController = null;

        const handleMessage = (message) => {
            if (!message || typeof message.sentAt !== 'number') return;
            if (message.sentAt <= lastHandledSentAt) return;
            if (Date.now() - message.sentAt > MAX_MESSAGE_AGE_MS) {
                log('Ignored an old order message.');
                return;
            }

            const orderNumber = normalizeOrderNumber(message.orderNumber);
            if (!orderNumber) return;

            lastHandledSentAt = message.sentAt;
            activeSearchController?.abort();
            activeSearchController = new AbortController();

            searchAndOpenOrder(orderNumber, activeSearchController.signal).catch((error) => {
                if (error.name !== 'AbortError') {
                    console.error('[QC → ShipStation]', error);
                }
            });
        };

        // Receive new orders while the ShipStation tab is already open.
        GM_addValueChangeListener(MESSAGE_KEY, (_key, _oldValue, newValue) => {
            handleMessage(newValue);
        });

        // Also recover a recent message if ShipStation loaded just after QC.
        handleMessage(GM_getValue(MESSAGE_KEY, null));
        log('Ready to receive QC orders.');
    }

    async function searchAndOpenOrder(orderNumber, signal) {
        const input = await waitForElement(
            'input[name="searchTerm"][placeholder="Search Orders..."]',
            15 * 1000,
            signal,
        );

        setReactInputValue(input, orderNumber);
        input.focus();

        // ShipStation's search control is type="button" and has its own React
        // click handler, so submitting the surrounding form does not search.
        await delay(100);
        const form = input.closest('form');
        const searchButton = form?.querySelector('button[type="button"]');
        if (searchButton) {
            searchButton.click();
        } else if (form?.requestSubmit) {
            form.requestSubmit();
        } else {
            throw new Error('ShipStation search button was not found.');
        }

        log('Searching for', orderNumber);

        const resultButton = await waitForExactOrderResult(
            orderNumber,
            RESULT_TIMEOUT_MS,
            signal,
        );

        resultButton.scrollIntoView({ block: 'center', behavior: 'smooth' });
        resultButton.click();
        log('Opened order', orderNumber);
    }

    function setReactInputValue(input, value) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value',
        )?.set;

        if (nativeSetter) {
            nativeSetter.call(input, value);
        } else {
            input.value = value;
        }

        input.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: value,
        }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function findExactOrderResult(orderNumber) {
        const expected = orderNumber.toLowerCase();
        const buttons = document.querySelectorAll(
            '[data-column="order-number"][data-row-id] button',
        );

        return [...buttons].find((button) => {
            return normalizeOrderNumber(button.textContent)?.toLowerCase() === expected;
        }) ?? null;
    }

    function waitForExactOrderResult(orderNumber, timeoutMs, signal) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new DOMException('Search superseded.', 'AbortError'));
                return;
            }

            const existing = findExactOrderResult(orderNumber);
            if (existing) {
                resolve(existing);
                return;
            }

            const observer = new MutationObserver(() => {
                const result = findExactOrderResult(orderNumber);
                if (!result) return;

                cleanup();
                resolve(result);
            });

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Timed out waiting for order ${orderNumber}.`));
            }, timeoutMs);

            const handleAbort = () => {
                cleanup();
                reject(new DOMException('Search superseded.', 'AbortError'));
            };

            const cleanup = () => {
                clearTimeout(timeout);
                observer.disconnect();
                signal?.removeEventListener('abort', handleAbort);
            };

            observer.observe(document.body, { childList: true, subtree: true });
            signal?.addEventListener('abort', handleAbort, { once: true });
        });
    }

    function waitForElement(selector, timeoutMs, signal) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new DOMException('Search superseded.', 'AbortError'));
                return;
            }

            const existing = document.querySelector(selector);
            if (existing) {
                resolve(existing);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (!element) return;

                cleanup();
                resolve(element);
            });

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Timed out waiting for ${selector}.`));
            }, timeoutMs);

            const handleAbort = () => {
                cleanup();
                reject(new DOMException('Search superseded.', 'AbortError'));
            };

            const cleanup = () => {
                clearTimeout(timeout);
                observer.disconnect();
                signal?.removeEventListener('abort', handleAbort);
            };

            observer.observe(document.body, { childList: true, subtree: true });
            signal?.addEventListener('abort', handleAbort, { once: true });
        });
    }

    function delay(milliseconds) {
        return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }
})();
