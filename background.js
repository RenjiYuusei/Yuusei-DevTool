// Store the state of attached tabs
// Map<tabId, windowId>
const attachedTabs = new Map();

chrome.action.onClicked.addListener(async (tab) => {
    // Check if we are already attached to this tab
    if (attachedTabs.has(tab.id)) {
        const windowId = attachedTabs.get(tab.id);
        // Focus the window
        chrome.windows.update(windowId, { focused: true }).catch(() => {
             // Window might be closed but not cleaned up?
             detachAndClean(tab.id);
             attachAndOpen(tab.id);
        });
    } else {
        attachAndOpen(tab.id);
    }
});

function attachAndOpen(tabId) {
    chrome.debugger.attach({ tabId: tabId }, "1.3", () => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          return;
        }

        // Open DevTools window
        // Use 'popup' type for a standalone window feel
        chrome.windows.create({
          url: `devtools/devtools.html?tabId=${tabId}`,
          type: 'popup',
          width: 800,
          height: 600
        }, (win) => {
            attachedTabs.set(tabId, win.id);
        });
    });
}

function detachAndClean(tabId) {
    chrome.debugger.detach({ tabId: tabId }, () => {
        if (chrome.runtime.lastError) {}
    });
    attachedTabs.delete(tabId);
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
