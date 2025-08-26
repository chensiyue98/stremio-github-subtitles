const { serveHTTP } = require('./index');

const PORT = process.env.PORT || 3000;

console.log(`🚀 Starting Stremio GitHub Subtitles addon on port ${PORT}`);
console.log(`📋 Manifest: http://localhost:${PORT}/manifest.json`);
console.log(`🔧 Configure at: http://localhost:${PORT}/configure`);

serveHTTP({ port: PORT });
