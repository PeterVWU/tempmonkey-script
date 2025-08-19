// ==UserScript==
// @name         Price Cost Warning Duoplane
// @namespace    http://tampermonkey.net/
// @version      1.0.1
// @description  Show warning when cost is greater then price
// @author       Peter Chen
// @match        https://app.duoplane.com/orders/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=duoplane.com
// @updateURL    https://github.com/PeterVWU/duoplane-price-warning/raw/main/duoplane_price_warning.user.js
// @downloadURL  https://github.com/PeterVWU/duoplane-price-warning/raw/main/duoplane_price_warning.user.js
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    // Add UI elements for input and control
    GM_addStyle(`
        #tampermonkey-controls {
            position: fixed;
            top: 40px;
            right: 15%;
            z-index: 10000;
            background: #fff;
            padding: 10px;
            border: 1px solid #ccc;
            box-shadow: 0 0 10px rgba(0,0,0,0.1);
        }
        .warning {
            background-color: #efef8d;
            width: 100%;
            text-align: center;
            padding: 10px 0; 
            box-sizing: border-box; 
        }
        .positive {
            background-color: #99cc33;
        }
        .negative {
            color: white;
            background-color: #e54141;
        }   
        .linkToRow {
            cursor: pointer;
            margin: 0 5px;
        }
    `);

    const controlsHtml = `
        <div id="tampermonkey-controls">
            
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', controlsHtml);
    let costGreaterThenPriceCount = 0;
    let netDifference = 0;

    let initScript = () => {
        let orders = document.querySelectorAll(`div.droppable_purchase_order`);
        orders.forEach(order => {
            findRow(order)
        })

        const costGreaterThenPriceCountElement = document.createElement('div');
        const countTextnode = document.createTextNode(`# of line item cost > price: ${costGreaterThenPriceCount} `);
        costGreaterThenPriceCountElement.className = `warning `;
        costGreaterThenPriceCountElement.appendChild(countTextnode);
        orders[0].parentElement.insertBefore(costGreaterThenPriceCountElement, orders[0].parentElement.firstChild);

        const netDifferenceElement = document.createElement('div');
        const differenceTextnode = document.createTextNode(`Total price - cost: ${netDifference.toFixed(2)} `);
        netDifferenceElement.className = `warning ${netDifference > 0 ? 'positive' : 'negative'}`;
        netDifferenceElement.appendChild(differenceTextnode);
        orders[0].parentElement.insertBefore(netDifferenceElement, orders[0].parentElement.firstChild);
    }
    let findRow = (orderElement) => {
        let dataRows = orderElement.querySelectorAll(`tbody tr`);
        let totalOrderPrice = 0;
        let totalOrderCost = 0;
        dataRows.forEach(row => {
            // find price column
            const priceCell = row.querySelector(`td[data-col-title="Total price"]`);
            // find cost column
            const costCell = row.querySelector(`td[data-col-title="Total cost"]`);

            if (!priceCell || !costCell) {
                return;
            }

            const totalLinePrice = Number(priceCell.textContent.trim().replace(',', ''));
            totalOrderPrice += totalLinePrice;
            const totalLineCost = Number(costCell.textContent.trim().replace(',', ''));
            totalOrderCost += totalLineCost;
            const difference = totalLinePrice - totalLineCost;

            if (difference <= 0) {
                costGreaterThenPriceCount++;
                row.style.backgroundColor = '#f9e154';
                const linkToRow = document.createElement('a');
                linkToRow.className = 'linkToRow';
                linkToRow.textContent = `item${costGreaterThenPriceCount}`;
                linkToRow.id = `linkToRow${costGreaterThenPriceCount}`;
                linkToRow.addEventListener('click', function () {
                    row.scrollIntoView({ behavior: 'smooth', block: "center" });
                });
                document.getElementById('tampermonkey-controls').appendChild(linkToRow);
            }
            console.log('totalLinePrice', totalLinePrice)
            console.log('totalLineCost', totalLineCost)
            console.log('cost greater than price', totalLinePrice < totalLineCost)
        })

        let orderDifference = totalOrderPrice - totalOrderCost;
        const differenceElement = document.createElement('div');
        const textnode = document.createTextNode(`Total price: $${totalOrderPrice.toFixed(2)} - Total cost: $${totalOrderCost.toFixed(2)} = $${orderDifference.toFixed(2)}`);
        differenceElement.className = `warning ${orderDifference > 0 ? 'positive' : 'negative'}`;
        differenceElement.appendChild(textnode);
        orderElement.insertBefore(differenceElement, orderElement.firstChild);
        netDifference += orderDifference;
    }
    initScript()
})();
