const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');
const path = require('path');

// Addon manifest
const manifest = {
    id: 'org.github.subtitles',
    version: '1.0.0',
    name: 'GitHub Subtitles',
    description: 'Fetches subtitles from public GitHub repositories',
    resources: ['subtitles'],
    types: ['movie', 'series'],
    catalogs: [],
    idPrefixes: ['tt'],
    behaviorHints: {
        configurable: true
    },
    config: [
        {
            key: 'github_repo',
            type: 'text',
            title: 'GitHub Repository',
            description: 'Format: owner/repo (e.g., OpenSubtitles/opensubtitles-com)',
            required: true
        },
        {
            key: 'github_path',
            type: 'text',
            title: 'Subtitles Path (optional)',
            description: 'Path within the repo where subtitles are stored (e.g., subtitles/)',
            required: false
        }
    ]
};

const builder = new addonBuilder(manifest);

// Helper function to parse subtitle filename and extract metadata
function parseSubtitleFilename(filename) {
    const basename = path.basename(filename, path.extname(filename));
    const parts = basename.split('.');
    
    // Common patterns for subtitle files:
    // movie.title.year.srt
    // movie.title.year.lang.srt
    // series.s01e01.srt
    // series.s01e01.lang.srt
    
    const metadata = {
        filename: filename,
        basename: basename,
        language: 'en' // default
    };
    
    // Extract language from filename (common patterns)
    const langPatterns = [
        /\.(en|eng|english)$/i,
        /\.(es|esp|spanish)$/i,
        /\.(fr|fre|french)$/i,
        /\.(de|ger|german)$/i,
        /\.(it|ita|italian)$/i,
        /\.(pt|por|portuguese)$/i,
        /\.(ru|rus|russian)$/i,
        /\.(zh|chi|chinese)$/i,
        /\.(ja|jpn|japanese)$/i,
        /\.(ko|kor|korean)$/i,
        /\.(ar|ara|arabic)$/i,
        /\.(hi|hin|hindi)$/i
    ];
    
    for (const pattern of langPatterns) {
        const match = basename.match(pattern);
        if (match) {
            metadata.language = match[1].toLowerCase();
            if (metadata.language === 'eng') metadata.language = 'en';
            if (metadata.language === 'esp') metadata.language = 'es';
            if (metadata.language === 'fre') metadata.language = 'fr';
            if (metadata.language === 'ger') metadata.language = 'de';
            if (metadata.language === 'ita') metadata.language = 'it';
            if (metadata.language === 'por') metadata.language = 'pt';
            if (metadata.language === 'rus') metadata.language = 'ru';
            if (metadata.language === 'chi') metadata.language = 'zh';
            if (metadata.language === 'jpn') metadata.language = 'ja';
            if (metadata.language === 'kor') metadata.language = 'ko';
            if (metadata.language === 'ara') metadata.language = 'ar';
            if (metadata.language === 'hin') metadata.language = 'hi';
            break;
        }
    }
    
    return metadata;
}

// Helper function to check if filename matches IMDB ID
function matchesImdbId(filename, imdbId) {
    // Remove 'tt' prefix from imdbId for comparison
    const numericId = imdbId.replace('tt', '');
    
    // Check if filename contains the IMDB ID
    return filename.toLowerCase().includes(numericId) || 
           filename.toLowerCase().includes(imdbId.toLowerCase());
}

// Helper function to match series episode
function matchesEpisode(filename, season, episode) {
    const seasonPadded = season.toString().padStart(2, '0');
    const episodePadded = episode.toString().padStart(2, '0');
    
    const patterns = [
        new RegExp(`s${seasonPadded}e${episodePadded}`, 'i'),
        new RegExp(`s${season}e${episode}`, 'i'),
        new RegExp(`${season}x${episodePadded}`, 'i'),
        new RegExp(`${season}x${episode}`, 'i')
    ];
    
    return patterns.some(pattern => pattern.test(filename));
}

// Helper function to fetch files from GitHub repository
async function fetchGitHubFiles(repo, path = '') {
    try {
        const url = `https://api.github.com/repos/${repo}/contents/${path}`;
        console.log(`Fetching from GitHub: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!Array.isArray(data)) {
            return [];
        }
        
        let files = [];
        
        for (const item of data) {
            if (item.type === 'file' && item.name.match(/\.(srt|vtt|ass|ssa|sub)$/i)) {
                files.push({
                    name: item.name,
                    path: item.path,
                    download_url: item.download_url
                });
            } else if (item.type === 'dir') {
                // Recursively fetch files from subdirectories
                const subFiles = await fetchGitHubFiles(repo, item.path);
                files = files.concat(subFiles);
            }
        }
        
        return files;
    } catch (error) {
        console.error('Error fetching GitHub files:', error);
        return [];
    }
}

// Subtitles handler
builder.defineSubtitlesHandler(async (args) => {
    console.log('Subtitles request:', args);
    
    const { type, id, extra } = args;
    const config = extra.config || {};
    
    if (!config.github_repo) {
        return { subtitles: [] };
    }
    
    try {
        // Fetch all subtitle files from the GitHub repository
        const subtitlePath = config.github_path || '';
        const files = await fetchGitHubFiles(config.github_repo, subtitlePath);
        
        console.log(`Found ${files.length} subtitle files in repository`);
        
        const subtitles = [];
        
        for (const file of files) {
            const metadata = parseSubtitleFilename(file.name);
            let isMatch = false;
            
            if (type === 'movie') {
                // For movies, try to match IMDB ID
                isMatch = matchesImdbId(file.name, id);
            } else if (type === 'series') {
                // For series, extract season and episode from the request
                // The id format for series is usually: tt1234567:1:1 (imdbId:season:episode)
                const [imdbId, season, episode] = id.split(':');
                
                if (season && episode) {
                    isMatch = matchesImdbId(file.name, imdbId) && 
                             matchesEpisode(file.name, parseInt(season), parseInt(episode));
                } else {
                    isMatch = matchesImdbId(file.name, imdbId);
                }
            }
            
            if (isMatch) {
                subtitles.push({
                    id: `github:${config.github_repo}:${file.path}`,
                    url: file.download_url,
                    lang: metadata.language,
                    filename: file.name
                });
            }
        }
        
        console.log(`Returning ${subtitles.length} matching subtitles`);
        return { subtitles };
        
    } catch (error) {
        console.error('Error in subtitles handler:', error);
        return { subtitles: [] };
    }
});

// Export the addon interface for use in server
const addonInterface = builder.getInterface();

// Export both the interface and a function to serve it
module.exports = {
    addonInterface,
    serveHTTP: (opts) => serveHTTP(addonInterface, opts)
};
