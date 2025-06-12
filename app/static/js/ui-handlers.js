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
                const schemaItem = this.closest('.schema-item'); // Get the parent schema-item
                const tableList = schemaItem.querySelector('.table-list'); // Find table-list within this schema-item
                const icon = this.querySelector('.toggle-icon');

                tableList.classList.toggle('show');
                icon.classList.toggle('fa-chevron-down');
                icon.classList.toggle('fa-chevron-up');
                schemaItem.classList.toggle('expanded'); // Optional: Add expanded class to schema-item for specific styling
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

                // --- Loading Modal Control ---
                window.App.UI.showLoadingModal(); // Show modal before loading starts
                try {
                    // Call LayerManagement function to start tracking
                    await window.App.LayerManagement.startTrackingLayer(schemaName, tableName);
                } catch (error) {
                    console.error("Failed to load table:", error);
                    window.App.Utils.displayError(`Error loading table ${schemaName}.${tableName}: ${error.message}`);
                } finally {
                    window.App.UI.hideLoadingModal(); // Hide modal after loading completes (success or failure)
                }
                // --- End Loading Modal Control ---
            });
        });

        // Initialize fieldDropdown elements and store in appState
        window.App.appState.fieldDropdown = {
            element: document.querySelector('.label-field-dropdown'),
            header: document.querySelector('.label-field-dropdown .dropdown-header'),
            content: document.querySelector('.label-field-dropdown .dropdown-content'),
            chevron: document.querySelector('.label-field-dropdown .dropdown-chevron'),
            titleSpan: document.querySelector('.label-field-dropdown .dropdown-title')
        };

        // Field dropdown toggle
        // Ensure elements exist before adding listeners
        if (window.App.appState.fieldDropdown.header && window.App.appState.fieldDropdown.element) {
            window.App.appState.fieldDropdown.header.addEventListener('click', () => {
                window.App.appState.fieldDropdown.element.classList.toggle('active');
                // Toggle chevron icon when dropdown opens/closes
                window.App.appState.fieldDropdown.chevron.classList.toggle('fa-chevron-down');
                window.App.appState.fieldDropdown.chevron.classList.toggle('fa-chevron-up');

                // When dropdown opens, focus on the search input
                if (window.App.appState.fieldDropdown.element.classList.contains('active')) {
                    const searchInput = window.App.appState.fieldDropdown.content.querySelector('.dropdown-search-input');
                    if (searchInput) {
                        searchInput.focus();
                    }
                }
            });

            // Close dropdown when clicking outside
            document.addEventListener('click', (event) => {
                const dropdownElement = window.App.appState.fieldDropdown.element;
                if (dropdownElement && !dropdownElement.contains(event.target) && dropdownElement.classList.contains('active')) {
                    dropdownElement.classList.remove('active');
                    // Ensure chevron points down when closing
                    window.App.appState.fieldDropdown.chevron.classList.remove('fa-chevron-up');
                    window.App.appState.fieldDropdown.chevron.classList.add('fa-chevron-down');
                }
            });

        } else {
            console.error('Label Field Dropdown HTML elements not found. Please check index.html.');
        }

        // Initialize loading modal functions
        window.App.UI.showLoadingModal = function() {
            const loadingModal = document.getElementById('loading-modal');
            if (loadingModal) {
                loadingModal.classList.add('show');
            }
        };

        window.App.UI.hideLoadingModal = function() {
            const loadingModal = document.getElementById('loading-modal');
            if (loadingModal) {
                loadingModal.classList.remove('show');
            }
        };

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
    const dropdownTitleSpan = window.App.appState.fieldDropdown.titleSpan;

    if (!dropdownContent || !dropdownTitleSpan) {
        console.error("populateFieldDropdown: Required dropdown elements are null.");
        return;
    }

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

    // Reset dropdown title to default
    dropdownTitleSpan.textContent = 'Label ...';
    window.App.appState.fieldDropdown.element.classList.remove('disabled'); // Ensure dropdown is enabled if fields exist
};

/**
 * Renders the given array of field names as dropdown options.
 * @param {Array<string>} fieldNamesToRender - Array of field names to display.
 */
