/**
 * EZNet Common Utilities
 * Enterprise-grade shared functionality
 * Only includes features not already in utils.js
 */

// ============================================
// Loading Overlay System
// ============================================
class LoadingOverlay {
    constructor() {
        this.overlay = null;
    }

    show(message = 'Loading...') {
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                backdrop-filter: blur(5px);
            `;
            this.overlay.innerHTML = `
                <div style="
                    background: white;
                    padding: 2rem 3rem;
                    border-radius: 16px;
                    text-align: center;
                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                ">
                    <div style="
                        width: 50px;
                        height: 50px;
                        border: 4px solid #f3f3f3;
                        border-top: 4px solid #5E17EB;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                        margin: 0 auto 1rem;
                    "></div>
                    <p style="color: #222; font-weight: 500; font-size: 1.125rem;" id="loading-message">${message}</p>
                </div>
            `;
            document.body.appendChild(this.overlay);
        } else {
            this.overlay.style.display = 'flex';
            const messageEl = this.overlay.querySelector('#loading-message');
            if (messageEl) {
                messageEl.textContent = message;
            }
        }
    }

    hide() {
        if (this.overlay) {
            this.overlay.style.display = 'none';
        }
    }

    remove() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
            this.overlay = null;
        }
    }
}

// Add spinner animation if not already present
if (!document.getElementById('eznet-spinner-style')) {
    const spinnerStyle = document.createElement('style');
    spinnerStyle.id = 'eznet-spinner-style';
    spinnerStyle.textContent = `
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    `;
    document.head.appendChild(spinnerStyle);
}

// Initialize global loading overlay
window.loading = new LoadingOverlay();

// ============================================
// Session Management (with expiry)
// ============================================
window.SessionManager = {
    /**
     * Set a session item with expiry
     * @param {string} key - Session key
     * @param {*} value - Value to store
     * @param {number} expiryMinutes - Expiry time in minutes (default: 60)
     */
    set(key, value, expiryMinutes = 60) {
        try {
            const item = {
                value: value,
                expiry: Date.now() + (expiryMinutes * 60 * 1000)
            };
            localStorage.setItem(`session_${key}`, JSON.stringify(item));
            return true;
        } catch (e) {
            console.error('Error setting session:', e);
            return false;
        }
    },

    /**
     * Get a session item (returns null if expired)
     * @param {string} key - Session key
     * @returns {*} Stored value or null if expired/not found
     */
    get(key) {
        try {
            const itemStr = localStorage.getItem(`session_${key}`);
            if (!itemStr) return null;

            const item = JSON.parse(itemStr);
            if (Date.now() > item.expiry) {
                localStorage.removeItem(`session_${key}`);
                return null;
            }
            return item.value;
        } catch (e) {
            console.error('Error getting session:', e);
            return null;
        }
    },

    /**
     * Remove a session item
     * @param {string} key - Session key
     */
    remove(key) {
        try {
            localStorage.removeItem(`session_${key}`);
            return true;
        } catch (e) {
            console.error('Error removing session:', e);
            return false;
        }
    },

    /**
     * Check if a session item exists and is valid
     * @param {string} key - Session key
     * @returns {boolean} True if session exists and is valid
     */
    has(key) {
        return this.get(key) !== null;
    },

    /**
     * Clear all expired sessions
     */
    clearExpired() {
        try {
            const keys = Object.keys(localStorage);
            keys.forEach(key => {
                if (key.startsWith('session_')) {
                    const itemStr = localStorage.getItem(key);
                    if (itemStr) {
                        try {
                            const item = JSON.parse(itemStr);
                            if (Date.now() > item.expiry) {
                                localStorage.removeItem(key);
                            }
                        } catch (e) {
                            // Invalid session data, remove it
                            localStorage.removeItem(key);
                        }
                    }
                }
            });
        } catch (e) {
            console.error('Error clearing expired sessions:', e);
        }
    }
};

// Auto-clear expired sessions on load
if (typeof window !== 'undefined') {
    SessionManager.clearExpired();
}

// ============================================
// CSV Export Utility
// ============================================
window.exportToCSV = function(data, filename) {
    if (!data || !data.length) {
        if (window.showNotification) {
            window.showNotification('No data to export', 'warning');
        } else {
            alert('No data to export');
        }
        return;
    }

    try {
        const headers = Object.keys(data[0]);
        const csvContent = [
            headers.join(','),
            ...data.map(row => headers.map(header => {
                const value = row[header];
                // Handle values with commas, quotes, or newlines
                if (value === null || value === undefined) {
                    return '';
                }
                const stringValue = String(value);
                if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
                    return `"${stringValue.replace(/"/g, '""')}"`;
                }
                return stringValue;
            }).join(','))
        ].join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `export-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        if (window.showNotification) {
            window.showNotification('Data exported successfully', 'success');
        }
    } catch (e) {
        console.error('Error exporting CSV:', e);
        if (window.showNotification) {
            window.showNotification('Error exporting data', 'error');
        } else {
            alert('Error exporting data');
        }
    }
};

// ============================================
// QR Code Generation (Placeholder)
// ============================================
/**
 * Generate QR Code (Simple placeholder)
 * For production use, integrate with a QR library like qrcode.js
 * @param {string} text - Text to encode in QR code
 * @param {number} size - Size in pixels (default: 200)
 * @returns {string} Data URL of QR code image
 */
window.generateQRCode = function(text, size = 200) {
    // For enterprise use, integrate with a QR library like:
    // - qrcode.js: https://github.com/davidshimjs/qrcodejs
    // - qrcode: https://github.com/soldair/node-qrcode
    
    // This is a placeholder that returns a simple canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = size;
    canvas.height = size;
    
    // Simple placeholder - in production use QRCode.js library
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = 'black';
    ctx.font = `${size / 10}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('QR Code', size / 2, size / 2 - 10);
    ctx.font = `${size / 15}px monospace`;
    ctx.fillText(text.substring(0, 20), size / 2, size / 2 + 10);
    
    return canvas.toDataURL();
};

// ============================================
// Export for module systems
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        LoadingOverlay,
        SessionManager: window.SessionManager,
        exportToCSV: window.exportToCSV,
        generateQRCode: window.generateQRCode
    };
}

console.log('✓ EZNet Common Utilities Loaded');

