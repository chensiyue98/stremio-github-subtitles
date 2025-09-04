/**
 * Enhanced fuzzy matching service for subtitle files
 */

const path = require('path');
const { distance } = require('fastest-levenshtein');

class FuzzyMatcher {
    constructor() {
        // Common words to ignore when matching titles (expanded list)
        this.stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were',
            'this', 'that', 'these', 'those', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'must', 'can', 'shall', 'de', 'la', 'le', 'el', 'les', 'los', 'las', 'un', 'une',
            'der', 'die', 'das', 'ein', 'eine', 'il', 'lo', 'la', 'gli', 'le', 'i'
        ]);
        
        // Release group tags and quality indicators to remove (expanded)
        this.releasePatterns = [
            /\b(yify|rarbg|etrg|ettv|x264|h264|h265|hevc|xvid|divx|ac3|dts|bluray|brrip|webrip|hdtv|dvdrip|720p|1080p|2160p|4k|uhd)\b/gi,
            /\b(internal|proper|repack|dubbed|subbed|unrated|extended|directors?.cut|theatrical|imax|limited|festival|screener|cam|ts|tc)\b/gi,
            /\b(aac|mp3|flac|dts-hd|truehd|atmos|dolby|surround|5\.1|7\.1)\b/gi,
            /\b(multi|dual|audio|subs?|hard\.?coded|hc|forced)\b/gi,
            /\[.*?\]/g, // Remove anything in square brackets
            /\{.*?\}/g, // Remove anything in curly brackets
            /\(.*?(720p|1080p|2160p|4k|x264|h264|h265|bluray|webrip|hdtv|dvdrip|year|\d{4}).*?\)/gi,
            /-\w+$/g, // Remove trailing release group tags like -RARBG
            /\.(mkv|mp4|avi|mov|wmv|flv|webm|m4v)$/gi // Remove video file extensions
        ];

        // Common abbreviations and their expansions
        this.abbreviations = {
            'vs': 'versus',
            'pt': 'part',
            'vol': 'volume',
            'ep': 'episode',
            'ch': 'chapter',
            'no': 'number',
            'nr': 'number',
            'num': 'number',
            '&': 'and',
            'w/': 'with',
            'wo/': 'without'
        };

        // Character normalization map for international characters
        this.charMap = {
            'à': 'a', 'á': 'a', 'â': 'a', 'ã': 'a', 'ä': 'a', 'å': 'a', 'æ': 'ae',
            'ç': 'c', 'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e', 'ì': 'i', 'í': 'i',
            'î': 'i', 'ï': 'i', 'ñ': 'n', 'ò': 'o', 'ó': 'o', 'ô': 'o', 'õ': 'o',
            'ö': 'o', 'ø': 'o', 'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u', 'ý': 'y',
            'ÿ': 'y', 'ß': 'ss', 'œ': 'oe'
        };
    }

    // Enhanced normalize text for better matching
    normalizeText(text) {
        if (!text) return '';
        
        let normalized = text.toLowerCase();
        
        // Normalize international characters
        for (const [accented, plain] of Object.entries(this.charMap)) {
            normalized = normalized.replace(new RegExp(accented, 'g'), plain);
        }
        
        // Expand common abbreviations
        for (const [abbrev, expansion] of Object.entries(this.abbreviations)) {
            const regex = new RegExp(`\\b${abbrev.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            normalized = normalized.replace(regex, expansion);
        }
        
        // Remove release group patterns
        for (const pattern of this.releasePatterns) {
            normalized = normalized.replace(pattern, ' ');
        }
        
        // Handle special cases for Roman numerals
        normalized = normalized.replace(/\b(?:part\s+)?([ivx]+)\b/g, (match, roman) => {
            const romanToNum = { 'i': '1', 'ii': '2', 'iii': '3', 'iv': '4', 'v': '5', 'vi': '6', 'vii': '7', 'viii': '8', 'ix': '9', 'x': '10' };
            return romanToNum[roman.toLowerCase()] || match;
        });
        
        // Remove special characters but preserve word boundaries
        normalized = normalized
            .replace(/['']/g, '') // Remove apostrophes
            .replace(/[^\w\s]/g, ' ') // Replace non-word chars with space
            .replace(/\s+/g, ' ') // Collapse multiple spaces
            .trim();
        
        // Remove stop words
        const words = normalized.split(' ').filter(word => 
            word.length > 0 && !this.stopWords.has(word)
        );
        
        return words.join(' ');
    }

    // Simple phonetic matching using a basic Soundex-like algorithm
    generatePhoneticCode(word) {
        if (!word) return '';
        
        let code = word.toLowerCase();
        
        // Remove duplicate adjacent letters
        code = code.replace(/(.)\1+/g, '$1');
        
        // Common phonetic replacements
        const phoneticMap = {
            'ph': 'f', 'gh': 'f', 'ck': 'k', 'qu': 'k', 'x': 'ks',
            'th': 't', 'sh': 's', 'ch': 's', 'wh': 'w'
        };
        
        for (const [from, to] of Object.entries(phoneticMap)) {
            code = code.replace(new RegExp(from, 'g'), to);
        }
        
        // Remove vowels except the first character
        code = code[0] + code.slice(1).replace(/[aeiou]/g, '');
        
        return code;
    }

    // Enhanced similarity calculation using multiple algorithms
    calculateSimilarity(str1, str2) {
        if (!str1 || !str2) return 0;
        
        const norm1 = this.normalizeText(str1);
        const norm2 = this.normalizeText(str2);
        
        if (norm1 === norm2) return 1.0;
        if (norm1.length === 0 || norm2.length === 0) return 0;
        
        // Exact substring match gets high score
        if (norm1.includes(norm2) || norm2.includes(norm1)) {
            const longer = norm1.length > norm2.length ? norm1 : norm2;
            const shorter = norm1.length <= norm2.length ? norm1 : norm2;
            return 0.85 + (0.15 * (shorter.length / longer.length));
        }
        
        // Multiple similarity metrics
        const levenshteinSim = this.calculateLevenshteinSimilarity(norm1, norm2);
        const jaccardSim = this.calculateJaccardSimilarity(norm1, norm2);
        const phoneticSim = this.calculatePhoneticSimilarity(norm1, norm2);
        const wordSim = this.calculateWordSimilarity(norm1.split(' '), norm2.split(' '));
        const ngramSim = this.calculateNGramSimilarity(norm1, norm2, 2);
        
        // Weighted combination of different similarity metrics
        const weights = {
            levenshtein: 0.25,
            jaccard: 0.20,
            phonetic: 0.15,
            word: 0.25,
            ngram: 0.15
        };
        
        const finalScore = (
            levenshteinSim * weights.levenshtein +
            jaccardSim * weights.jaccard +
            phoneticSim * weights.phonetic +
            wordSim * weights.word +
            ngramSim * weights.ngram
        );
        
        return Math.min(1.0, finalScore);
    }

    // Levenshtein distance similarity
    calculateLevenshteinSimilarity(str1, str2) {
        const maxLen = Math.max(str1.length, str2.length);
        if (maxLen === 0) return 1.0;
        return 1 - (distance(str1, str2) / maxLen);
    }

    // Jaccard similarity for character sets
    calculateJaccardSimilarity(str1, str2) {
        const set1 = new Set(str1.split(''));
        const set2 = new Set(str2.split(''));
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    // Phonetic similarity using basic phonetic codes
    calculatePhoneticSimilarity(str1, str2) {
        const words1 = str1.split(' ');
        const words2 = str2.split(' ');
        
        let matches = 0;
        let total = Math.max(words1.length, words2.length);
        
        for (const word1 of words1) {
            const code1 = this.generatePhoneticCode(word1);
            for (const word2 of words2) {
                const code2 = this.generatePhoneticCode(word2);
                if (code1 === code2 && code1.length > 0) {
                    matches++;
                    break;
                }
            }
        }
        
        return total === 0 ? 0 : matches / total;
    }

    // N-gram similarity
    calculateNGramSimilarity(str1, str2, n = 2) {
        const ngrams1 = this.generateNGrams(str1, n);
        const ngrams2 = this.generateNGrams(str2, n);
        
        if (ngrams1.length === 0 && ngrams2.length === 0) return 1.0;
        if (ngrams1.length === 0 || ngrams2.length === 0) return 0;
        
        const set1 = new Set(ngrams1);
        const set2 = new Set(ngrams2);
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return intersection.size / union.size;
    }

    // Generate n-grams from string
    generateNGrams(str, n) {
        const ngrams = [];
        const paddedStr = ' '.repeat(n - 1) + str + ' '.repeat(n - 1);
        
        for (let i = 0; i <= paddedStr.length - n; i++) {
            ngrams.push(paddedStr.substring(i, i + n));
        }
        
        return ngrams;
    }

    // Enhanced word-based similarity with partial matching
    calculateWordSimilarity(words1, words2) {
        if (words1.length === 0 && words2.length === 0) return 1.0;
        if (words1.length === 0 || words2.length === 0) return 0;
        
        // Exact word matches
        const set1 = new Set(words1);
        const set2 = new Set(words2);
        const exactMatches = new Set([...set1].filter(x => set2.has(x)));
        
        // Partial word matches using edit distance
        let partialMatches = 0;
        const used2 = new Set();
        
        for (const word1 of words1) {
            if (exactMatches.has(word1)) continue;
            
            let bestMatch = 0;
            let bestWord = null;
            
            for (const word2 of words2) {
                if (exactMatches.has(word2) || used2.has(word2)) continue;
                
                // Skip if words are too different in length
                const lengthRatio = Math.min(word1.length, word2.length) / Math.max(word1.length, word2.length);
                if (lengthRatio < 0.5) continue;
                
                const similarity = this.calculateLevenshteinSimilarity(word1, word2);
                if (similarity > bestMatch && similarity > 0.7) {
                    bestMatch = similarity;
                    bestWord = word2;
                }
            }
            
            if (bestWord) {
                partialMatches += bestMatch;
                used2.add(bestWord);
            }
        }
        
        const totalWords = Math.max(words1.length, words2.length);
        const exactScore = exactMatches.size / totalWords;
        const partialScore = partialMatches / totalWords;
        
        // Combine exact and partial matches
        return exactScore + (partialScore * 0.7);
    }

    // Enhanced title extraction with better pattern recognition
    extractTitle(filename) {
        let basename = filename.replace(/\.(srt|vtt|ass|ssa|sub)$/i, '');
        
        // Remove common prefixes/suffixes
        basename = basename.replace(/^(www\.|download\.|get\.|watch\.|stream\.)/i, '');
        basename = basename.replace(/\.(com|org|net|tv|me|to)$/i, '');
        
        // Remove year and everything after it in most cases
        const yearMatch = basename.match(/\b(19|20)\d{2}\b/);
        if (yearMatch) {
            const yearIndex = basename.indexOf(yearMatch[0]);
            // Keep title part before year, but check if year is at the very end
            const afterYear = basename.substring(yearIndex + 4).trim();
            if (afterYear.length < 10 || /^[\s\-._\[\]()]*$/.test(afterYear)) {
                basename = basename.substring(0, yearIndex).trim();
            }
        }
        
        // Remove season/episode info if present
        basename = basename.replace(/\b(s\d{1,2}e\d{1,2}|season\s*\d+|episode\s*\d+|\d+x\d+)\b.*$/i, '');
        
        // Remove common release patterns more aggressively
        const cleanPatterns = [
            /\b\d{3,4}p\b.*$/i,  // Remove resolution and everything after
            /\bhdtv\b.*$/i,      // Remove HDTV and after
            /\bbluray\b.*$/i,    // Remove BluRay and after  
            /\bwebrip\b.*$/i,    // Remove WebRip and after
            /\bx264\b.*$/i,      // Remove x264 and after
            /\bh264\b.*$/i,      // Remove h264 and after
            /\[-.*?-\]$/,        // Remove trailing tags like [-RARBG-]
        ];
        
        for (const pattern of cleanPatterns) {
            basename = basename.replace(pattern, '');
        }
        
        return this.normalizeText(basename);
    }

    // Enhanced year extraction with better validation
    extractYear(filename) {
        // Look for 4-digit years in reasonable ranges
        const yearMatches = filename.match(/\b(19[2-9]\d|20[0-5]\d)\b/g);
        
        if (!yearMatches) return null;
        
        // If multiple years found, prefer the one that looks most like a release year
        for (const year of yearMatches) {
            const yearNum = parseInt(year);
            
            // Reasonable movie/TV year range
            if (yearNum >= 1920 && yearNum <= 2030) {
                // Check context around the year
                const yearIndex = filename.indexOf(year);
                const before = filename.substring(Math.max(0, yearIndex - 10), yearIndex);
                const after = filename.substring(yearIndex + 4, yearIndex + 20);
                
                // Avoid years that are clearly resolution (2160p) or other numbers
                if (!/\d{3,4}p/i.test(before + year + after)) {
                    return year;
                }
            }
        }
        
        return yearMatches[0]; // Fallback to first match
    }

    // Enhanced IMDB ID matching with comprehensive pattern support
    matchesImdbId(filename, imdbId, threshold = 0.6) {
        const numericId = imdbId.replace('tt', '');
        const filenameLC = filename.toLowerCase();
        
        // Direct IMDB ID patterns (highest score)
        const directPatterns = [
            new RegExp(`\\btt${numericId}\\b`, 'i'),
            new RegExp(`\\b${numericId}\\b`),
            new RegExp(`imdb[\\s\\-_]*${numericId}`, 'i'),
            new RegExp(`\\[${numericId}\\]`),
            new RegExp(`\\(${numericId}\\)`),
            new RegExp(`\\b${imdbId}\\b`, 'i')
        ];
        
        for (const pattern of directPatterns) {
            if (pattern.test(filenameLC)) {
                return { score: 1.0, method: 'direct_imdb', pattern: pattern.source };
            }
        }
        
        // Fuzzy IMDB ID matching
        const idMatches = filename.match(/\b\d{6,8}\b/g);
        if (idMatches) {
            for (const match of idMatches) {
                // Exact length match with small differences
                if (match.length === numericId.length) {
                    const similarity = this.calculateLevenshteinSimilarity(match, numericId);
                    if (similarity >= 0.8) {
                        return { 
                            score: similarity * 0.9, 
                            method: 'fuzzy_imdb_exact_length',
                            details: { found: match, target: numericId, similarity }
                        };
                    }
                }
                
                // Substring matching for longer IDs
                if (match.length > numericId.length && match.includes(numericId)) {
                    return { score: 0.85, method: 'imdb_substring' };
                }
                
                if (numericId.length > match.length && numericId.includes(match)) {
                    return { score: 0.75, method: 'imdb_partial' };
                }
            }
        }
        
        // Look for IMDB patterns with separators
        const separatorPatterns = [
            new RegExp(`imdb[\\s\\-_\\.]*${numericId}`, 'i'),
            new RegExp(`tt[\\s\\-_\\.]*${numericId}`, 'i'),
            new RegExp(`\\b${numericId}[\\s\\-_\\.]*imdb`, 'i')
        ];
        
        for (const pattern of separatorPatterns) {
            if (pattern.test(filenameLC)) {
                return { score: 0.9, method: 'imdb_with_separator' };
            }
        }
        
        return { score: 0, method: 'no_imdb_match' };
    }

    // Enhanced title matching with comprehensive support
    matchesByTitle(filename, targetTitle, targetYear = null, threshold = 0.5) {
        const fileTitle = this.extractTitle(filename);
        const fileYear = this.extractYear(filename);
        
        if (!fileTitle) {
            return { score: 0, method: 'no_title' };
        }
        
        const normalizedTarget = this.normalizeText(targetTitle);
        const titleSimilarity = this.calculateSimilarity(fileTitle, normalizedTarget);
        
        // Multiple year matching strategies
        let yearBonus = 0;
        let yearPenalty = 0;
        
        if (targetYear && fileYear) {
            const yearDiff = Math.abs(parseInt(fileYear) - parseInt(targetYear));
            if (yearDiff === 0) {
                yearBonus = 0.25; // Exact year match
            } else if (yearDiff === 1) {
                yearBonus = 0.15; // Close year
            } else if (yearDiff <= 3) {
                yearBonus = 0.05; // Somewhat close
            } else if (yearDiff > 10) {
                yearPenalty = 0.2; // Very different year is suspicious
            }
        } else if (targetYear && !fileYear) {
            yearBonus = 0.05; // Small bonus for missing year
        } else if (!targetYear && fileYear) {
            yearBonus = 0.03; // Tiny bonus for having year info
        } else {
            yearBonus = 0.1; // Both missing years
        }
        
        // Title length similarity bonus
        const lengthRatio = Math.min(fileTitle.length, normalizedTarget.length) / 
                           Math.max(fileTitle.length, normalizedTarget.length);
        const lengthBonus = lengthRatio > 0.7 ? 0.1 : 0;
        
        // Word count similarity bonus
        const fileWords = fileTitle.split(' ').length;
        const targetWords = normalizedTarget.split(' ').length;
        const wordCountRatio = Math.min(fileWords, targetWords) / Math.max(fileWords, targetWords);
        const wordCountBonus = wordCountRatio > 0.8 ? 0.05 : 0;
        
        // Calculate final score
        let finalScore = titleSimilarity + yearBonus + lengthBonus + wordCountBonus - yearPenalty;
        finalScore = Math.max(0, Math.min(1.0, finalScore));
        
        // Additional checks for common false positives
        if (finalScore > threshold) {
            // Check for sample/trailer markers
            const suspiciousPatterns = /\b(sample|trailer|teaser|preview|clip|demo|test)\b/i;
            if (suspiciousPatterns.test(filename)) {
                finalScore *= 0.5; // Reduce score for samples/trailers
            }
            
            // Check for very short matches that might be coincidental
            if (normalizedTarget.length < 5 && titleSimilarity < 0.9) {
                finalScore *= 0.6;
            }
        }
        
        if (finalScore >= threshold) {
            return { 
                score: finalScore, 
                method: 'enhanced_title_match',
                details: { 
                    fileTitle, 
                    normalizedTarget, 
                    titleSimilarity: titleSimilarity.toFixed(3), 
                    yearBonus: yearBonus.toFixed(3),
                    yearPenalty: yearPenalty.toFixed(3),
                    lengthBonus: lengthBonus.toFixed(3),
                    wordCountBonus: wordCountBonus.toFixed(3),
                    fileYear, 
                    targetYear 
                }
            };
        }
        
        return { 
            score: finalScore, 
            method: 'below_threshold',
            details: { titleSimilarity: titleSimilarity.toFixed(3), finalScore: finalScore.toFixed(3) }
        };
    }

    // Enhanced episode matching with comprehensive pattern support
    matchesEpisode(filename, season, episode, threshold = 0.7) {
        const seasonPadded = season.toString().padStart(2, '0');
        const episodePadded = episode.toString().padStart(2, '0');
        const filenameLC = filename.toLowerCase();
        
        // Exact pattern matches (highest score)
        const exactPatterns = [
            // Standard formats
            new RegExp(`s${seasonPadded}e${episodePadded}\\b`, 'i'),
            new RegExp(`s${season}e${episode}\\b`, 'i'),
            new RegExp(`${season}x${episodePadded}\\b`, 'i'),
            new RegExp(`${season}x${episode}\\b`, 'i'),
            
            // With separators
            new RegExp(`s${seasonPadded}[\\s\\-_\\.]*e${episodePadded}`, 'i'),
            new RegExp(`s${season}[\\s\\-_\\.]*e${episode}`, 'i'),
            new RegExp(`season[\\s\\-_\\.]*${season}[\\s\\-_\\.]*episode[\\s\\-_\\.]*${episode}`, 'i'),
            new RegExp(`season[\\s\\-_\\.]*${seasonPadded}[\\s\\-_\\.]*episode[\\s\\-_\\.]*${episodePadded}`, 'i'),
            
            // Alternative formats
            new RegExp(`s${season}[\\s\\-_\\.]?ep?${episode}\\b`, 'i'),
            new RegExp(`s${seasonPadded}[\\s\\-_\\.]?ep?${episodePadded}\\b`, 'i'),
            new RegExp(`\\bs${season}${episodePadded}\\b`, 'i'),
            new RegExp(`\\bs${seasonPadded}${episodePadded}\\b`, 'i'),
            
            // Dot separated
            new RegExp(`\\.s${seasonPadded}\\.e${episodePadded}\\.`, 'i'),
            new RegExp(`\\.${season}x${episodePadded}\\.`, 'i'),
            
            // Bracket formats
            new RegExp(`\\[s${seasonPadded}e${episodePadded}\\]`, 'i'),
            new RegExp(`\\(s${seasonPadded}e${episodePadded}\\)`, 'i'),
            
            // Special formats
            new RegExp(`season[\\s\\-_]*${season}[\\s\\-_]*ep[\\s\\-_]*${episode}`, 'i'),
            new RegExp(`s${season}[\\s\\-_]*${episodePadded}`, 'i')
        ];
        
        for (const pattern of exactPatterns) {
            if (pattern.test(filenameLC)) {
                return { score: 1.0, method: 'exact_episode', pattern: pattern.source };
            }
        }
        
        // Fuzzy episode matching with tolerance
        const numberMatches = filenameLC.match(/\b\d{1,3}\b/g);
        if (numberMatches && numberMatches.length >= 2) {
            // Look for season and episode numbers in various positions
            for (let i = 0; i < numberMatches.length - 1; i++) {
                const s = parseInt(numberMatches[i]);
                const e = parseInt(numberMatches[i + 1]);
                
                // Exact match
                if (s === season && e === episode) {
                    return { score: 0.95, method: 'fuzzy_episode_exact' };
                }
                
                // Close match (±1 for episode)
                if (s === season && Math.abs(e - episode) === 1) {
                    return { score: 0.8, method: 'fuzzy_episode_close' };
                }
                
                // Season match only
                if (s === season) {
                    return { score: 0.6, method: 'fuzzy_season_only' };
                }
            }
        }
        
        // Look for episode-only patterns when season is 1
        if (season === 1 && numberMatches) {
            for (const match of numberMatches) {
                const num = parseInt(match);
                if (num === episode) {
                    // Check if it looks like an episode number (not year, etc.)
                    if (num <= 50 && !filenameLC.includes(`${num}p`) && !filenameLC.includes(`${num}k`)) {
                        return { score: 0.7, method: 'episode_only_s1' };
                    }
                }
            }
        }
        
        // Multi-season pack detection
        const multiSeasonPattern = new RegExp(`season[\\s\\-_]*${season}`, 'i');
        if (multiSeasonPattern.test(filenameLC)) {
            return { score: 0.5, method: 'season_pack' };
        }
        
        return { score: 0, method: 'no_match' };
    }

    // Enhanced best matches finder with multi-strategy scoring
    findBestMatches(files, type, id, targetTitle = null, targetYear = null, minScore = 0.4) {
        const matches = [];
        
        console.log(`\n=== ENHANCED FUZZY MATCHING ===`);
        console.log(`Type: ${type}, ID: ${id}, Target: "${targetTitle}" (${targetYear})`);
        console.log(`Files to analyze: ${files.length}`);
        console.log(`Minimum score threshold: ${minScore}`);
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            console.log(`\n[${i + 1}/${files.length}] Analyzing: "${file.name}"`);
            
            let matchResult = { score: 0, method: 'none' };
            
            if (type === 'movie') {
                // Multi-strategy matching for movies
                const strategies = [];
                
                // Strategy 1: IMDB ID matching
                const imdbMatch = this.matchesImdbId(file.name, id);
                strategies.push({ ...imdbMatch, strategy: 'imdb', weight: 0.7 });
                
                // Strategy 2: Title matching (if available)
                if (targetTitle) {
                    const titleMatch = this.matchesByTitle(file.name, targetTitle, targetYear);
                    strategies.push({ ...titleMatch, strategy: 'title', weight: 0.6 });
                }
                
                // Strategy 3: Filename analysis
                const filenameScore = this.analyzeFilename(file.name, targetTitle, targetYear);
                strategies.push({ ...filenameScore, strategy: 'filename', weight: 0.4 });
                
                // Find best strategy
                let bestStrategy = strategies.reduce((best, current) => 
                    current.score > best.score ? current : best
                );
                
                // Combine strategies if multiple have good scores
                if (strategies.filter(s => s.score > 0.5).length > 1) {
                    const combinedScore = strategies.reduce((sum, s) => sum + (s.score * s.weight), 0) /
                                        strategies.reduce((sum, s) => sum + s.weight, 0);
                    
                    if (combinedScore > bestStrategy.score) {
                        bestStrategy = {
                            score: combinedScore,
                            method: 'multi_strategy',
                            strategies: strategies.filter(s => s.score > 0.3)
                        };
                    }
                }
                
                matchResult = bestStrategy;
                
            } else if (type === 'series') {
                const [imdbId, season, episode] = id.split(':');
                
                if (season && episode) {
                    const seasonNum = parseInt(season);
                    const episodeNum = parseInt(episode);
                    
                    // Strategy 1: Episode pattern matching
                    const episodeMatch = this.matchesEpisode(file.name, seasonNum, episodeNum);
                    
                    // Strategy 2: IMDB + Episode combined
                    const imdbMatch = this.matchesImdbId(file.name, imdbId);
                    
                    console.log(`  Episode match: ${episodeMatch.score.toFixed(3)} (${episodeMatch.method})`);
                    console.log(`  IMDB match: ${imdbMatch.score.toFixed(3)} (${imdbMatch.method})`);
                    
                    if (episodeMatch.score > 0 && imdbMatch.score > 0) {
                        // Combined scoring for series
                        const combinedScore = (episodeMatch.score * 0.7) + (imdbMatch.score * 0.3);
                        matchResult = {
                            score: combinedScore,
                            method: 'series_combined',
                            details: { episodeMatch, imdbMatch }
                        };
                    } else if (episodeMatch.score > 0.6) {
                        // High confidence episode match
                        matchResult = episodeMatch;
                    } else if (imdbMatch.score > 0.7 && episodeMatch.score > 0.2) {
                        // Good IMDB with weak episode
                        matchResult = {
                            score: (imdbMatch.score * 0.6) + (episodeMatch.score * 0.4),
                            method: 'series_imdb_weighted',
                            details: { episodeMatch, imdbMatch }
                        };
                    } else {
                        matchResult = episodeMatch.score > imdbMatch.score ? episodeMatch : imdbMatch;
                    }
                } else {
                    // Only IMDB matching for series without episode info
                    matchResult = this.matchesImdbId(file.name, imdbId);
                }
            }
            
            console.log(`  Final score: ${matchResult.score.toFixed(3)} (${matchResult.method})`);
            
            if (matchResult.score >= minScore) {
                matches.push({
                    file,
                    match: matchResult
                });
                console.log(`  ✓ PASSED threshold (${minScore})`);
            } else {
                console.log(`  ✗ Below threshold (${minScore})`);
            }
        }
        
        // Sort by score descending, then by method preference
        matches.sort((a, b) => {
            if (Math.abs(a.match.score - b.match.score) < 0.01) {
                // If scores are very close, prefer certain methods
                const methodPriority = {
                    'direct_imdb': 10,
                    'exact_episode': 9,
                    'series_combined': 8,
                    'enhanced_title_match': 7,
                    'multi_strategy': 6,
                    'fuzzy_imdb_exact_length': 5,
                    'fuzzy_episode_exact': 4
                };
                const aPriority = methodPriority[a.match.method] || 0;
                const bPriority = methodPriority[b.match.method] || 0;
                return bPriority - aPriority;
            }
            return b.match.score - a.match.score;
        });
        
        console.log(`\n=== MATCHING COMPLETE ===`);
        console.log(`Found ${matches.length} matches above threshold`);
        
        return matches;
    }

    // Additional filename analysis for context
    analyzeFilename(filename, targetTitle, targetYear) {
        const basename = path.basename(filename, path.extname(filename));
        
        // Check for common indicators of quality matches
        let score = 0;
        const indicators = [];
        
        // Year presence
        if (targetYear && basename.includes(targetYear)) {
            score += 0.2;
            indicators.push('year_match');
        }
        
        // Title keywords
        if (targetTitle) {
            const titleWords = this.normalizeText(targetTitle).split(' ');
            const filenameWords = this.normalizeText(basename).split(' ');
            
            const wordMatches = titleWords.filter(word => 
                filenameWords.some(fw => fw.includes(word) || word.includes(fw))
            );
            
            if (wordMatches.length > 0) {
                score += (wordMatches.length / titleWords.length) * 0.3;
                indicators.push(`${wordMatches.length}_word_matches`);
            }
        }
        
        // Quality indicators (positive)
        const qualityPatterns = /\b(1080p|720p|4k|bluray|web-dl|webrip)\b/i;
        if (qualityPatterns.test(basename)) {
            score += 0.1;
            indicators.push('quality_tags');
        }
        
        // Negative indicators
        const negativePatterns = /\b(sample|trailer|preview|cam|ts|screener)\b/i;
        if (negativePatterns.test(basename)) {
            score -= 0.3;
            indicators.push('negative_indicators');
        }
        
        return {
            score: Math.max(0, Math.min(1, score)),
            method: 'filename_analysis',
            indicators
        };
    }
}

module.exports = FuzzyMatcher;
