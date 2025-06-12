// Layer style definitions
const layerStyles = {
    Point: {
        type: 'circle',
        paint: {
            'circle-radius': 3,
            'circle-color': '#088',
            'circle-opacity': 0.8,
            'circle-stroke-width': 0.5,
            'circle-stroke-color': '#044'
        }
    },
    LineString: {
        type: 'line',
        paint: {
            'line-color': '#088',
            'line-width': 2,
            'line-opacity': 0.8
        }
    },
    Polygon: {
        type: 'fill',
        paint: {
            'fill-color': '#088',
            'fill-opacity': 0.4,
            'fill-outline-color': '#044'
        }
    },
    // Label style will be dynamically updated
    Label: {
        type: 'symbol',
        layout: {
            // text-field will be set dynamically based on selected field
            'text-field': '', // Placeholder
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-offset': [0, 0.6],
            'text-anchor': 'top',
            'text-allow-overlap': false
        },
        paint: {
            'text-color': '#111',
            'text-halo-color': '#fff',
            'text-halo-width': 1
        }
    }
};

// Initialize application state
const appState = {
    map: null,
    currentSchema: null,
    currentTable: null,
    mapboxToken: null,
    fieldDropdown: null,
    selectedField: null,
    // Keep track of active layers
    activeLayerIds: [],
    activeSourceIds: []
};

// Helper function to generate layer and source IDs
function getFeatureLayerId(schema, table) {
    return `${schema}-${table}-features-layer`;
}

function getLabelLayerId(schema, table) {
    return `${schema}-${table}-labels-layer`;
}

function getSourceId(schema, table) {
    return `${schema}-${table}-source`;
}

// Helper function to generate MVT URL
function getMvtUrl(schema, table) {
    return `http://localhost:8000/api/mvt/${schema}/${table}/{z}/{x}/{y}.pbf`;
}

// Helper function to calculate tile coordinates from lon, lat, and zoom (RE-ADDED)
function lonLatToTile(lon, lat, zoom) {
    const latRad = lat * Math.PI / 180;
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x: x, y: y, z: zoom };
}

// Initialize the application
function initializeApp() {
    try {
        appState.mapboxToken = window.MAPBOX_TOKEN;
        if (!appState.mapboxToken) {
            throw new Error('Mapbox token not found');
        }

        initializeMapbox();

        appState.fieldDropdown = {
            element: document.querySelector('.label-field-dropdown'),
            header: document.querySelector('.dropdown-header'),
            content: document.querySelector('.dropdown-content'),
            chevron: document.querySelector('.dropdown-chevron'),
            titleSpan: document.querySelector('.dropdown-title')
        };

        // Re-enabled logic related to result-display element
        document.getElementById('result-display').classList.remove('show');
        setupUI();

        console.log('Application initialized successfully.');
    } catch (error) {
        console.error('Application initialization failed:', error);
        displayError('Failed to initialize map: ' + error.message);
    }
}

function initializeMapbox() {
    mapboxgl.accessToken = appState.mapboxToken;
    appState.map = new mapboxgl.Map({
        container: 'map',
        style: 'mapbox://styles/mapbox/light-v10',
        center: [0, 0],
        zoom: 2,
        hash: true // Enable URL hash for coordinates
    });

    // Add map controls to bottom right
    appState.map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');

    // Handle potential map errors
    appState.map.on('error', (e) => {
        console.error('Map error:', e.error);
        displayError('Map error occurred. Please reload.');
    });

    // Optional: Add a listener for when the map finishes loading
    appState.map.on('load', () => {
        console.log('Mapbox map fully loaded.');
    });
}

