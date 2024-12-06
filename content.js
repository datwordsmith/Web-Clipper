// Inject required styles
const style = document.createElement('style');
style.textContent = `
    .web-clipper-button-group {
        position: fixed;
        background: #ffffff;
        border: 1px solid #ddd;
        padding: 8px;
        border-radius: 4px;
        display: flex;
        gap: 8px;
        z-index: 21474836472147483647;
        font-family: Arial, sans-serif;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        user-select: none;
    }

    .web-clipper-button {
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 14px;
        transition: all 0.2s ease;
    }

    .web-clipper-save-button {
        background: #198754;
        color: white;
    }

    .web-clipper-save-button:hover {
        background: #146c43;
    }

    .web-clipper-ignore-button {
        background: #6c757d;
        color: white;
    }

    .web-clipper-ignore-button:hover {
        background: #5c636a;
    }
`;
document.head.appendChild(style);

let selectedText = '';
let sourceInfo = {};

// Function to handle text selection
function handleSelection(event) {
    // Wait a brief moment to ensure selection is complete
    setTimeout(() => {
        const selection = window.getSelection();
        selectedText = selection.toString().trim();

        if (selectedText) {
            // Get selection coordinates
            const range = selection.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            
            // Gather source information
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

            // Calculate position for button group
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;
            
            showClipButton({
                x: rect.left + scrollX + (rect.width / 2),
                y: rect.bottom + scrollY
            });
        }
    }, 10);
}

// Helper function to get author (checks common metadata patterns)
function getAuthor() {
    const authorMeta = document.querySelector('meta[name="author"]') ||
        document.querySelector('meta[property="article:author"]');
    if (authorMeta) return authorMeta.content;

    const authorSelectors = [
        '.author',
        '.byline',
        '[rel="author"]',
        '.entry-author'
    ];

    for (let selector of authorSelectors) {
        const element = document.querySelector(selector);
        if (element) return element.textContent.trim();
    }

    return 'Unknown Author';
}

// Helper function to get publish date
function getPublishDate() {
    const dateMeta = document.querySelector('meta[name="publication_date"]') ||
        document.querySelector('meta[property="article:published_time"]');
    if (dateMeta) return dateMeta.content;

    const dateSelectors = [
        '.published-date',
        '.post-date',
        'time[datetime]'
    ];

    for (let selector of dateSelectors) {
        const element = document.querySelector(selector);
        if (element) {
            return element.getAttribute('datetime') || element.textContent.trim();
        }
    }

    return 'Unknown Date';
}

// Get context before selection
function getContextBefore(selection) {
    const range = selection.getRangeAt(0);
    const contextRange = range.cloneRange();
    contextRange.setStart(range.startContainer.parentElement, 0);
    return contextRange.toString().slice(-150); // Last 150 characters before selection
}

// Get context after selection
function getContextAfter(selection) {
    const range = selection.getRangeAt(0);
    const contextRange = range.cloneRange();
    contextRange.setEndAfter(range.endContainer.parentElement);
    return contextRange.toString().slice(0, 150); // First 150 characters after selection
}

// Show floating button group near selection
function showClipButton(position) {
    // Remove any existing button groups
    const existingButtonGroup = document.querySelector('.web-clipper-button-group');
    if (existingButtonGroup) existingButtonGroup.remove();

    // Create button group
    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'web-clipper-button-group';
    
    // Position the button group below the selection
    buttonGroup.style.left = `${Math.min(position.x, window.innerWidth - 200)}px`;
    buttonGroup.style.top = `${position.y + 10}px`;

    // Save button
    const saveButton = document.createElement('button');
    saveButton.className = 'web-clipper-button web-clipper-save-button';
    saveButton.innerHTML = '<span>Save Clip</span>';
    saveButton.addEventListener('click', saveClip);

    // Ignore button
    const ignoreButton = document.createElement('button');
    ignoreButton.className = 'web-clipper-button web-clipper-ignore-button';
    ignoreButton.innerHTML = '<span>Ignore</span>';
    ignoreButton.addEventListener('click', () => buttonGroup.remove());

    buttonGroup.appendChild(saveButton);
    buttonGroup.appendChild(ignoreButton);
    document.body.appendChild(buttonGroup);

    // Add listeners to handle clicking outside
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('scroll', () => buttonGroup.remove());
    window.addEventListener('resize', () => buttonGroup.remove());
}
  

// Save the clip to storage
async function saveClip() {
  try {
      // Remove the clip button first
      const button = document.getElementById('web-clipper-button');
      if (button) button.remove();
      
      // Send message to background script and wait for response
      const response = await chrome.runtime.sendMessage({
          action: 'saveClip',
          data: sourceInfo
      });
      
      // Check if the save was successful
      if (response && response.error) {
          showNotification(response.error, 'error');
      } else {
          showNotification('Clip saved successfully!', 'success');
      }
  } catch (error) {
      console.error('Error saving clip:', error);
      showNotification('Failed to save clip. Please try again.', 'error');
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

// Listen for text selection
document.addEventListener('mouseup', handleSelection);
document.addEventListener('selectionchange', () => {
    const selection = window.getSelection();
    if (!selection.toString().trim()) {
        const buttonGroup = document.querySelector('.web-clipper-button-group');
        if (buttonGroup) buttonGroup.remove();
    }
});

function handleOutsideClick(event) {
    const buttonGroup = document.getElementById('web-clipper-button-group');
    if (buttonGroup && !buttonGroup.contains(event.target)) {
        buttonGroup.remove();
        cleanupListeners();
    }
}


function handleDeselection() {
    const selection = window.getSelection();
    if (!selection.toString().trim()) {
        const buttonGroup = document.getElementById('web-clipper-button-group');
        if (buttonGroup) {
            buttonGroup.remove();
            cleanupListeners();
        }
    }
}


function cleanupListeners() {
    document.removeEventListener('mousedown', handleOutsideClick);
    document.removeEventListener('selectionchange', handleDeselection);
}



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