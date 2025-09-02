const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const fetch = require('node-fetch');
const path = require('path');
const Fuse = require('fuse.js');
const { distance } = require('fastest-levenshtein');

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

// Enhanced fuzzy matching utilities
class FuzzyMatcher {
    constructor() {
        // Common words to ignore when matching titles
        this.stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were'
        ]);
        
        // Release group tags and quality indicators to remove
        this.releasePatterns = [
            /\b(yify|rarbg|etrg|ettv|x264|h264|h265|xvid|divx|ac3|dts|bluray|brrip|webrip|hdtv|dvdrip|720p|1080p|2160p|4k|uhd)\b/gi,
            /\b(internal|proper|repack|dubbed|subbed|unrated|extended|directors?.cut|theatrical|imax)\b/gi,
            /\[.*?\]/g, // Remove anything in square brackets
            /\(.*?(720p|1080p|2160p|4k|x264|h264|h265|bluray|webrip|hdtv|dvdrip).*?\)/gi
        ];
    }

    // Normalize text for better matching
    normalizeText(text) {
        if (!text) return '';
        
        let normalized = text.toLowerCase();
        
        // Remove release group patterns
        for (const pattern of this.releasePatterns) {
            normalized = normalized.replace(pattern, ' ');
        }
        
        // Remove special characters and normalize spaces
        normalized = normalized
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
        
        // Remove stop words
        const words = normalized.split(' ').filter(word => 
            word.length > 0 && !this.stopWords.has(word)
        );
        
        return words.join(' ');
    }

    // Calculate similarity between two strings using multiple algorithms
    calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const norm1 = this.normalizeText(str1);
        const norm2 = this.normalizeText(str2);
        
        if (norm1 === norm2) return 1.0;
        if (norm1.length === 0 || norm2.length === 0) return 0;
        
        // Exact substring match gets high score
        if (norm1.includes(norm2) || norm2.includes(norm1)) {
            return 0.9;
        }
        
        // Levenshtein distance similarity
        const maxLen = Math.max(norm1.length, norm2.length);
        const levenshteinSim = 1 - (distance(norm1, norm2) / maxLen);
        
        // Word-based similarity
        const words1 = norm1.split(' ');
        const words2 = norm2.split(' ');
        const wordSim = this.calculateWordSimilarity(words1, words2);
        
        // Combined score with weights
        return (levenshteinSim * 0.6) + (wordSim * 0.4);
    }

    // Calculate similarity based on word overlap
    calculateWordSimilarity(words1, words2) {
        if (words1.length === 0 || words2.length === 0) return 0;
        
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    // Extract and normalize title from filename
    extractTitle(filename) {
        const basename = filename.replace(/\.(srt|vtt|ass|ssa|sub)$/i, '');
        
        // Remove year if present
        const withoutYear = basename.replace(/\b(19|20)\d{2}\b.*$/, '');
        
        return this.normalizeText(withoutYear);
    }

    // Extract year from filename
    extractYear(filename) {
        const yearMatch = filename.match(/\b(19|20)\d{2}\b/);
        return yearMatch ? yearMatch[0] : null;
    }

    // Enhanced IMDB ID matching with fuzzy support
    matchesImdbId(filename, imdbId, threshold = 0.7) {
        const numericId = imdbId.replace('tt', '');
        const filenameLC = filename.toLowerCase();
        
        // Direct IMDB ID match
        if (filenameLC.includes(numericId) || filenameLC.includes(imdbId.toLowerCase())) {
            return { score: 1.0, method: 'direct_imdb' };
        }
        
        // Extract potential IDs from filename
        const idMatches = filename.match(/\b\d{7,8}\b/g);
        if (idMatches) {
            for (const match of idMatches) {
                const similarity = this.calculateSimilarity(match, numericId);
                if (similarity >= threshold) {
                    return { score: similarity, method: 'fuzzy_imdb' };
                }
            }
        }
        
        return { score: 0, method: 'none' };
    }

    // Enhanced title matching with fuzzy support
    matchesByTitle(filename, targetTitle, targetYear = null, threshold = 0.6) {
        const fileTitle = this.extractTitle(filename);
        const fileYear = this.extractYear(filename);
        
        if (!fileTitle) {
            return { score: 0, method: 'no_title' };
        }
        
        const normalizedTarget = this.normalizeText(targetTitle);
        const titleSimilarity = this.calculateSimilarity(fileTitle, normalizedTarget);
        
        // Year matching bonus
        let yearBonus = 0;
        if (targetYear && fileYear) {
            if (fileYear === targetYear) {
                yearBonus = 0.2;
            } else if (Math.abs(parseInt(fileYear) - parseInt(targetYear)) <= 1) {
                yearBonus = 0.1; // Close years get small bonus
            }
        } else if (!targetYear || !fileYear) {
            yearBonus = 0.05; // Small bonus if one year is missing
        }
        
        const finalScore = Math.min(1.0, titleSimilarity + yearBonus);
        
        if (finalScore >= threshold) {
            return { 
                score: finalScore, 
                method: 'fuzzy_title',
                details: { fileTitle, normalizedTarget, titleSimilarity, yearBonus, fileYear, targetYear }
            };
        }
        
        return { score: finalScore, method: 'below_threshold' };
    }

    // Enhanced episode matching with fuzzy support
    matchesEpisode(filename, season, episode, threshold = 0.8) {
        const seasonPadded = season.toString().padStart(2, '0');
        const episodePadded = episode.toString().padStart(2, '0');
        
        // Direct pattern matches (highest score)
        const exactPatterns = [
            new RegExp(`s${seasonPadded}e${episodePadded}`, 'i'),
            new RegExp(`s${season}e${episode}`, 'i'),
            new RegExp(`${season}x${episodePadded}`, 'i'),
            new RegExp(`${season}x${episode}`, 'i'),
            new RegExp(`season.?${season}.*episode.?${episode}`, 'i'),
            new RegExp(`s${season}.?ep?${episode}`, 'i')
        ];
        
        for (const pattern of exactPatterns) {
            if (pattern.test(filename)) {
                return { score: 1.0, method: 'exact_episode' };
            }
        }
        
        // Fuzzy episode matching
        const episodeNumbers = filename.match(/\b\d{1,2}\b/g);
        if (episodeNumbers && episodeNumbers.length >= 2) {
            // Try to find season and episode numbers
            for (let i = 0; i < episodeNumbers.length - 1; i++) {
                const s = parseInt(episodeNumbers[i]);
                const e = parseInt(episodeNumbers[i + 1]);
                
                if (s === season && e === episode) {
                    return { score: 0.9, method: 'fuzzy_episode' };
                }
            }
        }
        
        return { score: 0, method: 'no_match' };
    }

    // Find best matches from a list of files
    findBestMatches(files, type, id, targetTitle = null, targetYear = null, minScore = 0.5) {
        const matches = [];
        
        for (const file of files) {
            let matchResult = { score: 0, method: 'none' };
            
            if (type === 'movie') {
                // Try IMDB ID matching first
                const imdbMatch = this.matchesImdbId(file.name, id);
                if (imdbMatch.score > 0) {
                    matchResult = imdbMatch;
                } else if (targetTitle) {
                    // Fallback to title matching
                    const titleMatch = this.matchesByTitle(file.name, targetTitle, targetYear);
                    matchResult = titleMatch;
                }
            } else if (type === 'series') {
                const [imdbId, season, episode] = id.split(':');
                
                if (season && episode) {
                    // Check both IMDB and episode
                    const imdbMatch = this.matchesImdbId(file.name, imdbId);
                    const episodeMatch = this.matchesEpisode(file.name, parseInt(season), parseInt(episode));
                    
                    // Combined scoring for series
                    if (imdbMatch.score > 0 && episodeMatch.score > 0) {
                        matchResult = {
                            score: (imdbMatch.score * 0.6) + (episodeMatch.score * 0.4),
                            method: 'series_combined',
                            details: { imdbMatch, episodeMatch }
                        };
                    } else if (episodeMatch.score > 0.8) {
                        // High confidence episode match without IMDB
                        matchResult = episodeMatch;
                    }
                } else {
                    // Only IMDB matching
                    matchResult = this.matchesImdbId(file.name, imdbId);
                }
            }
            
            if (matchResult.score >= minScore) {
                matches.push({
                    file,
                    match: matchResult
                });
            }
        }
        
        // Sort by score descending
        matches.sort((a, b) => b.match.score - a.match.score);
        
        return matches;
    }
}

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

