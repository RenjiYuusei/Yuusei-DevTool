// utils.js

// Shared state
export const state = {
    tabId: null
};

export function setTabId(id) {
    state.tabId = id;
}

export function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
        if (!state.tabId) return reject(new Error("No tabId"));

        chrome.debugger.sendCommand({ tabId: state.tabId }, method, params, (result) => {
            if (chrome.runtime.lastError) {
                console.error("Command failed:", method, chrome.runtime.lastError);
                reject(chrome.runtime.lastError);
            } else {
                resolve(result);
            }
        });
    });
}

export function getFileName(url) {
    try {
        if (!url) return "(unknown)";
        if (url.startsWith('data:')) return "(data uri)";
        const u = new URL(url);
        const name = u.pathname.split('/').pop();
        return name || u.hostname;
    } catch (e) {
        return url;
    }
}

export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    if (!bytes) return '-';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Simple event bus if needed, or just direct calls.
// For now, we don't need a complex bus.