function setupUI() {
    try {
        // Schema toggle functionality
        document.querySelectorAll('.schema-header').forEach(header => {
            header.addEventListener('click', function () {
                const tableList = this.nextElementSibling;
                const icon = this.querySelector('.toggle-icon');

                tableList.classList.toggle('show');
                icon.classList.toggle('fa-chevron-down');
                icon.classList.toggle('fa-chevron-up');
            });
        });

        // Table selection and layer tracking
        document.querySelectorAll('.table-item').forEach(tableItem => {
            tableItem.addEventListener('click', async function (e) {
                // Don't proceed if clicking the unload-button
                if (e.target.classList.contains('unload-button')) {
                    return;
                }

                const schemaName = this.closest('.schema-item').querySelector('.schema-name').textContent.trim();
                const tableName = this.querySelector('.table-name').textContent.trim();

                // Remove active class and unload buttons from all tables
                document.querySelectorAll('.table-item').forEach(item => {
                    item.classList.remove('active');
                    const existingBtn = item.querySelector('.unload-button');
                    if (existingBtn) existingBtn.remove();
                });

                // Add active class to clicked table
                this.classList.add('active');

                // Create and add unload button
                const unloadBtn = document.createElement('i');
                unloadBtn.className = 'fas fa-times unload-button';
                unloadBtn.title = 'Remove layer';
                unloadBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent table item click
                    this.classList.remove('active'); // Remove active class
                    unloadBtn.remove(); // Remove the button itself
                    stopTrackingLayer();
                });

                // Add unload button to this table item
                this.appendChild(unloadBtn);

                // Start tracking the new layer
                startTrackingLayer(schemaName, tableName);
            });
        });

        // Keep this toggle functionality
        appState.fieldDropdown.header.addEventListener('click', () => {
            appState.fieldDropdown.element.classList.toggle('active');
        });

    } catch (error) {
        console.error('Error in setupUI:', error);
    }
}