// Enhanced movie database with more titles for better matching
const MOVIE_DATABASE = {
    'tt0120663': { title: 'Eyes Wide Shut', year: '1999', alternativeTitles: ['eyes wide shut'] },
    'tt0111161': { title: 'The Shawshank Redemption', year: '1994', alternativeTitles: ['shawshank redemption'] },
    'tt0068646': { title: 'The Godfather', year: '1972', alternativeTitles: ['godfather'] },
    'tt0071562': { title: 'The Godfather Part II', year: '1974', alternativeTitles: ['godfather part ii', 'godfather 2'] },
    'tt0468569': { title: 'The Dark Knight', year: '2008', alternativeTitles: ['dark knight'] },
    'tt0108052': { title: 'Schindler\'s List', year: '1993', alternativeTitles: ['schindlers list'] },
    'tt0167260': { title: 'The Lord of the Rings: The Return of the King', year: '2003', alternativeTitles: ['lord of the rings return of the king', 'lotr return king'] },
    'tt0110912': { title: 'Pulp Fiction', year: '1994', alternativeTitles: ['pulp fiction'] },
    'tt0060196': { title: 'The Good, the Bad and the Ugly', year: '1966', alternativeTitles: ['good bad ugly'] },
    'tt0137523': { title: 'Fight Club', year: '1999', alternativeTitles: ['fight club'] },
    'tt0120737': { title: 'The Lord of the Rings: The Fellowship of the Ring', year: '2001', alternativeTitles: ['lord of the rings fellowship', 'lotr fellowship'] },
    'tt0109830': { title: 'Forrest Gump', year: '1994', alternativeTitles: ['forrest gump'] }
};

