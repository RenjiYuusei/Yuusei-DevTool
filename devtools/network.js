// network.js
import { getFileName, formatBytes, sendCommand, escapeHtml } from './utils.js';

const networkRequests = new Map(); // requestId -> requestData
let currentFilter = 'all';
let networkListEl = null;
let preserveLog = false;
let detailsModal = null;

// Tab Elements
let tabHeaders, tabPayload, tabPreview, tabResponse, tabTiming;

export function initNetwork(listElement, filterRadios, clearBtn, preserveCheckbox, modalElement) {
    networkListEl = listElement;

    // Filter Listeners
    filterRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            refreshNetworkTable();
        });
    });

    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearTable();
        });
    }

    if (preserveCheckbox) {
        preserveCheckbox.addEventListener('change', (e) => {
            preserveLog = e.target.checked;
        });
    }

    if (modalElement) {
        detailsModal = modalElement;

        // Cache Tab Panes
        tabHeaders = modalElement.querySelector('#tab-headers');
        tabPayload = modalElement.querySelector('#tab-payload');
        tabPreview = modalElement.querySelector('#tab-preview');
        tabResponse = modalElement.querySelector('#tab-response');
        tabTiming = modalElement.querySelector('#tab-timing');

        // Close Button
        modalElement.querySelector('.close-modal').onclick = () => {
            detailsModal.classList.add('hidden');
        };
        // Close on click outside
        window.onclick = (event) => {
            if (event.target === detailsModal) {
                detailsModal.classList.add('hidden');
            }
        };

        // Tab Switching Logic
        const tabBtns = modalElement.querySelectorAll('.modal-tab-btn');
        const tabPanes = modalElement.querySelectorAll('.tab-pane');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                // Deactivate all
                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));

                // Activate clicked
                btn.classList.add('active');
                const targetId = btn.getAttribute('data-target');
                const targetPane = modalElement.querySelector(`#${targetId}`);
                if (targetPane) targetPane.classList.add('active');
            });
        });
    }
}

function clearTable() {
    networkRequests.clear();
    networkListEl.innerHTML = '';
}

export function handleNavigation() {
    if (!preserveLog) {
        clearTable();
    }
}

export function handleNetworkEvent(method, params) {
    if (method === 'Network.requestWillBeSent') {
        const { requestId, request, type, timestamp } = params;
        networkRequests.set(requestId, {
            id: requestId,
            url: request.url,
            name: getFileName(request.url),
            method: request.method,
            type: type || 'Other',
            status: 'Pending',
            size: 0,
            startTime: timestamp,
            display: true,
            postData: request.postData,
            requestHeaders: request.headers
        });
        renderNetworkRow(requestId);
    }
    else if (method === 'Network.responseReceived') {
        const { requestId, response } = params;
        const req = networkRequests.get(requestId);
        if (req) {
            req.status = response.status;
            req.mimeType = response.mimeType;
            if (!req.type || req.type === 'Other') {
                req.type = mapMimeToType(response.mimeType);
            }
            req.headers = response.headers;
            renderNetworkRow(requestId);
        }
    }
    else if (method === 'Network.loadingFinished') {
        const { requestId, encodedDataLength, timestamp } = params;
        const req = networkRequests.get(requestId);
        if (req) {
            req.size = encodedDataLength;
            req.status = req.status === 'Pending' ? 200 : req.status;
            if (req.startTime && timestamp) {
                 req.time = Math.round((timestamp - req.startTime) * 1000) + ' ms';
            }
            renderNetworkRow(requestId);
        }
    }
    else if (method === 'Network.loadingFailed') {
        const { requestId, errorText } = params;
        const req = networkRequests.get(requestId);
        if (req) {
            req.status = '(failed)';
            req.error = errorText;
            renderNetworkRow(requestId);
        }
    }
}

function mapMimeToType(mime) {
    if (!mime) return 'Other';
    if (mime.includes('javascript')) return 'Script';
    if (mime.includes('html')) return 'Document';
    if (mime.includes('css')) return 'Stylesheet';
    if (mime.includes('image')) return 'Image';
    if (mime.includes('json') || mime.includes('xml')) return 'Fetch';
    return 'Other';
}