async function startTrackingLayer(schemaName, tableName) {
    console.log(`Attempting to load layer for: ${schemaName}.${tableName}`);

    // Cleanup existing layers
    await stopTrackingLayer();

    // Set new current table and schema
    appState.currentSchema = schemaName;
    appState.currentTable = tableName;

    const sourceId = getSourceId(schemaName, tableName);
    const featureLayerId = getFeatureLayerId(schemaName, tableName);
    const labelLayerId = getLabelLayerId(schemaName, tableName);

    // Get SRID, geometry type, extent and fetch fields in parallel
    const [sridResponse, geomTypeResponse, extentResponse, fieldsResponse] = await Promise.all([
        fetch(`/api/check-srid/${schemaName}/${tableName}`),
        fetch(`/api/geometry-type/${schemaName}/${tableName}`),
        fetch(`/api/extent/${schemaName}/${tableName}`),
        fetch(`/api/fields/${schemaName}/${tableName}`)
    ]);

    // Check SRID first
    if (sridResponse.ok) {
        const sridData = await sridResponse.json();
        if (!sridData.valid) {
            displayError(`Cannot load layer: ${sridData.error}`);
            console.error(`SRID check failed for ${schemaName}.${tableName}: ${sridData.error}`);
            return;
        }
        console.log(`SRID for ${schemaName}.${tableName}: ${sridData.srid} (valid)`);
    } else {
        const errorText = await sridResponse.text();
        displayError(`Failed to check SRID for ${schemaName}.${tableName}. Server responded: ${errorText}`);
        console.error(`Failed to check SRID for ${schemaName}.${tableName}: ${sridResponse.status} - ${errorText}`);
        return;
    }

    // Get geometry type
    let geometryType = 'Polygon'; // Default to polygon if type not found or error
    if (geomTypeResponse.ok) {
        const geomTypeData = await geomTypeResponse.json();
        if (geomTypeData.geometryType) {
            geometryType = geomTypeData.geometryType;
            console.log(`Geometry type for ${schemaName}.${tableName}: ${geometryType}`);
        } else {
            console.warn(`No geometry type found for ${schemaName}.${tableName}. Defaulting to Polygon.`);
        }
    } else {
        const errorText = await geomTypeResponse.text();
        console.error(`Failed to get geometry type for ${schemaName}.${tableName}: ${geomTypeResponse.status} - ${errorText}`);
    }

    // Populate field dropdown
    try {
        if (fieldsResponse.ok) {
            const fieldsData = await fieldsResponse.json();
            const fieldsArray = Array.isArray(fieldsData) ? fieldsData : (fieldsData?.fields || []);
            populateFieldDropdown(fieldsArray);
            console.log(`Fields loaded for ${schemaName}.${tableName}:`, fieldsArray.map(f => f.name));
        } else {
            const errorText = await fieldsResponse.text();
            console.error(`Failed to fetch fields for ${schemaName}.${tableName}: ${fieldsResponse.status} - ${errorText}`);
            populateFieldDropdown([]); // Populate with empty to show 'No fields available'
        }
    } catch (error) {
        console.error('Error fetching fields:', error);
        populateFieldDropdown([]);
    }

    // Get and apply the extent
    if (extentResponse.ok) {
        const { bounds } = await extentResponse.json();
        console.log(`Extent for ${schemaName}.${tableName}:`, bounds);

        const coordinates = [
            [bounds.west, bounds.south],
            [bounds.east, bounds.north]
        ];

        appState.map.easeTo({
            pitch: 0,
            bearing: 0,
            duration: 0
        });

        appState.map.fitBounds(coordinates, {
            padding: { top: 50, bottom: 50, left: 50, right: 50 },
            duration: 1500,
            maxZoom: 15
        });
    } else {
        const errorText = await extentResponse.text();
        console.warn(`Failed to get extent for ${schemaName}.${tableName}: ${extentResponse.status} - ${errorText}`);
        // Optionally, display a smaller error or skip zooming
    }

    // Determine the layer style based on geometry type
    const baseGeomType = geometryType.replace('MULTI', '').replace('ST_', '');
    const style = layerStyles[baseGeomType] || layerStyles.Polygon;

    // Set up tile source
    const tileSourceURL = getMvtUrl(schemaName, tableName);
    console.log(`Adding MVT source: ${sourceId} with URL: ${tileSourceURL}`);

    if (appState.map.getSource(sourceId)) {
        appState.map.removeSource(sourceId); // Ensure source is not duplicated on re-selection
    }
    appState.map.addSource(sourceId, {
        type: 'vector',
        tiles: [tileSourceURL],
        minzoom: 0,
        maxzoom: 22
    });
    appState.activeSourceIds.push(sourceId); // Track active source

    // Add main features layer
    console.log(`Adding features layer: ${featureLayerId} for source-layer: 'features'`);
    appState.map.addLayer({
        id: featureLayerId,
        source: sourceId,
        'source-layer': 'features', // This must match the backend's ST_AsMVT layer name
        type: style.type,
        paint: style.paint
    });
    appState.activeLayerIds.push(featureLayerId); // Track active layer

    // Add labels layer
    // Initially, text-field is empty, so no text will be shown until a field is selected
    console.log(`Adding labels layer: ${labelLayerId} for source-layer: 'labels'`);
    appState.map.addLayer({
        id: labelLayerId,
        source: sourceId,
        'source-layer': 'labels', // This must match the backend's ST_AsMVT layer name
        type: 'symbol',
        layout: {
            'text-field': '', // Empty by default
            'text-font': layerStyles.Label.layout['text-font'],
            'text-size': layerStyles.Label.layout['text-size'],
            'text-offset': layerStyles.Label.layout['text-offset'],
            'text-anchor': layerStyles.Label.layout['text-anchor'],
            'symbol-placement': 'point' // Important for labels on general geometries
        },
        paint: layerStyles.Label.paint
    });
    appState.activeLayerIds.push(labelLayerId); // Track active layer

    // Debugging source data on load
    appState.map.on('sourcedata', (e) => {
        // Check for 'loaded' or 'error' state specifically for the current source
        if (e.sourceId === sourceId && e.sourceType === 'vector' && (e.isLoaded || e.is === 'loaded') && e.tile) { // e.isLoaded is for newer Mapbox GL JS versions
            console.group(`Source Data Loaded for Tile: ${e.tile.z}/${e.tile.x}/${e.tile.y}`);

            // Query features from 'features' layer
            const features = appState.map.querySourceFeatures(sourceId, {
                sourceLayer: 'features',
            });
            if (features.length > 0) {
                console.log(`Features layer ('features') has ${features.length} features.`);
                // console.log('Sample Feature Properties (features layer):', features[0].properties);
            } else {
                console.log('No features found in "features" source layer for this tile.');
            }

            // Query features from 'labels' layer
            const labels = appState.map.querySourceFeatures(sourceId, {
                sourceLayer: 'labels',
            });
            if (labels.length > 0) {
                console.log(`Labels layer ('labels') has ${labels.length} features.`);
                // console.log('Sample Label Properties (labels layer):', labels[0].properties);
            } else {
                console.log('No features found in "labels" source layer for this tile.');
            }
            console.groupEnd();
        }
    });

    // RE-ENABLED: Update UI on map movement and send state to backend
    appState.map.on('moveend', updateLayerInfo);
    updateLayerInfo(); // Initial update for UI and backend
}

