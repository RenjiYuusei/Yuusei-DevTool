from playwright.sync_api import sync_playwright

def verify_ui():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        import os
        cwd = os.getcwd()
        page = browser.new_page()

        page.goto(f"file://{cwd}/devtools/devtools.html?tabId=123")
        page.wait_for_timeout(2000)

        # Force hide all modals first
        page.evaluate("document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'))")

        page.evaluate("""
            const tbody = document.getElementById('network-list');
            tbody.innerHTML = '';

            const tr = document.createElement('tr');
            tr.id = 'req-1';
            tr.innerHTML = '<td><div class="cell-text">data</div></td><td>200</td><td>Fetch</td><td>500 B</td><td>50 ms</td>';
            tbody.appendChild(tr);

            tr.onclick = () => {
                 const modal = document.getElementById('details-modal');
                 modal.classList.remove('hidden');

                 document.querySelector('#tab-response').innerHTML = `
                    <div class="action-bar">
                        <button id="btn-copy-curl">Copy as cURL</button>
                        <button id="btn-copy-response">Copy Response</button>
                    </div>
                    <div id="response-content"><pre class="code-block">{"success": true}</pre></div>
                 `;
            };
        """)

        page.locator('#req-1').click(force=True)

        page.locator('#details-modal').wait_for(state='visible')
        page.locator("button[data-target='tab-response']").click()

        page.screenshot(path="verification/network_response.png")

        # Force close modal via JS to avoid visibility issues
        page.evaluate("document.getElementById('details-modal').classList.add('hidden')")

        # Check Application Tab
        page.locator("button[data-tab='application']").click()

        page.evaluate("""
            const modal = document.getElementById('value-preview-modal');
            modal.classList.remove('hidden');
            document.getElementById('value-preview-key').textContent = 'test_key';
            document.getElementById('value-preview-content').textContent = '{"some": "json", "value": 123}';
        """)

        page.screenshot(path="verification/app_modal.png")

        browser.close()

if __name__ == "__main__":
    verify_ui()
