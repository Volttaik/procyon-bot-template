'use strict';

const { fmt } = require('../lib/theme');

module.exports = {
    commands: ['kick','promote','demote','tagall','hidetag','link','revoke','groupinfo','setname','setdesc','lock','unlock'],
    description: 'Group management commands',
    permission:  'admin',
    group:       true,
    private:     false,

    run: async (sock, message, args, { jid, sender, isAdmin, isOwner, isBotAdmin, groupMetadata, mentionedJid, contextInfo, safeSend }) => {
        if (!isAdmin && !isOwner) return safeSend({ text: fmt('⛔ Admins only.') }, { quoted: message });

        const rawText = message.message?.extendedTextMessage?.text || message.message?.conversation || '';
        const cmd     = rawText.trim().split(/\s+/)[0].replace(/^[^a-zA-Z]/, '').toLowerCase();
        const text    = args.join(' ').trim();

        const send = (t) => safeSend({ text: fmt(t), contextInfo }, { quoted: message });

        if (!isBotAdmin && !['groupinfo','link','hidetag'].includes(cmd)) {
            return send('⛔ I need to be an admin to perform this action.');
        }

        if (cmd === 'kick') {
            const targets = mentionedJid?.length ? mentionedJid : (text ? [`${text.replace(/\D/g, '')}@s.whatsapp.net`] : []);
            if (!targets.length) return send('❌ Mention a user to kick.');
            for (const t of targets) {
                await sock.groupParticipantsUpdate(jid, [t], 'remove').catch(() => {});
            }
            return send(`✅ Kicked ${targets.length} member(s).`);
        }

        if (cmd === 'promote') {
            const targets = mentionedJid?.length ? mentionedJid : (text ? [`${text.replace(/\D/g, '')}@s.whatsapp.net`] : []);
            if (!targets.length) return send('❌ Mention a user to promote.');
            await sock.groupParticipantsUpdate(jid, targets, 'promote').catch(() => {});
            return send(`✅ Promoted ${targets.length} member(s) to admin.`);
        }

        if (cmd === 'demote') {
            const targets = mentionedJid?.length ? mentionedJid : (text ? [`${text.replace(/\D/g, '')}@s.whatsapp.net`] : []);
            if (!targets.length) return send('❌ Mention a user to demote.');
            await sock.groupParticipantsUpdate(jid, targets, 'demote').catch(() => {});
            return send(`✅ Demoted ${targets.length} member(s).`);
        }

        if (cmd === 'tagall' || cmd === 'hidetag') {
            if (!groupMetadata) return send('❌ Could not fetch group info.');
            const members  = groupMetadata.participants.map(p => p.id);
            const mentions  = members;
            const msgText   = text || `📢 *Attention Everyone!*`;
            if (cmd === 'tagall') {
                await sock.sendMessage(jid, { text: msgText + '\n\n' + members.map(m => `@${m.split('@')[0]}`).join(' '), mentions }, { quoted: message });
            } else {
                await sock.sendMessage(jid, { text: msgText, mentions }, { quoted: message });
            }
            return;
        }

        if (cmd === 'link') {
            try {
                const code = await sock.groupInviteCode(jid);
                return send(`🔗 *Group Link:*\nhttps://chat.whatsapp.com/${code}`);
            } catch (e) { return send(`❌ Failed: ${e.message}`); }
        }

        if (cmd === 'revoke') {
            await sock.groupRevokeInvite(jid).catch(() => {});
            return send('✅ Group invite link revoked.');
        }

        if (cmd === 'groupinfo') {
            if (!groupMetadata) return send('❌ Could not fetch group info.');
            const { subject, desc, participants, creation } = groupMetadata;
            const admins  = participants.filter(p => p.admin).length;
            const members = participants.length;
            const created = creation ? new Date(creation * 1000).toLocaleDateString() : 'Unknown';
            return send([
                `👥 *Group Info*`, '',
                `◈ *Name:* ${subject}`,
                `◈ *Members:* ${members}`,
                `◈ *Admins:* ${admins}`,
                `◈ *Created:* ${created}`,
                desc ? `◈ *Description:*\n${desc}` : '',
            ].filter(Boolean).join('\n'));
        }

        if (cmd === 'setname') {
            if (!text) return send('❌ Provide a new group name.');
            await sock.groupUpdateSubject(jid, text).catch(() => {});
            return send(`✅ Group name changed to *${text}*`);
        }

        if (cmd === 'setdesc') {
            await sock.groupUpdateDescription(jid, text).catch(() => {});
            return send(`✅ Group description updated.`);
        }

        if (cmd === 'lock') {
            await sock.groupSettingUpdate(jid, 'announcement').catch(() => {});
            return send('🔒 Group locked — only admins can send messages.');
        }

        if (cmd === 'unlock') {
            await sock.groupSettingUpdate(jid, 'not_announcement').catch(() => {});
            return send('🔓 Group unlocked — all members can send messages.');
        }
    }
};
