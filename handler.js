'use strict';

const fs   = require('fs');
const path = require('path');
const config = require('./config');
const { getStr, getActiveTheme } = require('./lib/theme');

let isJidGroup, areJidsSameUser, jidNormalizedUser;
try {
    ({ isJidGroup, areJidsSameUser, jidNormalizedUser } = require('@whiskeysockets/baileys'));
} catch {
    isJidGroup        = (jid) => typeof jid === 'string' && jid.endsWith('@g.us');
    jidNormalizedUser = (jid) => (jid || '').replace(/:[^@]+@/, '@');
    areJidsSameUser   = (a, b) => jidNormalizedUser(a) === jidNormalizedUser(b);
}

function jidToNum(jid) {
    if (!jid) return '';
    return jidNormalizedUser(jid).split('@')[0].replace(/\D/g, '');
}

function sameNumber(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const minLen = Math.min(a.length, b.length);
    const tail   = Math.min(minLen, 9);
    return tail >= 6 && a.slice(-tail) === b.slice(-tail);
}

const PERM = { PUBLIC: 'public', ADMIN: 'admin', OWNER: 'owner' };

const groupCache = new Map();
const GROUP_CACHE_TTL = 5 * 60 * 1000;

async function getCachedGroupMetadata(sock, jid) {
    const hit = groupCache.get(jid);
    if (hit && Date.now() < hit.expiry) return hit.metadata;
    try {
        const metadata = await sock.groupMetadata(jid);
        groupCache.set(jid, { metadata, expiry: Date.now() + GROUP_CACHE_TTL });
        return metadata;
    } catch { return null; }
}

function bindGroupCacheInvalidation(sock) {
    sock.ev.on('group-participants.update', ({ id }) => groupCache.delete(id));
}

async function safeSend(sock, jid, content, opts = {}) {
    if (!jid || !sock?.sendMessage) return null;
    try { return await sock.sendMessage(jid, content, opts); } catch (err) {
        console.error(`[SafeSend] ${jid}: ${err.message}`);
        return null;
    }
}

const GLOBAL_CONTEXT_INFO = {
    forwardingScore: 999,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: '120363200367779016@newsletter',
        newsletterName: '◢◤ Procyon Network ◢◤',
        serverMessageId: 144
    }
};

const plugins = [];
const pluginDir = path.join(__dirname, 'plugins');

function loadPlugins() {
    if (!fs.existsSync(pluginDir)) return;
    const files = fs.readdirSync(pluginDir).filter(f => f.endsWith('.js'));
    plugins.length = 0;

    for (const file of files) {
        const pluginPath = path.join(pluginDir, file);
        try {
            delete require.cache[require.resolve(pluginPath)];
            const plugin = require(pluginPath);
            const mods = Array.isArray(plugin) ? plugin : [plugin];

            for (const mod of mods) {
                if (!mod) continue;
                if (!mod.commands && mod.name) mod.commands = [mod.name];
                if (!mod.run && typeof mod.handler === 'function') mod.run = mod.handler;
                if (Array.isArray(mod.commands) && mod.commands.length && typeof mod.run === 'function') {
                    plugins.push(mod);
                }
            }
        } catch (err) {
            console.error(`[Plugin] Error loading ${file}: ${err.message}`);
        }
    }
    console.log(`[Plugin] ✅ ${plugins.length} plugins loaded`);
}

loadPlugins();

function setupConnectionHandlers(sock) {
    bindGroupCacheInvalidation(sock);
    sock.ev.on('connection.update', ({ connection }) => {
        if (connection === 'open') console.log('[Handler] WhatsApp connection open.');
    });
    sock.ev.on('group-participants.update', async (update) => {
        for (const p of plugins) {
            if (typeof p.onGroupParticipantsUpdate !== 'function') continue;
            try { await p.onGroupParticipantsUpdate(sock, update); } catch {}
        }
    });
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) =>
        Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
    );
    for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
    return dp[m][n];
}

function predictCommand(typed, allPlugins) {
    const flat = [];
    for (const plugin of allPlugins)
        for (const cmd of (plugin.commands || []))
            flat.push(cmd);
    let best = null, bestDist = Infinity;
    for (const cmd of flat) {
        const d = levenshtein(typed, cmd);
        if (d < bestDist && d <= 3) { best = cmd; bestDist = d; }
    }
    return best;
}

const RECORDING_CMDS = new Set(['tts','toaudio','convert','sticker','togif','tojpeg']);

