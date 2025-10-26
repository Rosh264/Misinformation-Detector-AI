console.log("MisInfo Guard (Inject): Script loaded (v0.5.2)."); // Version bump for this fix

const PANEL_ID = 'misinfo-guard-panel-container';

// --- Message Handler: Entry point from background script ---
function messageHandler(request, sender, sendResponse) {
    console.log("MisInfo Guard (Inject): Message received by handler", request);
    if (request.type === "SHOW_MISINFO_PANEL") {
        // Use a short timeout to ensure DOM is ready after injection
        setTimeout(() => {
            createOrUpdatePanel(
                request.headline,
                request.apiUrl,
                request.icons,
                request.mgIcon,
                request.mgTitleImg // Receive title image URL
            );
        }, 50);
        sendResponse({ success: true }); // Acknowledge message
        return true; // Keep message channel open briefly if needed
    }
    return false; // Indicate message not handled
}

// Add listener only once
if (!browser.runtime.onMessage.hasListener(messageHandler)) {
    browser.runtime.onMessage.addListener(messageHandler);
    console.log("MisInfo Guard (Inject): Message listener added.");
}


// --- Panel Creation and Management ---
function createOrUpdatePanel(headline, apiUrl, icons, mgIcon, mgTitleImg) {
    console.log("MisInfo Guard (Inject): Creating/Updating Panel for:", headline.substring(0, 30) + "...");
    let panelContainer = document.getElementById(PANEL_ID);
    if (panelContainer) panelContainer.remove(); // Remove old panel

    panelContainer = document.createElement('div');
    panelContainer.id = PANEL_ID;

    // Load HTML template
    fetch(browser.runtime.getURL('result_panel.html'))
        .then(response => response.ok ? response.text() : Promise.reject(`Failed to load panel HTML: ${response.statusText}`))
        .then(html => {
            panelContainer.innerHTML = html;
            document.body.appendChild(panelContainer);
            console.log("MisInfo Guard (Inject): Panel HTML injected.");

            const panel = panelContainer.querySelector('.mg-panel');
            const closeBtn = panelContainer.querySelector('#mg-close-btn');
            if (closeBtn) closeBtn.addEventListener('click', closePanel);

            // Set initial loading state and images, including the title image
            updatePanelContent(headline, icons, mgIcon, mgTitleImg, 'checking', 'Analyzing selected text...', null);
            requestAnimationFrame(() => { if (panel) panel.classList.add('mg-show'); });

            // Call API to get real results
            fetchHeadlineResult(headline, apiUrl, icons);
        })
        .catch(error => {
            console.error('MisInfo Guard (Inject): Error loading or setting up panel:', error);
             // Send fallback notification message to background script
             try {
                browser.runtime.sendMessage({
                    type: "FALLBACK_NOTIFICATION",
                    title: "Panel Load Error",
                    message: `Could not load UI: ${error.message || error}`
                });
             } catch (e) { console.error("MisInfo Guard (Inject): Failed to send fallback message:", e); }
        });
}

