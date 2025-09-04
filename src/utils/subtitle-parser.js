/**
 * Subtitle filename parsing utilities
 */

const path = require('path');

/**
 * Parse subtitle filename and extract metadata
 * @param {string} filename - The subtitle filename
 * @returns {Object} Parsed metadata including language, format, etc.
 */
function parseSubtitleFilename(filename) {
    console.log(`    Parsing filename: "${filename}"`);
    
    const basename = path.basename(filename, path.extname(filename));
    const extension = path.extname(filename).toLowerCase().substring(1);
    const parts = basename.split('.');
    
    console.log(`    Basename: "${basename}", Extension: "${extension}", Parts:`, parts);
    
    const metadata = {
        filename: filename,
        basename: basename,
        extension: extension,
        language: detectLanguage(basename),
        format: extension,
        isForced: detectForced(basename),
        isSDH: detectSDH(basename),
        quality: detectQuality(basename),
        releaseGroup: detectReleaseGroup(basename)
    };
    
    console.log(`    Final metadata:`, metadata);
    return metadata;
}

/**
 * Detect language from filename using various patterns
 * @param {string} basename - The filename without extension
 * @returns {string} Detected language code or 'other'
 */
function detectLanguage(basename) {
    const filenameLC = basename.toLowerCase();
    
    // Language detection patterns with priorities
    const languagePatterns = [
        // English variants
        { pattern: /\b(en|eng|english)\b/i, code: 'en', priority: 10 },
        { pattern: /\b(us|usa|american)\b/i, code: 'en', priority: 8 },
        { pattern: /\b(uk|british)\b/i, code: 'en', priority: 8 },
        
        // Spanish variants
        { pattern: /\b(es|esp|spanish|espanol|español)\b/i, code: 'es', priority: 10 },
        { pattern: /\b(latin|latino|latam)\b/i, code: 'es', priority: 8 },
        
        // French variants
        { pattern: /\b(fr|fre|french|francais|français)\b/i, code: 'fr', priority: 10 },
        
        // German variants
        { pattern: /\b(de|ger|german|deutsch)\b/i, code: 'de', priority: 10 },
        
        // Italian variants
        { pattern: /\b(it|ita|italian|italiano)\b/i, code: 'it', priority: 10 },
        
        // Portuguese variants
        { pattern: /\b(pt|por|portuguese|portugues|português)\b/i, code: 'pt', priority: 10 },
        { pattern: /\b(br|brazil|brazilian)\b/i, code: 'pt-br', priority: 9 },
        
        // Other major languages
        { pattern: /\b(ru|rus|russian)\b/i, code: 'ru', priority: 10 },
        { pattern: /\b(zh|chi|chinese|mandarin)\b/i, code: 'zh', priority: 10 },
        { pattern: /\b(ja|jpn|japanese)\b/i, code: 'ja', priority: 10 },
        { pattern: /\b(ko|kor|korean)\b/i, code: 'ko', priority: 10 },
        { pattern: /\b(ar|ara|arabic)\b/i, code: 'ar', priority: 10 },
        { pattern: /\b(hi|hin|hindi)\b/i, code: 'hi', priority: 10 },
        { pattern: /\b(nl|dut|dutch)\b/i, code: 'nl', priority: 10 },
        { pattern: /\b(sv|swe|swedish)\b/i, code: 'sv', priority: 10 },
        { pattern: /\b(no|nor|norwegian)\b/i, code: 'no', priority: 10 },
        { pattern: /\b(da|dan|danish)\b/i, code: 'da', priority: 10 },
        { pattern: /\b(fi|fin|finnish)\b/i, code: 'fi', priority: 10 }
    ];
    
    let bestMatch = { code: 'other', priority: 0 };
    
    for (const { pattern, code, priority } of languagePatterns) {
        if (pattern.test(filenameLC) && priority > bestMatch.priority) {
            bestMatch = { code, priority };
        }
    }
    
    // Special handling for multi-language indicators
    if (/\b(multi|dual)\b/i.test(filenameLC)) {
        return 'multi';
    }
    
    console.log(`    Language detected: ${bestMatch.code}`);
    return bestMatch.code;
}

