console.log("Misinfo Detector v0.2 Loaded");

const API_URL = "https://misinfo-detector.onrender.com/check-headlines";
let processedElements = new Set(); // Keep track of elements we've already checked

// --- Core Logic ---

// Function to find headlines based on the current site
function findHeadlinesOnPage() {
    console.log("Misinfo Detector: Entered findHeadlinesOnPage function");
    const headlines = [];
    let elementsToCheck = [];

    // --- Site-Specific Logic ---
    if (window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com')) {
        // Twitter (X) specific selectors - find tweet text
        // This selector might need updating if Twitter changes its structure
        elementsToCheck = document.querySelectorAll('article[data-testid="tweet"]');
        console.log("Misinfo Detector: Found Twitter elements:", elementsToCheck.length);

    } else if (window.location.hostname.includes('facebook.com')) {
        // Facebook specific selectors - Placeholder, needs refinement
        // elementsToCheck = document.querySelectorAll('[data-ad-preview="message"], .userContent p, ._5pbx userContent');
        console.log("Misinfo Detector: Facebook selectors need refinement.");

    } else if (window.location.hostname.includes('instagram.com')) {
         // Instagram specific selectors - Placeholder, needs refinement
        // elementsToCheck = document.querySelectorAll('._a9zs span'); // Post captions
         console.log("Misinfo Detector: Instagram selectors need refinement.");

    } else {
        // --- General Website Logic ---
        const genericSelectors = 'h1, h2, h3, h4, [role="heading"], p'; // Added 'p' for paragraphs too
        elementsToCheck = document.querySelectorAll(genericSelectors);
        // console.log("Misinfo Detector: Found generic elements:", elementsToCheck.length);
    }

    // --- Process Elements ---
elementsToCheck.forEach(el => {
    // Check if element is visible and hasn't been processed
    if (el.offsetParent !== null && !processedElements.has(el)) {
         let text = "";
         let targetElement = el; // By default, use the element itself

         // --- Special handling for Twitter article elements ---
         if ((window.location.hostname.includes('x.com') || window.location.hostname.includes('twitter.com')) && el.tagName === 'ARTICLE') {
             // Try finding the specific tweet text element *within* the article
             const tweetTextElement = el.querySelector('div[data-testid="tweetText"]'); 
             if (tweetTextElement) {
                 text = tweetTextElement.textContent ? tweetTextElement.textContent.trim() : "";
                 targetElement = tweetTextElement; // We want to add the icon near this text
                 console.log("[Debug] Extracted text from Twitter article:", text.substring(0,50)+"...");
             } else {
                 // Fallback if specific text element not found (might grab extra stuff)
                 text = el.textContent ? el.textContent.trim() : ""; 
                 console.log("[Debug] Fallback text extraction from Twitter article:", text.substring(0,50)+"...");
             }
         } else {
             // General case for other elements/sites
             text = el.textContent ? el.textContent.trim() : "";
         }
         // --- End special handling ---

         let reason = ""; // Why it might be skipped

         // --- DETAILED LOGGING ---
         console.log(`[Debug] Found element: <${el.tagName}>, Text length: ${text.length}, Text: "${text.substring(0, 50)}..."`);

         // Filter out short text, code blocks, navigation, etc.
         if (text.length > 25 && text.length < 1000 && !el.closest('nav, code, pre, script, style, button, a')) {
         } else if (text.length >= 1000) {
             reason = "Too long";
         } else if (el.closest('nav, code, pre, script, style, button, a')) { // Added button/link check
             reason = "Likely navigation, code, or interactive element";
         }

         if (reason) {
             console.log(`[Debug]   -> Skipping: ${reason}`);
             processedElements.add(el); // Mark skipped elements as processed
         } else {
             console.log("[Debug]   -> Adding to check list.");
             headlines.push({ element: targetElement, text: text });
             processedElements.add(el); // Mark added elements as processed
         }
         // --- END DETAILED LOGGING ---

    } else if (!processedElements.has(el)) {
        // Log elements that are hidden or already processed (less important)
        // console.log(`[Debug] Skipping hidden or already processed element: <${el.tagName}>`);
        processedElements.add(el);
    }
});

    // console.log("Misinfo Detector: Headlines to check:", headlines.length);
    return headlines;
}


