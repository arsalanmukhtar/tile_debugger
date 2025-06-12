// app/static/js/utils.js

window.App = window.App || {};
window.App.Utils = window.App.Utils || {};

/**
 * Calculates tile coordinates (z, x, y) from longitude, latitude, and zoom level.
 * @param {number} lon - Longitude.
 * @param {number} lat - Latitude.
 * @param {number} zoom - Zoom level.
 * @returns {{x: number, y: number, z: number}} Tile coordinates.
 */
window.App.Utils.lonLatToTile = function(lon, lat, zoom) {
    const latRad = lat * Math.PI / 180;
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x: x, y: y, z: zoom };
};

/**
 * Displays a dismissible error message dialog.
 * @param {string} message - The error message to display.
 */
window.App.Utils.displayError = function(message) {
    const overlay = document.createElement('div');
    overlay.className = 'error-dialog-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'error-dialog';

    dialog.innerHTML = `
        <div class="error-dialog-header">
            <i class="fas fa-exclamation-circle"></i>
            <h3>Error</h3>
        </div>
        <div class="error-dialog-message">
            ${message}
        </div>
        <div class="error-dialog-footer">
            <button class="error-dialog-button">Dismiss</button>
        </div>
    `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add('show');
        dialog.classList.add('show');
    });

    const dismissButton = dialog.querySelector('.error-dialog-button');
    dismissButton.addEventListener('click', () => {
        overlay.classList.remove('show');
        dialog.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
    });

    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        if (document.body.contains(overlay)) {
            overlay.classList.remove('show');
            dialog.classList.remove('show');
            setTimeout(() => overlay.remove(), 300);
        }
    }, 5000);
};