async function handleMessages(sock, messages) {
    for (const message of messages) {
        try {
            if (!message.message) continue;

            const jid     = message.key.remoteJid;
            const isGroup = isJidGroup(jid);
            const fromMe  = message.key.fromMe;
            if (!jid) continue;

            const isStatus   = jid === 'status@broadcast';
            const senderJid  = isGroup ? (message.key.participant || '') : jid;
            const senderNum  = jidToNum(senderJid);
            const botNum     = jidToNum(sock.user?.id || '');
            const ownerNum   = jidToNum(config.OWNER_NUMBER || '');
            const isOwner    = sameNumber(senderNum, ownerNum) || sameNumber(senderNum, botNum);

            if (isStatus) continue;

            if (config.ALWAYS_ONLINE && !fromMe) {
                try { await sock.sendPresenceUpdate('available', jid); } catch {}
            }

            if (config.READ_MESSAGE && !fromMe) {
                try { await sock.readMessages([message.key]); } catch {}
            }

            const msgContent =
                message.message?.conversation ||
                message.message?.extendedTextMessage?.text ||
                message.message?.imageMessage?.caption ||
                message.message?.videoMessage?.caption ||
                message.message?.documentMessage?.caption || '';

            const prefixes = Array.isArray(config.PREFIX)
                ? config.PREFIX
                : (config.PREFIX || '.').split(',').map(p => p.trim());

            const matchedPrefix = prefixes.find(p => msgContent.trimStart().startsWith(p));
            if (!matchedPrefix) continue;

            const body    = msgContent.trimStart().slice(matchedPrefix.length).trim();
            const parts   = body.split(/\s+/);
            const command = parts[0].toLowerCase();
            const args    = parts.slice(1);

            if (!command) continue;

            if (config.AUTO_TYPING && !fromMe) {
                try { await sock.sendPresenceUpdate('composing', jid); } catch {}
            }

            let groupMetadata = null;
            let isAdmin       = false;
            let isBotAdmin    = false;

            if (isGroup) {
                groupMetadata = await getCachedGroupMetadata(sock, jid);
                if (groupMetadata) {
                    const admins = groupMetadata.participants.filter(p => p.admin).map(p => jidNormalizedUser(p.id));
                    isAdmin    = admins.some(a => areJidsSameUser(a, senderJid));
                    isBotAdmin = admins.some(a => areJidsSameUser(a, sock.user?.id || ''));
                }
            }

            const contextInfo = GLOBAL_CONTEXT_INFO;
            const th = getActiveTheme()?.global || {};

            const sendReply = async (text) => safeSend(sock, jid, { text, contextInfo }, { quoted: message });

            let plugin = plugins.find(p => (p.commands || []).includes(command));
            let resolvedCommand = command;
            let predictionNote = null;

            if (!plugin) {
                const suggested = predictCommand(command, plugins);
                if (suggested) {
                    const suggestedPlugin = plugins.find(p => (p.commands || []).includes(suggested));
                    if (suggestedPlugin) {
                        predictionNote = `💡 Did you mean *${matchedPrefix}${suggested}*?`;
                        plugin = suggestedPlugin;
                        resolvedCommand = suggested;
                    }
                }
            }

            if (!plugin) continue;

            const perm = plugin.permission || PERM.PUBLIC;

            if (!isGroup && plugin.group === true && plugin.private !== true) {
                await sendReply(th.groupOnly || '⛔ This command only works in groups.');
                continue;
            }
            if (isGroup && plugin.private === true && plugin.group !== true) {
                await sendReply(th.privateOnly || '⛔ This command only works in private chats.');
                continue;
            }
            if (perm === PERM.OWNER && !isOwner) {
                await sendReply(th.ownerOnly || '⛔ Owner only command.');
                continue;
            }
            if (perm === PERM.ADMIN && !isAdmin && !isOwner) {
                await sendReply(th.adminOnly || '⛔ Admin only command.');
                continue;
            }

            if (predictionNote) {
                await sendReply(predictionNote);
                predictionNote = null;
            }

            if (config.AUTO_RECORDING && RECORDING_CMDS.has(resolvedCommand)) {
                try { await sock.sendPresenceUpdate('recording', jid); } catch {}
            }

            const ctx = {
                jid,
                sender: senderJid,
                senderNum,
                isOwner,
                isAdmin,
                isBotAdmin,
                isGroup,
                fromMe,
                args,
                command: resolvedCommand,
                prefix: matchedPrefix,
                groupMetadata,
                contextInfo,
                mentionedJid: message.message?.extendedTextMessage?.contextInfo?.mentionedJid || [],
                safeSend: (content, opts = {}) => safeSend(sock, jid, content, opts),
                reply: (text) => sendReply(text),
            };

            try {
                await plugin.run(sock, message, args, ctx);
            } catch (err) {
                console.error(`[Plugin:${command}] ${err.stack || err.message}`);
                const errTheme = getActiveTheme();
                await sendReply([
                    `*${th.botName || 'Procyon Bot'}*`, '',
                    errTheme?.error?.text || `⚠️ Command error: ${err.message || 'unknown error'}`,
                    '', th.footer ? `_${th.footer}_` : ''
                ].filter(Boolean).join('\n'));
            }

            if (config.AUTO_TYPING || config.AUTO_RECORDING) {
                try { await sock.sendPresenceUpdate('paused', jid); } catch {}
            }

        } catch (err) {
            console.error('[Handler] Fatal:', err.stack || err.message);
        }
    }
}

module.exports = { handleMessages, safeSend, setupConnectionHandlers, PERM, plugins };