function populateFieldDropdown(fieldsData) {
    appState.fieldDropdown.content.innerHTML = ''; // Clear existing options
    appState.selectedField = null; // Reset selected field

    try {
        const fieldNames = fieldsData
            .map(field => field?.name)
            .filter(name => typeof name === 'string' && name.trim() !== '');

        if (fieldNames.length > 0) {
            fieldNames.forEach(fieldName => {
                const option = document.createElement('div');
                option.className = 'dropdown-option';
                option.textContent = fieldName;
                option.addEventListener('click', (e) => {
                    e.stopPropagation();

                    appState.selectedField = fieldName;
                    updateLabelsLayer(fieldName); // Update label layer with selected field

                    // Update header text
                    appState.fieldDropdown.titleSpan.textContent = fieldName;
                    appState.fieldDropdown.titleSpan.dataset.originalText = 'Label ...'; // Store original text

                    // Add reset button if not already present
                    addResetButton();

                    // Close dropdown
                    appState.fieldDropdown.element.classList.remove('active');
                    console.log('Selected field for labeling:', fieldName);
                });
                appState.fieldDropdown.content.appendChild(option);
            });
        } else {
            showEmptyState('No fields available for labeling', false);
        }
    } catch (error) {
        console.error('Error populating fields:', error);
        showEmptyState('Error loading fields', true);
    }
}

function updateLabelsLayer(fieldName) {
    if (!appState.currentSchema || !appState.currentTable || !appState.map) {
        console.warn('Cannot update labels layer: map, schema, or table not set.');
        return;
    }

    const labelLayerId = getLabelLayerId(appState.currentSchema, appState.currentTable);

    if (appState.map.getLayer(labelLayerId)) {
        // Update the text-field property of the existing labels layer
        console.log(`Updating label layer '${labelLayerId}' with field: '${fieldName}'`);
        appState.map.setLayoutProperty(labelLayerId, 'text-field', ['get', fieldName]);
        appState.map.setLayoutProperty(labelLayerId, 'visibility', 'visible'); // Ensure visible
    } else {
        console.warn(`Label layer '${labelLayerId}' not found. Cannot update.`);
    }
}

// Helper functions
function showEmptyState(message, isError = false) {
    const emptyOption = document.createElement('div');
    emptyOption.className = `dropdown-option disabled ${isError ? 'error' : ''}`;
    emptyOption.textContent = message;
    appState.fieldDropdown.content.appendChild(emptyOption);
}

function addResetButton() {
    // Check if reset button already exists
    if (appState.fieldDropdown.header.querySelector('.reset-field')) {
        return;
    }

    const resetBtn = document.createElement('span');
    resetBtn.className = 'reset-field';
    resetBtn.innerHTML = '&times;';

    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent dropdown from toggling

        // Reset field selection and remove labels
        resetFieldSelection();
        // Remove the button itself
        resetBtn.remove();
    });

    appState.fieldDropdown.header.appendChild(resetBtn);
}

function resetFieldSelection() {
    appState.selectedField = null;
    appState.fieldDropdown.titleSpan.textContent =
        appState.fieldDropdown.titleSpan.dataset.originalText || 'Label ...';

    // Set text-field to empty string to hide labels
    const labelLayerId = getLabelLayerId(appState.currentSchema, appState.currentTable);
    if (appState.map.getLayer(labelLayerId)) {
        appState.map.setLayoutProperty(labelLayerId, 'text-field', ''); // Set text field to empty
        appState.map.setLayoutProperty(labelLayerId, 'visibility', 'none'); // Hide label layer
        console.log('Labels layer hidden.');
    }

    // Remove reset button if it exists
    const resetBtn = appState.fieldDropdown.header.querySelector('.reset-field');
    if (resetBtn) resetBtn.remove();
}

