// ==UserScript==
// @name         QC Order to ShipStation
// @namespace    vapordna-qc-shipstation
// @version      2.7.0
// @description  Finds a QC order in ShipStation Orders or Scan and opens it for processing.
// @match        https://vapordna.limitlessdigitaltech.com/inventory/order*
// @match        https://nv02.limitlessdigitaltech.com/inventory/order*
// @match        https://*.shipstation.com/scan*
// @match        https://*.shipstation.com/orders*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// ==/UserScript==

(() => {
    'use strict';

    const MESSAGE_KEY = 'qc-order-message';
    const LAST_HANDLED_ORDER_KEY = 'qc-last-handled-order';
    const MAX_MESSAGE_AGE_MS = 2 * 60 * 1000;
    const log = (...values) => console.log('[QC → ShipStation]', ...values);

    const qcHostnames = new Set([
        'vapordna.limitlessdigitaltech.com',
        'nv02.limitlessdigitaltech.com',
    ]);

    if (qcHostnames.has(location.hostname)) {
        publishQcOrder();
        return;
    }

    if (location.hostname.endsWith('.shipstation.com')) {
        startShipStationReceiver();
    }

    function normalizeOrderNumber(value) {
        const orderNumber = String(value ?? '').trim().replace(/^#\s*/, '');
        return /^[A-Za-z0-9-]+$/.test(orderNumber) ? orderNumber : null;
    }

    function publishQcOrder() {
        // QC pages expose the number on their copy control, while order detail
        // pages display it in an H1 (with different wrappers on each site).
        const copyOrderButton = document.querySelector('[data-copy-order-number]');
        const heading = document.querySelector('.wl-detail h1.wl-mono')
            ?? document.querySelector('h1.wl-mono');
        const orderNumber = normalizeOrderNumber(
            copyOrderButton?.getAttribute('data-copy-order-number')
                ?? heading?.textContent,
        );

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
            const lastHandledOrder = normalizeOrderNumber(
                GM_getValue(LAST_HANDLED_ORDER_KEY, null),
            );
            if (orderNumber === lastHandledOrder) {
                log('Ignored duplicate order', orderNumber);
                return;
            }

            // Persist before starting any UI work so refreshes and other
            // ShipStation tabs cannot restart automation for the same order.
            GM_setValue(LAST_HANDLED_ORDER_KEY, orderNumber);
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
        if (location.pathname.startsWith('/orders')) {
            await searchAndOpenOrderFromOrdersPage(orderNumber, signal);
            return;
        }

        await searchAndOpenOrderFromScanPage(orderNumber, signal);
    }

    async function searchAndOpenOrderFromOrdersPage(orderNumber, signal) {
        const input = await waitForElement(
            'input[name="searchTerm"][placeholder="Search Orders..."]',
            15 * 1000,
            signal,
        );

        setReactInputValue(input, orderNumber);
        input.focus();

        // Orders uses a type="button" search control with its own React click
        // handler, so submitting the surrounding form does not start a search.
        const form = input.closest('form');
        const searchButton = form?.querySelector('button[type="button"]');
        if (!searchButton) {
            throw new Error('ShipStation Orders search button was not found.');
        }

        await delay(100);
        searchButton.click();
        log('Submitted order to Orders', orderNumber);

        const orderButton = await waitForOrderResult(orderNumber, 60 * 1000, signal);
        await delay(100);
        if (signal?.aborted) {
            throw new DOMException('Search superseded.', 'AbortError');
        }

        orderButton.click();
        log('Opened order from Orders', orderNumber);

        await waitForScaleButton(30 * 1000, signal);
        // The order canvas animates and may replace its controls once while
        // loading. Let it settle, then resolve the live Scale button again.
        await delay(500);
        if (signal?.aborted) {
            throw new DOMException('Search superseded.', 'AbortError');
        }

        const scaleButton = findScaleButton();
        if (!scaleButton) {
            throw new Error('ShipStation Scale button disappeared before clicking.');
        }

        scaleButton.click();
        log('Clicked Scale for', orderNumber);
    }

    async function searchAndOpenOrderFromScanPage(orderNumber, signal) {
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

    function findOrderResult(orderNumber) {
        return [...document.querySelectorAll('[data-column="order-number"] button')]
            .find((button) => {
                return !button.disabled
                    && normalizeOrderNumber(button.textContent) === orderNumber;
            }) ?? null;
    }

    function waitForOrderResult(orderNumber, timeoutMs, signal) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new DOMException('Search superseded.', 'AbortError'));
                return;
            }

            const existing = findOrderResult(orderNumber);
            if (existing) {
                resolve(existing);
                return;
            }

            const observer = new MutationObserver(() => {
                const button = findOrderResult(orderNumber);
                if (!button) return;

                cleanup();
                resolve(button);
            });

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error(`Timed out waiting for order result: ${orderNumber}.`));
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

            observer.observe(document.body, {
                childList: true,
                characterData: true,
                subtree: true,
            });
            signal?.addEventListener('abort', handleAbort, { once: true });
        });
    }

    function findScaleButton() {
        return [...document.querySelectorAll('button[class*="scale-button-"]')]
            .find((button) => {
                return !button.disabled
                    && button.isConnected
                    && button.getClientRects().length > 0
                    && button.textContent.trim().toLowerCase() === 'scale'
                    && button.querySelector('svg[data-icon="weight-scale"]');
            }) ?? null;
    }

    function waitForScaleButton(timeoutMs, signal) {
        return new Promise((resolve, reject) => {
            if (signal?.aborted) {
                reject(new DOMException('Search superseded.', 'AbortError'));
                return;
            }

            const existing = findScaleButton();
            if (existing) {
                resolve(existing);
                return;
            }

            const observer = new MutationObserver(() => {
                const button = findScaleButton();
                if (!button) return;

                cleanup();
                resolve(button);
            });

            const timeout = setTimeout(() => {
                cleanup();
                reject(new Error('Timed out waiting for the ShipStation Scale button.'));
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

            observer.observe(document.body, {
                attributes: true,
                childList: true,
                subtree: true,
            });
            signal?.addEventListener('abort', handleAbort, { once: true });
        });
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
