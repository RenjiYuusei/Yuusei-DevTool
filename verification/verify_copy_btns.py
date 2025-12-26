import threading
import http.server
import socketserver
import time
from playwright.sync_api import sync_playwright
import os

PORT = 8084

def start_server():
    os.chdir("/app") # Root of repo
    Handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print("serving at port", PORT)
        httpd.serve_forever()

def verify_frontend():
    # Start server in background
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    time.sleep(2) # Wait for server

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        url = f"http://localhost:{PORT}/devtools/devtools.html?tabId=1"
        print(f"Navigating to {url}")

        # Inject chrome mock immediately
        page.add_init_script("""
            window.chrome = {
                runtime: {
                    connect: () => ({ onDisconnect: { addListener: () => {} } }),
                    lastError: null,
                    sendMessage: (msg, cb) => cb && cb()
                },
                debugger: {
                    onEvent: { addListener: () => {} },
                    attach: (t, v, cb) => cb(),
                    detach: (t, cb) => cb(),
                    sendCommand: (t, m, p, cb) => {
                        console.log("Mock sendCommand:", m);
                        if (m === 'Network.getResponseBody') {
                            cb({ body: 'Mock Response Body', base64Encoded: false });
                        } else if (m === 'Runtime.evaluate') {
                             // Mock Local Storage result
                             const data = JSON.stringify([['testKey', '{"a":1}']]);
                             cb({ result: { value: data } });
                        } else if (m === 'Network.getCookies') {
                             cb({ cookies: [] });
                        } else {
                            cb({});
                        }
                    }
                },
                tabs: { query: (q, cb) => cb([{id:1}]) }
            };
        """)

        page.goto(url)
        page.wait_for_load_state("networkidle")

        # Check modules
        modules_loaded = page.evaluate("typeof window.Network !== 'undefined'")
        print(f"Modules Loaded: {modules_loaded}")

        if modules_loaded:
            print("Verifying Network Copy Button...")
            # Trigger network event
            page.evaluate("""
                window.Network.handleNetworkEvent('Network.requestWillBeSent', {
                    requestId: 'mock-1',
                    request: { url: 'http://test.com/api', method: 'GET', headers: {} },
                    timestamp: 1000,
                    type: 'Fetch'
                });
            """)

            # Click row
            page.click("#req-mock-1")

            # Open Response tab
            page.wait_for_selector("#details-modal", state="visible")
            page.click("button[data-target='tab-response']")

            # Check button
            try:
                page.wait_for_selector("#btn-copy-response", state="visible", timeout=2000)
                print("SUCCESS: Network Copy Button Found")
            except:
                print("FAILURE: Network Copy Button Not Found")

            # Close modal using specific ID for network details modal if possible or just hide it via JS
            page.evaluate("document.getElementById('details-modal').classList.add('hidden')")
            page.wait_for_selector("#details-modal", state="hidden")

            print("Verifying Application Copy Button...")

            # Switch to Application tab first!
            # The sidebar item is only visible if the application panel is active.
            page.click("button[data-tab='application']")
            page.wait_for_selector("#application-panel.active")

            # Click Sidebar Local Storage
            # This triggers refreshView -> Runtime.evaluate -> renderTable
            page.click(".app-sidebar-item[data-type='local']")

            # Wait for table
            try:
                page.wait_for_selector("#app-storage-list tr", timeout=2000)
                print("Table populated.")

                # Click row to open modal
                page.click("#app-storage-list tr")

                # Check modal for copy button
                page.wait_for_selector("#value-preview-modal", state="visible")
                page.wait_for_selector("#value-preview-copy", state="visible", timeout=2000)
                print("SUCCESS: Application Copy Button Found")

            except Exception as e:
                print(f"FAILURE Application Verification: {e}")

        page.screenshot(path="verification/verification.png")
        print("Screenshot saved.")

if __name__ == "__main__":
    verify_frontend()
