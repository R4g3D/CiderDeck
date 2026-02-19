/// <reference path="../../libs/js/property-inspector.js" />
/// <reference path="../../libs/js/utils.js" />
/// <reference path="../../libs/js/base-inspector.js" />

let tempSettings = {};

document.addEventListener('DOMContentLoaded', function() {
    initUI();

    if (!baseInspector.globalSettings.playlist) {
        baseInspector.globalSettings.playlist = {
            playlistId: '',
            shouldShuffle: false
        };
    }

    baseInspector.initialize({
        actionType: 'playlist',
        onActionSettingsReceived: handleSettingsUpdate,
        onGlobalSettingsReceived: handleGlobalSettingsUpdate,
        addGlobalSettingsTab: true
    });
});

function handleSettingsUpdate(settings) {
    tempSettings = JSON.parse(JSON.stringify(settings || {}));
    loadSettingsToUI(tempSettings);
}

function handleGlobalSettingsUpdate(globalSettings) {
    if (globalSettings?.playlist) {
        baseInspector.actionSettings = { ...baseInspector.actionSettings, ...globalSettings.playlist };
        tempSettings = JSON.parse(JSON.stringify(baseInspector.actionSettings));
        loadSettingsToUI(tempSettings);
    }
}

function initUI() {
    document.getElementById('save-settings').addEventListener('click', (event) => {
        event.preventDefault();
        collectFormValues();

        baseInspector.actionSettings = JSON.parse(JSON.stringify(tempSettings));
        baseInspector.syncActionToGlobalSettings();
        baseInspector.saveActionSettings();
        baseInspector.saveGlobalSettings();

        const button = document.getElementById('save-settings');
        const originalText = button.innerText;
        button.innerText = "Saved!";
        setTimeout(() => {
            button.innerText = originalText;
        }, 2000);
    });

    document.getElementById('reset-settings').addEventListener('click', (event) => {
        event.preventDefault();
        tempSettings = {
            playlistId: '',
            shouldShuffle: false
        };
        loadSettingsToUI(tempSettings);
    });
}

function collectFormValues() {
    tempSettings.playlistId = document.getElementById('playlistId').value.trim();
    tempSettings.shouldShuffle = document.getElementById('shouldShuffle').checked;
}

function loadSettingsToUI(settings) {
    document.getElementById('playlistId').value = settings.playlistId || '';
    document.getElementById('shouldShuffle').checked = Boolean(settings.shouldShuffle);
}