// Updates panel content (initially loading, then with results)
function updatePanelContent(headline, icons, mgIcon, mgTitleImg, status = 'checking', reason = 'Analyzing selected text...', probabilities = null) {
    const panelContainer = document.getElementById(PANEL_ID);
    if (!panelContainer) return;

    // Get references
    const headerIcon = panelContainer.querySelector('#mg-header-icon');
    const titleImage = panelContainer.querySelector('#mg-title-image');
    const statusIcon = panelContainer.querySelector('#mg-status-icon');
    const statusText = panelContainer.querySelector('#mg-status-text');
    const reasonText = panelContainer.querySelector('#mg-reason');
    const headlineText = panelContainer.querySelector('#mg-selected-headline');
    const predictionDetail = panelContainer.querySelector('#mg-prediction-detail');

    // Basic check to prevent errors if elements aren't found
    if (!headerIcon || !titleImage || !statusIcon || !statusText || !reasonText || !headlineText || !predictionDetail) {
        console.error("MisInfo Guard (Inject): One or more critical panel elements not found! Check HTML structure.");
        closePanel(); // Close broken panel
        return;
    }

    const safeStatus = status ? status.toLowerCase() : 'error';

    // Set general info & images (only if provided - prevents overwriting on subsequent updates)
    if (mgIcon) {
      headerIcon.src = mgIcon;
      headerIcon.alt = "MisInfo Guard Icon";
    }
    if (mgTitleImg) {
      titleImage.src = mgTitleImg; // <-- Sets the title image src
      titleImage.alt = "MisInfo Guard Title";
      titleImage.style.display = 'block'; // Ensure it's visible
    }

    if (headlineText) headlineText.textContent = headline;

    // Set status specific info
    if (statusIcon) statusIcon.src = icons[safeStatus] || icons.error;
    if (statusIcon) statusIcon.alt = `${safeStatus} status icon`;
    if (statusText) {
        statusText.textContent = safeStatus.toUpperCase();
        statusText.className = `mg-status-text mg-status-${safeStatus}`;
    }
    if (reasonText) reasonText.textContent = reason;

    // --- Display probabilities ---
    if (safeStatus !== 'checking' && probabilities && typeof probabilities === 'object' && !probabilities.error) {
        // Ensure keys match what the backend sends (e.g., 'misleading', 'verified')
        const probMisleading = probabilities.misleading || 0;
        const probVerified = probabilities.verified || 0;
        let totalProb = probMisleading + probVerified;
        // Avoid division by zero if both probabilities are 0
        if (totalProb === 0) totalProb = 1;

        const fakePerc = ((probMisleading / totalProb) * 100).toFixed(1);
        const realPerc = ((probVerified / totalProb) * 100).toFixed(1);

        predictionDetail.innerHTML = `
            <div class="mg-prob-item">
                <span class="mg-label mg-label-fake">Fake / Misleading:</span>
                <span class="mg-value mg-value-fake">${fakePerc}%</span>
            </div>
            <div class="mg-prob-item">
                <span class="mg-label mg-label-real">Real / Verified:</span>
                <span class="mg-value mg-value-real">${realPerc}%</span>
            </div>
        `;
    } else if (safeStatus === 'checking') {
         predictionDetail.innerHTML = `<p class="mg-loading-text">Calculating confidence...</p>`;
    }
     else { // Error or no probabilities available
        predictionDetail.innerHTML = `<p class="mg-info-text">Confidence scores not available.</p>`;
    }
}

// Closes and removes the panel
function closePanel() {
    const panelContainer = document.getElementById(PANEL_ID);
    if (panelContainer) {
        const panel = panelContainer.querySelector('.mg-panel');
        if (panel) {
            panel.classList.remove('mg-show');
            // Remove after transition finishes
            panel.addEventListener('transitionend', () => {
                 if (document.body.contains(panelContainer)) { panelContainer.remove(); }
            }, { once: true });
             // Fallback removal timer in case transition event doesn't fire
             setTimeout(() => { if (document.body.contains(panelContainer)) { panelContainer.remove(); } }, 350); // Slightly longer than transition
        } else {
             panelContainer.remove(); // If panel element not found, just remove container
        }
        console.log("MisInfo Guard (Inject): Panel closed.");
    }
}

// --- API Call ---
async function fetchHeadlineResult(headline, apiUrl, icons) {
    console.log("MisInfo Guard (Inject): Fetching result from API...");
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ headlines: [headline] })
        });

        // Check if panel still exists and is shown before processing response
        const panelContainer = document.getElementById(PANEL_ID);
        const panel = panelContainer?.querySelector('.mg-panel.mg-show');
        if (!panel) {
             console.log("MisInfo Guard (Inject): Panel closed before API response received.");
             return; // Stop processing if panel was closed
        }

        if (!response.ok) {
            let errorMsg = `API Error ${response.status}`;
            try {
                // Try to get more detail from JSON error response
                const errorJson = await response.json();
                errorMsg += `: ${errorJson.detail || JSON.stringify(errorJson)}`;
            } catch (e) {
                // Fallback if response is not JSON
                errorMsg += `: ${await response.text() || 'Unknown server error.'}`;
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        console.log("MisInfo Guard (Inject): Received results:", data);

        if (data.results && data.results.length > 0) {
            const result = data.results[0];
            // Call updatePanelContent again, but only pass needed args to update results
            // Pass headline again to ensure it's displayed correctly if update is very fast
            updatePanelContent(headline, icons, null, null, result.status, result.reason, result.probabilities);
        } else {
            throw new Error("Received no results or unclear data from server.");
        }

    } catch (error) { // Handle network errors (fetch failed) or API errors (response not ok)
        console.error("MisInfo Guard (Inject): Error fetching result:", error);
        // Call updatePanelContent again to display error status
        updatePanelContent(headline, icons, null, null, 'error', error.message, null);
    }
}

