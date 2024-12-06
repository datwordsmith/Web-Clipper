// popup.js
document.addEventListener('DOMContentLoaded', () => {
    const clipsContainer = document.getElementById('clipsContainer');
    const clipOffcanvas = new bootstrap.Offcanvas(document.getElementById('clipOffcanvas'));
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteClipModal'));
    let currentClipIndex = null;

    const CHROME_SYNC_STORAGE_LIMIT = 102400;

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
     

    // Function to truncate text
    function truncateText(text, maxLength = 120) {
        if (text.length <= maxLength) return text;
        return text.substring(0, maxLength) + '...';
    }

    // Fetch and display clips
    function loadClips() {
        // Check if we have access to chrome.storage
        if (!chrome.storage || !chrome.storage.sync) {
            console.error('Chrome storage API not available');
            clipsContainer.innerHTML = '<p class="text-center text-danger">Error: Unable to access storage</p>';
            return;
        }

        // Update storage info first
        try {
            updateStorageInfo();
        } catch (error) {
            console.error('Error updating storage info:', error);
        }

        chrome.storage.sync.get(['clips'], (result) => {
            if (chrome.runtime.lastError) {
                console.error('Error accessing storage:', chrome.runtime.lastError);
                clipsContainer.innerHTML = '<p class="text-center text-danger">Error loading clips</p>';
                return;
            }
    
            const clips = result.clips || [];
            
            if (clips.length === 0) {
                clipsContainer.innerHTML = '<p class="text-center text-muted">No clips saved yet.</p>';
                return;
            }
    
            clipsContainer.innerHTML = clips.map((clip, index) => `
                <div class="clip-item border rounded p-2 mb-2">
                    <div class="clip-content">
                        <div class="clip-metadata text-muted small mb-2">
                            <div><strong>Source:</strong> ${clip.title}</div>
                            <div><strong>Author:</strong> ${clip.author}</div>
                            <div><strong>Date Clipped:</strong> ${new Date(clip.dateClipped).toLocaleDateString()}</div>
                        </div>
                        <p class="mb-3">${truncateText(clip.selectedText)}</p>
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
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
            
            attachEventListeners();
        });
    }
    

    // Attach event listeners to buttons
    function attachEventListeners() {
        // View buttons
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                viewClip(index);
            });
        });

        // Copy citation buttons
        document.querySelectorAll('.copy-citation-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                copyCitation(index);
            });
        });

        // Copy text buttons
        document.querySelectorAll('.copy-text-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                copyText(index);
            });
        });

        // Delete buttons
        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                showDeleteModal(index);
            });
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
                    <button class="btn btn-outline-secondary btn-sm copy-text-btn" data-index="${index}">
                        <i class="bi bi-files"></i> Copy Text
                    </button>
                    <button class="btn btn-outline-danger btn-sm delete-btn" data-index="${index}">
                        <i class="bi bi-trash"></i> Delete
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
                loadClips();
                showToast('Clip deleted successfully');
                currentClipIndex = null;
            });
        });
    }  

    // Show toast notification
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

    // Initial setup
    loadClips()

    // Handle delete confirmation
    document.querySelector('#deleteClipModal .btn-danger').addEventListener('click', deleteClip);

    // Handle search
    document.getElementById('searchInput').addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        chrome.storage.sync.get(['clips'], (result) => {
            const clips = result.clips || [];
            const filteredClips = clips.filter(clip => 
                clip.selectedText.toLowerCase().includes(searchTerm) ||
                clip.title.toLowerCase().includes(searchTerm) ||
                clip.tags.some(tag => tag.toLowerCase().includes(searchTerm))  // Added tag search
            );
            
            if (filteredClips.length === 0) {
                clipsContainer.innerHTML = '<p class="text-center text-muted">No matching clips found.</p>';
            } else {
                loadClips(filteredClips);
            }
        });
    });    

    function addTagToClip(clipId, tagInput) {
        const tag = tagInput.value.trim();
        if (!tag) return;
    
        chrome.runtime.sendMessage({
            action: 'addTag',
            clipId: clipId,
            tag: tag
        }, (response) => {
            if (response.success) {
                showToast('Tag added successfully');
                loadClips(); // Refresh the display
                tagInput.value = ''; // Clear input
            } else {
                showToast(response.message || 'Error adding tag', 'danger');
            }
        });
    }
    
    function removeTagFromClip(clipId, tag) {
        chrome.runtime.sendMessage({
            action: 'removeTag',
            clipId: clipId,
            tag: tag
        }, (response) => {
            if (response.success) {
                showToast('Tag removed successfully');
                loadClips(); // Refresh the display
            } else {
                showToast(response.message || 'Error removing tag', 'danger');
            }
        });
    }    
});