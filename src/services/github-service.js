/**
 * GitHub API service for fetching subtitle files
 */

const fetch = require('node-fetch');

/**
 * Fetch files from GitHub repository recursively
 * @param {string} repo - Repository in format 'owner/repo'
 * @param {string} path - Path within the repository (optional)
 * @returns {Promise<Array>} Array of subtitle files with metadata
 */
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
            
            if (item.type === 'file' && isSubtitleFile(item.name)) {
                console.log(`  Found subtitle file: ${item.name}`);
                files.push({
                    name: item.name,
                    path: item.path,
                    download_url: item.download_url,
                    size: item.size,
                    sha: item.sha
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

/**
 * Check if a file is a subtitle file based on its extension
 * @param {string} filename - The filename to check
 * @returns {boolean} True if it's a subtitle file
 */
function isSubtitleFile(filename) {
    return /\.(srt|vtt|ass|ssa|sub)$/i.test(filename);
}

/**
 * Get supported subtitle file extensions
 * @returns {Array<string>} Array of supported extensions
 */
function getSupportedExtensions() {
    return ['srt', 'vtt', 'ass', 'ssa', 'sub'];
}

/**
 * Validate GitHub repository format
 * @param {string} repo - Repository string to validate
 * @returns {boolean} True if valid format (owner/repo)
 */
function validateRepoFormat(repo) {
    if (!repo || typeof repo !== 'string') {
        return false;
    }
    
    const parts = repo.split('/');
    return parts.length === 2 && parts[0].length > 0 && parts[1].length > 0;
}

/**
 * Fetch repository information
 * @param {string} repo - Repository in format 'owner/repo'
 * @returns {Promise<Object|null>} Repository information or null if error
 */
async function fetchRepoInfo(repo) {
    try {
        if (!validateRepoFormat(repo)) {
            throw new Error('Invalid repository format. Use owner/repo');
        }
        
        const url = `https://api.github.com/repos/${repo}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`Repository not found or not accessible: ${response.status}`);
        }
        
        const data = await response.json();
        return {
            name: data.name,
            fullName: data.full_name,
            description: data.description,
            isPrivate: data.private,
            defaultBranch: data.default_branch,
            language: data.language,
            size: data.size,
            updatedAt: data.updated_at
        };
    } catch (error) {
        console.error('Error fetching repository info:', error);
        return null;
    }
}

module.exports = {
    fetchGitHubFiles,
    isSubtitleFile,
    getSupportedExtensions,
    validateRepoFormat,
    fetchRepoInfo
};
