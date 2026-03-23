/// <reference path="../../libs/js/property-inspector.js" />
/// <reference path="../../libs/js/utils.js" />
/// <reference path="../../libs/js/base-inspector.js" />

// Create a temporary storage for unsaved settings
// This allows us to track changes between tabs without saving to Stream Deck
let tempSettings = {};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Initialize UI event listeners for controls
    initUI();
    
    // Initialize the base inspector with our settings
    baseInspector.initialize({
        actionType: 'dial',
        onActionSettingsReceived: handleSettingsUpdate,
        onGlobalSettingsReceived: handleGlobalSettingsUpdate,
        addGlobalSettingsTab: true
    });
    
    // Add custom tab switching to ensure settings persist across functional tabs
    setupFunctionalTabSwitching();
});

function getValueByPath(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
}

function setValueByPath(obj, path, value) {
    const keys = path.split('.');
    let target = obj;

    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
            target[key] = {};
        }
        target = target[key];
    }

    target[keys[keys.length - 1]] = value;
}

function calculateSliderPercent(input) {
    const min = Number(input.min ?? 0);
    const max = Number(input.max ?? 100);
    const value = Number(input.value ?? min);
    const range = max - min;

    if (range <= 0) {
        return 100;
    }

    return Math.round(((value - min) / range) * 100);
}

function formatSliderReadout(input) {
    const value = Number(input.value);

    switch (input.id) {
        case 'volumeStep':
            return `${value}%`;
        case 'marqueeSpeed':
            return `${value} ms`;
        case 'marqueeLength':
            return `${value} ch`;
        case 'marqueeDelay':
            return `${(value / 1000).toFixed(1)} s`;
        default:
            return `${calculateSliderPercent(input)}%`;
    }
}

function updateSliderReadout(input) {
    const readout = document.getElementById(`${input.id}-readout`);
    if (!readout) return;
    readout.textContent = formatSliderReadout(input);
}

function refreshSliderReadouts() {
    document.querySelectorAll('input[type="range"]').forEach(updateSliderReadout);
}

function initializeSliderReadouts() {
    document.querySelectorAll('input[type="range"]').forEach(input => {
        updateSliderReadout(input);
        input.addEventListener('input', () => updateSliderReadout(input));
        input.addEventListener('change', () => updateSliderReadout(input));
    });
}

/**
 * Handle settings updates from baseInspector
 * This is called when the action settings are received from Stream Deck
 * @param {Object} settings - The settings object from Stream Deck
 */
function handleSettingsUpdate(settings) {
    console.log('Dial action settings updated:', settings);
    
    // Initialize the temporary settings with a deep copy of the received settings
    tempSettings = JSON.parse(JSON.stringify(baseInspector.actionSettings));
    
    // Load the settings into the UI
    loadSettingsToUI(tempSettings);
    
    // Update UI state
    updateDependentControls();
    refreshSliderReadouts();
}

/**
 * Handle global settings updates
 * This ensures temporary settings stay in sync with global settings
 * @param {Object} globalSettings - The global settings object from Stream Deck
 */
function handleGlobalSettingsUpdate(globalSettings) {
    console.log('Global settings updated:', globalSettings);
    
    // If we have dial settings in the global object, update our UI
    if (globalSettings.dial) {
        // Synchronize the action settings with global dial settings
        baseInspector.actionSettings = {...baseInspector.actionSettings, ...globalSettings.dial};
        
        // Update our temporary settings to keep them in sync
        tempSettings = JSON.parse(JSON.stringify(baseInspector.actionSettings));
        
        // Load the temporary settings to the UI
        loadSettingsToUI(tempSettings);
        
        // Update UI state
        updateDependentControls();
        refreshSliderReadouts();
    }
}

/**
 * Initialize UI event listeners and functionality
 * Sets up all event handlers for the property inspector UI
 */
