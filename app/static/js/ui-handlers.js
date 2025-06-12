// app/static/js/ui-handlers.js

window.App = window.App || {};
window.App.UI = window.App.UI || {};

// Private variable to store all available fields for searching
let allFieldNames = [];

/**
 * Sets up all UI event listeners for the application.
 */
window.App.UI.setupUI = function() {
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
                    e.stopPropagation();
                    this.classList.remove('active');
                    unloadBtn.remove();
                    window.App.LayerManagement.stopTrackingLayer(); // Call LayerManagement function
                });
                this.appendChild(unloadBtn);

                // Call LayerManagement function to start tracking
                window.App.LayerManagement.startTrackingLayer(schemaName, tableName);
            });
        });

        // Field dropdown toggle
        window.App.appState.fieldDropdown.header.addEventListener('click', () => {
            window.App.appState.fieldDropdown.element.classList.toggle('active');
            // When dropdown opens, focus on the search input
            if (window.App.appState.fieldDropdown.element.classList.contains('active')) {
                const searchInput = window.App.appState.fieldDropdown.content.querySelector('.dropdown-search-input');
                if (searchInput) {
                    searchInput.focus();
                }
            }
        });

    } catch (error) {
        console.error('Error in setupUI:', error);
        window.App.Utils.displayError('UI setup failed: ' + error.message);
    }
};

/**
 * Populates the label field dropdown with available fields.
 * This function is called by LayerManagement.
 * @param {Array<object>} fieldsData - Array of field objects {name: string}.
 */
window.App.UI.populateFieldDropdown = function(fieldsData) {
    const dropdownContent = window.App.appState.fieldDropdown.content;
    dropdownContent.innerHTML = ''; // Clear existing options
    window.App.appState.selectedField = null; // Reset selected field

    // Store all field names for search functionality
    allFieldNames = fieldsData
        .map(field => field?.name)
        .filter(name => typeof name === 'string' && name.trim() !== '');

    // Add search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search fields...';
    searchInput.className = 'dropdown-search-input';
    searchInput.addEventListener('input', (e) => {
        window.App.UI.filterFieldDropdown(e.target.value);
    });
    dropdownContent.appendChild(searchInput);

    // Populate dropdown options initially with all fields
    if (allFieldNames.length > 0) {
        window.App.UI.renderFieldOptions(allFieldNames);
    } else {
        window.App.UI.showEmptyState('No fields available for labeling', false);
    }
};

/**
 * Renders the given array of field names as dropdown options.
 * @param {Array<string>} fieldNamesToRender - Array of field names to display.
 */
window.App.UI.renderFieldOptions = function(fieldNamesToRender) {
    const dropdownContent = window.App.appState.fieldDropdown.content;
    // Clear only the options, keep the search input
    Array.from(dropdownContent.children).forEach(child => {
        if (!child.classList.contains('dropdown-search-input')) {
            child.remove();
        }
    });

    if (fieldNamesToRender.length > 0) {
        fieldNamesToRender.forEach(fieldName => {
            const option = document.createElement('div');
            option.className = 'dropdown-option';
            option.textContent = fieldName;
            option.addEventListener('click', (e) => {
                e.stopPropagation();

                window.App.appState.selectedField = fieldName;
                window.App.LayerManagement.updateLabelsLayer(fieldName);

                window.App.appState.fieldDropdown.titleSpan.textContent = fieldName;
                window.App.appState.fieldDropdown.titleSpan.dataset.originalText = 'Label ...';

                window.App.UI.addResetButton();

                window.App.appState.fieldDropdown.element.classList.remove('active');
                console.log('Selected field for labeling:', fieldName);
                // Clear search input on selection
                const searchInput = dropdownContent.querySelector('.dropdown-search-input');
                if (searchInput) searchInput.value = '';
                window.App.UI.filterFieldDropdown(''); // Reset filter display
            });
            dropdownContent.appendChild(option);
        });
    } else {
        window.App.UI.showEmptyState('No matching fields', false);
    }
};

/**
 * Filters the field dropdown options based on search text.
 * @param {string} searchText - The text to filter by.
 */
window.App.UI.filterFieldDropdown = function(searchText) {
    const lowerCaseSearchText = searchText.toLowerCase();
    const filteredFields = allFieldNames.filter(fieldName =>
        fieldName.toLowerCase().includes(lowerCaseSearchText)
    );
    window.App.UI.renderFieldOptions(filteredFields);
};

/**
 * Adds a reset button to the field dropdown header.
 * This is a private helper within UI.
 */
window.App.UI.addResetButton = function() {
    if (window.App.appState.fieldDropdown.header.querySelector('.reset-field')) {
        return;
    }

    const resetBtn = document.createElement('span');
    resetBtn.className = 'reset-field';
    resetBtn.innerHTML = '&times;';

    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.App.UI.resetFieldSelection();
        resetBtn.remove();
    });

    window.App.appState.fieldDropdown.header.appendChild(resetBtn);
};

/**
 * Resets the selected field and hides labels.
 * This is a private helper within UI.
 */
window.App.UI.resetFieldSelection = function() {
    window.App.appState.selectedField = null;
    window.App.appState.fieldDropdown.titleSpan.textContent =
        window.App.appState.fieldDropdown.titleSpan.dataset.originalText || 'Label ...';

    window.App.LayerManagement.updateLabelsLayer('');

    const resetBtn = window.App.appState.fieldDropdown.header.querySelector('.reset-field');
    if (resetBtn) resetBtn.remove();
};

/**
 * Resets the field dropdown to its initial state (including search input).
 * This is called by LayerManagement.
 */
window.App.UI.resetFieldDropdown = function() {
    window.App.appState.fieldDropdown.content.innerHTML = ''; // Clear everything including search input

    const headerText = window.App.appState.fieldDropdown.header.querySelector('span');
    if (headerText.dataset.originalText) {
        headerText.textContent = headerText.dataset.originalText;
    } else {
        headerText.textContent = 'Label ...';
    }

    const resetBtn = window.App.appState.fieldDropdown.header.querySelector('.reset-field');
    if (resetBtn) resetBtn.remove();

    window.App.appState.fieldDropdown.element.classList.remove('active');

    // Also clear the stored field names when resetting the dropdown
    allFieldNames = [];
};

/**
 * Displays an empty state message within the dropdown.
 * This is a private helper within UI.
 * @param {string} message - The message to display.
 * @param {boolean} isError - True if the message indicates an error.
 */
window.App.UI.showEmptyState = function(message, isError = false) {
    const emptyOption = document.createElement('div');
    emptyOption.className = `dropdown-option disabled ${isError ? 'error' : ''}`;
    emptyOption.textContent = message;
    window.App.appState.fieldDropdown.content.appendChild(emptyOption);
};