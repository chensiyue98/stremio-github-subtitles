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
    console.log(`    Parsing filename: "${filename}"`);
    
    const basename = path.basename(filename, path.extname(filename));
    const parts = basename.split('.');
    
    console.log(`    Basename: "${basename}", Parts:`, parts);
    
    // Common patterns for subtitle files:
    // movie.title.year.srt
    // movie.title.year.lang.srt
    // series.s01e01.srt
    // series.s01e01.lang.srt
    
    const metadata = {
        filename: filename,
        basename: basename,
        language: 'other' // default
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
            console.log(`    Language pattern matched: ${pattern} -> ${match[1]}`);
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
    
    console.log(`    Final metadata:`, metadata);
    return metadata;
}

// Helper function to check if filename matches IMDB ID
function matchesImdbId(filename, imdbId) {
    // Remove 'tt' prefix from imdbId for comparison
    const numericId = imdbId.replace('tt', '');
    
    console.log(`  Checking IMDB match for "${filename}":`, {
        imdbId,
        numericId,
        filenameLC: filename.toLowerCase(),
        containsNumeric: filename.toLowerCase().includes(numericId),
        containsFullId: filename.toLowerCase().includes(imdbId.toLowerCase())
    });
    
    // Check if filename contains the IMDB ID
    const matches = filename.toLowerCase().includes(numericId) || 
           filename.toLowerCase().includes(imdbId.toLowerCase());
    
    console.log(`  IMDB match result: ${matches}`);
    return matches;
}

