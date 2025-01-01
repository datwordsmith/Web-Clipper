// Constants
const CHROME_SYNC_STORAGE_LIMIT = 102400;

function escapeHTML(text) {
    if (!text) return '';
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Utility Functions
function truncateText(text, maxLength = 120) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function searchAndHighlightClips(clips, searchTerm) {
    if (!searchTerm) return clips;
    
    searchTerm = searchTerm.toLowerCase();
    return clips.filter(clip => {
        const textMatch = clip.selectedText?.toLowerCase().includes(searchTerm);
        const titleMatch = clip.title?.toLowerCase().includes(searchTerm);
        const authorMatch = clip.author?.toLowerCase().includes(searchTerm);
        return textMatch || titleMatch || authorMatch;
    });
}

function highlightMatch(text, searchTerm) {
    if (!searchTerm || !text) return escapeHTML(text);
    const escapedText = escapeHTML(text);
    const escapedSearchTerm = escapeHTML(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
    return escapedText.replace(regex, '<mark class="highlight">$1</mark>');
}

// Storage Management
async function updateStorageInfo() {
    if (!chrome.storage || !chrome.storage.sync) {
        console.error('Chrome storage API not available');
        return;
    }

    try {
        const bytesInUse = await new Promise((resolve, reject) => {
            chrome.storage.sync.getBytesInUse(null, (bytes) => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(bytes);
                }
            });
        });

        const quotaPercentage = (bytesInUse / CHROME_SYNC_STORAGE_LIMIT) * 100;
        const storageInfo = document.getElementById('storageInfo');
        if (!storageInfo) return;
        
        storageInfo.innerHTML = `
            <div class="storage-usage small mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span>Storage Usage</span>
                    <span>${Math.round(quotaPercentage)}%</span>
                </div>
                <div class="progress">
                    <div class="progress-bar progress-bar-striped ${quotaPercentage > 80 ? 'bg-danger' : 'bg-success'}" 
                         role="progressbar" 
                         style="width: ${quotaPercentage}%" 
                         aria-valuenow="${quotaPercentage}" 
                         aria-valuemin="0" 
                         aria-valuemax="100">
                    </div>
                </div>
                ${quotaPercentage > 80 ? 
                    '<div class="text-danger mt-1"><small><i class="bi bi-exclamation-triangle"></i> Storage nearly full</small></div>' 
                    : ''}
            </div>
        `;
    } catch (error) {
        console.error('Error updating storage info:', error);
        const storageInfo = document.getElementById('storageInfo');
        if (storageInfo) {
            storageInfo.innerHTML = `
                <div class="alert alert-warning small">
                    Unable to fetch storage information
                </div>
            `;
        }
    }
}

