// Inject required styles
const style = document.createElement('style');
style.textContent = `
    .web-clipper-button-group {
        position: fixed;
        background: #2d2d2d;
        padding: 4px;
        border-radius: 3px;
        display: flex;
        gap: 4px;
        z-index: 2147483647;
        font-family: system-ui, -apple-system, sans-serif;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        user-select: none;
    }        

    .web-clipper-button {
        padding: 4px 8px;
        border-radius: 2px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        transition: all 0.15s ease;
        border: none;
        background: transparent;
        color: #ffffff;
    }

    .web-clipper-button:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .web-clipper-save-button {
        background: #18b713;
    }

    .web-clipper-save-button:hover {
        background: rgba(255, 255, 255, 0.2);
    }
`;
document.head.appendChild(style);

let selectedText = '';
let sourceInfo = {};

// Function to handle text selection
function handleSelection(event) {
    setTimeout(() => {
        const selection = window.getSelection();
        selectedText = selection.toString().trim();

        if (selectedText) {
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            sourceInfo = {
                url: window.location.href,
                title: document.title,
                author: getAuthor(),
                date: getPublishDate(),
                dateClipped: new Date().toISOString(),
                selectedText: selectedText,
                contextBefore: getContextBefore(selection),
                contextAfter: getContextAfter(selection)
            };

           
            showClipButton({
                x: rect.left + window.scrollX,
                y: rect.bottom + window.scrollY                
            });
        }
    }, 10);
}

// Helper functions to get author and date
function getAuthor() {
    const authorMeta = document.querySelector('meta[name="author"]') || document.querySelector('meta[property="article:author"]');
    if (authorMeta) return authorMeta.content;

    const authorSelectors = ['.author', '.byline', '[rel="author"]', '.entry-author'];
    for (let selector of authorSelectors) {
        const element = document.querySelector(selector);
        if (element) return element.textContent.trim();
    }
    return 'Unknown Author';
}

function getPublishDate() {
    const dateMeta = document.querySelector('meta[name="publication_date"]') || document.querySelector('meta[property="article:published_time"]');
    if (dateMeta) return dateMeta.content;

    const dateSelectors = ['.published-date', '.post-date', 'time[datetime]'];
    for (let selector of dateSelectors) {
        const element = document.querySelector(selector);
        if (element) return element.getAttribute('datetime') || element.textContent.trim();
    }
    return 'Unknown Date';
}

// Get context before and after selection
function getContextBefore(selection) {
    const range = selection.getRangeAt(0);
    const contextRange = range.cloneRange();
    contextRange.setStart(range.startContainer.parentElement, 0);
    return contextRange.toString().slice(-150);
}

function getContextAfter(selection) {
    const range = selection.getRangeAt(0);
    const contextRange = range.cloneRange();
    contextRange.setEndAfter(range.endContainer.parentElement);
    return contextRange.toString().slice(0, 150);
}

