/**
 * Stremio addon manifest configuration
 */

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

module.exports = manifest;
