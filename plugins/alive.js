'use strict';

const os      = require('os');
const config  = require('../config');
const { performance } = require('perf_hooks');
const { getActiveTheme } = require('../lib/theme');

module.exports = {
    commands:    ['alive', 'bot', 'botinfo'],
    description: 'Show bot status and system information',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { sender, contextInfo }) => {
        const t = getActiveTheme()?.global || {};

        const start  = performance.now();
        const ping   = (performance.now() - start).toFixed(1);

        const upRaw  = process.uptime();
        const h      = Math.floor(upRaw / 3600);
        const m      = Math.floor((upRaw % 3600) / 60);
        const s      = Math.floor(upRaw % 60);
        const uptime = `${h}h ${m}m ${s}s`;

        const totalRam = (os.totalmem() / 1073741824).toFixed(2);
        const usedRam  = ((os.totalmem() - os.freemem()) / 1073741824).toFixed(2);

        const mode    = (config.MODE || 'PUBLIC').toUpperCase();
        const owner   = config.OWNER_NUMBER || 'Unknown';
        const prefix  = config.PREFIX || '.';
        const theme   = (config.THEME || 'procyon').toLowerCase();
        const botName = t.botName || config.BOT_NAME || 'Procyon Bot';
        const footer  = t.footer  || 'Powered by Procyon';
        const alive   = t.alive   || 'All systems operational.';
        const emoji   = t.aliveEmoji || '⚡';
        const imageUrl = config.ALIVE_IMG || t.pic1 || 'https://files.catbox.moe/5uli5p.jpeg';

        const modeEmoji = mode === 'PUBLIC' ? '🟢' : mode === 'PRIVATE' ? '🔒' : '🔵';

        const caption = [
            `${emoji}  *${botName}* — Online!`,
            '',
            `╭──────────────────`,
            `│ 🤖  *Bot:*      ${botName}`,
            `│ 👑  *Owner:*    +${owner}`,
            `│ ⏱️  *Uptime:*   ${uptime}`,
            `│ ⚡  *Speed:*    ${ping} ms`,
            `│ 💾  *RAM:*      ${usedRam} / ${totalRam} GB`,
            `│ ${modeEmoji}  *Mode:*     ${mode}`,
            `│ 🎨  *Theme:*    ${theme}`,
            `│ 🔑  *Prefix:*   ${prefix}`,
            `╰──────────────────`,
            '',
            `❝ ${alive} ❞`,
            '',
            `✦ ${footer}`,
        ].join('\n');

        try {
            await sock.sendMessage(sender, {
                image:   { url: imageUrl },
                caption,
                contextInfo
            }, { quoted: message });
        } catch {
            await sock.sendMessage(sender, { text: caption, contextInfo }, { quoted: message });
        }
    }
};