// Show button group near selection
function showClipButton(position) {
    const existingButtonGroup = document.querySelector('.web-clipper-button-group');
    if (existingButtonGroup) existingButtonGroup.remove();

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'web-clipper-button-group';

    // Position the button group directly at the left edge
    buttonGroup.style.left = `${position.x}px`;
    buttonGroup.style.top = `${position.y}px`;

    // Create save button with icon
    const saveButton = document.createElement('button');
    saveButton.className = 'web-clipper-button web-clipper-save-button';
    
    // Create icon element for save button
    const saveIcon = document.createElement('img');
    saveIcon.src = chrome.runtime.getURL('assets/img/Web-Research-Clipper-16.png');
    saveIcon.style.width = '16px';
    saveIcon.style.height = '16px';
    saveIcon.style.borderRadius = '3px';
    saveIcon.style.backgroundColor = '#ffffff';
    saveIcon.style.padding = '2px';     
    
    saveButton.appendChild(saveIcon);
    saveButton.appendChild(document.createElement('span')).textContent = 'Save Clip';
    saveButton.addEventListener('click', saveClip);

    // Create ignore button with icon
    const ignoreButton = document.createElement('button');
    ignoreButton.className = 'web-clipper-button web-clipper-ignore-button';
    
    // Create icon for ignore button using an SVG
    const ignoreIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    ignoreIcon.setAttribute('width', '16');
    ignoreIcon.setAttribute('height', '16');
    ignoreIcon.setAttribute('viewBox', '0 0 24 24');
    ignoreIcon.setAttribute('fill', 'none');
    ignoreIcon.setAttribute('stroke', 'currentColor');
    ignoreIcon.setAttribute('stroke-width', '2');
    ignoreIcon.setAttribute('stroke-linecap', 'round');
    ignoreIcon.setAttribute('stroke-linejoin', 'round');
    ignoreIcon.innerHTML = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
    
    ignoreButton.appendChild(ignoreIcon);
    ignoreButton.appendChild(document.createElement('span')).textContent = 'Ignore';
    ignoreButton.addEventListener('click', () => {
        buttonGroup.remove();
        clearSelection();
        cleanupListeners();
    });

    buttonGroup.appendChild(saveButton);
    buttonGroup.appendChild(ignoreButton);
    document.body.appendChild(buttonGroup);

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('selectionchange', handleDeselection);
    document.addEventListener('scroll', () => buttonGroup.remove());
    window.addEventListener('resize', () => buttonGroup.remove());

    // Add automatic cleanup after 5 seconds
    setTimeout(() => {
        if (buttonGroup.parentNode) {
            buttonGroup.remove();
            clearSelection();
            cleanupListeners();
        }
    }, 5000);
}
// Clear selection
function clearSelection() {
    if (window.getSelection) {
        if (window.getSelection().empty) {
            window.getSelection().empty();
        } else if (window.getSelection().removeAllRanges) {
            window.getSelection().removeAllRanges();
        }
    } else if (document.selection) {
        document.selection.empty();
    }
}

// Save clip
async function saveClip() {
    try {
        const buttonGroup = document.querySelector('.web-clipper-button-group');
        if (buttonGroup) buttonGroup.remove();

        // Check if the clip size exceeds the per-item limit
        const clipData = JSON.stringify(sourceInfo);
        const clipSize = new Blob([clipData]).size; // Get the size in bytes
        const QUOTA_BYTES_PER_ITEM = 8192; // 8 KB per item limit

        if (clipSize > QUOTA_BYTES_PER_ITEM) {
            showNotification('Clip is too large to save. Please shorten it.', 'error');
            return;
        }        
        
        const response = await chrome.runtime.sendMessage({ 
            action: 'saveClip', 
            data: sourceInfo 
        });

        if (response && response.error) {
            showNotification(response.error, 'error');
        } else {
            showNotification('Clip saved successfully!', 'success');
        }

        // Clear selection and cleanup listeners
        clearSelection();
        cleanupListeners();
    } catch (error) {
        console.error('Error saving clip:', error);
        showNotification('Failed to save clip. Please try again.', 'error');
        
        // Make sure to clean up even if there's an error
        const buttonGroup = document.querySelector('.web-clipper-button-group');
        if (buttonGroup) buttonGroup.remove();
        clearSelection();
        cleanupListeners();
    }
}

// Show notification
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'error' ? '#dc3545' : '#4caf50'};
        color: white;
        padding: 12px 24px;
        border-radius: 4px;
        z-index: 10000;
        font-family: Arial, sans-serif;
        animation: fadeIn 0.3s, fadeOut 0.3s 2s forwards;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => notification.remove(), 2500);
}

// Handle deselection
function handleDeselection() {
    const selection = window.getSelection();
    if (!selection.toString().trim()) {
        const buttonGroup = document.querySelector('.web-clipper-button-group');
        if (buttonGroup) {
            buttonGroup.remove();
            cleanupListeners();
        }
    }
}

// Handle clicks outside
function handleOutsideClick(event) {
    const buttonGroup = document.querySelector('.web-clipper-button-group');
    if (buttonGroup && !buttonGroup.contains(event.target)) {
        buttonGroup.remove();
        cleanupListeners();
    }
}

// Cleanup listeners
function cleanupListeners() {
    document.removeEventListener('mousedown', handleOutsideClick);
    document.removeEventListener('selectionchange', handleDeselection);
}

// Listen for text selection
document.addEventListener('mouseup', handleSelection);

// Listen for context menu selection
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'handleContextMenuSelection') {
        sourceInfo = {
            url: window.location.href,
            title: document.title,
            author: getAuthor(),
            date: getPublishDate(),
            dateClipped: new Date().toISOString(),
            selectedText: message.data.selectedText,
            contextBefore: '',
            contextAfter: ''
        };
        saveClip();
    }
});

