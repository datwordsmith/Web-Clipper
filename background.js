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

        // Get existing clips
        const result = await chrome.storage.sync.get(['clips']);
        const clips = result.clips || [];

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

        // Check if adding this clip would exceed quota
        if (newClipSize > CHROME_SYNC_STORAGE_LIMIT) {
            throw new Error('CLIP_TOO_LARGE');
        }

        // Add new clip to beginning of array
        clips.unshift(newClip);
        
        // Save updated clips array
        await chrome.storage.sync.set({ clips });
        updateBadge(clips.length);

        // Broadcast to all windows and tabs
        try {
            await chrome.runtime.sendMessage({
                target: 'sidepanel',
                action: 'sidePanel:updateClips',
                clips: clips
            });
        } catch (error) {
            // Ignore connection errors for closed sidepanels
            if (!error.message.includes('Could not establish connection')) {
                console.error('Error updating sidepanel:', error);
            }
        }    
        
        try {
            await chrome.runtime.sendMessage({
                target: 'sidepanel',
                action: 'sidePanel:updateClips',
                clips: clips
            });
        } catch (error) {
            // Ignore connection errors for closed sidepanels
            if (!error.message.includes('Could not establish connection')) {
                console.error('Error updating sidepanel:', error);
            }
        }        

        return { success: true };        

    } catch (error) {
        console.error('Error saving clip:', error);
        throw error;
    }
}

// Generate unique ID for clips
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
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