function renderNetworkRow(requestId) {
    const req = networkRequests.get(requestId);
    if (!req) return;

    if (!shouldShow(req)) {
        const existing = document.getElementById(`req-${requestId}`);
        if (existing) existing.remove();
        return;
    }

    let tr = document.getElementById(`req-${requestId}`);
    if (!tr) {
        tr = document.createElement('tr');
        tr.id = `req-${requestId}`;
        tr.onclick = () => showDetails(req);
        networkListEl.appendChild(tr);
    }

    // Reset classes
    tr.className = '';
    if (req.status === '(failed)' || (typeof req.status === 'number' && req.status >= 400)) {
        tr.classList.add('error');
    }

    let nameContent = `<div class="cell-text">${escapeHtml(req.name)}</div><div class="cell-sub">${escapeHtml(req.method)}</div>`;

    // Thumbnail for images
    if (req.type === 'Image') {
         nameContent = `<div class="name-col"><img src="${escapeHtml(req.url)}" class="row-thumb" alt=""> <div><div class="cell-text">${escapeHtml(req.name)}</div><div class="cell-sub">${escapeHtml(req.method)}</div></div></div>`;
    }

    tr.innerHTML = `
        <td title="${escapeHtml(req.url)}">${nameContent}</td>
        <td>${escapeHtml(req.status)}</td>
        <td>${escapeHtml(req.type)}</td>
        <td>${formatBytes(req.size)}</td>
        <td>${escapeHtml(req.time || 'Pending')}</td>
    `;
}

