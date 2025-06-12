// app/static/js/layer-management.js

window.App = window.App || {};
window.App.LayerManagement = window.App.LayerManagement || {};

// Helper function to generate layer and source IDs (local to this module)
function getFeatureLayerId(schema, table) {
    return `${schema}-${table}-features-layer`;
}

function getLabelLayerId(schema, table) {
    return `${schema}-${table}-labels-layer`;
}

function getSourceId(schema, table) {
    return `${schema}-${table}-source`;
}

/**
 * Starts tracking and displaying a new layer on the map.
 * This is called when a *new table is selected* or when the map is initialized.
 * It performs all initial checks and loads the MVT data.
 * @param {string} schemaName - The database schema name.
 * @param {string} tableName - The database table name.
 */
window.App.LayerManagement.startTrackingLayer = async function(schemaName, tableName) {
    console.log(`Attempting to load layer for: ${schemaName}.${tableName}`);

    // Cleanup existing layers (including any previously loaded MVT layers)
    await window.App.LayerManagement.stopTrackingLayer();

    // Set new current table and schema
    window.App.appState.currentSchema = schemaName;
    window.App.appState.currentTable = tableName;

    const sourceId = getSourceId(schemaName, tableName);
    const featureLayerId = getFeatureLayerId(schemaName, tableName);
    const labelLayerId = getLabelLayerId(schemaName, tableName);

    // Fetch SRID, geometry type, extent, and fields in parallel
    const [sridResponse, geomTypeResponse, extentResponse, fieldsResponse] = await Promise.all([
        window.App.Api.fetchSrid(schemaName, tableName),
        window.App.Api.fetchGeometryType(schemaName, tableName),
        window.App.Api.fetchExtent(schemaName, tableName),
        window.App.Api.fetchFields(schemaName, tableName)
    ]);

    // --- Critical Path: SRID Check ---
    if (sridResponse.ok) {
        const sridData = await sridResponse.json();
        if (!sridData.valid) {
            window.App.Utils.displayError(`Cannot load layer: ${sridData.error}`);
            console.error(`SRID check failed for ${schemaName}.${tableName}: ${sridData.error}`);
            return; // Exit if SRID is invalid
        }
        console.log(`SRID for ${schemaName}.${tableName}: ${sridData.srid} (valid)`);
    } else {
        const errorText = await sridResponse.text();
        window.App.Utils.displayError(`Failed to check SRID for ${schemaName}.${tableName}. Server responded: ${errorText}`);
        console.error(`Failed to check SRID for ${schemaName}.${tableName}: ${sridResponse.status} - ${errorText}`);
        return; // Exit on SRID fetch error
    }
    // --- End SRID Check ---


    // Get geometry type (not critical for stopping execution if fails)
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

    // Populate field dropdown (not critical for stopping execution if fails)
    try {
        if (fieldsResponse.ok) {
            const fieldsData = await fieldsResponse.json();
            const fieldsArray = Array.isArray(fieldsData) ? fieldsData : (fieldsData?.fields || []);
            window.App.UI.populateFieldDropdown(fieldsArray);
            console.log(`Fields loaded for ${schemaName}.${tableName}:`, fieldsArray.map(f => f.name));
        } else {
            const errorText = await fieldsResponse.text();
            console.error(`Failed to fetch fields for ${schemaName}.${tableName}: ${fieldsResponse.status} - ${errorText}`);
            window.App.UI.populateFieldDropdown([]); // Populate with empty to show 'No fields available'
        }
    } catch (error) {
        console.error('Error fetching fields:', error);
        window.App.UI.populateFieldDropdown([]);
    }

    // --- Extent Handling ---
    if (extentResponse.ok) {
        const { bounds } = await extentResponse.json();
        console.log(`Extent for ${schemaName}.${tableName}:`, bounds);

        if (bounds && typeof bounds.west === 'number' && typeof bounds.south === 'number' &&
            typeof bounds.east === 'number' && typeof bounds.north === 'number') {

            const coordinates = [
                [bounds.west, bounds.south],
                [bounds.east, bounds.north]
            ];

            window.App.appState.map.easeTo({
                pitch: 0,
                bearing: 0,
                duration: 0
            });

            window.App.appState.map.fitBounds(coordinates, {
                padding: { top: 50, bottom: 50, left: 50, right: 50 },
                duration: 1500,
                maxZoom: 15
            });
            console.log(`Map fitting bounds to: ${JSON.stringify(coordinates)}`);
        } else {
            console.warn(`Invalid bounds received for ${schemaName}.${tableName}:`, bounds);
            window.App.Utils.displayError(`Failed to zoom to extent: Invalid boundary data for ${schemaName}.${tableName}.`);
        }
    } else {
        const errorText = await extentResponse.text();
        console.warn(`Failed to get extent for ${schemaName}.${tableName}: ${extentResponse.status} - ${errorText}`);
        window.App.Utils.displayError(`Failed to fetch table extent for ${schemaName}.${tableName}. Server responded: ${errorText}`);
    }
    // --- End Extent Handling ---


    // Determine the layer style based on geometry type
    const baseGeomType = geometryType.replace('MULTI', '').replace('ST_', '');
    const style = window.App.layerStyles[baseGeomType] || window.App.layerStyles.Polygon;

    // Add the MVT source and layers
    window.App.LayerManagement.addMVTSourceAndLayers(schemaName, tableName, style);

    // Update UI on map movement and send state to backend
    window.App.appState.map.on('moveend', window.App.LayerManagement.updateLayerInfo);
    window.App.LayerManagement.updateLayerInfo(); // Initial update
};

