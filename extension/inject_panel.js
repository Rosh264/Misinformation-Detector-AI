console.log("MisInfo Guard (Inject): Script loaded (v1.0.1 - Title Fix)."); // Version bump for this fix

const PANEL_CONTAINER_ID = 'misinfo-guard-panel-container';

// --- Message Handler: Entry point from background script ---
function handleBackgroundMessage(request, sender, sendResponse) {
    console.log("MisInfo Guard (Inject): Message received by handler", request);
    if (request.type === "SHOW_MISINFO_PANEL") {
        setTimeout(() => {
            createOrUpdatePanel(
                request.headline,
                request.apiUrl,
                request.icons,
                request.mgIcon,
                request.mgTitleImg // Receive the URL for the title image
            );
        }, 50);
        sendResponse({ success: true });
        return true;
    }
    return false;
}

// Add listener only once
if (!browser.runtime.onMessage.hasListener(handleBackgroundMessage)) {
    browser.runtime.onMessage.addListener(handleBackgroundMessage);
    console.log("MisInfo Guard (Inject): Message listener added.");
}


// --- Panel Creation and Management ---
function createOrUpdatePanel(headline, apiUrl, icons, mgIcon, mgTitleImg) {
    console.log("MisInfo Guard (Inject): Creating/Updating Panel for:", headline.substring(0, 30) + "...");

    let existingPanelContainer = document.getElementById(PANEL_CONTAINER_ID);
    if (existingPanelContainer) {
        existingPanelContainer.remove();
    }

    const panelContainer = document.createElement('div');
    panelContainer.id = PANEL_CONTAINER_ID;

    fetch(browser.runtime.getURL('result_panel.html'))
        .then(response => {
            if (!response.ok) {
                return Promise.reject(`Failed to load panel HTML: ${response.status} ${response.statusText}`);
            }
            return response.text();
        })
        .then(html => {
            panelContainer.innerHTML = html;
            document.body.appendChild(panelContainer);
            console.log("MisInfo Guard (Inject): Panel HTML injected.");

            const panel = panelContainer.querySelector('.mg-panel');
            const closeBtn = panelContainer.querySelector('#mg-close-btn');
            const titleImageEl = panelContainer.querySelector('#mg-title-image'); // Get title image element

            if (closeBtn) {
                closeBtn.addEventListener('click', closePanel);
            } else {
                console.warn("MisInfo Guard (Inject): Close button not found.");
            }

            // *** FIX: Set title image source HERE when creating panel ***
            if (titleImageEl && mgTitleImg) {
                titleImageEl.src = mgTitleImg;
                titleImageEl.alt = "MisInfo Guard Title";
                titleImageEl.style.display = 'block'; // Ensure visible
                console.log("MisInfo Guard (Inject): Title image src set.");
            } else if (!titleImageEl) {
                 console.warn("MisInfo Guard (Inject): Title image element (#mg-title-image) not found in HTML.");
            }
            // *** END FIX ***

            // Set initial loading state
            updatePanelContent(headline, icons, mgIcon, null, 'checking', 'Analyzing selected text...', null); // Pass null for title img now

            requestAnimationFrame(() => {
                if (panel) panel.classList.add('mg-show');
            });

            fetchHeadlineResult(headline, apiUrl, icons);
        })
        .catch(error => {
            console.error('MisInfo Guard (Inject): Error loading or setting up panel:', error);
             try {
                browser.runtime.sendMessage({ type: "FALLBACK_NOTIFICATION", title: "Panel Load Error", message: `Could not load UI: ${error.message || error}` });
             } catch (e) { console.error("MisInfo Guard (Inject): Failed to send fallback message:", e); }
        });
}

