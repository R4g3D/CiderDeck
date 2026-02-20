/**
 * CiderDeck Playback Controls
 * Handles playback-related functionality: play/pause, skip, repeat, shuffle, etc.
 */

// Create module-specific loggers
const logger = window.CiderDeckLogger?.createLogger('Playback') || {
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

// Create subcategory loggers
const repeatLogger = logger.category('Repeat');
const shuffleLogger = logger.category('Shuffle');
const artworkLogger = window.CiderDeckLogger?.createLogger('Artwork') || logger;
const nowPlayingTileLogger = logger.category('NowPlayingTile');
let nowPlayingRenderRequestId = 0;

// Debounce function for logging
const debounce = (func, wait) => {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

// Debounced version of the logger.info method (200ms)
const debouncedPlaybackInfo = debounce(logger.info.bind(logger), 200);

function truncateOverlayText(ctx, text, maxWidth) {
    if (!text) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;

    const ellipsis = '...';
    let result = text;
    while (result.length > 0 && ctx.measureText(result + ellipsis).width > maxWidth) {
        result = result.slice(0, -1);
    }
    return `${result}${ellipsis}`;
}

function isPlaybackPaused(playbackState) {
    return normalizePlaybackState(playbackState) !== 'playing';
}

function normalizePlaybackState(playbackState) {
    if (playbackState && typeof playbackState === 'object') {
        if (Object.prototype.hasOwnProperty.call(playbackState, 'state')) {
            return normalizePlaybackState(playbackState.state);
        }
        if (Object.prototype.hasOwnProperty.call(playbackState, 'isPlaying')) {
            return normalizePlaybackState(playbackState.isPlaying);
        }
        if (Object.prototype.hasOwnProperty.call(playbackState, 'isPaused')) {
            return playbackState.isPaused ? 'paused' : 'playing';
        }
        return 'paused';
    }

    if (typeof playbackState === 'string') {
        return playbackState.toLowerCase() === 'playing' ? 'playing' : 'paused';
    }
    if (typeof playbackState === 'number') {
        return playbackState === 1 ? 'playing' : 'paused';
    }
    if (typeof playbackState === 'boolean') {
        return playbackState ? 'playing' : 'paused';
    }
    return 'paused';
}

function renderNowPlayingTile(artworkDataUrl, title, artist, playbackState) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 144;
        canvas.height = 144;
        const paused = isPlaybackPaused(playbackState);

        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = () => {
            if (paused) {
                ctx.filter = 'grayscale(100%) brightness(65%)';
            }
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            ctx.filter = 'none';

            if (paused) {
                // Add a subtle tint and pause badge to clearly indicate paused playback.
                ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                const badgeSize = 36;
                const badgeX = canvas.width - badgeSize - 8;
                const badgeY = 8;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
                ctx.fillRect(badgeX, badgeY, badgeSize, badgeSize);

                ctx.fillStyle = '#FFFFFF';
                const barWidth = 6;
                const barHeight = 16;
                const barGap = 6;
                const barsX = badgeX + (badgeSize - ((barWidth * 2) + barGap)) / 2;
                const barsY = badgeY + (badgeSize - barHeight) / 2;
                ctx.fillRect(barsX, barsY, barWidth, barHeight);
                ctx.fillRect(barsX + barWidth + barGap, barsY, barWidth, barHeight);
            }

            const overlayHeight = 48;
            const y = canvas.height - overlayHeight;
            const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
            gradient.addColorStop(0, 'rgba(0, 0, 0, 0.15)');
            gradient.addColorStop(1, 'rgba(0, 0, 0, 0.85)');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, y, canvas.width, overlayHeight);

            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';

            const horizontalPadding = 8;
            const maxWidth = canvas.width - (horizontalPadding * 2);

            ctx.font = 'bold 14px sans-serif';
            const safeTitle = truncateOverlayText(ctx, title || 'Unknown song', maxWidth);
            ctx.fillText(safeTitle, horizontalPadding, canvas.height - 28, maxWidth);

            ctx.font = '12px sans-serif';
            const safeArtist = truncateOverlayText(ctx, artist || 'Unknown artist', maxWidth);
            ctx.fillText(safeArtist, horizontalPadding, canvas.height - 11, maxWidth);

            resolve(canvas.toDataURL('image/png'));
        };

        img.onerror = reject;
        img.src = artworkDataUrl;
    });
}

