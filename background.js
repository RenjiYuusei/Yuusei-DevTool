// Store the state of attached tabs
// Map<tabId, windowId>
const attachedTabs = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_STATUS') {
        const isAttached = attachedTabs.has(message.tabId);
        sendResponse({ attached: isAttached });
    } else if (message.type === 'TOGGLE_DEVTOOLS') {
        const tabId = message.tabId;
        if (attachedTabs.has(tabId)) {
            const windowId = attachedTabs.get(tabId);
            chrome.windows.remove(windowId).catch(() => {});
            detachAndClean(tabId);
            sendResponse({ attached: false });
        } else {
            attachAndOpen(tabId);
            sendResponse({ attached: true });
        }
    }
    return true; // async response
});

function attachAndOpen(tabId) {
    const protocolVersion = "1.3";
    chrome.debugger.attach({ tabId: tabId }, protocolVersion, () => {
        if (chrome.runtime.lastError) {
            console.error("Attach failed:", chrome.runtime.lastError.message);
            if (chrome.runtime.lastError.message.includes("Already attached")) {
                // Force detach and retry
                chrome.debugger.detach({ tabId: tabId }, () => {
                    if (chrome.runtime.lastError) { /* ignore */ }
                    setTimeout(() => {
                        chrome.debugger.attach({ tabId: tabId }, protocolVersion, () => {
                            if (chrome.runtime.lastError) {
                                console.error("Retry attach failed:", chrome.runtime.lastError.message);
                                return;
                            }
                            openWindow(tabId);
                        });
                    }, 100);
                });
            }
            return;
        }
        openWindow(tabId);
    });
}

function openWindow(tabId) {
    // Store tabId in storage as backup in case URL params are stripped
    chrome.storage.local.set({ ['target_tab_' + tabId]: tabId, 'last_target_tab': tabId }, () => {
        chrome.windows.create({
            url: `devtools/devtools.html?tabId=${tabId}`,
            type: 'normal',
            focused: true
            // Removed width/height to force full tab behavior on mobile
        }, (win) => {
            attachedTabs.set(tabId, win.id);
        });
    });
}

// Keep-Alive Logic
chrome.runtime.onConnect.addListener((port) => {
    if (port.name === 'devtools-page') {
        // Find the tabId from the port's sender url if possible, or wait for message
        // Ideally devtools.js sends a message immediately with tabId,
        // but 'attachedTabs' map helps track window->tab.

        port.onDisconnect.addListener(() => {
            // If the devtools page closes, we might want to detach the debugger
            // But we already have chrome.windows.onRemoved.
            // This is primarily to keep the SW alive.
        });
    }
});

function detachAndClean(tabId) {
    chrome.debugger.detach({ tabId: tabId }, () => {
        if (chrome.runtime.lastError) {}
    });
    attachedTabs.delete(tabId);
    // Clean up storage
    chrome.storage.local.remove(['target_tab_' + tabId]);
}

// Handle detachment (e.g. user clicks "Cancel" on the browser banner)
chrome.debugger.onDetach.addListener((source, reason) => {
  const tabId = source.tabId;
  if (attachedTabs.has(tabId)) {
    const windowId = attachedTabs.get(tabId);
    // Try to close the associated window
    chrome.windows.remove(windowId, () => {
      if (chrome.runtime.lastError) {}
    });
    attachedTabs.delete(tabId);
    chrome.storage.local.remove(['target_tab_' + tabId]);
  }
});

// If user closes the devtools window, we should detach
chrome.windows.onRemoved.addListener((windowId) => {
    for (const [tabId, winId] of attachedTabs.entries()) {
        if (winId === windowId) {
            detachAndClean(tabId);
            break;
        }
    }
});