// Core Display Function
function displayClips(clips, searchInput) {
    const searchTerm = searchInput?.value?.toLowerCase() || '';
    const clipsContainer = document.getElementById('clipsContainer');

    if (!clipsContainer) return;

    if (!clips || clips.length === 0) {
        clipsContainer.innerHTML = '<p class="text-center text-muted">No clips saved yet.</p>';
        return;
    }

    const filteredClips = searchTerm ? searchAndHighlightClips(clips, searchTerm) : clips;

    if (filteredClips.length === 0) {
        clipsContainer.innerHTML = '<p class="text-center text-muted">No matching clips found.</p>';
        return;
    }

    clipsContainer.innerHTML = filteredClips.map((clip, index) => {
        const highlightedText = searchTerm ? 
            highlightMatch(clip.selectedText, searchTerm) :
            escapeHTML(truncateText(clip.selectedText));
        const highlightedTitle = searchTerm ? 
            highlightMatch(clip.title || '', searchTerm) :
            escapeHTML(clip.title || '');
        const highlightedAuthor = searchTerm ? 
            highlightMatch(clip.author || '', searchTerm) :
            escapeHTML(clip.author || '');

        return `
            <div class="clip-item border rounded p-2 mb-2">
                <div class="clip-content">
                    <div class="clip-metadata text-muted small mb-2">
                        <div><strong>Source:</strong> ${highlightedTitle}</div>
                        <div><strong>Author:</strong> ${highlightedAuthor}</div>
                        <div><strong>Date Clipped:</strong> ${new Date(clip.dateClipped).toLocaleDateString()}</div>
                    </div>
                    <pre class="mb-3 text-wrap"><code>${highlightedText}</code></pre>
                </div>
                <div class="btn-group btn-group-sm w-100">
                    <button class="btn btn-outline-info view-btn" data-index="${index}">
                        <i class="bi bi-eye"></i> View
                    </button>
                    <button class="btn btn-outline-secondary copy-citation-btn" data-key="clip_${clip.id}">
                        <i class="bi bi-quote"></i> Citation
                    </button>
                    <button class="btn btn-outline-success copy-text-btn" data-key="clip_${clip.id}">
                        <i class="bi bi-files"></i> Copy
                    </button>
                    <button class="btn btn-outline-primary email-btn" data-index="${index}">
                        <i class="bi bi-envelope"></i> Email
                    </button>                    
                    <button class="btn btn-outline-danger delete-btn" data-index="${index}">
                        <i class="bi bi-trash"></i> Delete
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Event Handlers
function handleClipUpdate(message, sender, sendResponse) {
    console.log('Received message:', message);
    
    if (message.action === 'sidePanel:updateClips') {
        // If clips are included in the message, use them directly
        if (message.clips) {
            displayClips(message.clips, document.getElementById('searchInput'));
            updateStorageInfo();
        } else {
            // Otherwise fetch from storage
            chrome.storage.sync.get(['clips'], (result) => {
                const clips = result.clips || [];
                displayClips(clips, document.getElementById('searchInput'));
                updateStorageInfo();
            });
        }
    }    
}

function handleStorageChange(changes, namespace) {
    if (namespace === 'sync' && changes.clips) {
        console.log('Storage changed:', changes.clips);
        displayClips(changes.clips.newValue, document.getElementById('searchInput'));
        updateStorageInfo();
    }
}

// Message Listener Setup
function setupMessageListeners() {
    chrome.runtime.onMessage.removeListener(handleClipUpdate);

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('Sidepanel received message:', message);
            
        if (message.target === 'sidepanel' && message.action === 'sidePanel:updateClips') {
            // Always use the clips from the message
            const clips = message.clips || [];
            displayClips(clips, document.getElementById('searchInput'));
            updateStorageInfo();
            
            // Acknowledge receipt
            sendResponse({ success: true });
        }
        return true; // Keep channel open for async response
    });  
    
    // Also listen for storage changes as backup
    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.clips) {
            displayClips(changes.clips.newValue, document.getElementById('searchInput'));
            updateStorageInfo();
        }
    });
}

// Attach event listeners to buttons
function attachEventListeners() {
    const clipsContainer = document.getElementById('clipsContainer');
    
    // Use event delegation
    clipsContainer.addEventListener('click', (e) => {
        // View button
        const viewBtn = e.target.closest('.view-btn');
        if (viewBtn) {
            const index = parseInt(viewBtn.dataset.index);
            viewClip(index);
            return;
        }        

        // Copy citation button
        const citationBtn = e.target.closest('.copy-citation-btn');
        if (citationBtn) {
            const clipKey = citationBtn.dataset.key;
            copyCitation(clipKey);
            return;
        }        

        // Copy text button
        const copyTextBtn = e.target.closest('.copy-text-btn');
        if (copyTextBtn) {
            const clipKey = copyTextBtn.dataset.key;
            copyText(clipKey);
            return;
        }        

        // Delete button
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.index);
            chrome.storage.sync.get('clipIndex', (result) => {
                const clipKeys = result.clipIndex || [];
                currentClipKey = clipKeys[index];
                currentClipIndex = index;
                showDeleteModal(index);
            });
        }

        // Email button
        const emailBtn = e.target.closest('.email-btn');
        if (emailBtn) {
            const index = parseInt(emailBtn.dataset.index, 10);
            
            chrome.storage.sync.get(null, (result) => {
                const clipKeys = result.clipIndex || [];
                const clipKey = clipKeys[index];
                const clip = result[clipKey];
                
                if (clip) {
                    emailClip(clip);
                } else {
                    console.error('No clip found for index:', index);
                    showToast('Failed to find the clip for emailing', 'danger');
                }
            });
            return;
        }
    });
}

// View clip in offcanvas
function viewClip(index) {
    chrome.storage.sync.get(null, (result) => {
        const clipKeys = result.clipIndex || [];
        const clipKey = clipKeys[index];
        const clip = result[clipKey];

        if (clip) {
            const actionsContainer = document.getElementById('clip-actions');
            actionsContainer.innerHTML = `
                <button class="btn btn-outline-secondary btn-sm" id="offcanvas-citation-btn">
                    <i class="bi bi-quote"></i> Copy Citation
                </button>
                <button class="btn btn-outline-success btn-sm" id="offcanvas-copy-btn">
                    <i class="bi bi-files"></i> Copy Text
                </button>
                <button class="btn btn-outline-primary btn-sm" id="offcanvas-email-btn">
                    <i class="bi bi-envelope"></i> Email
                </button>                
            `;
            
            // Event listeners for the offcnavas buttons
            document.getElementById('offcanvas-citation-btn').addEventListener('click', () => {
                const citation = `${clip.author || 'Unknown Author'} (${clip.date || 'Unknown Date'}). ${clip.title || 'Untitled'}. Retrieved from ${clip.url || 'No URL'}`;
                navigator.clipboard.writeText(citation)
                    .then(() => showOffcanvasToast('Citation copied to clipboard'))
                    .catch(err => {
                        console.error('Clipboard error:', err);
                        showOffcanvasToast('Failed to copy citation', 'danger');
                    });
            });            
            
            document.getElementById('offcanvas-copy-btn').addEventListener('click', () => {
                navigator.clipboard.writeText(clip.selectedText)
                    .then(() => showOffcanvasToast('Text copied to clipboard'))
                    .catch(err => {
                        console.error('Clipboard error:', err);
                        showOffcanvasToast('Failed to copy text', 'danger');
                    });
            });

            document.getElementById('offcanvas-email-btn').addEventListener('click', () => {
                emailClip(clip);
            });            

            const metadataHTML = `
                <p class="mb-1"><strong>Source:</strong> ${clip.title}</p>
                <p class="mb-1"><strong>Author:</strong> ${clip.author}</p>
                <p class="mb-1"><strong>Date:</strong> ${clip.date}</p>
                <p class="mb-1"><strong>URL:</strong> <a href="${clip.url}" target="_blank">${clip.url}</a></p>
            `;
            
            document.getElementById('clip-metadata').innerHTML = metadataHTML;
            document.getElementById('full-clip-content').textContent = clip.selectedText;
            
            clipOffcanvas.show();
        }
    });
}


//offCanvas Toast
function showOffcanvasToast(message, type = 'success') {
    const toastContainer = document.createElement('div');
    toastContainer.className = 'position-fixed top-0 start-50 translate-middle-x p-3';
    toastContainer.style.zIndex = '1070';

    toastContainer.innerHTML = `
        <div class="toast align-items-center text-white bg-${type} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;

    document.body.appendChild(toastContainer);

    // Initialize Bootstrap toast
    const toast = new bootstrap.Toast(toastContainer.querySelector('.toast'), {
        autohide: true,
        delay: 3000
    });
    
    toast.show();

    // Remove the container after the toast is hidden
    toast._element.addEventListener('hidden.bs.toast', () => {
        toastContainer.remove();
    });
}

// Copy citation
function copyCitation(clipKey) {
    chrome.storage.sync.get([clipKey], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error accessing storage:', chrome.runtime.lastError.message);
            showToast('Failed to access storage', 'danger');
            return;
        }
        const clip = result[clipKey];
        if (clip) {
            const citation = `${clip.author || 'Unknown Author'} (${clip.date || 'Unknown Date'}). ${clip.title || 'Untitled'}. Retrieved from ${clip.url || 'No URL'}`;
            navigator.clipboard.writeText(citation)
                .then(() => showToast('Citation copied to clipboard'))
                .catch(err => {
                    console.error('Clipboard error:', err);
                    showToast('Failed to copy citation', 'danger');
                });
        } else {
            console.warn('No clip found for key:', clipKey);
            showToast('Clip not found', 'danger');
        }
    });
}

