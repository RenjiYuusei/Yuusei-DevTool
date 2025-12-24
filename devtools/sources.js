// sources.js
import { getFileName, sendCommand } from './utils.js';

let fileTreeEl = null;
let codeViewerEl = null;
const scriptFiles = new Map(); // url -> scriptId
const addedFiles = new Set();

export function initSources(treeElement, viewerElement) {
    fileTreeEl = treeElement;
    codeViewerEl = viewerElement;
}

export function handleScriptParsed(params) {
    if (params.url) {
        scriptFiles.set(params.url, params.scriptId);
        addFileToTree(params.url, 'script', params.scriptId);
    }
}

export async function loadResources() {
    const result = await sendCommand('Page.getResourceTree');
    if (result && result.frameTree) {
        processFrameTree(result.frameTree);
    }
}

function processFrameTree(frameTree) {
    if (frameTree.resources) {
        frameTree.resources.forEach(res => {
             addFileToTree(res.url, 'resource', null, frameTree.frame.id);
        });
    }
    if (frameTree.childFrames) {
        frameTree.childFrames.forEach(child => processFrameTree(child));
    }
}

function addFileToTree(url, type, id, frameId = null) {
    if (!url || url.startsWith('chrome-extension:')) return;
    if (addedFiles.has(url)) return;
    addedFiles.add(url);

    const name = getFileName(url);
    const div = document.createElement('div');
    div.className = 'file-tree-item';

    // Icon based on type
    const icon = type === 'script' ? 'JS' : '📄';

    div.innerHTML = `<span class="file-icon">${icon}</span> <span class="file-name">${name}</span>`;
    div.title = url;
    div.onclick = () => loadFileContent(url, type, id, frameId, div);

    fileTreeEl.appendChild(div);
}

async function loadFileContent(url, type, id, frameId, element) {
    // Highlight selection
    document.querySelectorAll('.file-tree-item').forEach(el => el.classList.remove('selected'));
    element.classList.add('selected');

    codeViewerEl.textContent = "Loading...";

    try {
        let content = '';
        if (type === 'script' && id) {
            const res = await sendCommand('Debugger.getScriptSource', { scriptId: id });
            content = res.scriptSource;
        } else {
             const res = await sendCommand('Page.getResourceContent', { frameId: frameId, url: url });
             content = res.content;
        }
        codeViewerEl.textContent = content;
        // Basic highlighting could go here
    } catch (e) {
        codeViewerEl.textContent = "Failed to load content: " + e.message;
    }
}