async function updateNowPlayingActionTile(artwork, title, artist, playbackState) {
    const renderRequestId = ++nowPlayingRenderRequestId;
    const contexts = window.contexts?.ciderLogoAction || [];
    if (contexts.length === 0) {
        return;
    }

    if (!window.isConnected) {
        contexts.forEach(context => $SD.setState(context, 1));
        return;
    }

    if (!artwork) {
        contexts.forEach(context => {
            $SD.setState(context, 0);
            $SD.setImage(context, "actions/assets/buttons/icon", 0);
        });
        return;
    }

    const utils = window.CiderDeckUtils;
    if (!utils?.getBase64Image) {
        nowPlayingTileLogger.warn('CiderDeckUtils.getBase64Image not available');
        return;
    }

    try {
        const art64 = await utils.getBase64Image(artwork);
        const compositeImage = await renderNowPlayingTile(art64, title, artist, playbackState);

        // Ignore stale async render completions.
        if (renderRequestId !== nowPlayingRenderRequestId) {
            return;
        }

        contexts.forEach(context => {
            $SD.setState(context, 0);
            if (utils.setImage) {
                utils.setImage(context, compositeImage, 0);
            } else {
                $SD.setImage(context, compositeImage, 0);
            }
        });
    } catch (error) {
        nowPlayingTileLogger.error(`Failed to render now-playing tile: ${error}`);
    }
}

async function refreshNowPlayingTile() {
    const cacheManager = window.cacheManager;
    if (!cacheManager) return;

    const artwork = cacheManager.get('artwork');
    const songName = cacheManager.get('song');
    const artistName = cacheManager.get('artist');
    const playbackState = cacheManager.get('status');

    await updateNowPlayingActionTile(artwork, songName, artistName, playbackState);
}

// Playback state tracking
let currentRepeatMode = 0; // 0: off, 1: repeat one, 2: repeat all, 3: disabled
let currentShuffleMode = 0; // 0: off, 1: on, 2: disabled
let lastNowPlayingPausedState = null;

/**
 * Sets default playback states for all controls
 */
async function setDefaults() {
    logger.debug("Setting default state");
    Object.keys(window.actions || {}).forEach(actionKey => {
        window.contexts[actionKey]?.forEach(context => {
            if (actionKey === 'ciderPlaybackAction') {
                const feedbackPayload = {
                    "icon1": "actions/assets/buttons/media-playlist",
                    "icon2": "actions/assets/buttons/volume-off",
                    "title": "Cider - N/A",
                };
                $SD.setFeedback(context, feedbackPayload);
                logger.info("Set default feedback for Cider Playback Action");
            } else {
                $SD.setState(context, 0);
            }
        });
    });
}

/**
 * Updates library and favorite states based on current playback
 * @param {Object} data - The playback data containing library and favorites status
 */
async function setAdaptiveData({ inLibrary, inFavorites }) {
    const libraryLogger = window.CiderDeckLogger?.createLogger('Library') || logger;
    const favoritesLogger = window.CiderDeckLogger?.createLogger('Favorites') || logger;
    
    libraryLogger.debug(`inLibrary: ${inLibrary}, inFavorites: ${inFavorites}`);
    
    const cacheManager = window.cacheManager;
    
    // Skip if cache manager is not available
    if (!cacheManager) {
        libraryLogger.warn("Cache manager not available");
        return;
    }
    
    if (cacheManager.checkAndUpdate('addedToLibrary', inLibrary)) {
        window.contexts.addToLibraryAction?.forEach(context => {
            $SD.setState(context, inLibrary ? 1 : 0);
        });
        libraryLogger.debug(`Updated library status: ${inLibrary}`);
    }

    if (cacheManager.checkAndUpdate('rating', inFavorites ? 1 : 0)) {
        window.contexts.likeAction?.forEach(context => {
            $SD.setState(context, inFavorites ? 1 : 0);
        });
        window.contexts.dislikeAction?.forEach(context => {
            $SD.setState(context, 0); // Always set to default state for dislike
        });
        favoritesLogger.debug(`Updated favorites status: ${inFavorites}`);
    }
}

/**
 * Updates display data based on current playback state
 * @param {Object} data - The playback data
 */