// Helper function to get movie info by IMDB ID
function getMovieInfo(imdbId) {
    return MOVIE_DATABASE[imdbId] || null;
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

// Subtitles handler with enhanced fuzzy matching
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
        
        // Get movie information for title-based matching
        if (type === 'movie') {
            const movieInfo = getMovieInfo(id);
            if (movieInfo) {
                targetTitle = movieInfo.title;
                targetYear = movieInfo.year;
                console.log(`Found movie info for ${id}: "${targetTitle}" (${targetYear})`);
                
                // Also try alternative titles
                if (movieInfo.alternativeTitles) {
                    console.log(`Alternative titles: ${movieInfo.alternativeTitles.join(', ')}`);
                }
            } else {
                console.log(`No movie info found for ${id} - will use IMDB ID matching only`);
            }
        }
        
        // Find best matches using fuzzy matching
        const matches = fuzzyMatcher.findBestMatches(files, type, id, targetTitle, targetYear);
        
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
                score: match.score,
                matchMethod: match.method
            };
            
            subtitles.push(subtitle);
            console.log(`  ✓ ADDED TO RESULTS:`, {
                filename: subtitle.filename,
                lang: subtitle.lang,
                score: subtitle.score,
                method: subtitle.matchMethod
            });
        }
        
        // Sort by match score (highest first)
        subtitles.sort((a, b) => b.score - a.score);
        
        console.log('\n=== FINAL RESULTS ===');
        console.log(`Returning ${subtitles.length} matching subtitles out of ${files.length} total files`);
        
        if (subtitles.length > 0) {
            console.log('Top matches:');
            subtitles.slice(0, 5).forEach((sub, idx) => {
                console.log(`  ${idx + 1}. ${sub.filename} (score: ${sub.score.toFixed(3)}, method: ${sub.matchMethod}, lang: ${sub.lang})`);
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
        
        // Return subtitles without internal scoring fields
        const cleanSubtitles = subtitles.map(({ score, matchMethod, ...subtitle }) => subtitle);
        
        return { subtitles: cleanSubtitles };
        
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
