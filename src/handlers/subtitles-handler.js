/**
 * Subtitles request handler
 */

const FuzzyMatcher = require('../services/fuzzy-matcher');
const { fetchGitHubFiles } = require('../services/github-service');
const { getMovieInfo } = require('../services/movie-database');
const { parseSubtitleFilename } = require('../utils/subtitle-parser');

/**
 * Handle subtitles requests
 * @param {Object} args - Request arguments
 * @returns {Promise<Object>} Subtitles response
 */
async function handleSubtitlesRequest(args) {
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
        // Initialize fuzzy matcher
        const fuzzyMatcher = new FuzzyMatcher();
        
        // Fetch all subtitle files from the GitHub repository
        const subtitlePath = config.github_path || '';
        console.log(`Fetching subtitle files from repo: ${config.github_repo}, path: "${subtitlePath}"`);
        
        const files = await fetchGitHubFiles(config.github_repo, subtitlePath);
        
        console.log(`Found ${files.length} subtitle files in repository`);
        
        if (files.length === 0) {
            console.log('No subtitle files found in repository');
            return { subtitles: [] };
        }
        
        console.log('=== STARTING FUZZY MATCHING ===');
        
        let targetTitle = null;
        let targetYear = null;
        
        // Try to get movie information for enhanced title-based matching
        if (type === 'movie') {
            try {
                const movieInfo = await getMovieInfo(id);
                if (movieInfo) {
                    targetTitle = movieInfo.title;
                    targetYear = movieInfo.year;
                    console.log(`Found movie info for ${id}: "${targetTitle}" (${targetYear})`);
                } else {
                    console.log(`No movie metadata available for ${id} - relying on IMDB ID and filename analysis`);
                }
            } catch (error) {
                console.error(`Error fetching movie info for ${id}:`, error.message);
                console.log(`Falling back to IMDB ID and filename analysis`);
            }
        }
        
        // Find best matches using fuzzy matching
        const matches = fuzzyMatcher.findBestMatches(files, type, id, targetTitle, targetYear, 0.3);
        
        console.log(`\nFuzzy matching results: Found ${matches.length} matches`);
        
        const subtitles = [];
        
        for (let i = 0; i < matches.length; i++) {
            const { file, match } = matches[i];
            
            console.log(`\n[${i + 1}/${matches.length}] Match found:`, {
                filename: file.name,
                score: match.score.toFixed(3),
                method: match.method,
                details: match.details || 'none'
            });
            
            const metadata = parseSubtitleFilename(file.name);
            
            const subtitle = {
                id: `github:${config.github_repo}:${file.path}`,
                url: file.download_url,
                lang: metadata.language,
                filename: file.name,
                // Add metadata for debugging (can be removed in production)
                _score: match.score,
                _matchMethod: match.method,
                _metadata: metadata
            };
            
            subtitles.push(subtitle);
            console.log(`  ✓ ADDED TO RESULTS:`, {
                filename: subtitle.filename,
                lang: subtitle.lang,
                score: subtitle._score,
                method: subtitle._matchMethod
            });
        }
        
        // Sort by match score (highest first)
        subtitles.sort((a, b) => b._score - a._score);
        
        console.log('\n=== FINAL RESULTS ===');
        console.log(`Returning ${subtitles.length} matching subtitles out of ${files.length} total files`);
        
        if (subtitles.length > 0) {
            console.log('Top matches:');
            subtitles.slice(0, 5).forEach((sub, idx) => {
                console.log(`  ${idx + 1}. ${sub.filename} (score: ${sub._score.toFixed(3)}, method: ${sub._matchMethod}, lang: ${sub.lang})`);
            });
        } else {
            console.log('NO SUBTITLES MATCHED!');
            console.log('Debugging info:');
            console.log(`- Content type: ${type}`);
            console.log(`- Request ID: ${id}`);
            console.log(`- Target title: ${targetTitle || 'not found'}`);
            console.log(`- Target year: ${targetYear || 'not found'}`);
            console.log(`- Files checked: ${files.length}`);
            
            if (files.length > 0) {
                console.log('Sample filenames:');
                files.slice(0, 3).forEach(f => console.log(`  - ${f.name}`));
            }
        }
        
        console.log('=== SUBTITLES REQUEST END ===\n');
        
        // Return subtitles without internal scoring fields (clean for production)
        const cleanSubtitles = subtitles.map(({ _score, _matchMethod, _metadata, ...subtitle }) => subtitle);
        
        return { subtitles: cleanSubtitles };
        
    } catch (error) {
        console.error('Error in subtitles handler:', error);
        console.error('Error stack:', error.stack);
        return { subtitles: [] };
    }
}

/**
 * Validate subtitles request arguments
 * @param {Object} args - Request arguments
 * @returns {Object} Validation result
 */
function validateSubtitlesRequest(args) {
    const errors = [];
    const warnings = [];
    
    if (!args) {
        errors.push('Missing request arguments');
        return { valid: false, errors, warnings };
    }
    
    if (!args.type) {
        errors.push('Missing content type');
    } else if (!['movie', 'series'].includes(args.type)) {
        errors.push(`Invalid content type: ${args.type}. Must be 'movie' or 'series'`);
    }
    
    if (!args.id) {
        errors.push('Missing content ID');
    } else if (args.type === 'movie' && !args.id.match(/^tt\d+$/)) {
        warnings.push(`Movie ID format unusual: ${args.id}. Expected format: ttNNNNNNN`);
    } else if (args.type === 'series' && !args.id.includes(':')) {
        warnings.push(`Series ID format unusual: ${args.id}. Expected format: ttNNNNNNN:season:episode`);
    }
    
    // Check for configuration
    const config = args.config || (args.extra && args.extra.config) || args.directConfig;
    if (!config) {
        warnings.push('No configuration found in request');
    } else {
        if (!config.github_repo) {
            errors.push('Missing GitHub repository configuration');
        } else if (!config.github_repo.includes('/')) {
            errors.push('Invalid GitHub repository format. Use owner/repo');
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Extract series information from ID
 * @param {string} id - Series ID in format ttNNNNNNN:season:episode
 * @returns {Object} Parsed series information
 */
function parseSeriesId(id) {
    const parts = id.split(':');
    
    if (parts.length < 2) {
        return {
            imdbId: parts[0],
            season: null,
            episode: null,
            isValid: false
        };
    }
    
    return {
        imdbId: parts[0],
        season: parts[1] ? parseInt(parts[1]) : null,
        episode: parts[2] ? parseInt(parts[2]) : null,
        isValid: parts.length >= 3 && !isNaN(parseInt(parts[1])) && !isNaN(parseInt(parts[2]))
    };
}

module.exports = {
    handleSubtitlesRequest,
    validateSubtitlesRequest,
    parseSeriesId
};
