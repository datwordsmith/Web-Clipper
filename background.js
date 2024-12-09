// background.js
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const CHROME_SYNC_STORAGE_LIMIT = 102400; // 100KB limit
const MAX_CLIP_LENGTH = 8192;

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'saveClip') {
        // Handle saving the clip
        saveClip(message.data)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Important: indicates we'll send response asynchronously
    }   
});

chrome.runtime.onInstalled.addListener(async () => {
    // Initialize storage
    try {
        const storage = await chrome.storage.sync.get(['clips']);
        if (!storage.clips) {
            await chrome.storage.sync.set({ clips: [] });
            console.log('Storage initialized successfully');
        }
    } catch (error) {
        console.error('Error initializing storage:', error);
    }
});


// Save clip to storage
async function saveClip(clipData) {
    try {
        // Check clip length
        if (clipData.selectedText.length > MAX_CLIP_LENGTH) {
            throw new Error('CLIP_TOO_LONG');
        }

        // Format the clip data
        const newClip = {
            id: generateId(),
            selectedText: clipData.selectedText,
            title: clipData.title || 'Untitled',
            url: clipData.url,
            author: clipData.author || 'Unknown Author',
            date: clipData.date || new Date().toISOString(),
            dateClipped: new Date().toISOString(),
            tags: [],
            contextBefore: clipData.contextBefore || '',
            contextAfter: clipData.contextAfter || ''
        };

        // Calculate approximate size of new clip
        const newClipSize = JSON.stringify(newClip).length;
        if (newClipSize > CHROME_SYNC_STORAGE_LIMIT) {
            throw new Error('CLIP_TOO_LARGE');
        }

        // Get existing clip IDs
        const result = await chrome.storage.sync.get(['clipIndex']);
        const clipIndex = result.clipIndex || [];

        // Add new clip to storage with its ID as the key
        const clipKey = `clip_${newClip.id}`;
        await chrome.storage.sync.set({
            [clipKey]: newClip,
            clipIndex: [clipKey, ...clipIndex].slice(0, 50) // Limit to 50 clips
        });

        // Update badge count
        updateBadge(clipIndex.length + 1);

        // Broadcast updates to sidepanel
        broadcastClipUpdate();

        return { success: true };
    } catch (error) {
        console.error('Error saving clip:', error);
        throw error;
    }
}


// Generate unique ID for clips
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 15);
}

async function broadcastClipUpdate() {
    try {
        const result = await chrome.storage.sync.get(null);
        const clipKeys = result.clipIndex || [];
        const clips = clipKeys.map(key => result[key]).filter(Boolean);

        await chrome.runtime.sendMessage({
            target: 'sidepanel',
            action: 'sidePanel:updateClips',
            clips
        });
    } catch (error) {
        if (!error.message.includes('Could not establish connection')) {
            console.error('Error broadcasting clip update:', error);
        }
    }
}


// Update extension badge
function updateBadge(count) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#4a90e2' });
}

// Show chrome notification
function showNotification(message, type = 'success') {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'assets/img/icon.png',
        title: type === 'error' ? 'Web Clipper Error' : 'Web Clipper',
        message: message,
        priority: type === 'error' ? 2 : 0
    });
}

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Initialize storage with empty clips array
        chrome.storage.sync.set({ clips: [] });

        // Show welcome notification
        showNotification('Web Clipper installed successfully! Start selecting text to save clips.');
    }
});


// Context menu creation
chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: 'saveSelection',
        title: 'Save Selection',
        contexts: ['selection']
    });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'saveSelection') {
        try {
            // Send message to content script to handle the selection
            chrome.tabs.sendMessage(tab.id, {
                action: 'handleContextMenuSelection',
                data: {
                    selectedText: info.selectionText
                }
            });
        } catch (error) {
            console.error('Error sending message to content script:', error);
        }
    }
});

// Optional: Handle keyboard shortcuts
chrome.commands.onCommand.addListener((command) => {
    if (command === 'save-clip') {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            try {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: 'triggerClipSave'
                });
            } catch (error) {
                console.error('Error sending message to content script:', error);
            }
        });
    }
});


chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.clips) {
        // Get all windows to find sidepanels
        chrome.windows.getAll({ populate: true }, (windows) => {
            windows.forEach(window => {
                // Send update to sidepanel
                chrome.runtime.sendMessage({
                    target: 'sidepanel',
                    action: 'sidePanel:updateClips',
                    clips: changes.clips.newValue
                }).catch(error => {
                    // Ignore errors from closed sidepanels
                    if (!error.message.includes('Could not establish connection')) {
                        console.error('Error updating sidepanel:', error);
                    }
                });
            });
        });
    }
});