// Copy text
function copyText(clipKey) {
    chrome.storage.sync.get([clipKey], (result) => {
        if (chrome.runtime.lastError) {
            console.error('Error accessing storage:', chrome.runtime.lastError.message);
            showToast('Failed to access storage', 'danger');
            return;
        }
        const clip = result[clipKey];
        if (clip && clip.selectedText) {
            navigator.clipboard.writeText(clip.selectedText)
                .then(() => showToast('Text copied to clipboard'))
                .catch(err => {
                    console.error('Clipboard error:', err);
                    showToast('Failed to copy text', 'danger');
                });
        } else {
            console.warn('No text found for key:', clipKey);
            showToast('Clip or text not found', 'danger');
        }
    });
}

// Show delete confirmation modal
function showDeleteModal(index) {
    currentClipIndex = index;
    deleteModal.show();
}

// Delete clip
function deleteClip() {
    if (currentClipKey === null) return;
    
    chrome.storage.sync.get(null, async (result) => {
        try {
            const clipIndex = result.clipIndex || [];
            const updatedIndex = clipIndex.filter(key => key !== currentClipKey);
            
            // Create an update object
            const updates = {
                clipIndex: updatedIndex
            };
            updates[currentClipKey] = null; // Mark for deletion
            
            // Update storage
            await chrome.storage.sync.set(updates);
            
            // Remove the deleted item
            await chrome.storage.sync.remove(currentClipKey);
            
            // Hide modal and update UI
            deleteModal.hide();
            window.loadClips();
            showToast('Clip deleted successfully');
            
            // Update storage info
            updateStorageInfo();
            
            // Notify background script about deletion
            chrome.runtime.sendMessage({
                action: 'clipDeleted',
                clipIndex: updatedIndex
            });
            
            // Reset current clip key
            currentClipKey = null;
            
        } catch (error) {
            console.error('Error deleting clip:', error);
            showToast('Error deleting clip', 'danger');
        }
    });
}

