/**
 * CiderDeck Album Art Grid
 *
 * Renders the current artwork across multiple keypad buttons by cropping
 * a square source image into per-tile images.
 */

const albumArtGridLogger = window.CiderDeckLogger?.createLogger('AlbumArtGrid') || {
    info: console.log,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
    category: () => ({
        info: console.log,
        debug: console.debug,
        warn: console.warn,
        error: console.error
    })
};

const DEFAULT_TILE_RENDER_SIZE = 144;
const DEVICE_TILE_RENDER_SIZE = {
    default: 144
};

const albumArtGridContexts = new Map();
const albumArtGridDevices = new Map();
const albumArtGridImageCache = new Map();
const albumArtGridTileCache = new Map();

function clampNumber(value, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return min;
    }

    return Math.min(max, Math.max(min, Math.floor(numeric)));
}

function normalizeGridSettings(settings = {}) {
    const gridSize = clampNumber(settings.gridSize ?? 2, 1, 6);
    const tileRow = clampNumber(settings.tileRow ?? 1, 1, gridSize);
    const tileColumn = clampNumber(settings.tileColumn ?? 1, 1, gridSize);
    const fitMode = settings.fitMode === 'contain' ? 'contain' : 'cover';

    return {
        gridSize,
        tileRow,
        tileColumn,
        fitMode
    };
}

function getDeviceTileRenderSize(device) {
    const deviceInfo = device ? albumArtGridDevices.get(device) : null;
    const deviceType = deviceInfo?.type;

    if (deviceType !== undefined && Object.prototype.hasOwnProperty.call(DEVICE_TILE_RENDER_SIZE, deviceType)) {
        return DEVICE_TILE_RENDER_SIZE[deviceType];
    }

    return DEVICE_TILE_RENDER_SIZE.default || DEFAULT_TILE_RENDER_SIZE;
}

function getDefaultTileImage() {
    return "actions/assets/buttons/icon";
}

function setDefaultTile(context) {
    if (!context) {
        return;
    }

    $SD.setState(context, 0);
    $SD.setImage(context, getDefaultTileImage(), 0);
}

function setOfflineTile(context) {
    if (!context) {
        return;
    }

    $SD.setState(context, 1);
}

