import os
import time
from playwright.sync_api import sync_playwright

def run():
    url = 'http://localhost:8000/devtools/devtools.html?tabId=1337'

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 800, 'height': 600})

        page.on("console", lambda msg: print(f"Console: {msg.text}"))
        page.on("pageerror", lambda err: print(f"Page Error: {err}"))

        # Inject Mock Chrome API
        page.add_init_script("""
            window.chrome = {
                debugger: {
                    onEvent: { addListener: () => {} },
                    sendCommand: (target, method, params, callback) => {
                        console.log('Mock SendCommand:', method);
                        if (method === 'Network.getResponseBody') {
                            setTimeout(() => {
                                callback({ body: '{"success": true, "message": "Mock Response Body"}', base64Encoded: false });
                            }, 100);
                        } else if (method === 'Debugger.getScriptSource') {
                             setTimeout(() => {
                                callback({ scriptSource: 'function test() {\\n  console.log("Hello World");\\n  const x = "Long line to test overflow scrolling behavior......................................................................................................";\\n}' });
                            }, 100);
                        } else {
                            callback({});
                        }
                    }
                },
                runtime: { lastError: null }
            };
        """)

        page.goto(url)
        # page.wait_for_load_state('networkidle') # Local files sometimes don't trigger network idle well
        time.sleep(2) # Force wait for modules

        # Check if Network is exposed
        exposed = page.evaluate("typeof window.Network !== 'undefined'")
        if not exposed:
            print("window.Network is not defined yet.")
            # return

        # --- Test Network Tab ---
        print("Testing Network Tab...")
        # Add a mock request
        page.evaluate("""
            if (window.Network) {
                window.Network.handleNetworkEvent('Network.requestWillBeSent', {
                    requestId: '1',
                    request: {
                        url: 'https://example.com/api/data?q=test',
                        method: 'GET',
                        headers: { 'User-Agent': 'TestBot' },
                        postData: '{"foo":"bar"}'
                    },
                    type: 'Fetch',
                    timestamp: Date.now() / 1000
                });
                window.Network.handleNetworkEvent('Network.responseReceived', {
                    requestId: '1',
                    response: {
                        status: 200,
                        mimeType: 'application/json',
                        headers: { 'Content-Type': 'application/json', 'Server': 'MockServer' }
                    }
                });
                window.Network.handleNetworkEvent('Network.loadingFinished', {
                    requestId: '1',
                    encodedDataLength: 500,
                    timestamp: (Date.now() / 1000) + 0.5
                });
            } else {
                console.error("Network module not loaded");
            }
        """)

        # Click the row
        try:
            page.click('tr#req-1', timeout=2000)
            time.sleep(0.5)

            # Take screenshot of Modal Headers
            page.screenshot(path='verification_network_headers.png')
            print("Captured verification_network_headers.png")

            # Click Tabs
            page.click('button[data-target="tab-payload"]')
            time.sleep(0.2)
            page.screenshot(path='verification_network_payload.png')

            page.click('button[data-target="tab-preview"]')
            time.sleep(1.0) # Wait for async body
            page.screenshot(path='verification_network_preview.png')

            # Close Modal
            page.click('.close-modal')
        except Exception as e:
            print(f"Network tab interaction failed: {e}")

        # --- Test Sources Tab ---
        print("Testing Sources Tab...")
        page.click('button[data-tab="sources"]')

        # Add mock script
        page.evaluate("""
            if (window.Sources) {
                window.Sources.handleScriptParsed({
                    url: 'https://example.com/js/app.js',
                    scriptId: '100'
                });
                 window.Sources.handleScriptParsed({
                    url: 'https://example.com/assets/vendor/jquery.min.js',
                    scriptId: '102'
                });
            }
        """)

        # Wait for render (requestAnimationFrame)
        time.sleep(1.0)

        # Expand folders
        # Click "js" folder
        js_folder = page.locator('.tree-row:has-text("js")')
        if js_folder.count() > 0:
            js_folder.first.click()
            time.sleep(0.5)

        # Check for app.js
        app_js = page.locator('.tree-row:has-text("app.js")')
        if app_js.count() > 0:
            app_js.first.click()
            time.sleep(0.5) # Wait for content
            page.screenshot(path='verification_sources_js.png')
            print("Captured verification_sources_js.png")

            # Verify Icon Class presence
            icon_count = page.locator('.icon-js-file').count()
            print(f"Found {icon_count} JS icons")
        else:
            print("Could not find app.js in tree")
            print(page.inner_html('#file-tree'))

        browser.close()

if __name__ == '__main__':
    run()