// Updates panel content (excluding title image now)
function updatePanelContent(headline, icons, mgIcon, mgTitleImg, status = 'checking', reason = 'Analyzing selected text...', probabilities = null) {
    const panelContainer = document.getElementById(PANEL_CONTAINER_ID);
    if (!panelContainer) return;

    // Get references
    const headerIcon = panelContainer.querySelector('#mg-header-icon');
    // const titleImage = panelContainer.querySelector('#mg-title-image'); // No longer needed here
    const statusIcon = panelContainer.querySelector('#mg-status-icon');
    const statusText = panelContainer.querySelector('#mg-status-text');
    const reasonText = panelContainer.querySelector('#mg-reason');
    const headlineText = panelContainer.querySelector('#mg-selected-headline');
    const predictionDetail = panelContainer.querySelector('#mg-prediction-detail');

    if (!headerIcon || /* !titleImage || */ !statusIcon || !statusText || !reasonText || !headlineText || !predictionDetail) {
        console.error("MisInfo Guard (Inject): One or more critical panel elements not found!");
        closePanel(); return;
    }

    const safeStatus = status ? status.toLowerCase() : 'error';

    // Set header icon only if provided (on initial load)
    if (mgIcon) {
      headerIcon.src = mgIcon;
      headerIcon.alt = "MisInfo Guard Icon";
    }
    // Title image is set only once during creation now

    if (headlineText) headlineText.textContent = headline;

    if (statusIcon) statusIcon.src = icons[safeStatus] || icons.error;
    if (statusIcon) statusIcon.alt = `${safeStatus} status icon`;
    if (statusText) {
        statusText.textContent = safeStatus.toUpperCase();
        statusText.className = `mg-status-text mg-status-${safeStatus}`;
    }
    if (reasonText) reasonText.textContent = reason;

    // Display probabilities
    if (safeStatus !== 'checking' && probabilities && typeof probabilities === 'object' && !probabilities.error) {
        const probMisleading = probabilities.misleading || 0;
        const probVerified = probabilities.verified || 0;
        let totalProb = probMisleading + probVerified;
        if (totalProb <= 0) totalProb = 1;

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
    } else {
        predictionDetail.innerHTML = `<p class="mg-info-text">Confidence scores not available.</p>`;
    }
}

// Closes and removes the panel
function closePanel() {
    // ... (keep the existing closePanel function) ...
    const panelContainer = document.getElementById(PANEL_CONTAINER_ID);
    if (panelContainer) {
        const panel = panelContainer.querySelector('.mg-panel');
        if (panel) {
            panel.classList.remove('mg-show');
            panel.addEventListener('transitionend', () => {
                 if (document.body.contains(panelContainer)) { panelContainer.remove(); }
            }, { once: true });
             setTimeout(() => { if (document.body.contains(panelContainer)) { panelContainer.remove(); } }, 350);
        } else {
             panelContainer.remove();
        }
        console.log("MisInfo Guard (Inject): Panel closed.");
    }
}


// --- API Call ---
async function fetchHeadlineResult(headline, apiUrl, icons) {
    // ... (keep the existing fetchHeadlineResult function) ...
    console.log("MisInfo Guard (Inject): Fetching result from API:", apiUrl);
    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ headlines: [headline] })
        });

        const panelContainer = document.getElementById(PANEL_CONTAINER_ID);
        const panel = panelContainer?.querySelector('.mg-panel.mg-show');
        if (!panel) {
             console.log("MisInfo Guard (Inject): Panel was closed before API response received.");
             return;
        }

        if (!response.ok) {
            let errorMsg = `API Error ${response.status}`;
            try {
                const errorJson = await response.json();
                errorMsg += `: ${errorJson.detail || JSON.stringify(errorJson)}`;
            } catch (e) {
                const textError = await response.text();
                errorMsg += `: ${textError || 'Unknown server error.'}`;
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        console.log("MisInfo Guard (Inject): Received results from API:", data);

        if (data.results && data.results.length > 0) {
            const result = data.results[0];
            // Update panel content with results
            updatePanelContent(headline, icons, null, null, result.status, result.reason, result.probabilities);
        } else {
            throw new Error("Received no results or unclear data format from server.");
        }

    } catch (error) {
        console.error("MisInfo Guard (Inject): Error fetching or processing API result:", error);
        updatePanelContent(headline, icons, null, null, 'error', error.message, null);
    }
}