/**
 * Adds the MVT source and layers to the map.
 * This is a new helper function called by startTrackingLayer and readdMVTLayer.
 * @param {string} schemaName
 * @param {string} tableName
 * @param {object} style - The Mapbox GL JS style object for the main layer type.
 */
window.App.LayerManagement.addMVTSourceAndLayers = function(schemaName, tableName, style) {
    const sourceId = getSourceId(schemaName, tableName);
    const featureLayerId = getFeatureLayerId(schemaName, tableName);
    const labelLayerId = getLabelLayerId(schemaName, tableName);
    const tileSourceURL = window.App.Api.getMvtUrl(schemaName, tableName);

    console.log(`Adding/Re-adding MVT source: ${sourceId} with URL: ${tileSourceURL}`);

    // Ensure active layers and sources are removed from the map state
    // before attempting to remove them from Mapbox, to prevent errors.
    // Mapbox GL JS will throw an error if you try to remove a layer/source that doesn't exist.
    if (window.App.appState.map.getLayer(featureLayerId)) {
        window.App.appState.map.removeLayer(featureLayerId);
    }
    if (window.App.appState.map.getLayer(labelLayerId)) {
        window.App.appState.map.removeLayer(labelLayerId);
    }
    if (window.App.appState.map.getSource(sourceId)) {
        window.App.appState.map.removeSource(sourceId);
    }

    // Add the source
    window.App.appState.map.addSource(sourceId, {
        type: 'vector',
        tiles: [tileSourceURL],
        minzoom: 0,
        maxzoom: 22
    });
    // Add source to active tracking list if not already there
    if (!window.App.appState.activeSourceIds.includes(sourceId)) {
        window.App.appState.activeSourceIds.push(sourceId);
    }

    // Add main features layer
    console.log(`Adding features layer: ${featureLayerId} for source-layer: 'features'`);
    window.App.appState.map.addLayer({
        id: featureLayerId,
        source: sourceId,
        'source-layer': 'features',
        type: style.type,
        paint: style.paint
    });
    // Add layer to active tracking list if not already there
    if (!window.App.appState.activeLayerIds.includes(featureLayerId)) {
        window.App.appState.activeLayerIds.push(featureLayerId);
    }

    // Add labels layer
    console.log(`Adding labels layer: ${labelLayerId} for source-layer: 'labels'`);
    window.App.appState.map.addLayer({
        id: labelLayerId,
        source: sourceId,
        'source-layer': 'labels',
        type: 'symbol',
        layout: {
            // Set text-field based on selectedField from appState, if available
            'text-field': window.App.appState.selectedField ? ['get', window.App.appState.selectedField] : '',
            'text-font': window.App.layerStyles.Label.layout['text-font'],
            'text-size': window.App.layerStyles.Label.layout['text-size'],
            'text-offset': window.App.layerStyles.Label.layout['text-offset'],
            'text-anchor': window.App.layerStyles.Label.layout['text-anchor'],
            'symbol-placement': 'point'
        },
        paint: window.App.layerStyles.Label.paint
    });
    // Add layer to active tracking list if not already there
    if (!window.App.appState.activeLayerIds.includes(labelLayerId)) {
        window.App.appState.activeLayerIds.push(labelLayerId);
    }

    // Restore label visibility if a field was already selected
    if (window.App.appState.selectedField) {
        window.App.appState.map.setLayoutProperty(labelLayerId, 'visibility', 'visible');
    } else {
        window.App.appState.map.setLayoutProperty(labelLayerId, 'visibility', 'none');
    }

    // Debugging source data on load (remove previous listener if exists, then add new)
    // To avoid multiple listeners for the same source, ensure previous one is removed.
    // If you need to debug multiple tile loads for the same source, this needs more robust management.
    // For now, if called multiple times, this might add multiple listeners.
    // A simple approach is to manage a reference to the listener and remove it.
    // OR, we can just use the debug in startTrackingLayer which runs once per table load.
    // For basemap change, we typically trust the MVT endpoint.
    // Let's remove the listener here for simplicity, as it's more for initial load debugging.
    // The previous implementation used a named function 'sourceDataDebug' to allow removal.
    // Keeping it here for clarity.
    window.App.appState.map.off('sourcedata', window.App.LayerManagement._sourceDataDebugListener); // Remove previous if any
    window.App.LayerManagement._sourceDataDebugListener = function(e) {
        if (e.sourceId === sourceId && e.sourceType === 'vector' && (e.isLoaded || e.is === 'loaded') && e.tile) {
            console.group(`Source Data Loaded for Tile: ${e.tile.z}/${e.tile.x}/${e.tile.y}`);
            const features = window.App.appState.map.querySourceFeatures(sourceId, { sourceLayer: 'features' });
            if (features.length > 0) { console.log(`Features layer ('features') has ${features.length} features.`); }
            else { console.log('No features found in "features" source layer for this tile.'); }
            const labels = window.App.appState.map.querySourceFeatures(sourceId, { sourceLayer: 'labels' });
            if (labels.length > 0) { console.log(`Labels layer ('labels') has ${labels.length} features.`); }
            else { console.log('No features found in "labels" source layer for this tile.'); }
            console.groupEnd();
        }
    };
    window.App.appState.map.on('sourcedata', window.App.LayerManagement._sourceDataDebugListener);
};