// Email clip
function emailClip(clip) {
    if (!clip) {
        console.error('Email clip called with no clip data');
        showToast('Clip data is missing', 'danger');
        return;
    }

    try {
        // Format the date properly
        const clipDate = clip.dateClipped ? new Date(clip.dateClipped).toLocaleDateString() : 'Unknown Date';
        
        // Create a clean email body with proper formatting
        const emailBody = `
        Source: ${clip.title || 'Untitled'}
        Author: ${clip.author || 'Unknown'}
        Date: ${clipDate}
        URL: ${clip.url || 'N/A'}

        Clipped Text:
        ${clip.selectedText || 'No text'}

        Citation:
        ${clip.author || 'Unknown Author'} (${clipDate}). ${clip.title || 'Untitled'}. Retrieved from ${clip.url || 'No URL'}`.trim();

        // Create Gmail compose URL
        const gmailURL = `https://mail.google.com/mail/u/0/?fs=1&tf=cm&source=mailto&to=&su=${encodeURIComponent(`Clip: ${clip.title || 'Untitled'}`)}&body=${encodeURIComponent(emailBody)}`;

        // Open Gmail in a new tab
        chrome.tabs.create({ url: gmailURL }, (tab) => {
            if (chrome.runtime.lastError) {
                console.error('Error opening Gmail:', chrome.runtime.lastError);
                showToast('Failed to open Gmail', 'danger');
                return;
            }
            showToast('Gmail opened with clip content');
        });
    } catch (error) {
        console.error('Error in emailClip:', error);
        showToast('Failed to generate email', 'danger');
    }
}


