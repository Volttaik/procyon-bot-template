// Procyon WhatsApp Bot — Devatron
// Based on Baileys multi-file auth state
// Adapted from silva-md-bot by SilvaTech

'use strict';

const baileys = require('@whiskeysockets/baileys');
const {
    makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    Browsers,
    DisconnectReason,
    isJidGroup,
    isJidBroadcast,
    isJidStatusBroadcast,
    jidNormalizedUser,
    downloadContentFromMessage,
} = baileys;

const fs      = require('fs');
const path    = require('path');
const os      = require('os');
const zlib    = require('zlib');
const express = require('express');
const P       = require('pino');
const { handleMessages, setupConnectionHandlers } = require('./handler');
const { handleStatusBroadcast } = require('./lib/statusManager');
const config  = require('./config');

const prefix     = config.PREFIX || '.';
const tempDir    = path.join(os.tmpdir(), 'procyon-cache');
const sessionDir = path.join(os.tmpdir(), 'procyon-session');
const credsPath  = path.join(sessionDir, 'creds.json');

function createDirIfNotExist(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
createDirIfNotExist(sessionDir);
createDirIfNotExist(tempDir);

// ─── Temp file cleanup ───────────────────────────────────────────────────────
setInterval(() => {
    try {
        fs.readdirSync(tempDir).forEach(file => {
            try { fs.unlinkSync(path.join(tempDir, file)); } catch {}
        });
    } catch {}
}, 10 * 60 * 1000);

// ─── State ───────────────────────────────────────────────────────────────────
let currentQR      = null;
let pairingCode    = null;
let connectionStatus = 'initializing';
let botSock        = null;
let startTime      = Date.now();
let messagesHandled = 0;
let commandsRun    = 0;

function logMessage(type, message) {
    if (!config.DEBUG && type === 'DEBUG') return;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [${type}] ${message}`);
}

// ─── Session restore from SESSION_ID ────────────────────────────────────────
async function loadSession() {
    try {
        const sid = (config.SESSION_ID || '').trim();
        const hasTilde = sid.includes('~');

        if (sid && hasTilde) {
            if (!fs.existsSync(credsPath)) {
                const [header, b64data] = sid.split('~');
                if (header !== 'Procyon' || !b64data) {
                    logMessage('WARN', '⚠️ SESSION_ID format invalid — falling back to QR scan');
                    return;
                }
                const cleanB64 = b64data.replace('...', '');
                const compressedData = Buffer.from(cleanB64, 'base64');
                const decompressedData = zlib.gunzipSync(compressedData);
                fs.writeFileSync(credsPath, decompressedData, 'utf8');
                logMessage('SUCCESS', '✅ Session restored from SESSION_ID');
            } else {
                logMessage('INFO', '📂 Using existing session from disk');
            }
        } else if (fs.existsSync(credsPath)) {
            logMessage('INFO', '📂 Using existing session from disk');
        } else {
            logMessage('WARN', '⚠️ No session found — QR scan required');
        }
    } catch (e) {
        logMessage('ERROR', `Session Error: ${e.message}`);
    }
}

// ─── Export session as Procyon~<b64gz> ───────────────────────────────────────
async function exportSession() {
    try {
        if (!fs.existsSync(credsPath)) return null;
        const raw        = fs.readFileSync(credsPath);
        const compressed = zlib.gzipSync(raw);
        const b64        = compressed.toString('base64');
        return `Procyon~${b64}`;
    } catch { return null; }
}

// ─── Report status to Procyon platform ───────────────────────────────────────
async function reportStatus(status, extra = {}) {
    if (!config.PROCYON_API_URL || !config.PROCYON_BOT_ID || !config.PROCYON_API_KEY) return;
    try {
        const payload = JSON.stringify({ status, botId: config.PROCYON_BOT_ID, ...extra });
        const https   = require('https');
        const http    = require('http');
        const url     = new URL(`${config.PROCYON_API_URL}/api/bots/${config.PROCYON_BOT_ID}/webhook`);
        const mod     = url.protocol === 'https:' ? https : http;
        const req     = mod.request({
            hostname: url.hostname,
            port:     url.port || (url.protocol === 'https:' ? 443 : 80),
            path:     url.pathname,
            method:   'POST',
            headers:  {
                'Content-Type':   'application/json',
                'Content-Length': Buffer.byteLength(payload),
                'X-Procyon-Key':  config.PROCYON_API_KEY,
            },
        });
        req.write(payload);
        req.end();
    } catch {}
}

// ─── Main WhatsApp connection ────────────────────────────────────────────────
async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        logger:  P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS('Safari'),
        auth:    state,
        version,
        syncFullHistory: false,
        generateHighQualityLinkPreview: false,
        getMessage: async () => undefined,
    });

    botSock = sock;
    setupConnectionHandlers(sock);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            try {
                const qrcode = require('qrcode');
                currentQR = await qrcode.toDataURL(qr);
                pairingCode = null;
                connectionStatus = 'awaiting_scan';
                logMessage('INFO', 'QR code generated — waiting for scan');
                await reportStatus('awaiting_scan');
            } catch (e) {
                logMessage('ERROR', `QR generation failed: ${e.message}`);
            }
        }

        if (connection === 'close') {
            connectionStatus = 'disconnected';
            currentQR = null;
            const code = lastDisconnect?.error?.output?.statusCode;
            logMessage('WARN', `Connection closed (${code})`);
            await reportStatus('disconnected');
            if (code !== DisconnectReason.loggedOut) {
                logMessage('INFO', 'Reconnecting in 5s...');
                setTimeout(() => connectToWhatsApp(), 5000);
            } else {
                logMessage('ERROR', 'Logged out — session cleared, restart required');
                connectionStatus = 'logged_out';
            }
        } else if (connection === 'open') {
            connectionStatus = 'connected';
            currentQR  = null;
            pairingCode = null;
            startTime  = Date.now();
            const num  = sock.user?.id?.split('@')[0] || '';
            logMessage('SUCCESS', `✅ Connected as +${num}`);

            const session = await exportSession();
            await reportStatus('connected', { waNumber: num, sessionId: session });

            if (config.OWNER_NUMBER) {
                try {
                    const ownerJid = `${config.OWNER_NUMBER.replace(/\D/g, '')}@s.whatsapp.net`;
                    await sock.sendMessage(ownerJid, {
                        text: `⚡ *${config.BOT_NAME}* is now online!\n\n` +
                              `◈ Prefix: ${prefix}\n` +
                              `◈ Mode: ${config.MODE || 'public'}\n\n` +
                              `_Powered by Procyon — Devatron_`
                    });
                } catch {}
            }
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // ─── Build LID-to-phone map from contacts ────────────────────────────────
    if (!global.lidJidMap) global.lidJidMap = new Map();
    sock.ev.on('contacts.update', (contacts) => {
        for (const c of contacts) {
            if (c.lid && c.id && c.id.includes('@s.whatsapp.net')) {
                global.lidJidMap.set(c.lid, c.id);
            }
        }
    });

    // ─── Status broadcasts ────────────────────────────────────────────────────
    sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
        if (type !== 'notify') return;

        const statusMessages = msgs.filter(m => m.key?.remoteJid === 'status@broadcast');
        const chatMessages   = msgs.filter(m => m.key?.remoteJid !== 'status@broadcast');

        for (const m of statusMessages) {
            try { await handleStatusBroadcast(sock, m); } catch {}
        }

        if (chatMessages.length) {
            messagesHandled += chatMessages.length;
            try { await handleMessages(sock, chatMessages); } catch (e) {
                logMessage('ERROR', `Handler error: ${e.message}`);
            }
        }
    });

    // ─── Anti-ViewOnce ────────────────────────────────────────────────────────
    if (config.ANTIVV) {
        sock.ev.on('messages.upsert', async ({ messages: msgs, type }) => {
            if (type !== 'notify') return;
            for (const m of msgs) {
                const vMsg = m.message?.viewOnceMessageV2?.message ||
                             m.message?.viewOnceMessageV2Extension?.message ||
                             m.message?.viewOnceMessage?.message;
                if (!vMsg || !config.OWNER_NUMBER) continue;

                for (const t of ['imageMessage', 'videoMessage', 'audioMessage']) {
                    if (!vMsg[t]) continue;
                    try {
                        const stream = await downloadContentFromMessage(vMsg[t], t.replace('Message', ''));
                        let buffer = Buffer.from([]);
                        for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
                        const ownerJid = `${config.OWNER_NUMBER.replace(/\D/g, '')}@s.whatsapp.net`;
                        const senderNum = (m.key.participant || m.key.remoteJid || '').split('@')[0];
                        const caption   = `👁️ *Anti-ViewOnce*\n👤 From: @${senderNum}`;
                        if (t === 'imageMessage') {
                            await sock.sendMessage(ownerJid, { image: buffer, caption, mimetype: vMsg[t]?.mimetype || 'image/jpeg' });
                        } else if (t === 'videoMessage') {
                            await sock.sendMessage(ownerJid, { video: buffer, caption, mimetype: vMsg[t]?.mimetype || 'video/mp4' });
                        } else if (t === 'audioMessage') {
                            await sock.sendMessage(ownerJid, { audio: buffer, mimetype: vMsg[t]?.mimetype || 'audio/ogg', ptt: false });
                            await sock.sendMessage(ownerJid, { text: caption });
                        }
                    } catch {}
                    break;
                }
            }
        });
    }
}

// ─── HTTP Server ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        bot:      config.BOT_NAME,
        status:   connectionStatus,
        platform: 'Procyon by Devatron',
        uptime:   Math.floor((Date.now() - startTime) / 1000),
        version:  '2.0',
    });
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', connection: connectionStatus, time: new Date().toISOString() });
});

app.get('/qr', (req, res) => {
    if (connectionStatus === 'connected')
        return res.json({ status: 'connected', qr: null, pairingCode: null });
    if (currentQR)
        return res.json({ status: 'awaiting_scan', qr: currentQR, pairingCode: null });
    if (pairingCode)
        return res.json({ status: 'awaiting_scan', qr: null, pairingCode });
    res.json({ status: connectionStatus, qr: null, pairingCode: null });
});

app.get('/status', (req, res) => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    res.json({
        status:          connectionStatus,
        botName:         config.BOT_NAME,
        prefix:          config.PREFIX,
        mode:            config.MODE,
        uptime,
        messagesHandled,
        commandsRun,
        hasSession:      fs.existsSync(credsPath),
    });
});

app.post('/pair', async (req, res) => {
    const { phone } = req.body;
    if (!phone)       return res.status(400).json({ error: 'phone is required' });
    if (!botSock)     return res.status(503).json({ error: 'Bot not initialized yet' });
    if (connectionStatus === 'connected') return res.json({ status: 'already_connected' });

    try {
        const cleaned = phone.replace(/\D/g, '');
        const code    = await botSock.requestPairingCode(cleaned);
        pairingCode   = code;
        currentQR     = null;
        logMessage('INFO', `Pairing code generated for ${cleaned}: ${code}`);
        res.json({ code, status: 'awaiting_pair' });
    } catch (e) {
        logMessage('ERROR', `Pairing failed: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.get('/session', async (req, res) => {
    const key = req.headers['x-procyon-key'];
    if (key !== config.PROCYON_API_KEY && config.PROCYON_API_KEY)
        return res.status(401).json({ error: 'Unauthorized' });
    const session = await exportSession();
    res.json({ session });
});

app.listen(config.PORT, () => {
    logMessage('INFO', `Procyon Bot HTTP server on port ${config.PORT}`);
});

// ─── Self-pinger to keep service alive ───────────────────────────────────────
if (config.APP_URL) {
    setInterval(() => {
        try {
            const mod = config.APP_URL.startsWith('https') ? require('https') : require('http');
            mod.get(`${config.APP_URL}/health`, () => {}).on('error', () => {});
        } catch {}
    }, 4 * 60 * 1000);
}

// ─── Error handling ───────────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
    logMessage('CRITICAL', `Uncaught Exception: ${err.stack || err.message}`);
    setTimeout(() => connectToWhatsApp().catch(e => logMessage('CRITICAL', `Reconnect failed: ${e.message}`)), 5000);
});
process.on('unhandledRejection', (reason) => {
    logMessage('WARN', `Unhandled Rejection: ${reason}`);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
    console.log('\x1b[36m');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║    ____  ____   ___   ____  __   ___  _  ║');
    console.log('║   |  _ \\|  _ \\ / _ \\ / ___|  \\/ / _ \\| ║');
    console.log('║   | |_) | |_) | | | | |    > < | | | |  ║');
    console.log('║   |  __/|  _ <| |_| | |___ / . \\ |_| |  ║');
    console.log('║   |_|   |_| \\_\\\\___/ \\____/_/ \\_\\___/ ║');
    console.log('║                                           ║');
    console.log('║       WhatsApp Bot  •  by Devatron       ║');
    console.log('╚══════════════════════════════════════════╝');
    console.log('\x1b[0m');
    logMessage('INFO', `Booting ${config.BOT_NAME}...`);
    try {
        await loadSession();
        await connectToWhatsApp();
    } catch (e) {
        logMessage('CRITICAL', `Bot Init Failed: ${e.stack || e.message}`);
        setTimeout(() => connectToWhatsApp(), 5000);
    }
})();

module.exports = app;