// Add a private variable to store the listener reference
window.App.LayerManagement._sourceDataDebugListener = null;


/**
 * Re-adds the current MVT layer if a schema and table are active.
 * This is typically called after the basemap style changes.
 * IMPORTANT: This does NOT re-fetch SRID, Extent, or Fields. It assumes they are constant for the table.
 */
window.App.LayerManagement.readdMVTLayer = async function() {
    if (!window.App.appState.currentSchema || !window.App.appState.currentTable || !window.App.appState.map) {
        console.log('No active table to re-add MVT layer after basemap change.');
        return;
    }

    console.log(`Re-adding MVT layer for ${window.App.appState.currentSchema}.${window.App.appState.currentTable} after basemap change.`);

    // Fetch geometry type to ensure correct styling (small API call, safe)
    const geomTypeResponse = await window.App.Api.fetchGeometryType(
        window.App.appState.currentSchema,
        window.App.appState.currentTable
    );
    let geometryType = 'Polygon'; // Default
    if (geomTypeResponse.ok) {
        const geomTypeData = await geomTypeResponse.json();
        geometryType = geomTypeData.geometryType || 'Polygon';
    } else {
        console.warn(`Failed to get geometry type for re-adding layer. Defaulting to Polygon.`);
    }

    const baseGeomType = geometryType.replace('MULTI', '').replace('ST_', '');
    const style = window.App.layerStyles[baseGeomType] || window.App.layerStyles.Polygon;

    // Directly call the helper function to add the source and layers
    window.App.LayerManagement.addMVTSourceAndLayers(
        window.App.appState.currentSchema,
        window.App.appState.currentTable,
        style
    );

    // Update layer info display
    window.App.LayerManagement.updateLayerInfo();
};