// Show toast notification
function showToast(message, type = 'success') {
    const toastContainer = document.createElement('div');
    toastContainer.className = 'position-fixed bottom-0 start-50 translate-middle-x p-3';
    toastContainer.style.zIndex = '11';

    toastContainer.innerHTML = `
        <div class="toast align-items-center text-white bg-${type} border-0" role="alert">
            <div class="d-flex">
                <div class="toast-body">
                    ${message}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
            </div>
        </div>
    `;

    document.body.appendChild(toastContainer);
    const toast = new bootstrap.Toast(toastContainer.querySelector('.toast'));
    toast.show();

    toast._element.addEventListener('hidden.bs.toast', () => {
        toastContainer.remove();
    });
}


const clipsContainer = document.getElementById('clipsContainer');
const clipOffcanvas = new bootstrap.Offcanvas(document.getElementById('clipOffcanvas'));
const deleteModal = new bootstrap.Modal(document.getElementById('deleteClipModal'));

// DOM Content Loaded Event
document.addEventListener('DOMContentLoaded', () => {
    console.log('Sidepanel DOM loaded');

    attachEventListeners();


    const searchInput = document.getElementById('searchInput');
    let currentClipIndex = null;
    let debounceTimer;

    window.loadClips = function(clips = null) {
        try {
            updateStorageInfo();
        } catch (error) {
            console.error('Error updating storage info:', error);
        }
        
        if (!clips) {
            chrome.storage.sync.get(null, (result) => {
                const clipKeys = result.clipIndex || [];
                const clips = clipKeys.map(key => result[key]).filter(Boolean);
                displayClips(clips, document.getElementById('searchInput'));
            });
        } else {
            displayClips(clips, document.getElementById('searchInput'));
        }
    }

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync' && changes.clips) {
            console.log('Storage changed in sidepanel:', changes.clips.newValue);
            displayClips(changes.clips.newValue, document.getElementById('searchInput'));
            updateStorageInfo();
        }
    });

    function showToast(message, type = 'success') {
        const toastContainer = document.createElement('div');
        toastContainer.className = 'position-fixed bottom-0 end-0 p-3';
        toastContainer.style.zIndex = '11';
        
        toastContainer.innerHTML = `
            <div class="toast align-items-center text-white bg-${type} border-0" role="alert">
                <div class="d-flex">
                    <div class="toast-body">
                        ${message}
                    </div>
                    <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
                </div>
            </div>
        `;
        
        document.body.appendChild(toastContainer);
        const toast = new bootstrap.Toast(toastContainer.querySelector('.toast'));
        toast.show();
        
        toast._element.addEventListener('hidden.bs.toast', () => {
            toastContainer.remove();
        });
    }

    // Event Listeners Setup
    document.querySelector('#deleteClipModal .btn-danger').addEventListener('click', deleteClip);

    document.getElementById('clipOffcanvas').addEventListener('hidden.bs.offcanvas', () => {
        const citationBtn = document.getElementById('offcanvas-citation-btn');
        const copyBtn = document.getElementById('offcanvas-copy-btn');
        
        if (citationBtn) citationBtn.remove();
        if (copyBtn) copyBtn.remove();
    });    

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            chrome.storage.sync.get(null, (result) => {
                const clipKeys = result.clipIndex || [];
                const clips = clipKeys.map(key => result[key]).filter(Boolean);
                displayClips(clips, searchInput);
            });
        }, 300);
    });

    // Initialize
    //loadClips();
    window.loadClips();
    setupMessageListeners();
});