/**
 * Detect if subtitles are forced (for foreign language parts only)
 * @param {string} basename - The filename without extension
 * @returns {boolean} True if forced subtitles
 */
function detectForced(basename) {
    return /\b(forced|foreign)\b/i.test(basename);
}

/**
 * Detect if subtitles are SDH (Subtitles for Deaf and Hard of hearing)
 * @param {string} basename - The filename without extension
 * @returns {boolean} True if SDH subtitles
 */
function detectSDH(basename) {
    return /\b(sdh|deaf|hard\.?of\.?hearing|cc|closed\.?caption)\b/i.test(basename);
}

/**
 * Detect video quality from filename
 * @param {string} basename - The filename without extension
 * @returns {string|null} Detected quality or null
 */
function detectQuality(basename) {
    const qualityPatterns = [
        { pattern: /\b2160p\b/i, quality: '4K' },
        { pattern: /\b1080p\b/i, quality: '1080p' },
        { pattern: /\b720p\b/i, quality: '720p' },
        { pattern: /\b480p\b/i, quality: '480p' },
        { pattern: /\b4k\b/i, quality: '4K' },
        { pattern: /\buhd\b/i, quality: '4K' },
        { pattern: /\bhd\b/i, quality: 'HD' }
    ];
    
    for (const { pattern, quality } of qualityPatterns) {
        if (pattern.test(basename)) {
            return quality;
        }
    }
    
    return null;
}

/**
 * Detect release group from filename
 * @param {string} basename - The filename without extension
 * @returns {string|null} Detected release group or null
 */
function detectReleaseGroup(basename) {
    // Common release group patterns
    const patterns = [
        /\[([A-Z0-9]+)\]$/i,           // [RARBG]
        /-([A-Z0-9]+)$/i,             // -YIFY
        /\.([A-Z0-9]+)$/i,            // .ETRG
        /\(([A-Z0-9]+)\)$/i           // (FGT)
    ];
    
    for (const pattern of patterns) {
        const match = basename.match(pattern);
        if (match) {
            return match[1].toUpperCase();
        }
    }
    
    return null;
}

/**
 * Generate a cleaned subtitle filename for display
 * @param {string} filename - Original filename
 * @returns {string} Cleaned filename
 */
function cleanFilename(filename) {
    let cleaned = path.basename(filename, path.extname(filename));
    
    // Remove common release artifacts
    cleaned = cleaned
        .replace(/\.(720p|1080p|2160p|4k|x264|h264|h265|bluray|webrip|hdtv|dvdrip)/gi, '')
        .replace(/\[.*?\]/g, '')
        .replace(/-[A-Z0-9]+$/i, '')
        .replace(/\./g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    return cleaned;
}

/**
 * Get language name from language code
 * @param {string} code - Language code
 * @returns {string} Language name
 */
function getLanguageName(code) {
    const languageMap = {
        'en': 'English',
        'es': 'Spanish',
        'fr': 'French',
        'de': 'German',
        'it': 'Italian',
        'pt': 'Portuguese',
        'pt-br': 'Portuguese (Brazil)',
        'ru': 'Russian',
        'zh': 'Chinese',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'hi': 'Hindi',
        'nl': 'Dutch',
        'sv': 'Swedish',
        'no': 'Norwegian',
        'da': 'Danish',
        'fi': 'Finnish',
        'multi': 'Multiple Languages',
        'other': 'Other'
    };
    
    return languageMap[code] || code;
}

module.exports = {
    parseSubtitleFilename,
    detectLanguage,
    detectForced,
    detectSDH,
    detectQuality,
    detectReleaseGroup,
    cleanFilename,
    getLanguageName
};