async function setData(data) {
    if (!data || typeof data !== 'object') {
        logger.warn("Invalid playback data received for setData");
        return;
    }

    const state = normalizePlaybackState(data.state ?? data.isPlaying ?? data.playbackState ?? data);
    const attributes = data.attributes || data;
    setPlaybackStatus(state);

    const cacheManager = window.cacheManager;
    if (!cacheManager) {
        logger.error("Cache manager is not available");
        return;
    }

    let artwork = cacheManager.get('artwork');

    if (attributes?.artwork) {
        artwork = attributes.artwork?.url?.replace('{w}', attributes?.artwork?.width).replace('{h}', attributes?.artwork?.height);
    }

    const songName = attributes.name;
    const artistName = attributes.artistName;
    const albumName = attributes.albumName;
    let shouldUpdateNowPlayingTile = false;
    const paused = isPlaybackPaused(state);

    debouncedPlaybackInfo(`Processing: "${songName}" by ${artistName} from ${albumName}`);
    logger.debug(`Artwork URL: ${artwork}`);
    
    let logMessage = "[DEBUG] [Playback] ";
    
    if (cacheManager.checkAndUpdate('artwork', artwork) && artwork) {
        shouldUpdateNowPlayingTile = true;
        artworkLogger.debug(`Updating artwork from: ${artwork}`);
        const utils = window.CiderDeckUtils;
        if (utils && utils.getBase64Image) {
            utils.getBase64Image(artwork).then(art64 => {
                artworkLogger.debug(`Successfully converted artwork to base64`);
                if (window.contexts.ciderPlaybackAction && window.contexts.ciderPlaybackAction[0]) {
                    // Check if user wants to show artwork on dial or use default Cider logo
                    const showArtworkOnDial = window.ciderDeckSettings?.dial?.showArtworkOnDial ?? true;
                    const dialLogger = logger.category('Dial');
                    dialLogger.debug(`Show artwork on dial: ${showArtworkOnDial}`);
                    if (showArtworkOnDial) {
                        $SD.setFeedback(window.contexts.ciderPlaybackAction[0], { "icon1": art64 });
                        dialLogger.debug(`Set artwork on dial`);
                    } else {
                        // Use Cider logo instead
                        $SD.setFeedback(window.contexts.ciderPlaybackAction[0], { "icon1": "actions/assets/buttons/media-playlist" });
                        dialLogger.debug(`Set Cider logo on dial`);
                    }
                }
            }).catch(err => {
                artworkLogger.error(`Failed to get base64 image: ${err}`);
            });
            logMessage += `Updated artwork: ${artwork}; `;
        }
    }
    
    if (cacheManager.checkAndUpdate('song', songName)) {
        shouldUpdateNowPlayingTile = true;
        // Get dial and song display settings
        const dialSettings = window.ciderDeckSettings?.dial || {};
        
        // Format title according to custom format if available
        const songInfo = {
            title: songName,
            artist: artistName,
            album: albumName
        };
        
        // Format the text using the custom format from dial settings (or fallback to default)
        const customFormat = dialSettings.customFormat || '{song} - {album}';
        const textPrefix = dialSettings.textPrefix || '';
        const fullTitle = textPrefix + formatSongInfo(customFormat, songInfo);
        
        // Initialize the song renderer if it hasn't been yet
        if (!window.songDisplayRenderer) {
            const songDisplayLogger = logger.category('SongDisplay');
            songDisplayLogger.debug('Initializing song display renderer on data update');
            try {
                window.songDisplayRenderer = new SongDisplayRenderer();
            } catch (err) {
                songDisplayLogger.error(`Failed to initialize renderer: ${err}`);
            }
        }
        
        // Update song info in the custom renderer
        if (window.songDisplayRenderer) {
            try {
                window.songDisplayRenderer.updateSongInfo({
                    title: songName,
                    artist: artistName,
                    album: albumName
                });
            } catch (err) {
                const songDisplayLogger = logger.category('SongDisplay');
                songDisplayLogger.error(`Failed to update song info: ${err}`);
            }
        }
        
        // Handle Stream Deck+ marquee display
        const marquee = window.CiderDeckMarquee;
        if (marquee && marquee.clearMarquee) {
            const marqueeLogger = logger.category('Marquee');
            marqueeLogger.debug('Clearing current marquee display');
            
            marquee.clearMarquee();
            const marqueeSettings = window.ciderDeckSettings?.dial?.marquee || {};
            const isMarqueeEnabled = marqueeSettings.enabled ?? true;
            const displayLength = marqueeSettings.length ?? 15;
            
            marqueeLogger.debug(`Marquee enabled: ${isMarqueeEnabled}, Title length: ${fullTitle.length}, Display length: ${displayLength}`);
            
            if (isMarqueeEnabled && fullTitle.length > displayLength && 
                window.contexts.ciderPlaybackAction && window.contexts.ciderPlaybackAction[0]) {
                const allContexts = [window.contexts.ciderPlaybackAction[0]];
                marqueeLogger.debug(`Starting marquee with text: "${fullTitle}"`);
                marquee.startMarquee(allContexts, fullTitle);
            } else if (window.contexts.ciderPlaybackAction && window.contexts.ciderPlaybackAction[0]) {
                marqueeLogger.debug(`Setting static title: "${fullTitle}"`);
                $SD.setFeedback(window.contexts.ciderPlaybackAction[0], { "title": fullTitle });
            }
        }
        
        // Update custom rendered song display for regular Stream Deck
        const songDisplay = window.CiderDeckSongDisplay;
        if (songDisplay && songDisplay.updateCustomSongDisplay) {
            try {
                const songDisplayLogger = logger.category('SongDisplay');
                songDisplayLogger.debug('Updating custom song display');
                songDisplay.updateCustomSongDisplay();
            } catch (err) {
                const songDisplayLogger = logger.category('SongDisplay');
                songDisplayLogger.error(`Failed to update custom display: ${err}`);
            }
        }
        
        logMessage += `Updated song: ${songName}; Artist: ${artistName}; Album: ${albumName}; `;
    }
    
    if (cacheManager.checkAndUpdate('artist', artistName)) {
        shouldUpdateNowPlayingTile = true;
    }

    if (lastNowPlayingPausedState !== paused) {
        lastNowPlayingPausedState = paused;
        shouldUpdateNowPlayingTile = true;
    }

    if (shouldUpdateNowPlayingTile) {
        updateNowPlayingActionTile(artwork, songName, artistName, state);
    }

    const toggleIcon = state === "playing" ? 'pause.png' : 'play.png';

    window.contexts.toggleAction?.forEach(context => {
        const utils = window.CiderDeckUtils;
        if (utils && utils.setImage) {
            utils.setImage(context, `actions/playback/assets/${toggleIcon}`, 0);
        } else {
            $SD.setImage(context, `actions/playback/assets/${toggleIcon}`, 0);
        }
    });
    logMessage += `State: ${state}`;

    // Use our colorful logger instead of standard console.debug
    logger.debug(logMessage);
}

