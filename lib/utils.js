'use strict';

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');
const https  = require('https');
const http   = require('http');

module.exports = {
    generateRandomHex: (length = 12) => {
        return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
    },

    getBuffer: async (url, options = {}) => {
        return new Promise((resolve, reject) => {
            const mod = url.startsWith('https') ? https : http;
            const req = mod.get(url, { timeout: options.timeout || 30000, headers: options.headers || {} }, (res) => {
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
                res.on('error', reject);
            });
            req.on('error', reject);
        });
    },

    saveTempFile: async (buffer, ext = 'tmp') => {
        const tempDir = path.join(require('os').tmpdir(), 'procyon-temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
        const filename = `temp_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
        const filepath = path.join(tempDir, filename);
        await fs.promises.writeFile(filepath, buffer);
        return filepath;
    },

    cleanupTempFiles: async (hours = 2) => {
        const tempDir = path.join(require('os').tmpdir(), 'procyon-temp');
        if (!fs.existsSync(tempDir)) return;
        const now = Date.now();
        const threshold = hours * 60 * 60 * 1000;
        try {
            const files = await fs.promises.readdir(tempDir);
            for (const file of files) {
                const filepath = path.join(tempDir, file);
                const stats = await fs.promises.stat(filepath);
                if (now - stats.mtimeMs > threshold) await fs.promises.unlink(filepath).catch(() => {});
            }
        } catch {}
    },

    formatSize: (bytes) => {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    },

    formatDuration: (seconds) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return [h, m, s].map(v => v.toString().padStart(2, '0')).join(':').replace(/^00:/, '');
    },

    sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),

    escapeMarkdown: (text) => String(text).replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&'),
};