/**
 * Stops tracking the current layer and cleans up map resources.
 */
window.App.LayerManagement.stopTrackingLayer = async function() {
    console.log('Stopping tracking layer and cleaning up map resources...');

    window.App.appState.map.off('moveend', window.App.LayerManagement.updateLayerInfo);
    window.App.appState.map.off('sourcedata', window.App.LayerManagement._sourceDataDebugListener); // Remove debug listener

    // Manually remove layers and sources based on active IDs
    window.App.appState.activeLayerIds.forEach(layerId => {
        if (window.App.appState.map.getLayer(layerId)) {
            console.log(`Removing layer: ${layerId}`);
            window.App.appState.map.removeLayer(layerId);
        }
    });
    window.App.appState.activeSourceIds.forEach(sourceId => {
        if (window.App.appState.map.getSource(sourceId)) {
            console.log(`Removing source: ${sourceId}`);
            window.App.appState.map.removeSource(sourceId);
        }
    });

    window.App.appState.activeLayerIds = [];
    window.App.appState.activeSourceIds = [];

    window.App.UI.resetFieldDropdown(); // Call UI function

    window.App.appState.currentTable = null;
    window.App.appState.currentSchema = null;
    window.App.appState.selectedField = null;

    const resultDiv = document.getElementById('result-display');
    if (resultDiv) {
        resultDiv.innerHTML = '';
        resultDiv.classList.remove('show');
    }
    console.log('Layer tracking stopped. Map resources cleaned.');
};

/**
 * Updates the labels layer with the selected field.
 * @param {string} fieldName - The field name to use for labels.
 */
window.App.LayerManagement.updateLabelsLayer = function(fieldName) {
    if (!window.App.appState.currentSchema || !window.App.appState.currentTable || !window.App.appState.map) {
        console.warn('Cannot update labels layer: map, schema, or table not set.');
        return;
    }

    const labelLayerId = getLabelLayerId(window.App.appState.currentSchema, window.App.appState.currentTable);

    if (window.App.appState.map.getLayer(labelLayerId)) {
        console.log(`Updating label layer '${labelLayerId}' with field: '${fieldName}'`);
        window.App.appState.map.setLayoutProperty(labelLayerId, 'text-field', fieldName ? ['get', fieldName] : '');
        window.App.appState.map.setLayoutProperty(labelLayerId, 'visibility', fieldName ? 'visible' : 'none');
    } else {
        console.warn(`Label layer '${labelLayerId}' not found. Cannot update.`);
    }
};

/**
 * Updates the layer information displayed in the UI and sends it to the backend.
 */
window.App.LayerManagement.updateLayerInfo = async function() {
    if (!window.App.appState.currentTable || !window.App.appState.currentSchema) return;

    const zoom = Math.floor(window.App.appState.map.getZoom());
    const center = window.App.appState.map.getCenter();

    const tile = window.App.Utils.lonLatToTile(center.lng, center.lat, zoom);
    const tileX = tile.x;
    const tileY = tile.y;

    const mvtURL = window.App.Api.getMvtUrl(window.App.appState.currentSchema, window.App.appState.currentTable)
        .replace('{z}', zoom)
        .replace('{x}', tileX)
        .replace('{y}', tileY);

    console.log(`Current MVT tile URL for center: ${mvtURL}`);

    const resultDiv = document.getElementById('result-display');
    if (resultDiv) {
        resultDiv.innerHTML = `
            <div><code>/${window.App.appState.currentSchema}/${window.App.appState.currentTable}/${zoom}/${tileX}/${tileY}.pbf</code></div>
        `;
        resultDiv.classList.add('show');
    }

    await window.App.Api.sendLayerState(window.App.appState.currentSchema, window.App.appState.currentTable, zoom, tileX, tileY);
};