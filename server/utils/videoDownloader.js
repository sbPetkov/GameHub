const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

class VideoDownloader {
    constructor(tempDir) {
        this.tempDir = tempDir;
        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        } else {
            // Clean up on start to remove orphaned files from previous runs
            this.cleanupAll();
        }
    }

    cleanupAll() {
        try {
            const files = fs.readdirSync(this.tempDir);
            for (const file of files) {
                const curPath = path.join(this.tempDir, file);
                fs.rmSync(curPath, { recursive: true, force: true });
            }
            console.log(`[VideoDownloader] Startup cleanup: Cleared ${this.tempDir}`);
        } catch (err) {
            console.error(`[VideoDownloader] Cleanup failed:`, err);
        }
    }

    /**
     * Downloads a video from YouTube.
     * @param {string} url - The YouTube URL.
     * @param {string} roomId - The room ID (used for subfolder).
     * @param {string} filename - The output filename (e.g. 'song_1.mp4').
     * @returns {Promise<string>} - Resolves with full file path.
     */
    downloadVideo(url, roomId, filename) {
        return new Promise((resolve, reject) => {
            const outputDir = path.join(this.tempDir, roomId);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const outputPath = path.join(outputDir, filename);

            // Check if file already exists
            if (fs.existsSync(outputPath)) {
                console.log(`[VideoDownloader] File already exists: ${outputPath}`);
                return resolve(outputPath);
            }

            // Command to download:
            // -f "bestvideo[height<=480]+bestaudio/best[height<=480]" : Limit to 480p
            // -o : Output template
            // --no-playlist : Ensure single video
            // --merge-output-format mp4 : Ensure mp4 container
            const command = `yt-dlp -f "bestvideo[height<=480]+bestaudio/best[height<=480]" --merge-output-format mp4 -o "${outputPath}" --no-playlist "${url}"`;

            console.log(`[VideoDownloader] Starting download: ${url} -> ${outputPath}`);

            // Get Title first (or in parallel, but we need it for the return)
            // efficient way: just run download. Then separate command for title? 
            // yt-dlp is slow to start. 
            // Let's just run --get-title separately for now. It's safer.
            
            this.getVideoTitle(url).then(title => {
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`[VideoDownloader] Error: ${error.message}`);
                        return reject(error);
                    }
                    if (fs.existsSync(outputPath)) {
                        console.log(`[VideoDownloader] Download complete: ${outputPath}`);
                        resolve({ path: outputPath, title: title.trim() });
                    } else {
                        reject(new Error("File was not created"));
                    }
                });
            }).catch(err => {
                 console.error(`[VideoDownloader] Failed to get title: ${err.message}`);
                 // Fallback if title fetch fails but we want to try download?
                 // For now reject.
                 reject(err);
            });
        });
    }

    getVideoTitle(url) {
        return new Promise((resolve, reject) => {
            exec(`yt-dlp --get-title --no-playlist "${url}"`, (error, stdout, stderr) => {
                if (error) {
                    return reject(error);
                }
                resolve(stdout.trim());
            });
        });
    }

    cleanupRoom(roomId) {
        const roomDir = path.join(this.tempDir, roomId);
        if (fs.existsSync(roomDir)) {
            fs.rmSync(roomDir, { recursive: true, force: true });
            console.log(`[VideoDownloader] Cleaned up directory: ${roomDir}`);
        }
    }
}

module.exports = new VideoDownloader(path.join(__dirname, '../data/temp'));