function loadArtworkImage(artworkUrl) {
    if (!artworkUrl) {
        return Promise.resolve(null);
    }

    if (albumArtGridImageCache.has(artworkUrl)) {
        return albumArtGridImageCache.get(artworkUrl);
    }

    const imagePromise = new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load artwork: ${artworkUrl}`));
        image.src = artworkUrl;
    });

    albumArtGridImageCache.set(artworkUrl, imagePromise);
    return imagePromise;
}

function drawArtworkTile(sourceImage, settings, tileSize) {
    const { gridSize, tileRow, tileColumn, fitMode } = settings;
    const sourceWidth = sourceImage.naturalWidth || sourceImage.width;
    const sourceHeight = sourceImage.naturalHeight || sourceImage.height;
    const masterSize = gridSize * tileSize;

    const masterCanvas = document.createElement('canvas');
    masterCanvas.width = masterSize;
    masterCanvas.height = masterSize;
    const masterContext = masterCanvas.getContext('2d');

    masterContext.clearRect(0, 0, masterSize, masterSize);
    masterContext.fillStyle = '#000000';
    masterContext.fillRect(0, 0, masterSize, masterSize);

    const scale = fitMode === 'contain'
        ? Math.min(masterSize / sourceWidth, masterSize / sourceHeight)
        : Math.max(masterSize / sourceWidth, masterSize / sourceHeight);

    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const drawX = (masterSize - drawWidth) / 2;
    const drawY = (masterSize - drawHeight) / 2;

    masterContext.drawImage(sourceImage, drawX, drawY, drawWidth, drawHeight);

    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = tileSize;
    tileCanvas.height = tileSize;
    const tileContext = tileCanvas.getContext('2d');

    const sourceX = (tileColumn - 1) * tileSize;
    const sourceY = (tileRow - 1) * tileSize;
    tileContext.drawImage(masterCanvas, sourceX, sourceY, tileSize, tileSize, 0, 0, tileSize, tileSize);

    return tileCanvas.toDataURL('image/png');
}

async function renderArtworkTile(artworkUrl, settings, tileSize) {
    const cacheKey = JSON.stringify({
        artworkUrl,
        tileSize,
        gridSize: settings.gridSize,
        tileRow: settings.tileRow,
        tileColumn: settings.tileColumn,
        fitMode: settings.fitMode
    });

    if (albumArtGridTileCache.has(cacheKey)) {
        return albumArtGridTileCache.get(cacheKey);
    }

    const sourceImage = await loadArtworkImage(artworkUrl);
    if (!sourceImage) {
        return null;
    }

    const tileDataUrl = drawArtworkTile(sourceImage, settings, tileSize);
    albumArtGridTileCache.set(cacheKey, tileDataUrl);
    return tileDataUrl;
}

function clearTileCacheForArtwork(artworkUrl) {
    if (!artworkUrl) {
        return;
    }

    Array.from(albumArtGridTileCache.keys()).forEach((cacheKey) => {
        if (cacheKey.includes(artworkUrl)) {
            albumArtGridTileCache.delete(cacheKey);
        }
    });
}

async function refreshContext(context) {
    const contextInfo = albumArtGridContexts.get(context);
    if (!contextInfo) {
        return;
    }

    if (!window.isConnected) {
        setOfflineTile(context);
        return;
    }

    const artworkUrl = window.cacheManager?.get('artwork');
    if (!artworkUrl) {
        setDefaultTile(context);
        return;
    }

    try {
        const tileSize = getDeviceTileRenderSize(contextInfo.device);
        const tileDataUrl = await renderArtworkTile(artworkUrl, contextInfo.settings, tileSize);
        if (!tileDataUrl) {
            setDefaultTile(context);
            return;
        }

        $SD.setState(context, 0);
        $SD.setImage(context, tileDataUrl, 0);
    } catch (error) {
        albumArtGridLogger.error(`Failed to render album art tile for ${context}: ${error}`);
        setDefaultTile(context);
    }
}

function registerContext(context, details = {}) {
    if (!context) {
        return;
    }

    const existing = albumArtGridContexts.get(context) || {};
    albumArtGridContexts.set(context, {
        ...existing,
        device: details.device ?? existing.device ?? null,
        settings: normalizeGridSettings(details.settings ?? existing.settings ?? {})
    });
}

function updateContextSettings(context, settings = {}) {
    if (!context) {
        return;
    }

    registerContext(context, { settings });
    refreshContext(context);
}

function unregisterContext(context) {
    albumArtGridContexts.delete(context);
}

function registerDevice(device, deviceInfo = {}) {
    if (!device) {
        return;
    }

    albumArtGridDevices.set(device, deviceInfo);
}

function unregisterDevice(device) {
    if (!device) {
        return;
    }

    albumArtGridDevices.delete(device);
}

function refreshAll() {
    albumArtGridContexts.forEach((_, context) => {
        refreshContext(context);
    });
}

function notifyArtworkChanged(previousArtworkUrl, nextArtworkUrl) {
    if (previousArtworkUrl && previousArtworkUrl !== nextArtworkUrl) {
        clearTileCacheForArtwork(previousArtworkUrl);
    }

    if (nextArtworkUrl) {
        refreshAll();
        return;
    }

    albumArtGridContexts.forEach((_, context) => {
        setDefaultTile(context);
    });
}

function setDefaultStates() {
    albumArtGridContexts.forEach((_, context) => {
        setDefaultTile(context);
    });
}

function setOfflineStates() {
    albumArtGridContexts.forEach((_, context) => {
        setOfflineTile(context);
    });
}

window.CiderDeckAlbumArtGrid = {
    normalizeGridSettings,
    registerContext,
    updateContextSettings,
    unregisterContext,
    registerDevice,
    unregisterDevice,
    refreshContext,
    refreshAll,
    notifyArtworkChanged,
    setDefaultStates,
    setOfflineStates
};
