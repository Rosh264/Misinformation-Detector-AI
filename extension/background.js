console.log("MisInfo Guard Background: Script Started (v0.5.1)");

// --- Configuration ---
const API_URL = "https://misinformation-detector-ai.vercel.app/check-headlines";
const EXTENSION_ICON = browser.runtime.getURL("icons/shield-48.png");
const EXTENSION_TITLE_IMAGE = browser.runtime.getURL("icons/shield-48-title.png"); // Your title image
const STATUS_ICONS = {
    'verified': browser.runtime.getURL("icons/check.png"),
    'misleading': browser.runtime.getURL("icons/cross.png"),
    'caution': browser.runtime.getURL("icons/warning.png"),
    'error': browser.runtime.getURL("icons/info.png")
};

// --- Context Menu Creation ---
// Use onInstalled to prevent errors on reload during development
browser.runtime.onInstalled.addListener(() => {
    // Use try-catch for robustness, especially during development reloads
    try {
        browser.contextMenus.create({
            id: "check-misinfo-guard",
            title: "Check headline with MisInfo Guard",
            contexts: ["selection"]
        }, () => { // Optional callback to check for creation errors
            if (browser.runtime.lastError) {
                console.error("MisInfo Guard Background: Error creating context menu:", browser.runtime.lastError);
            } else {
                console.log("MisInfo Guard Background: Context menu created successfully.");
            }
        });
    } catch (error) {
         console.error("MisInfo Guard Background: Exception during context menu creation:", error);
    }
});

// --- Context Menu Click Listener ---
browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId === "check-misinfo-guard" && info.selectionText) {
        const selectedText = info.selectionText.trim();
        console.log("MisInfo Guard Background: Text selected:", selectedText);

        if (!tab || !tab.id) {
            console.error("MisInfo Guard Background: Invalid tab ID.");
            return;
        }

        try {
            // Inject CSS first (V2 API)
            await browser.tabs.insertCSS(tab.id, { file: "result_panel.css" });
            console.log("MisInfo Guard Background: CSS Injected.");

            // Inject the panel script (V2 API)
            await browser.tabs.executeScript(tab.id, { file: "inject_panel.js" });
            console.log("MisInfo Guard Background: Panel Script Injected.");

            // Send message after ensuring scripts are likely injected
            setTimeout(() => {
                console.log("MisInfo Guard Background: Sending message to panel script...");
                browser.tabs.sendMessage(tab.id, {
                    type: "SHOW_MISINFO_PANEL",
                    headline: selectedText,
                    apiUrl: API_URL,
                    icons: STATUS_ICONS,
                    mgIcon: EXTENSION_ICON,
                    mgTitleImg: EXTENSION_TITLE_IMAGE // Pass the title image URL
                }).catch(err => {
                     console.error("MisInfo Guard Background: Error sending message:", err ? err.message : "No response from content script. Please refresh the page.");
                     // Show notification as fallback if message fails
                     showBasicNotification("Communication Error", "Could not send data to the page panel. Please refresh and try again.");
                });
            }, 150); // Delay remains useful

        } catch (err) {
            console.error(`MisInfo Guard Background: Failed to inject scripts/CSS: ${err}`);
            showBasicNotification("Injection Error", "Could not load the panel on this page. Try refreshing the page.");
        }
    }
});

// Helper for fallback error notifications
function showBasicNotification(title, message) {
    try {
        browser.notifications.create({
            type: "basic",
            iconUrl: EXTENSION_ICON,
            title: `MisInfo Guard: ${title}`,
            message: message
        });
    } catch (notifyError) {
        console.error("MisInfo Guard Background: Failed to show notification:", notifyError);
    }
}

// Listener for potential messages from injected scripts (e.g., fallback)
browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "FALLBACK_NOTIFICATION") {
        showBasicNotification(request.title, request.message);
        return true; // Indicate potential async response
    }
    return false; // Indicate message not handled
});

console.log("MisInfo Guard Background: Script fully loaded and listeners ready.");

