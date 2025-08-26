# Stremio GitHub Subtitles Addon

A Stremio addon that fetches subtitles from public GitHub repositories. This addon is completely stateless and allows users to specify any public GitHub repository containing subtitle files.

## Features

- 📁 Reads subtitle files from any public GitHub repository
- 🌍 Supports multiple subtitle formats (SRT, VTT, ASS, SSA, SUB)
- 🎯 Smart filename matching for movies and TV series
- 🗣️ Automatic language detection from filenames
- ⚡ Stateless operation - no database required
- 🔄 Real-time fetching from GitHub API

## Supported Subtitle Formats

- `.srt` - SubRip
- `.vtt` - WebVTT
- `.ass` - Advanced SubStation Alpha
- `.ssa` - SubStation Alpha
- `.sub` - MicroDVD

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd stremio-github-subtitles
```

2. Install dependencies:
```bash
npm install
```

3. Start the addon:
```bash
npm start
```

The addon will be available at `http://localhost:3000`

## Usage

1. **Start the addon** by running `npm start`

2. **Configure the addon** by visiting `http://localhost:3000/configure`

3. **Set up the GitHub repository**:
   - **GitHub Repository**: Enter the repository in format `owner/repo` (e.g., `OpenSubtitles/opensubtitles-com`)
   - **Subtitles Path** (optional): Specify a subdirectory if subtitles are not in the root (e.g., `subtitles/`)

4. **Install in Stremio**:
   - Copy the configuration URL provided
   - In Stremio, go to Addons → Add Addon → paste the URL

## Subtitle File Naming Conventions

The addon uses smart filename matching to identify the correct subtitles:

### Movies
- `movie.title.2023.srt`
- `tt1234567.srt` (IMDB ID)
- `movie.title.2023.en.srt` (with language)

### TV Series
- `series.s01e01.srt`
- `tt1234567.s01e01.srt`
- `series.1x01.srt`
- `series.s01e01.en.srt` (with language)

### Language Detection
The addon automatically detects languages from filenames:
- `en`, `eng`, `english` → English
- `es`, `esp`, `spanish` → Spanish
- `fr`, `fre`, `french` → French
- `de`, `ger`, `german` → German
- `it`, `ita`, `italian` → Italian
- `pt`, `por`, `portuguese` → Portuguese
- `ru`, `rus`, `russian` → Russian
- `zh`, `chi`, `chinese` → Chinese
- `ja`, `jpn`, `japanese` → Japanese
- `ko`, `kor`, `korean` → Korean
- `ar`, `ara`, `arabic` → Arabic
- `hi`, `hin`, `hindi` → Hindi

## Repository Structure Examples

### Example 1: Movies by IMDB ID
```
subtitles/
├── movies/
│   ├── tt0111161.srt          # The Shawshank Redemption
│   ├── tt0111161.es.srt       # Spanish subtitles
│   ├── tt0068646.srt          # The Godfather
│   └── tt0068646.fr.srt       # French subtitles
```

### Example 2: TV Series
```
subtitles/
├── series/
│   ├── breaking-bad/
│   │   ├── tt0903747.s01e01.srt
│   │   ├── tt0903747.s01e02.srt
│   │   └── tt0903747.s01e01.es.srt
│   └── game-of-thrones/
│       ├── tt0944947.s01e01.srt
│       └── tt0944947.s01e02.srt
```

### Example 3: Mixed Structure
```
repo/
├── movies/
│   └── 2023/
│       ├── oppenheimer.tt15398776.srt
│       └── barbie.tt1517268.srt
├── tv-shows/
│   └── stranger-things/
│       ├── s01/
│       │   ├── tt4574334.s01e01.srt
│       │   └── tt4574334.s01e02.srt
│       └── s02/
│           ├── tt4574334.s02e01.srt
│           └── tt4574334.s02e02.srt
```

## Configuration Options

### GitHub Repository (Required)
Format: `owner/repository`

Examples:
- `OpenSubtitles/opensubtitles-com`
- `your-username/my-subtitles`
- `community/movie-subtitles`

### Subtitles Path (Optional)
Specify a subdirectory within the repository where subtitles are stored.

Examples:
- `subtitles/`
- `subs/movies/`
- `content/subtitles/`

## API Endpoints

- `GET /manifest.json` - Addon manifest
- `GET /configure` - Configuration page
- `GET /subtitles/:type/:id.json` - Fetch subtitles for content

## Environment Variables

- `PORT` - Server port (default: 3000)

## Development

For development with auto-reload:
```bash
npm run dev
```

## How It Works

1. **Configuration**: User specifies a GitHub repository and optional path
2. **Content Request**: When Stremio requests subtitles for content, the addon:
   - Fetches the repository file tree using GitHub API
   - Recursively scans for subtitle files
   - Matches filenames against the requested content (IMDB ID, season/episode)
   - Returns direct download URLs to matching subtitle files
3. **Delivery**: Stremio downloads subtitles directly from GitHub's raw content URLs

## GitHub API Rate Limits

This addon uses the GitHub API without authentication, which has a rate limit of 60 requests per hour per IP address. For heavy usage, consider:

1. Adding GitHub token authentication
2. Implementing caching mechanisms
3. Using a proxy or CDN

## Troubleshooting

### No subtitles found
- Verify the GitHub repository exists and is public
- Check that subtitle files follow naming conventions
- Ensure IMDB IDs in filenames match the content
- Check the browser console for error messages

### GitHub API errors
- Verify repository name format (`owner/repo`)
- Check if repository is public
- Ensure you haven't exceeded GitHub API rate limits

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License
