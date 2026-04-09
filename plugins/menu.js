'use strict';

const config  = require('../config');
const { getActiveTheme } = require('../lib/theme');

const CATEGORIES = [
    { icon: '⬇️',  name: 'Downloaders',        cmds: ['yt','tiktok','instagram','facebook'] },
    { icon: '🤖',  name: 'AI & Tools',          cmds: ['ai','translate','define','tts','calc'] },
    { icon: '🌍',  name: 'Search & Info',       cmds: ['wiki','weather','currency','time'] },
    { icon: '🖼️', name: 'Media & Stickers',    cmds: ['sticker','qrcode'] },
    { icon: '👥',  name: 'Group Management',    cmds: ['kick','promote','demote','tagall','hidetag','poll','lock','unlock','link','revoke'] },
    { icon: '👋',  name: 'Welcome & Events',    cmds: ['welcome','goodbye'] },
    { icon: '🛡️', name: 'Protection',          cmds: ['antidelete','antilink','anticall','antivv','blocklist','afk'] },
    { icon: '😄',  name: 'Fun & Games',         cmds: ['joke','fact','riddle','meme','quote','advice','flip'] },
    { icon: '🔒',  name: 'Utilities',           cmds: ['password','morse','base64','tempmail','virus'] },
    { icon: 'ℹ️', name: 'Bot Info',            cmds: ['alive','ping','uptime','owner','menu'] },
];

function box(title, lines) {
    return `╭─「 ${title} 」\n${lines.map(l => `│  ${l}`).join('\n')}\n╰─────────────────────`;
}

module.exports = {
    commands:    ['menu', 'help', 'list'],
    description: 'Show command menu',
    permission:  'public',
    group:       true,
    private:     true,

    run: async (sock, message, args, { sender, contextInfo, jid }) => {
        const t       = getActiveTheme()?.global || {};
        const botName = t.botName || config.BOT_NAME || 'Procyon Bot';
        const footer  = t.footer  || 'Powered by Procyon';
        const pfx     = config.PREFIX || '.';
        const owner   = config.OWNER_NUMBER || 'Unknown';
        const mode    = (config.MODE || 'PUBLIC').toUpperCase();
        const modeEmoji = mode === 'PUBLIC' ? '🟢' : mode === 'PRIVATE' ? '🔒' : '🔵';

        const header = [
            '',
            '⚡ ⚡ ⚡ ⚡ ⚡ ⚡ ⚡ ⚡ ⚡',
            `   *${botName.toUpperCase()}*`,
            '   _The Ultimate WhatsApp Bot_',
            '⚡ ⚡ ⚡ ⚡ ⚡ ⚡ ⚡ ⚡ ⚡',
            '',
        ].join('\n');

        const infoPanel = box('📋 Bot Status', [
            `◆ *Bot:*     ${botName}`,
            `◆ *Owner:*   +${owner}`,
            `◆ *Prefix:*  \`${pfx}\``,
            `◆ *Mode:*    ${modeEmoji} ${mode}`,
        ]);

        const catBlocks = [];
        for (const { icon, name, cmds } of CATEGORIES) {
            catBlocks.push(box(`${icon} ${name}`, cmds.map(c => `◈  \`${pfx}${c}\``)));
        }

        const footerBlock = [
            '',
            `╭────────────────────╮`,
            `│  💡 \`${pfx}help <cmd>\`    │`,
            `╰────────────────────╯`,
            '',
            `> ⚡ _${footer}_`,
        ].join('\n');

        const menuText = `${header}${infoPanel}\n\n${catBlocks.join('\n\n')}\n${footerBlock}`;

        const imageUrl = config.ALIVE_IMG || 'https://files.catbox.moe/5uli5p.jpeg';

        try {
            await sock.sendMessage(sender, {
                image:   { url: imageUrl },
                caption: menuText,
                contextInfo
            }, { quoted: message });
        } catch {
            await sock.sendMessage(sender, { text: menuText, contextInfo }, { quoted: message });
        }
    }
};
