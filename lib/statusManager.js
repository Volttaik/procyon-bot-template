'use strict';

const config = require('../config');

const _seenIds = new Set();

function unwrapStatus(m) {
    let inner = { ...(m.message || {}) };
    if (inner.ephemeralMessage)  inner = { ...(inner.ephemeralMessage.message  || inner) };
    if (inner.viewOnceMessageV2) inner = { ...(inner.viewOnceMessageV2.message || inner) };
    if (inner.viewOnceMessage)   inner = { ...(inner.viewOnceMessage.message   || inner) };
    const ORDER = ['imageMessage','videoMessage','audioMessage','extendedTextMessage','conversation','stickerMessage','documentMessage','reactionMessage'];
    const msgType = ORDER.find(k => inner[k]) || Object.keys(inner)[0] || 'unknown';
    return { inner, msgType };
}

function resolvePhoneJid(key) {
    if (key.participantPn && key.participantPn.includes('@s.whatsapp.net')) return key.participantPn;
    if (key.participant   && key.participant.includes('@s.whatsapp.net'))   return key.participant;
    if (key.participant   && key.participant.includes('@lid') && global.lidJidMap?.has(key.participant)) {
        return global.lidJidMap.get(key.participant);
    }
    return key.participant || null;
}

async function handleStatusBroadcast(sock, m, saveMedia) {
    try {
        const statusId    = m.key.id;
        const participant = m.key.participant;
        if (!participant) return;
        if (_seenIds.has(statusId)) return;
        _seenIds.add(statusId);
        if (_seenIds.size > 500) {
            const first = _seenIds.values().next().value;
            _seenIds.delete(first);
        }

        const shouldSee   = config.AUTO_STATUS_SEEN   !== false;
        const shouldReact = config.AUTO_STATUS_REACT  !== false;
        const shouldReply = config.AUTO_STATUS_REPLY  === true;
        const { msgType } = unwrapStatus(m);

        const phoneJid = resolvePhoneJid(m.key);

        if (shouldSee && phoneJid) {
            try {
                await sock.readMessages([{ ...m.key, participant: phoneJid }]);
            } catch {}
        }

        if (shouldReact && phoneJid) {
            try {
                const emojis = (config.CUSTOM_REACT_EMOJIS || '⚡').split(',').map(e => e.trim()).filter(Boolean);
                const emoji  = emojis[Math.floor(Math.random() * emojis.length)];
                await sock.newsletterReactMessage?.(m.key.remoteJid, m.key.server_id || statusId, emoji).catch(() => {});
            } catch {}
        }

        if (shouldReply && phoneJid && msgType !== 'reactionMessage') {
            try {
                const replyText = config.AUTO_STATUS_MSG || 'Seen ⚡';
                await sock.sendMessage(phoneJid, { text: replyText });
            } catch {}
        }

    } catch (e) {
        console.error('[StatusManager] Error:', e.message);
    }
}

module.exports = { handleStatusBroadcast };
