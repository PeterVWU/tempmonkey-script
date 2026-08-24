// ==UserScript==
// @name         QC Order to ShipStation
// @namespace    vapordna-qc-shipstation
// @version      2.1.0
// @description  Finds the QC order in ShipStation Scan and verifies all its items.
// @match        https://vapordna.limitlessdigitaltech.com/inventory/order*
// @match        https://ship14.shipstation.com/scan*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    const MESSAGE_KEY = 'qc-order-message';
    const MAX_MESSAGE_AGE_MS = 2 * 60 * 1000;
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
            '#scan-search-box',
            15 * 1000,
            signal,
        );

        setReactInputValue(input, orderNumber);
        input.focus();

        // The Scan page's Find Shipment control is type="button" and has its
        // own React click handler, so click that specific adjacent control.
        await delay(100);
        const form = input.closest('form');
        const searchButton = form?.querySelector('button[type="button"]');
        if (searchButton) {
            searchButton.click();
        } else {
            throw new Error('ShipStation Find Shipment button was not found.');
        }

        log('Submitted order to Scan', orderNumber);

        // Do not use a generic delay here: the old shipment can remain visible
        // while ShipStation loads the new one. Wait for the exact order header.
        await waitForTextButton(orderNumber, null, 20 * 1000, signal);
        const verifyAllButton = await waitForTextButton(
            'Verify All',
            '#verify-item-list',
            15 * 1000,
            signal,
        );

        await delay(100);
        if (signal?.aborted) {
            throw new DOMException('Search superseded.', 'AbortError');
        }

        verifyAllButton.click();
        log('Clicked Verify All for', orderNumber);
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

    function findTextButton(text, rootSelector) {
        const root = rootSelector ? document.querySelector(rootSelector) : document;
        if (!root) return null;

        const expected = text.trim().toLowerCase();
        return [...root.querySelectorAll('button')].find((button) => {
            return !button.disabled && button.textContent.trim().toLowerCase() === expected;
        }) ?? null;
    }

    function waitForTextButton(text, rootSelector, timeoutMs, signal) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new DOMException('Search superseded.', 'AbortError'));
                return;
            }

            const existing = findTextButton(text, rootSelector);
            if (existing) {
                resolve(existing);
                return;
            }

            const observer = new MutationObserver(() => {
                const button = findTextButton(text, rootSelector);
                if (!button) return;

                cleanup();
                resolve(button);
            });

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Timed out waiting for button: ${text}.`));
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
