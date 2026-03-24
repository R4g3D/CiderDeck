/// <reference path="../../libs/js/property-inspector.js" />
/// <reference path="../../libs/js/utils.js" />
/// <reference path="../../libs/js/base-inspector.js" />

let tempSettings = {};

function getDefaultSettings() {
    return {
        gridSize: 2,
        tileRow: 1,
        tileColumn: 1,
        fitMode: 'cover'
    };
}

function clamp(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return min;
    }

    return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function rebuildTileOptions(gridSize) {
    const size = clamp(gridSize, 1, 6);
    const rowSelect = document.getElementById('tileRow');
    const columnSelect = document.getElementById('tileColumn');
    const selectedRow = clamp(tempSettings.tileRow ?? 1, 1, size);
    const selectedColumn = clamp(tempSettings.tileColumn ?? 1, 1, size);

    rowSelect.innerHTML = '';
    columnSelect.innerHTML = '';

    for (let index = 1; index <= size; index += 1) {
        rowSelect.add(new Option(`${index}`, `${index}`));
        columnSelect.add(new Option(`${index}`, `${index}`));
    }

    rowSelect.value = `${selectedRow}`;
    columnSelect.value = `${selectedColumn}`;
    tempSettings.tileRow = selectedRow;
    tempSettings.tileColumn = selectedColumn;
}

function loadSettingsToUI(settings) {
    const merged = {
        ...getDefaultSettings(),
        ...(settings || {})
    };

    tempSettings = JSON.parse(JSON.stringify(merged));
    document.getElementById('gridSize').value = `${merged.gridSize}`;
    rebuildTileOptions(merged.gridSize);
    document.getElementById('fitMode').value = merged.fitMode || 'cover';
}

function collectFormValues() {
    const gridSize = clamp(document.getElementById('gridSize').value, 1, 6);
    tempSettings.gridSize = gridSize;
    tempSettings.tileRow = clamp(document.getElementById('tileRow').value, 1, gridSize);
    tempSettings.tileColumn = clamp(document.getElementById('tileColumn').value, 1, gridSize);
    tempSettings.fitMode = document.getElementById('fitMode').value === 'contain' ? 'contain' : 'cover';
}

function handleSettingsUpdate(settings) {
    tempSettings = JSON.parse(JSON.stringify(settings || getDefaultSettings()));
    loadSettingsToUI(tempSettings);
}

function handleGlobalSettingsUpdate(globalSettings) {
    if (!globalSettings?.albumArtGrid) {
        return;
    }

    baseInspector.actionSettings = { ...baseInspector.actionSettings, ...globalSettings.albumArtGrid };
    tempSettings = JSON.parse(JSON.stringify(baseInspector.actionSettings));
    loadSettingsToUI(tempSettings);
}

function initUI() {
    document.getElementById('gridSize').addEventListener('change', () => {
        const gridSize = clamp(document.getElementById('gridSize').value, 1, 6);
        tempSettings.gridSize = gridSize;
        rebuildTileOptions(gridSize);
    });

    document.getElementById('save-settings').addEventListener('click', (event) => {
        event.preventDefault();
        collectFormValues();

        baseInspector.actionSettings = JSON.parse(JSON.stringify(tempSettings));
        baseInspector.syncActionToGlobalSettings();
        baseInspector.saveActionSettings();
        baseInspector.saveGlobalSettings();

        const button = document.getElementById('save-settings');
        const originalText = button.innerText;
        button.innerText = 'Saved!';
        setTimeout(() => {
            button.innerText = originalText;
        }, 2000);
    });

    document.getElementById('reset-settings').addEventListener('click', (event) => {
        event.preventDefault();
        tempSettings = getDefaultSettings();
        loadSettingsToUI(tempSettings);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initUI();

    if (!baseInspector.globalSettings.albumArtGrid) {
        baseInspector.globalSettings.albumArtGrid = getDefaultSettings();
    }

    baseInspector.initialize({
        actionType: 'albumArtGrid',
        onActionSettingsReceived: handleSettingsUpdate,
        onGlobalSettingsReceived: handleGlobalSettingsUpdate,
        addGlobalSettingsTab: true
    });
});
