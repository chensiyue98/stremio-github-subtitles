/**
 * Movie database and metadata service
 * 
 * This service provides movie metadata functionality using external APIs.
 * It fetches movie information from OMDB API to enable title-based matching.
 */

// Simple in-memory cache to avoid repeated API calls
const movieCache = new Map();

/**
 * Get movie information by IMDB ID
 * @param {string} imdbId - The IMDB ID (e.g., 'tt0111161')
 * @returns {Promise<Object|null>} Movie information or null if not found
 */
async function getMovieInfo(imdbId) {
    // Check cache first
    if (movieCache.has(imdbId)) {
        console.log(`Cache hit for ${imdbId}`);
        return movieCache.get(imdbId);
    }

    try {
        // Fetch from OMDB API (using 'trilogy' as a free API key)
        const response = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=trilogy`);
        const data = await response.json();
        
        if (data.Response === 'True') {
            const movieInfo = {
                imdbId: data.imdbID,
                title: data.Title,
                year: data.Year,
                director: data.Director,
                genre: data.Genre,
                plot: data.Plot,
                runtime: data.Runtime,
                rating: data.imdbRating
            };
            
            // Cache the result
            movieCache.set(imdbId, movieInfo);
            console.log(`Fetched movie info for ${imdbId}: "${movieInfo.title}" (${movieInfo.year})`);
            
            return movieInfo;
        } else {
            console.log(`Movie not found in OMDB for ${imdbId}: ${data.Error}`);
            // Cache null result to avoid repeated failed requests
            movieCache.set(imdbId, null);
            return null;
        }
    } catch (error) {
        console.error(`Error fetching movie info for ${imdbId}:`, error.message);
        return null;
    }
}

/**
 * Search for movies by title (case-insensitive)
 * @param {string} title - Movie title to search for
 * @returns {Promise<Array>} Array of matching movies from cache
 */
async function searchMoviesByTitle(title) {
    const results = [];
    const normalizedTitle = title.toLowerCase();
    
    // Search through cached movies
    for (const [imdbId, movieInfo] of movieCache.entries()) {
        if (movieInfo && movieInfo.title && movieInfo.title.toLowerCase().includes(normalizedTitle)) {
            results.push(movieInfo);
        }
    }
    
    return results;
}

/**
 * Add a new movie to the cache
 * @param {string} imdbId - The IMDB ID
 * @param {Object} movieData - Movie data object
 */
function addMovie(imdbId, movieData) {
    movieCache.set(imdbId, movieData);
    console.log(`Added movie to cache: ${imdbId} - ${movieData.title}`);
}

/**
 * Get all cached movies
 * @returns {Object} Object with all cached movies
 */
function getAllMovies() {
    const movies = {};
    for (const [imdbId, movieInfo] of movieCache.entries()) {
        if (movieInfo) {
            movies[imdbId] = movieInfo;
        }
    }
    return movies;
}

/**
 * Clear the movie cache
 */
function clearCache() {
    movieCache.clear();
    console.log('Movie cache cleared');
}

module.exports = {
    getMovieInfo,
    searchMoviesByTitle,
    addMovie,
    getAllMovies,
    clearCache
};
