// background.js

const CHROME_SYNC_STORAGE_LIMIT = 102400; // 100KB limit
const MAX_CLIP_LENGTH = 8000;

// Handle messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'saveClip') {
        // Handle saving the clip
        saveClip(message.data)
            .then(() => sendResponse({ success: true }))
            .catch(error => sendResponse({ success: false, error: error.message }));
        return true; // Important: indicates we'll send response asynchronously
    }
    
    if (message.action === 'addTag') {
        addTagToClip(message.clipId, message.tag)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({ error: error.message }));
        return true;
    }
    
    if (message.action === 'removeTag') {
        removeTagFromClip(message.clipId, message.tag)
            .then(response => sendResponse(response))
            .catch(error => sendResponse({ error: error.message }));
        return true;
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
        return { success: true };        

    } catch (error) {
        console.error('Error saving clip:', error);
        throw error;
    }
}

// Modified showNotification function


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

async function addTagToClip(clipId, tag) {
    try {
        const result = await chrome.storage.sync.get(['clips']);
        const clips = result.clips || [];
        
        const clipIndex = clips.findIndex(clip => clip.id === clipId);
        if (clipIndex === -1) throw new Error('Clip not found');
        
        // Ensure tag is properly formatted
        tag = tag.toLowerCase().trim();
        
        // Add tag if it doesn't exist
        if (!clips[clipIndex].tags.includes(tag)) {
            clips[clipIndex].tags.push(tag);
            await chrome.storage.sync.set({ clips });
            return { success: true };
        }
        
        return { success: false, message: 'Tag already exists' };
    } catch (error) {
        console.error('Error adding tag:', error);
        throw error;
    }
}

async function removeTagFromClip(clipId, tag) {
    try {
        const result = await chrome.storage.sync.get(['clips']);
        const clips = result.clips || [];
        
        const clipIndex = clips.findIndex(clip => clip.id === clipId);
        if (clipIndex === -1) throw new Error('Clip not found');
        
        // Remove tag
        const tagIndex = clips[clipIndex].tags.indexOf(tag);
        if (tagIndex > -1) {
            clips[clipIndex].tags.splice(tagIndex, 1);
            await chrome.storage.sync.set({ clips });
            return { success: true };
        }
        
        return { success: false, message: 'Tag not found' };
    } catch (error) {
        console.error('Error removing tag:', error);
        throw error;
    }
}
