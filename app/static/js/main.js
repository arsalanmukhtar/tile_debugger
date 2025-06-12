// app/static/js/main.js

window.App = window.App || {};

// Define available Mapbox basemap styles with icon classes
const BASEMAP_STYLES = [
    // Added 'iconClass' and 'labelText' for better control
    { name: 'Streets', iconClass: 'fas fa-map', labelText: 'Road' , url: 'mapbox://styles/mapbox/streets-v12' },
    { name: 'Satellite', iconClass: 'fas fa-satellite', labelText: 'Sat', url: 'mapbox://styles/mapbox/satellite-streets-v12' },
    { name: 'Light', iconClass: 'fas fa-sun', labelText: 'Light', url: 'mapbox://styles/mapbox/light-v11' },
    { name: 'Dark', iconClass: 'fas fa-moon', labelText: 'Dark', url: 'mapbox://styles/mapbox/dark-v11' },
    { name: 'Outdoors', iconClass: 'fas fa-mountain', labelText: 'Outdoors', url: 'mapbox://styles/mapbox/outdoors-v12' }
];

/**
 * Initializes the core application.
 */
window.App.init = function() {
    try {
        window.App.appState.mapboxToken = window.MAPBOX_TOKEN;
        if (!window.App.appState.mapboxToken) {
            throw new Error('Mapbox token not found');
        }

        initializeMapbox(); // Call local helper function

        // Initialize fieldDropdown element reference
        window.App.appState.fieldDropdown = {
            element: document.querySelector('.label-field-dropdown'),
            header: document.querySelector('.dropdown-header'),
            content: document.querySelector('.dropdown-content'),
            chevron: document.querySelector('.dropdown-chevron'),
            titleSpan: document.querySelector('.dropdown-title')
        };

        document.getElementById('result-display').classList.remove('show');
        window.App.UI.setupUI(); // Call UI setup function

        console.log('Application initialized successfully.');
    } catch (error) {
        console.error('Application initialization failed:', error);
        window.App.Utils.displayError('Failed to initialize map: ' + error.message);
    }
};

/**
 * Initializes the Mapbox GL JS map and basemap selector.
 */
function initializeMapbox() {
    mapboxgl.accessToken = window.App.appState.mapboxToken;
    window.App.appState.map = new mapboxgl.Map({
        container: 'map',
        style: BASEMAP_STYLES[0].url, // Set initial map style to the first one
        center: [0, 0],
        zoom: 2,
        hash: true,
        projection: 'mercator' // NEW: Explicitly set Mercator projection for a flat map
    });

    // Add default Mapbox Navigation controls (Zoom and Rotate)
    window.App.appState.map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');


    window.App.appState.map.on('error', (e) => {
        console.error('Map error:', e.error);
        window.App.Utils.displayError('Map error occurred. Please reload.');
    });

    window.App.appState.map.on('load', () => {
        console.log('Mapbox map fully loaded.');
        setupBasemapSelector(); // Setup basemap selector after map loads
    });
}

/**
 * Sets up the basemap selection widget with hover functionality and image icons.
 */
function setupBasemapSelector() {
    const basemapSelectorContainer = document.getElementById('basemap-selector');
    const basemapOptionsList = basemapSelectorContainer.querySelector('.basemap-options-list');
    const basemapToggleButton = basemapSelectorContainer.querySelector('.basemap-toggle');

    if (!basemapSelectorContainer || !basemapOptionsList || !basemapToggleButton) {
        console.error('Basemap selector HTML elements not found. Check index.html structure.');
        return;
    }

    // FIX: Clear existing options to prevent duplicates
    basemapOptionsList.innerHTML = '';


    // Ensure the toggle button always has the layer-group icon
    basemapToggleButton.innerHTML = '<i class="fas fa-layer-group"></i>';


    // Populate the basemap options list
    BASEMAP_STYLES.forEach((style, index) => {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'basemap-option';
        optionDiv.dataset.styleUrl = style.url;
        optionDiv.dataset.styleName = style.name;

        // Create icon element
        const iconElement = document.createElement('i');
        iconElement.className = style.iconClass; // Assign Font Awesome class
        optionDiv.appendChild(iconElement);

        // Optional: Add a small text label overlay for clarity if desired
        const labelElement = document.createElement('span');
        labelElement.className = 'label-overlay'; // Add class for styling
        labelElement.textContent = style.labelText; // Use the short label
        optionDiv.appendChild(labelElement);

        // Set active class for the initial style
        if (index === 0) {
            optionDiv.classList.add('active');
        }

        optionDiv.addEventListener('click', (event) => {
            event.stopPropagation();

            // Remove active class from all options
            document.querySelectorAll('.basemap-option').forEach(item => {
                item.classList.remove('active');
            });

            // Add active class to the clicked option
            optionDiv.classList.add('active');

            // Set the new map style if it's different
            if (window.App.appState.map.getStyle().id !== style.url) {
                window.App.appState.map.setStyle(style.url);
                console.log(`Map style changed to: ${style.name}`);

                // Re-add MVT layers after the new style loads
                window.App.appState.map.once('style.load', () => {
                    window.App.LayerManagement.readdMVTLayer(); // Use the readd function
                });
            }
        });
        basemapOptionsList.appendChild(optionDiv);
    });

    // The hover logic is now purely in CSS.
}

// Initialize the application when the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', window.App.init);