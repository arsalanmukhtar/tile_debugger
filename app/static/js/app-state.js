// app/static/js/app-state.js

// Create a global App object if it doesn't exist
window.App = window.App || {};

// Initialize application state
window.App.appState = {
    map: null,
    currentSchema: null,
    currentTable: null,
    mapboxToken: null,
    fieldDropdown: null,
    selectedField: null,
    activeLayerIds: [],
    activeSourceIds: [],
    customLayerStyles: {} // NEW: Object to store custom styles for active layers
};

// Layer style definitions (existing)
window.App.layerStyles = {
    Point: {
        type: 'circle',
        paint: {
            'circle-radius': 3,
            'circle-color': '#007d7e', /* Adjusted to primary accent color for default */
            'circle-opacity': 0.8,
            'circle-stroke-width': 0.5,
            'circle-stroke-color': '#005d5e' /* Slightly darker */
        }
    },
    LineString: {
        type: 'line',
        paint: {
            'line-color': '#007d7e', /* Adjusted to primary accent color for default */
            'line-width': 2,
            'line-opacity': 0.8
        }
    },
    Polygon: {
        type: 'fill',
        paint: {
            'fill-color': '#007d7e', /* Adjusted to primary accent color for default */
            'fill-opacity': 0.4,
            'fill-outline-color': '#005d5e' /* Slightly darker */
        }
    },
    Label: {
        type: 'symbol',
        layout: {
            'text-field': '',
            'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
            'text-size': 12,
            'text-offset': [0, 0.6],
            'text-anchor': 'top',
            'text-allow-overlap': false
        },
        paint: {
            'text-color': '#333333', /* Primary text color */
            'text-halo-color': '#fff',
            'text-halo-width': 1
        }
    }
};