function resetFieldDropdown() {
    // Clear dropdown content
    appState.fieldDropdown.content.innerHTML = '';

    // Reset header text
    const headerText = appState.fieldDropdown.header.querySelector('span');
    if (headerText.dataset.originalText) {
        headerText.textContent = headerText.dataset.originalText;
    } else {
        headerText.textContent = 'Label ...';
    }

    // Remove reset button if exists
    const resetBtn = appState.fieldDropdown.header.querySelector('.reset-field');
    if (resetBtn) resetBtn.remove();

    // Close dropdown if open
    appState.fieldDropdown.element.classList.remove('active');
}

async function stopTrackingLayer() {
    console.log('Stopping tracking layer and cleaning up map resources...');

    // RE-ENABLED: Remove moveend listener
    appState.map.off('moveend', updateLayerInfo);

    // Remove all active layers and sources
    appState.activeLayerIds.forEach(layerId => {
        if (appState.map.getLayer(layerId)) {
            console.log(`Removing layer: ${layerId}`);
            appState.map.removeLayer(layerId);
        }
    });
    appState.activeSourceIds.forEach(sourceId => {
        if (appState.map.getSource(sourceId)) {
            console.log(`Removing source: ${sourceId}`);
            appState.map.removeSource(sourceId);
        }
    });

    // Clear tracked IDs
    appState.activeLayerIds = [];
    appState.activeSourceIds = [];

    // Reset field dropdown
    resetFieldDropdown();

    // Reset state
    appState.currentTable = null;
    appState.currentSchema = null;
    appState.selectedField = null;

    // Update UI
    const resultDiv = document.getElementById('result-display');
    if (resultDiv) {
        resultDiv.innerHTML = '';
        resultDiv.classList.remove('show');
    }

    console.log('Layer tracking stopped. Map resources cleaned.');
}


// RE-ADDED: Function to update layer info and send to backend
async function updateLayerInfo() {
    if (!appState.currentTable || !appState.currentSchema) return;

    const zoom = Math.floor(appState.map.getZoom());
    const center = appState.map.getCenter();

    // Calculate tile coordinates
    const tile = lonLatToTile(center.lng, center.lat, zoom);
    const tileX = tile.x;
    const tileY = tile.y;

    // Generate current tile URL (for display)
    const mvtURL = getMvtUrl(appState.currentSchema, appState.currentTable)
        .replace('{z}', zoom)
        .replace('{x}', tileX)
        .replace('{y}', tileY);

    console.log(`Current MVT tile URL for center: ${mvtURL}`);

    // Update the display with schema information
    const resultDiv = document.getElementById('result-display');
    if (resultDiv) { // Ensure element exists
        resultDiv.innerHTML = `
            <div><code>/${appState.currentSchema}/${appState.currentTable}/${zoom}/${tileX}/${tileY}.pbf</code></div>
        `;
        resultDiv.classList.add('show');
    }

    // Send layer state to backend
    try {
        const response = await fetch('/api/layer-state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                schema_name: appState.currentSchema, // Changed to match backend
                table: appState.currentTable,
                z: zoom,
                x: tileX,
                y: tileY
            })
        });

        if (!response.ok) {
            console.warn(`Failed to update layer state on backend: ${response.status}`);
        } else {
            const data = await response.json();
            console.log('Layer state updated on backend:', data.message);
        }
    } catch (error) {
        console.error('Error sending layer state to backend:', error);
    }
}


function updateTableSelection(tableName) {
    document.querySelectorAll('.table-item').forEach(item => {
        const itemTableName = item.querySelector('.table-name').textContent.trim();
        const isActive = itemTableName === tableName;
        item.classList.toggle('active', isActive);
    });
}

function displayError(message) {
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
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initializeApp);