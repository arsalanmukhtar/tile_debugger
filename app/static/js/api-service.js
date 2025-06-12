// app/static/js/api-service.js

window.App = window.App || {};
window.App.Api = window.App.Api || {};

/**
 * Fetches schema and table SRID information.
 * @param {string} schemaName
 * @param {string} tableName
 * @returns {Promise<Response>}
 */
window.App.Api.fetchSrid = async function(schemaName, tableName) {
    return await fetch(`/api/check-srid/${schemaName}/${tableName}`);
};

/**
 * Fetches geometry type for a table.
 * @param {string} schemaName
 * @param {string} tableName
 * @returns {Promise<Response>}
 */
window.App.Api.fetchGeometryType = async function(schemaName, tableName) {
    return await fetch(`/api/geometry-type/${schemaName}/${tableName}`);
};

/**
 * Fetches extent (bounding box) for a table.
 * @param {string} schemaName
 * @param {string} tableName
 * @returns {Promise<Response>}
 */
window.App.Api.fetchExtent = async function(schemaName, tableName) {
    return await fetch(`/api/extent/${schemaName}/${tableName}`);
};

/**
 * Fetches fields (columns) for a table.
 * @param {string} schemaName
 * @param {string} tableName
 * @returns {Promise<Response>}
 */
window.App.Api.fetchFields = async function(schemaName, tableName) {
    return await fetch(`/api/fields/${schemaName}/${tableName}`);
};

/**
 * Sends current layer state to the backend for logging/tracking.
 * @param {string} schema_name
 * @param {string} table
 * @param {number} z
 * @param {number} x
 * @param {number} y
 */
window.App.Api.sendLayerState = async function(schema_name, table, z, x, y) {
    try {
        const response = await fetch('/api/layer-state', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                schema_name,
                table,
                z,
                x,
                y
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
};

/**
 * Helper to generate MVT URL.
 * @param {string} schema
 * @param {string} table
 * @returns {string} MVT tile URL template.
 */
window.App.Api.getMvtUrl = function(schema, table) {
    return `http://localhost:8000/api/mvt/${schema}/${table}/{z}/{x}/{y}.pbf`;
};