/**
 * Updates playback data from the full playback info object
 * @param {Object} playbackInfo - The full playback info from Cider
 */
async function setManualData(playbackInfo) {
    if (!playbackInfo || typeof playbackInfo !== 'object') {
        logger.warn("Invalid playback data received for setManualData");
        return;
    }

    setData({ state: playbackInfo.state, attributes: playbackInfo });
}

/**
 * Updates playback status (playing/paused) on Stream Deck buttons
 * @param {string|number} status - The current playback status
 */
async function setPlaybackStatus(status) {
    const normalizedState = normalizePlaybackState(status);
    const normalizedStatus = normalizedState === 'playing' ? 1 : 0;
    
    const cacheManager = window.cacheManager;
    if (!cacheManager) {
        logger.warn("Cache manager not available, setting status directly");
        window.contexts.toggleAction?.forEach(context => {
            $SD.setState(context, normalizedStatus ? 1 : 0);
        });
        return;
    }
    
    if (cacheManager.checkAndUpdate('status', normalizedStatus)) {
        window.contexts.toggleAction?.forEach(context => {
            $SD.setState(context, normalizedStatus ? 1 : 0);
        });
        logger.debug(`Updated playback status: ${normalizedState}`);
    }
}

/**
 * Updates repeat mode and corresponding button state
 * @param {number} mode - The repeat mode (0: off, 1: repeat one, 2: repeat all, 3: disabled)
 */
function updateRepeatMode(mode) {
    currentRepeatMode = mode;
    repeatLogger.debug(`Updated repeat mode to: ${currentRepeatMode}`);
    
    window.contexts.repeatAction?.forEach(context => {
        $SD.setState(context, currentRepeatMode);
    });
}

/**
 * Updates shuffle mode and corresponding button state
 * @param {number} mode - The shuffle mode (0: off, 1: on, 2: disabled)
 */
function updateShuffleMode(mode) {
    currentShuffleMode = mode;
    shuffleLogger.debug(`Updated shuffle mode to: ${currentShuffleMode}`);
    
    window.contexts.shuffleAction?.forEach(context => {
        $SD.setState(context, currentShuffleMode);
    });
}

/**
 * Handles "previous track" behavior based on settings and current playback time
 */