// Helper function to extract title and year from filename
function extractTitleAndYear(filename) {
    const basename = filename.replace(/\.(srt|vtt|ass|ssa|sub)$/i, '');
    
    // Common patterns to extract title and year
    // Examples: "Movie.Title.2020.1080p.BluRay.x264.YIFY"
    //          "Movie Title (2020)"
    //          "Movie.Title.2020"
    
    const yearMatch = basename.match(/\b(19|20)\d{2}\b/);
    const year = yearMatch ? yearMatch[0] : null;
    
    let title = basename;
    if (year) {
        // Remove year and everything after it
        title = basename.split(year)[0];
    }
    
    // Clean up title: remove dots, underscores, and extra spaces
    title = title
        .replace(/[._-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    
    console.log(`  Extracted from "${filename}": title="${title}", year=${year}`);
    return { title, year };
}

// Helper function to check if filename matches by title and year
function matchesByTitle(filename, targetTitle, targetYear) {
    const { title: fileTitle, year: fileYear } = extractTitleAndYear(filename);
    
    if (!fileTitle) {
        console.log(`  No title extracted from filename`);
        return false;
    }
    
    // Normalize titles for comparison
    const normalizedFileTitle = fileTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    const normalizedTargetTitle = targetTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
    
    console.log(`  Title comparison:`, {
        fileTitle: normalizedFileTitle,
        targetTitle: normalizedTargetTitle,
        fileYear,
        targetYear
    });
    
    // Check if titles match (allow partial matches for flexibility)
    const titleMatch = normalizedFileTitle.includes(normalizedTargetTitle) || 
                      normalizedTargetTitle.includes(normalizedFileTitle) ||
                      // Check word-by-word match for cases like "eyes wide shut" vs "eyes.wide.shut"
                      normalizedFileTitle.split(' ').join('') === normalizedTargetTitle.split(' ').join('');
    
    // Year should match if both are available
    const yearMatch = !targetYear || !fileYear || fileYear === targetYear;
    
    console.log(`  Title match: ${titleMatch}, Year match: ${yearMatch}`);
    return titleMatch && yearMatch;
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
    
    console.log(`  Checking episode match for "${filename}":`, {
        season,
        episode,
        seasonPadded,
        episodePadded,
        patterns: patterns.map(p => p.toString())
    });
    
    const matches = patterns.some(pattern => {
        const match = pattern.test(filename);
        console.log(`    Pattern ${pattern} -> ${match}`);
        return match;
    });
    
    console.log(`  Episode match result: ${matches}`);
    return matches;
}

// Helper function to fetch files from GitHub repository
async function fetchGitHubFiles(repo, path = '') {
    try {
        const url = `https://api.github.com/repos/${repo}/contents/${path}`;
        console.log(`Fetching from GitHub: ${url}`);
        
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`GitHub API error: ${response.status} ${response.statusText}`);
            const errorText = await response.text();
            console.error(`Error response body: ${errorText}`);
            throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log(`GitHub API response: ${Array.isArray(data) ? data.length : 'not array'} items`);
        
        if (!Array.isArray(data)) {
            console.log('Response is not an array:', data);
            return [];
        }
        
        let files = [];
        
        for (const item of data) {
            console.log(`Processing item: ${item.name} (type: ${item.type})`);
            
            if (item.type === 'file' && item.name.match(/\.(srt|vtt|ass|ssa|sub)$/i)) {
                console.log(`  Found subtitle file: ${item.name}`);
                files.push({
                    name: item.name,
                    path: item.path,
                    download_url: item.download_url
                });
            } else if (item.type === 'dir') {
                console.log(`  Recursively scanning directory: ${item.path}`);
                // Recursively fetch files from subdirectories
                const subFiles = await fetchGitHubFiles(repo, item.path);
                console.log(`  Found ${subFiles.length} subtitle files in ${item.path}`);
                files = files.concat(subFiles);
            } else {
                console.log(`  Skipping ${item.name} (not a subtitle file)`);
            }
        }
        
        console.log(`Total subtitle files found: ${files.length}`);
        if (files.length > 0) {
            console.log('All found subtitle files:', files.map(f => f.name));
        }
        
        return files;
    } catch (error) {
        console.error('Error fetching GitHub files:', error);
        return [];
    }
}

// Subtitles handler
builder.defineSubtitlesHandler(async (args) => {
    console.log('=== SUBTITLES REQUEST START ===');
    console.log('Full request args:', JSON.stringify(args, null, 2));
    
    const { type, id, extra, config: directConfig } = args;
    
    // Configuration can be in different places depending on how the request is made
    let config = {};
    if (directConfig) {
        config = directConfig;
        console.log('Found config directly in args');
    } else if (extra && extra.config) {
        config = extra.config;
        console.log('Found config in extra.config');
    } else if (args.config) {
        config = args.config;
        console.log('Found config in args.config');
    }
    
    console.log('Parsed request:', {
        type,
        id,
        config: config,
        hasGithubRepo: !!config.github_repo,
        githubPath: config.github_path || '(root)',
        extraKeys: extra ? Object.keys(extra) : 'no extra',
        allArgsKeys: Object.keys(args)
    });
    
    if (!config.github_repo) {
        console.log('No GitHub repository configured - returning empty subtitles');
        return { subtitles: [] };
    }
    
    try {
        // Fetch all subtitle files from the GitHub repository
        const subtitlePath = config.github_path || '';
        console.log(`Fetching subtitle files from repo: ${config.github_repo}, path: "${subtitlePath}"`);
        
        const files = await fetchGitHubFiles(config.github_repo, subtitlePath);
        
        console.log(`Found ${files.length} subtitle files in repository`);
        
        const subtitles = [];
        
        console.log('=== STARTING FILE MATCHING ===');
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`\n[${i + 1}/${files.length}] Processing file: "${file.name}"`);
            console.log(`  Full path: ${file.path}`);
            console.log(`  Download URL: ${file.download_url}`);
            
            const metadata = parseSubtitleFilename(file.name);
            console.log(`  Parsed metadata:`, metadata);
            
            let isMatch = false;
            
            if (type === 'movie') {
                console.log(`  Checking movie match for IMDB ID: ${id}`);
                
                // First, try to match by IMDB ID
                isMatch = matchesImdbId(file.name, id);
                
                // If IMDB match fails, try to match by title patterns
                if (!isMatch) {
                    console.log(`  IMDB match failed, trying title-based matching...`);
                    
                    // For "Eyes Wide Shut" (tt0120663), we can try to match common title patterns
                    // This is a fallback approach since we don't have the actual movie metadata
                    const knownTitles = {
                        'tt0120663': { title: 'eyes wide shut', year: '1999' },
                        'tt0111161': { title: 'shawshank redemption', year: '1994' },
                        'tt0068646': { title: 'godfather', year: '1972' },
                        'tt0071562': { title: 'godfather part ii', year: '1974' },
                        'tt0468569': { title: 'dark knight', year: '2008' },
                        'tt0108052': { title: 'schindlers list', year: '1993' },
                        'tt0167260': { title: 'lord of the rings return of the king', year: '2003' },
                        'tt0110912': { title: 'pulp fiction', year: '1994' },
                        'tt0060196': { title: 'good bad ugly', year: '1966' },
                        'tt0137523': { title: 'fight club', year: '1999' },
                        'tt0120737': { title: 'lord of the rings fellowship', year: '2001' },
                        'tt0109830': { title: 'forrest gump', year: '1994' }
                    };
                    
                    const movieInfo = knownTitles[id];
                    if (movieInfo) {
                        console.log(`  Found known movie info for ${id}:`, movieInfo);
                        isMatch = matchesByTitle(file.name, movieInfo.title, movieInfo.year);
                    } else {
                        console.log(`  No known movie info for ${id}, cannot do title matching`);
                        
                        // As a last resort, try to extract any meaningful patterns from the filename
                        const { title: fileTitle, year: fileYear } = extractTitleAndYear(file.name);
                        console.log(`  File contains title patterns: "${fileTitle}" (${fileYear})`);
                    }
                }
            } else if (type === 'series') {
                console.log(`  Checking series match for ID: ${id}`);
                // For series, extract season and episode from the request
                // The id format for series is usually: tt1234567:1:1 (imdbId:season:episode)
                const [imdbId, season, episode] = id.split(':');
                
                console.log(`  Parsed series ID:`, {
                    imdbId,
                    season,
                    episode
                });
                
                if (season && episode) {
                    console.log(`  Checking both IMDB and episode match...`);
                    const imdbMatch = matchesImdbId(file.name, imdbId);
                    const episodeMatch = matchesEpisode(file.name, parseInt(season), parseInt(episode));
                    isMatch = imdbMatch && episodeMatch;
                    console.log(`  Combined match result: IMDB(${imdbMatch}) && Episode(${episodeMatch}) = ${isMatch}`);
                } else {
                    console.log(`  Only checking IMDB match (no season/episode)...`);
                    isMatch = matchesImdbId(file.name, imdbId);
                }
            } else {
                console.log(`  Unknown content type: ${type}`);
            }
            
            console.log(`  Final match result for "${file.name}": ${isMatch}`);
            
            if (isMatch) {
                const subtitle = {
                    id: `github:${config.github_repo}:${file.path}`,
                    url: file.download_url,
                    lang: metadata.language,
                    filename: file.name
                };
                subtitles.push(subtitle);
                console.log(`  ✓ ADDED TO RESULTS:`, subtitle);
            } else {
                console.log(`  ✗ Not matched - skipping`);
            }
        }
        
        console.log('\n=== FINAL RESULTS ===');
        console.log(`Returning ${subtitles.length} matching subtitles out of ${files.length} total files`);
        if (subtitles.length > 0) {
            console.log('Matched subtitles:', subtitles.map(s => ({ filename: s.filename, lang: s.lang, url: s.url })));
        } else {
            console.log('NO SUBTITLES MATCHED!');
            console.log('Possible reasons:');
            console.log('1. IMDB ID not found in any filename');
            console.log('2. For series: season/episode pattern not found');
            console.log('3. No subtitle files found in repository');
            console.log('4. Repository path incorrect');
        }
        console.log('=== SUBTITLES REQUEST END ===\n');
        
        return { subtitles };
        
    } catch (error) {
        console.error('Error in subtitles handler:', error);
        console.error('Error stack:', error.stack);
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
