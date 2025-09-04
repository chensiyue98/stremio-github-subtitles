/**
 * Stremio GitHub Subtitles Addon
 * Main entry point using modular architecture
 */

const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const manifest = require('./src/config/manifest');
const { handleSubtitlesRequest } = require('./src/handlers/subtitles-handler');

// Create addon builder with manifest
const builder = new addonBuilder(manifest);

// Define subtitles handler
builder.defineSubtitlesHandler(async (args) => {
    return await handleSubtitlesRequest(args);
});

// Export the addon interface for use in server
const addonInterface = builder.getInterface();

// Export both the interface and a function to serve it
module.exports = {
    addonInterface,
    serveHTTP: (opts) => serveHTTP(addonInterface, opts),
    
    // Export individual modules for testing
    modules: {
        manifest,
        FuzzyMatcher: require('./src/services/fuzzy-matcher'),
        githubService: require('./src/services/github-service'),
        movieDatabase: require('./src/services/movie-database'),
        subtitleParser: require('./src/utils/subtitle-parser'),
        subtitlesHandler: require('./src/handlers/subtitles-handler')
    }
};