function initUI() {
    // Enable/disable marquee controls based on enableMarquee checkbox
    document.getElementById('enableMarquee').addEventListener('change', function() {
        updateMarqueeControls();
    });

    // Show/hide volume step based on rotation action
    document.getElementById('rotationAction').addEventListener('change', function() {
        updateRotationControls();
    });

    initializeSliderReadouts();
    
    // Save button: Apply temporary settings to actual settings and save to Stream Deck
    document.getElementById('save-settings').addEventListener('click', (event) => {
        event.preventDefault();
        
        collectFormValues();
        
        // Show a success message
        const button = document.getElementById('save-settings');
        const originalText = button.innerText;
        button.innerText = "✓ Saved!";
        setTimeout(() => {
            button.innerText = originalText;
        }, 2000);
    });

    // Reset settings to defaults
    document.getElementById('reset-settings').addEventListener('click', (event) => {
        event.preventDefault();
        // Get default dial settings from the base inspector
        const defaultSettings = baseInspector.globalSettings.dial;
        // Reset temp settings to defaults 
        tempSettings = JSON.parse(JSON.stringify(defaultSettings));
        // Load default settings into the UI
        loadSettingsToUI(tempSettings);
        // Update dependent controls
        updateDependentControls();
        refreshSliderReadouts();
    });

    // Handle range inputs with clickable spans
    document.querySelectorAll('.clickable').forEach(span => {
        span.addEventListener('click', function() {
            const value = this.getAttribute('value');
            const input = this.parentNode.querySelector('input[type="range"]');
            if (input && value) {
                input.value = value;
                // Trigger change event
                const event = new Event('change');
                input.dispatchEvent(event);
                updateSliderReadout(input);
            }
        });
    });
}

/**
 * Setup functional tab switching with persistence between tabs
 * This allows users to switch tabs without losing unsaved changes
 */
function setupFunctionalTabSwitching() {
    // Add event listeners for the functional tab buttons (Dial Controls, Display)
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', function() {
            // First, save current tab values to temporary storage
            collectFormValues();
            
            // Handle visual tab switching
            document.querySelectorAll('.tab-button').forEach(btn => {
                btn.classList.remove('active');
            });
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            
            // Activate selected tab
            this.classList.add('active');
            const tabId = this.getAttribute('data-tab');
            const tabContent = document.getElementById(tabId);
            if (tabContent) {
                tabContent.classList.add('active');
            }
            
            // Restore saved values to the newly activated tab
            loadSettingsToUI(tempSettings);
            
            // Update dependent controls
            updateDependentControls();
            refreshSliderReadouts();
        });
    });
}

/**
 * Collect all form values into the temporary settings object
 * This captures the current state of all form elements with data-setting attributes
 */
function collectFormValues() {
    // Get all form elements with data-setting attributes
    document.querySelectorAll('[data-setting]').forEach(element => {
        const settingName = element.dataset.setting;
        if (!settingName) return;
        
        // Update the setting in tempSettings based on element type
        let value;
        if (element.type === 'checkbox') {
            value = element.checked;
        } else if (element.type === 'range' || element.type === 'number') {
            const numValue = parseInt(element.value, 10);
            value = isNaN(numValue) ? 0 : numValue;
        } else {
            value = element.value.trim();
        }

        setValueByPath(tempSettings, settingName, value);
    });
}

/**
 * Load settings from a settings object to the UI controls
 * This applies stored settings to all form elements with data-setting attributes
 * @param {Object} settings - The settings object to load into the UI
 */
function loadSettingsToUI(settings) {
    // Get all form elements with data-setting attributes
    document.querySelectorAll('[data-setting]').forEach(element => {
        const settingName = element.dataset.setting;
        if (!settingName) return;
        const value = getValueByPath(settings, settingName);
        if (value === undefined) return;
        
        // Update the UI element based on its type
        if (element.type === 'checkbox') {
            element.checked = value;
        } else if (element.type === 'range' || element.type === 'number' || element.type === 'text' || element.tagName === 'SELECT') {
            element.value = value;
        }
    });

    refreshSliderReadouts();
}

/**
 * Update UI state for dependent elements
 * Enables/disables and adjusts opacity of UI elements based on their parent controls
 */
function updateDependentControls() {
    // Update marquee controls state
    updateMarqueeControls();
    
    // Update volume step visibility based on rotation action
    updateRotationControls();
}

/**
 * Update marquee controls state based on enableMarquee checkbox
 * Disables marquee-related controls when marquee is turned off
 */
function updateMarqueeControls() {
    const isEnabled = document.getElementById('enableMarquee').checked;
    document.getElementById('marqueeSpeed').disabled = !isEnabled;
    document.getElementById('marqueeLength').disabled = !isEnabled;
    document.getElementById('marqueeDelay').disabled = !isEnabled;
    
    document.querySelectorAll('#marquee-speed-container .clickable, #marquee-length-container .clickable, #marquee-delay-container .clickable').forEach(el => {
        el.style.opacity = isEnabled ? 1 : 0.5;
    });
}

/**
 * Update rotation controls based on selected rotation action
 * Shows/hides volume step control based on whether volume control is selected
 */
function updateRotationControls() {
    const rotationAction = document.getElementById('rotationAction').value;
    const volumeStepContainer = document.getElementById('volume-step-item');
    volumeStepContainer.style.display = rotationAction === 'volume' ? 'flex' : 'none';
}
