'use strict';

const config = require('../config');
const { fmt } = require('../lib/theme');

const groupSettings = new Map();

function getSettings(jid) {
    if (!groupSettings.has(jid)) groupSettings.set(jid, { welcome: false, goodbye: false, customWelcome: '', customGoodbye: '' });
    return groupSettings.get(jid);
}

module.exports = {
    commands:    ['welcome','goodbye','setwelcome','setgoodbye'],
    description: 'Welcome and goodbye messages for groups',
    permission:  'admin',
    group:       true,
    private:     false,

    onGroupParticipantsUpdate: async (sock, update) => {
        const { id: jid, action, participants } = update;
        const settings = getSettings(jid);

        for (const participant of participants) {
            const num = participant.split('@')[0];

            if (action === 'add' && settings.welcome) {
                const text = settings.customWelcome
                    ? settings.customWelcome.replace('{name}', `@${num}`)
                    : `👋 Welcome to the group, @${num}!\n\n_Powered by ${config.BOT_NAME || 'Procyon Bot'}_`;
                await sock.sendMessage(jid, { text, mentions: [participant] }).catch(() => {});
            }

            if (action === 'remove' && settings.goodbye) {
                const text = settings.customGoodbye
                    ? settings.customGoodbye.replace('{name}', `@${num}`)
                    : `👋 Goodbye, @${num}. We'll miss you!`;
                await sock.sendMessage(jid, { text, mentions: [participant] }).catch(() => {});
            }
        }
    },

    run: async (sock, message, args, { jid, isAdmin, isOwner, safeSend }) => {
        if (!isAdmin && !isOwner) return safeSend({ text: fmt('⛔ Admins only.') }, { quoted: message });
        const settings = getSettings(jid);
        const rawCmd   = (message.message?.extendedTextMessage?.text || message.message?.conversation || '').trim().split(/\s+/)[0].replace(/^[^a-zA-Z]/, '').toLowerCase();
        const sub      = (args[0] || '').toLowerCase();

        if (rawCmd === 'welcome') {
            if (sub === 'on')  { settings.welcome = true;  return safeSend({ text: fmt('👋 *Welcome messages ON*') }, { quoted: message }); }
            if (sub === 'off') { settings.welcome = false; return safeSend({ text: fmt('👋 *Welcome messages OFF*') }, { quoted: message }); }
            return safeSend({ text: fmt(`👋 *Welcome:* ${settings.welcome ? '✅ ON' : '❌ OFF'}\n\nUse .welcome on/off`) }, { quoted: message });
        }

        if (rawCmd === 'goodbye') {
            if (sub === 'on')  { settings.goodbye = true;  return safeSend({ text: fmt('👋 *Goodbye messages ON*') }, { quoted: message }); }
            if (sub === 'off') { settings.goodbye = false; return safeSend({ text: fmt('👋 *Goodbye messages OFF*') }, { quoted: message }); }
            return safeSend({ text: fmt(`👋 *Goodbye:* ${settings.goodbye ? '✅ ON' : '❌ OFF'}\n\nUse .goodbye on/off`) }, { quoted: message });
        }

        if (rawCmd === 'setwelcome') {
            const msg = args.join(' ').trim();
            if (!msg) return safeSend({ text: fmt('❌ Provide a message. Use {name} as placeholder.\nExample: .setwelcome Welcome {name}!') }, { quoted: message });
            settings.customWelcome = msg;
            return safeSend({ text: fmt(`✅ Welcome message set:\n${msg}`) }, { quoted: message });
        }

        if (rawCmd === 'setgoodbye') {
            const msg = args.join(' ').trim();
            if (!msg) return safeSend({ text: fmt('❌ Provide a message. Use {name} as placeholder.\nExample: .setgoodbye Bye {name}!') }, { quoted: message });
            settings.customGoodbye = msg;
            return safeSend({ text: fmt(`✅ Goodbye message set:\n${msg}`) }, { quoted: message });
        }
    }
};