window.App.UI.renderFieldOptions = function(fieldNamesToRender) {
    const dropdownContent = window.App.appState.fieldDropdown.content;
    // Clear only the options, keep the search input and empty state
    Array.from(dropdownContent.children).forEach(child => {
        if (!child.classList.contains('dropdown-search-input') && !child.classList.contains('empty-state')) {
            child.remove();
        }
    });

    // Remove existing empty state if there is one
    const existingEmptyState = dropdownContent.querySelector('.empty-state');
    if (existingEmptyState) {
        existingEmptyState.remove();
    }

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
                window.App.appState.fieldDropdown.titleSpan.dataset.originalText = 'Label ...'; // Store original text

                window.App.UI.addResetButton(); // Add reset button

                window.App.appState.fieldDropdown.element.classList.remove('active'); // Close dropdown
                // Clear search input on selection
                const searchInput = dropdownContent.querySelector('.dropdown-search-input');
                if (searchInput) searchInput.value = '';
                window.App.UI.filterFieldDropdown(''); // Reset filter display to show all original options
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
 */
window.App.UI.addResetButton = function() {
    const header = window.App.appState.fieldDropdown.header;
    if (!header) return;

    if (header.querySelector('.reset-field')) { // Check if button already exists
        return;
    }

    const resetBtn = document.createElement('span');
    resetBtn.className = 'reset-field';
    resetBtn.innerHTML = '&times;'; // 'x' icon

    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent dropdown from toggling when clicking reset
        window.App.UI.resetFieldSelection();
        resetBtn.remove(); // Remove button after use
    });

    header.appendChild(resetBtn);
};

/**
 * Resets the selected field and hides labels.
 */
window.App.UI.resetFieldSelection = function() {
    window.App.appState.selectedField = null; // Clear selected field in appState
    
    const dropdownTitleSpan = window.App.appState.fieldDropdown.titleSpan;
    if (dropdownTitleSpan) {
        dropdownTitleSpan.textContent = dropdownTitleSpan.dataset.originalText || 'Label ...';
    }

    window.App.LayerManagement.updateLabelsLayer(''); // Hide labels on the map

    const resetBtn = window.App.appState.fieldDropdown.header.querySelector('.reset-field');
    if (resetBtn) resetBtn.remove(); // Remove the reset button
};

/**
 * Resets the field dropdown to its initial state (including search input).
 * This is called by LayerManagement.
 */
window.App.UI.resetFieldDropdown = function() {
    const dropdownContent = window.App.appState.fieldDropdown.content;
    const dropdownTitleSpan = window.App.appState.fieldDropdown.titleSpan;
    const fieldDropdownElement = window.App.appState.fieldDropdown.element;

    if (!dropdownContent || !dropdownTitleSpan || !fieldDropdownElement) {
        console.error('Cannot reset field dropdown: one or more elements are null.');
        return;
    }

    dropdownContent.innerHTML = ''; // Clear everything including search input
    
    // Reset dropdown title to default
    if (dropdownTitleSpan.dataset.originalText) {
        dropdownTitleSpan.textContent = dropdownTitleSpan.dataset.originalText;
    } else {
        dropdownTitleSpan.textContent = 'Label ...';
    }

    const resetBtn = window.App.appState.fieldDropdown.header.querySelector('.reset-field');
    if (resetBtn) resetBtn.remove(); // Remove the reset button

    fieldDropdownElement.classList.remove('active'); // Ensure dropdown is closed

    // Also clear the stored field names when resetting the dropdown
    allFieldNames = [];
};

/**
 * Displays an empty state message within the dropdown.
 * @param {string} message - The message to display.
 * @param {boolean} isError - True if the message indicates an error.
 */
window.App.UI.showEmptyState = function(message, isError = false) {
    const dropdownContent = window.App.appState.fieldDropdown.content;
    if (!dropdownContent) return;

    // Remove existing empty state if there is one
    const existingEmptyState = dropdownContent.querySelector('.empty-state');
    if (existingEmptyState) {
        existingEmptyState.remove();
    }

    const emptyOption = document.createElement('div');
    emptyOption.className = `dropdown-option empty-state ${isError ? 'error' : ''}`; // Add 'empty-state' class
    emptyOption.textContent = message;
    dropdownContent.appendChild(emptyOption);
};