async function goBack() {
    // Check the setting that determines if we should always go to the previous track
    const alwaysGoToPrevious = window.ciderDeckSettings?.playback?.alwaysGoToPrevious ?? false;
    const utils = window.CiderDeckUtils;
    
    if (!utils || !utils.comRPC) {
        logger.error("CiderDeckUtils not available for comRPC");
        return;
    }
    
    if (alwaysGoToPrevious) {
        // If the setting is enabled, always go to the previous track
        logger.debug("Always go to previous track setting enabled, going to previous track");
        await utils.comRPC("POST", "previous");
    } else {
        // Otherwise, use the default behavior:
        // If within the first 10 seconds of the track, seek to the start
        // If later in the track, go to the previous track
        if (window.currentPlaybackTime > 10) {
            logger.debug("Going to previous track");
            await utils.comRPC("POST", "previous");
        } else {
            logger.debug("Seeking to start of current track");
            await utils.comRPC("POST", "seek", true, { position: 0 });
        }
    }
}

/**
 * Updates repeat and shuffle modes from current Cider state
 */
async function updatePlaybackModes() {
    try {
        const utils = window.CiderDeckUtils;
        if (!utils || !utils.comRPC) {
            logger.error("CiderDeckUtils not available for comRPC");
            return;
        }
        
        const repeatMode = await utils.comRPC("GET", "repeat-mode");
        if (repeatMode && repeatMode.status === "ok" && repeatMode.value !== undefined) {
            updateRepeatMode(repeatMode.value);
        }
        
        const shuffleMode = await utils.comRPC("GET", "shuffle-mode");
        if (shuffleMode && shuffleMode.status === "ok" && shuffleMode.value !== undefined) {
            updateShuffleMode(shuffleMode.value);
        }
    } catch (error) {
        logger.error(`Error updating playback modes: ${error}`);
    }
}

/**
 * Formats song information according to a template
 * Supports variables: {song}, {artist}, {album}, {duration}
 * @param {string} template - The format template
 * @param {Object} songInfo - Object containing song details
 * @returns {string} Formatted text
 */
function formatSongInfo(template, songInfo) {
    const formatLogger = logger.category('Format');
    
    // If no custom format is provided, use a default format
    if (!template || template === '') {
        formatLogger.debug("No template provided, using default format");
        return `${songInfo.title || ''} - ${songInfo.album || ''}`;
    }
    
    formatLogger.debug(`Formatting with template: "${template}"`);
    
    // Apply variable replacements
    let formattedText = template
        .replace(/\{song\}/gi, songInfo.title || '')
        .replace(/\{artist\}/gi, songInfo.artist || '')
        .replace(/\{album\}/gi, songInfo.album || '')
        .replace(/\{duration\}/gi, songInfo.duration || '');
    
    formatLogger.debug(`Formatted result: "${formattedText}"`);
    return formattedText;
}

/**
 * Updates playback time indicator on Stream Deck+
 * @param {number} time - Current playback time in seconds
 * @param {number} duration - Total track duration in seconds
 */
async function setPlaybackTime(time, duration) {
    const cacheManager = window.cacheManager;
    if (cacheManager) {
        cacheManager.set('currentPlaybackTime', time);
    }
    window.currentPlaybackTime = time; // Backup in case cacheManager isn't available
    
    const progress = Math.round((time / duration) * 100);
    
    // Create a specialized logger for playback time
    const timeLogger = logger.category('Time');
    timeLogger.debug(`Current time: ${time}s, Duration: ${duration}s, Progress: ${progress}%`);

    // Update Stream Deck+ display if available
    if (window.contexts.ciderPlaybackAction && window.contexts.ciderPlaybackAction[0]) {
        const feedbackPayload = {
            "indicator1": progress
        };
        $SD.setFeedback(window.contexts.ciderPlaybackAction[0], feedbackPayload);
    }
}

// Export the playback functions
window.CiderDeckPlayback = {
    setDefaults,
    setAdaptiveData,
    setData,
    setManualData,
    setPlaybackStatus,
    updateRepeatMode,
    updateShuffleMode,
    goBack,
    updatePlaybackModes,
    setPlaybackTime,
    refreshNowPlayingTile,
    formatSongInfo,
    getCurrentRepeatMode: () => currentRepeatMode,
    getCurrentShuffleMode: () => currentShuffleMode,
    setCurrentRepeatMode: (mode) => { currentRepeatMode = mode; },
    setCurrentShuffleMode: (mode) => { currentShuffleMode = mode; }
};