// Function to send headlines to the backend API
async function checkHeadlinesWithAPI(headlinesToCheck) {
    if (!headlinesToCheck || headlinesToCheck.length === 0) {
        return;
    }

    const headlineTexts = headlinesToCheck.map(h => h.text);

    try {
        console.log(`Misinfo Detector: Sending ${headlineTexts.length} headlines to API...`);
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({ headlines: headlineTexts })
        });

        if (!response.ok) {
            console.error("Misinfo Detector: API request failed", response.status, response.statusText);
             // Add error icons for failed API calls
             headlinesToCheck.forEach(h => addResultIcon(h.element, "error", `API Error: ${response.status}`));
            return;
        }

        const data = await response.json();
        console.log("Misinfo Detector: Received results:", data);

        if (data.results && data.results.length > 0) {
            // Match results back to elements and add icons
            data.results.forEach(result => {
                // Find potentially multiple elements with the same text
                const originals = headlinesToCheck.filter(h => h.text === result.headline);
                originals.forEach(original => {
                    if (original && original.element) {
                        addResultIcon(original.element, result.status, result.reason);
                    }
                });
            });
        } else if (data.error) {
             console.error("Misinfo Detector: API returned an error:", data.error);
             headlinesToCheck.forEach(h => addResultIcon(h.element, "error", `API Error: ${data.error}`));
        }

    } catch (error) {
        console.error("Misinfo Detector: Error calling API", error);
        // Add error icons for network errors
        headlinesToCheck.forEach(h => addResultIcon(h.element, "error", "API connection failed"));
    }
}

// Function to add the icon next to the headline/text
function addResultIcon(element, status, reason) {
    // Prevent adding multiple icons to the same element
    if (element.querySelector('.misinfo-icon')) {
        return;
    }

    let icon = '';
    let color = 'gray';
    let title = `Misinfo Detector: ${reason}`; // Tooltip text

    switch (status) {
        case 'misleading':
            icon = '❌'; // Red X
            color = '#e0245e'; // Twitter-like red
            break;
        case 'caution':
            icon = '⚠️'; // Warning sign
            color = '#ffad1f'; // Twitter-like orange/yellow
            break;
        case 'verified':
             icon = '✅'; // Green check
             color = '#17bf63'; // Twitter-like green
            // Maybe don't show verified icon to reduce clutter? Uncomment below to hide.
            // return;
            break;
        case 'error':
             icon = '❓'; // Question mark for errors
             color = '#1da1f2'; // Twitter-like blue
             title = `Misinfo Detector Error: ${reason}`;
            break;
        default:
             icon = '❔'; // Unknown status
    }

    const iconSpan = document.createElement('span');
    iconSpan.textContent = ` ${icon}`;
    iconSpan.style.color = color;
    iconSpan.style.cursor = 'help';
    iconSpan.style.fontSize = 'inherit'; // Use same size as surrounding text
    iconSpan.style.marginLeft = '4px'; // Add a little space
    iconSpan.title = title;
    iconSpan.classList.add('misinfo-icon');
    iconSpan.dataset.status = status; // Store status for potential future use

    // Try to append reasonably within the element
     if (element.tagName === 'P' || element.tagName.startsWith('H')) {
        // Append at the end for paragraphs and headings
        element.appendChild(iconSpan);
     } else {
         // For divs (like tweets), append after the main text node if possible
         // This is simplistic and might need adjustment per site
         element.insertBefore(iconSpan, element.firstChild?.nextSibling); // Try inserting after first child
     }
}

// --- Dynamic Content Handling with MutationObserver ---


// Create and start the MutationObserver
const observer = new MutationObserver(processMutations);
observer.observe(document.body, {
    childList: true, // Watch for nodes being added or removed
    subtree: true    // Watch the entire body and its descendants
});

// --- Initial Scan ---
console.log("Misinfo Detector: Setting up initial scan...");
// Run an initial scan after a short delay to allow page rendering
setTimeout(() => {
    console.log("Misinfo Detector: Running initial scan...");
    const initialHeadlines = findHeadlinesOnPage();
    checkHeadlinesWithAPI(initialHeadlines);
    console.log("Misinfo Detector: Initial scan complete, observer watching...");
}, 1500); // Wait 1.5 seconds after script load