// Constants
const CHROME_SYNC_STORAGE_LIMIT = 102400;

// Utility Functions
function truncateText(text, maxLength = 120) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

function highlightMatch(text, searchTerm) {
    if (!searchTerm) return text;
    const regex = new RegExp(`(${searchTerm})`, 'gi');
    return text.replace(regex, '<span class="highlight">$1</span>');
}

// Storage Management
function updateStorageInfo() {
    if (!chrome.storage || !chrome.storage.sync) {
        console.error('Chrome storage API not available');
        return;
    }

    chrome.storage.sync.getBytesInUse(null, (bytesInUse) => {
        if (chrome.runtime.lastError) {
            console.error('Error accessing storage:', chrome.runtime.lastError);
            return;
        }
        const quotaPercentage = (bytesInUse / CHROME_SYNC_STORAGE_LIMIT) * 100;
        const storageInfo = document.getElementById('storageInfo');
        if (!storageInfo) return;
        
        storageInfo.innerHTML = `
            <div class="storage-usage small mb-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span>Storage Usage</span>
                    <span>${Math.round(quotaPercentage)}%</span>
                </div>
                <div class="progress" style="height: 4px;">
                    <div class="progress-bar ${quotaPercentage > 80 ? 'bg-danger' : 'bg-primary'}" 
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
    });
}

// Core Display Function
function displayClips(clips, searchInput) {
    const searchTerm = searchInput?.value?.toLowerCase() || '';
    const clipsContainer = document.getElementById('clipsContainer');

    if (!clipsContainer) return;

    if (clips.length === 0) {
        clipsContainer.innerHTML = '<p class="text-center text-muted">No clips saved yet.</p>';
        return;
    }        

    clipsContainer.innerHTML = clips.map((clip, index) => {
        const displayedText = searchTerm
            ? highlightMatch(clip.selectedText, searchTerm)
            : truncateText(clip.selectedText);

        return `
            <div class="clip-item border rounded p-2 mb-2">
                <div class="clip-content">
                    <div class="clip-metadata text-muted small mb-2">
                        <div><strong>Source:</strong> ${clip.title}</div>
                        <div><strong>Author:</strong> ${clip.author}</div>
                        <div><strong>Date Clipped:</strong> ${new Date(clip.dateClipped).toLocaleDateString()}</div>
                    </div>
                    <p class="mb-3">${displayedText}</p>
                </div>
                <div class="btn-group btn-group-sm w-100">
                    <button class="btn btn-outline-info view-btn" data-index="${index}">
                        <i class="bi bi-eye"></i> View
                    </button>
                    <button class="btn btn-outline-secondary copy-citation-btn" data-index="${index}">
                        <i class="bi bi-quote"></i> Citation
                    </button>
                    <button class="btn btn-outline-success copy-text-btn" data-index="${index}">
                        <i class="bi bi-files"></i> Copy
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
            const index = parseInt(citationBtn.dataset.index);
            copyCitation(index);
            return;
        }

        // Copy text button
        const copyTextBtn = e.target.closest('.copy-text-btn');
        if (copyTextBtn) {
            const index = parseInt(copyTextBtn.dataset.index);
            copyText(index);
            return;
        }

        // Delete button
        const deleteBtn = e.target.closest('.delete-btn');
        if (deleteBtn) {
            const index = parseInt(deleteBtn.dataset.index);
            showDeleteModal(index);
        }
    });
}

    // View clip in offcanvas
    function viewClip(index) {
        chrome.storage.sync.get(['clips'], (result) => {
            const clip = result.clips[index];
            if (clip) {
                //document.getElementById('clipOffcanvasLabel').textContent = `Clip from ${clip.title}`;
                document.getElementById('clip-actions').innerHTML = `
                    <button class="btn btn-outline-secondary btn-sm copy-citation-btn" data-index="${index}">
                        <i class="bi bi-quote"></i> Copy Citation
                    </button>
                    <button class="btn btn-outline-success btn-sm copy-text-btn" data-index="${index}">
                        <i class="bi bi-files"></i> Copy Text
                    </button>
                `;
                
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

    // Copy citation
    function copyCitation(index) {
        chrome.storage.sync.get(['clips'], (result) => {
            const clip = result.clips[index];
            const citation = `${clip.author} (${clip.date}). ${clip.title}. Retrieved from ${clip.url}`;
            navigator.clipboard.writeText(citation)
                .then(() => showToast('Citation copied to clipboard'))
                .catch(err => showToast('Failed to copy citation', 'danger'));
        });
    }

    // Copy text
    function copyText(index) {
        chrome.storage.sync.get(['clips'], (result) => {
            const clip = result.clips[index];
            navigator.clipboard.writeText(clip.selectedText)
                .then(() => showToast('Text copied to clipboard'))
                .catch(err => showToast('Failed to copy text', 'danger'));
        });
    }

    // Show delete confirmation modal
    function showDeleteModal(index) {
        currentClipIndex = index;
        deleteModal.show();
    }

    // Delete clip
    function deleteClip() {
        if (currentClipIndex === null) return;
        
        chrome.storage.sync.get(['clips'], (result) => {
            const clips = result.clips || [];
            clips.splice(currentClipIndex, 1);
            chrome.storage.sync.set({ clips }, () => {
                deleteModal.hide();
                window.loadClips();
                showToast('Clip deleted successfully');
                currentClipIndex = null;
            });
        });
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
            chrome.storage.sync.get(['clips'], (result) => {
                displayClips(result.clips || [], searchInput);
            });
        } else {
            displayClips(clips, searchInput);
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

    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const searchTerm = e.target.value.toLowerCase();
            chrome.storage.sync.get(['clips'], (result) => {
                const clips = result.clips || [];
                const filteredClips = clips.filter(clip => 
                    clip.selectedText.toLowerCase().includes(searchTerm) ||
                    clip.title.toLowerCase().includes(searchTerm) ||
                    clip.tags.some(tag => tag.toLowerCase().includes(searchTerm))
                );
                displayClips(filteredClips, searchInput);
            });
        }, 300);
    });

    // Initialize
    //loadClips();
    window.loadClips();
    setupMessageListeners();
});