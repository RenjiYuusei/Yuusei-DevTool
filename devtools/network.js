// network.js
import { getFileName, formatBytes } from './utils.js';

const networkRequests = new Map(); // requestId -> requestData
let currentFilter = 'all';
let networkListEl = null;
let preserveLog = false;
let detailsModal = null;
let detailsBody = null;

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
        detailsBody = modalElement.querySelector('#details-body');
        modalElement.querySelector('.close-modal').onclick = () => {
            detailsModal.classList.add('hidden');
        };
        // Close on click outside
        window.onclick = (event) => {
            if (event.target === detailsModal) {
                detailsModal.classList.add('hidden');
            }
        };
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
            display: true
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
            // Store some headers if needed for details
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

    tr.innerHTML = `
        <td title="${req.url}"><div class="cell-text">${req.name}</div><div class="cell-sub">${req.method}</div></td>
        <td>${req.status}</td>
        <td>${req.type}</td>
        <td>${formatBytes(req.size)}</td>
        <td>${req.time || 'Pending'}</td>
    `;
}

function showDetails(req) {
    if (!detailsModal || !detailsBody) return;

    let html = `
        <p><strong>URL:</strong> <span style="word-break: break-all;">${req.url}</span></p>
        <p><strong>Method:</strong> ${req.method}</p>
        <p><strong>Status:</strong> ${req.status}</p>
        <p><strong>Type:</strong> ${req.type}</p>
        <p><strong>Size:</strong> ${formatBytes(req.size)}</p>
        <p><strong>Time:</strong> ${req.time || '-'}</p>
    `;

    if (req.error) {
        html += `<p style="color:red"><strong>Error:</strong> ${req.error}</p>`;
    }

    if (req.headers) {
         html += `<h4>Response Headers</h4><div style="max-height: 100px; overflow: auto; background: #333; padding: 5px;">`;
         for (const [key, value] of Object.entries(req.headers)) {
             html += `<div><strong>${key}:</strong> ${value}</div>`;
         }
         html += `</div>`;
    }

    detailsBody.innerHTML = html;
    detailsModal.classList.remove('hidden');
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