async function showDetails(req) {
    if (!detailsModal) return;

    // Clear tabs
    tabHeaders.innerHTML = '';
    tabPayload.innerHTML = '';
    tabPreview.innerHTML = 'Loading...';
    tabResponse.innerHTML = 'Loading...';
    tabTiming.innerHTML = '';

    // --- Headers Tab ---
    let generalHtml = `
        <div class="header-section">
            <div class="header-section-title">General</div>
            <div class="header-row"><span class="header-name">Request URL:</span> <span class="header-value">${escapeHtml(req.url)}</span></div>
            <div class="header-row"><span class="header-name">Request Method:</span> <span class="header-value">${escapeHtml(req.method)}</span></div>
            <div class="header-row"><span class="header-name">Status Code:</span> <span class="header-value">${escapeHtml(req.status)}</span></div>
        </div>
    `;

    // Response Headers
    let resHeadersHtml = `<div class="header-section"><div class="header-section-title">Response Headers</div>`;
    if (req.headers) {
        const sortedKeys = Object.keys(req.headers).sort();
        for (const key of sortedKeys) {
            resHeadersHtml += `<div class="header-row"><span class="header-name">${escapeHtml(key)}:</span> <span class="header-value">${escapeHtml(req.headers[key])}</span></div>`;
        }
    } else {
        resHeadersHtml += `<div style="color:#777; font-style:italic;">No response headers</div>`;
    }
    resHeadersHtml += `</div>`;

    // Request Headers
    let reqHeadersHtml = `<div class="header-section"><div class="header-section-title">Request Headers</div>`;
    if (req.requestHeaders) {
        const sortedKeys = Object.keys(req.requestHeaders).sort();
        for (const key of sortedKeys) {
            reqHeadersHtml += `<div class="header-row"><span class="header-name">${escapeHtml(key)}:</span> <span class="header-value">${escapeHtml(req.requestHeaders[key])}</span></div>`;
        }
    }
    reqHeadersHtml += `</div>`;

    tabHeaders.innerHTML = generalHtml + resHeadersHtml + reqHeadersHtml;


    // --- Payload Tab ---
    let payloadHtml = '';
    // Query String Parameters
    try {
        const urlObj = new URL(req.url);
        if (urlObj.searchParams && Array.from(urlObj.searchParams).length > 0) {
             payloadHtml += `<div class="header-section"><div class="header-section-title">Query String Parameters</div>`;
             urlObj.searchParams.forEach((value, key) => {
                 payloadHtml += `<div class="header-row"><span class="header-name">${escapeHtml(key)}:</span> <span class="header-value">${escapeHtml(value)}</span></div>`;
             });
             payloadHtml += `</div>`;
        }
    } catch(e) {}

    // Request Payload (Post Data)
    if (req.postData) {
        payloadHtml += `<div class="header-section"><div class="header-section-title">Request Payload</div>`;
        payloadHtml += `<pre class="code-block">${escapeHtml(req.postData)}</pre></div>`;
    }

    if (!payloadHtml) {
        payloadHtml = '<div style="padding:10px; color:#777;">No payload data</div>';
    }
    tabPayload.innerHTML = payloadHtml;


    // --- Timing Tab ---
    tabTiming.innerHTML = `
        <div style="padding:10px;">
            <p><strong>Started:</strong> ${new Date(req.startTime * 1000).toLocaleString()}</p>
            <p><strong>Duration:</strong> ${req.time || 'Pending'}</p>
        </div>
    `;


    // --- Show Modal ---
    detailsModal.classList.remove('hidden');


    // --- Async Fetch Body (Preview & Response) ---
    // Add cURL button to Response tab for utility
    tabResponse.innerHTML = `<div class="action-bar"><button id="btn-copy-curl">Copy as cURL</button></div><div id="response-content">Loading...</div>`;

    document.getElementById('btn-copy-curl').onclick = () => {
        const curl = generateCurl(req);
        navigator.clipboard.writeText(curl).then(() => {
            alert('Copied cURL to clipboard');
        });
    };

    try {
        const result = await sendCommand('Network.getResponseBody', { requestId: req.id });
        const contentEl = document.getElementById('response-content');

        let bodyContent = result.body;
        let isBase64 = result.base64Encoded;

        // Preview Logic
        if (req.type === 'Image' && isBase64) {
            tabPreview.innerHTML = `<div style="text-align:center; padding:20px;"><img src="data:${req.mimeType};base64,${bodyContent}" style="max-width:100%; max-height: 400px; border:1px solid #555;"></div>`;
            if (contentEl) contentEl.textContent = "(Image Data)";
        }
        else {
             // Text/JSON
             let text = bodyContent;
             // Try to prettify JSON for Preview
             try {
                if (req.mimeType && req.mimeType.includes('json')) {
                    const obj = JSON.parse(text);
                    // Simple pretty print for now
                    tabPreview.innerHTML = `<pre class="code-block">${escapeHtml(JSON.stringify(obj, null, 2))}</pre>`;
                } else {
                    tabPreview.innerHTML = `<pre class="code-block">${escapeHtml(text)}</pre>`;
                }
             } catch(e) {
                 tabPreview.innerHTML = `<pre class="code-block">${escapeHtml(text)}</pre>`;
             }

             if (contentEl) contentEl.innerHTML = `<pre class="code-block">${escapeHtml(text)}</pre>`;
        }

    } catch (e) {
        tabPreview.innerHTML = '<div style="padding:10px; color:#777;">No data available</div>';
        const contentEl = document.getElementById('response-content');
        if (contentEl) contentEl.textContent = "Failed to load response body.";
    }
}

function generateCurl(req) {
    let curl = `curl '${req.url}'`;
    curl += ` \\\n  -X '${req.method}'`;

    if (req.requestHeaders) {
        for (const [key, value] of Object.entries(req.requestHeaders)) {
            curl += ` \\\n  -H '${key}: ${value}'`;
        }
    }

    if (req.postData) {
        curl += ` \\\n  --data-raw '${req.postData.replace(/'/g, "'\\''")}'`;
    }

    curl += ` \\\n  --compressed`;
    return curl;
}

function shouldShow(req) {
    if (currentFilter === 'all') return true;
    return req.type === currentFilter || (currentFilter === 'Fetch' && req.type === 'XHR');
}

function refreshNetworkTable() {
    networkListEl.innerHTML = '';
    for (const [requestId, req] of networkRequests) {
        renderNetworkRow(requestId);
    }
}
