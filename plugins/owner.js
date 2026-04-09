'use strict';

const fs     = require('fs');
const path   = require('path');
const config = require('../config');
const { fmt } = require('../lib/theme');

const SUDO_FILE = path.join(require('os').tmpdir(), 'procyon-data', 'sudo.json');
function loadSudo()     { try { return JSON.parse(fs.readFileSync(SUDO_FILE, 'utf8')); } catch { return []; } }
function saveSudo(list) { fs.mkdirSync(path.dirname(SUDO_FILE), { recursive: true }); fs.writeFileSync(SUDO_FILE, JSON.stringify(list, null, 2)); }

module.exports = {
    commands: ['block','unblock','mygroups','setbotname','setmode','setprefix','setsudo','delsudo','getsudo','join','cmd','eval'],
    description: 'Owner control commands',
    permission:  'owner',
    group:       true,
    private:     true,

    run: async (sock, message, args, { jid, sender, contextInfo, isOwner, mentionedJid }) => {
        const send = (t) => sock.sendMessage(jid, { text: fmt(t), contextInfo }, { quoted: message });

        if (!isOwner) return send('⛔ This command is for the owner only.');

        const rawText = message.message?.extendedTextMessage?.text || message.message?.conversation || '';
        const cmd     = rawText.trim().split(/\s+/)[0].replace(/^[^a-zA-Z0-9]/, '').toLowerCase();
        const text    = args.join(' ').trim();

        if (cmd === 'block') {
            const target = mentionedJid?.[0] || (text ? `${text.replace(/\D/g, '')}@s.whatsapp.net` : null);
            if (!target) return send('❌ Usage: `.block @user` or `.block <number>`');
            await sock.updateBlockStatus(target, 'block').catch(() => {});
            return send(`🚫 Blocked +${target.split('@')[0]}`);
        }

        if (cmd === 'unblock') {
            const target = mentionedJid?.[0] || (text ? `${text.replace(/\D/g, '')}@s.whatsapp.net` : null);
            if (!target) return send('❌ Usage: `.unblock @user` or `.unblock <number>`');
            await sock.updateBlockStatus(target, 'unblock').catch(() => {});
            return send(`✅ Unblocked +${target.split('@')[0]}`);
        }

        if (cmd === 'mygroups') {
            try {
                const groups = await sock.groupFetchAllParticipating();
                const list   = Object.values(groups).map(g => `◈ ${g.subject} (${g.participants.length} members)`).join('\n');
                return send(`👥 *My Groups (${Object.keys(groups).length})*\n\n${list}`);
            } catch (e) {
                return send(`❌ Failed: ${e.message}`);
            }
        }

        if (cmd === 'setbotname') {
            if (!text) return send('❌ Provide a new bot name.');
            config.BOT_NAME = text;
            return send(`✅ Bot name changed to *${text}*`);
        }

        if (cmd === 'setmode') {
            const mode = text.toLowerCase();
            if (!['public','private','group'].includes(mode)) return send('❌ Mode must be: public, private, or group');
            config.MODE = mode;
            return send(`✅ Mode set to *${mode}*`);
        }

        if (cmd === 'setprefix') {
            if (!text) return send('❌ Provide a new prefix.');
            config.PREFIX = text;
            return send(`✅ Prefix changed to *${text}*`);
        }

        if (cmd === 'setsudo') {
            const target = mentionedJid?.[0] || (text ? `${text.replace(/\D/g, '')}@s.whatsapp.net` : null);
            if (!target) return send('❌ Mention a user or provide a number.');
            const sudo = loadSudo();
            if (!sudo.includes(target)) { sudo.push(target); saveSudo(sudo); }
            return send(`✅ Added +${target.split('@')[0]} to sudo list`);
        }

        if (cmd === 'delsudo') {
            const target = mentionedJid?.[0] || (text ? `${text.replace(/\D/g, '')}@s.whatsapp.net` : null);
            if (!target) return send('❌ Mention a user or provide a number.');
            const sudo   = loadSudo().filter(s => s !== target);
            saveSudo(sudo);
            return send(`✅ Removed +${target.split('@')[0]} from sudo list`);
        }

        if (cmd === 'getsudo') {
            const sudo = loadSudo();
            if (!sudo.length) return send('ℹ️ No sudo users set.');
            return send(`🔑 *Sudo Users:*\n${sudo.map(s => `◈ +${s.split('@')[0]}`).join('\n')}`);
        }

        if (cmd === 'join') {
            if (!text) return send('❌ Provide a group invite link.');
            try {
                const code = text.split('chat.whatsapp.com/').pop()?.trim();
                if (!code) return send('❌ Invalid link format.');
                await sock.groupAcceptInvite(code);
                return send('✅ Joined group successfully.');
            } catch (e) {
                return send(`❌ Failed to join: ${e.message}`);
            }
        }

        if (cmd === 'cmd' || cmd === 'eval') {
            if (!text) return send('❌ Provide code to execute.');
            try {
                const result = eval(text);
                const output = result instanceof Promise ? await result : result;
                return send(`✅ *Result:*\n\`\`\`\n${JSON.stringify(output, null, 2)}\n\`\`\``);
            } catch (e) {
                return send(`❌ Error: ${e.message}`);
            }
        }
    }
};
