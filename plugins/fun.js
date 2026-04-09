'use strict';

const { fmt } = require('../lib/theme');

const jokes = [
    "Why don't scientists trust atoms? Because they make up everything! 😄",
    "What do you call a fake noodle? An impasta! 🍝",
    "Why did the scarecrow win an award? Because he was outstanding in his field! 🌾",
    "I told my wife she was drawing her eyebrows too high. She looked surprised! 😲",
    "What do you call cheese that isn't yours? Nacho cheese! 🧀",
    "Why can't you give Elsa a balloon? Because she'll let it go! ❄️",
    "I'm reading a book on anti-gravity. It's impossible to put down! 📚",
    "Why did the bicycle fall over? Because it was two-tired! 🚲",
    "What time did the man go to the dentist? Tooth-hurty! 🦷",
    "Why don't eggs tell jokes? They'd crack each other up! 🥚",
];

const facts = [
    "🌍 Honey never spoils. Archaeologists have found 3000-year-old honey in Egyptian tombs, still perfectly edible.",
    "🐘 Elephants are the only animals that can't jump.",
    "🌊 The Pacific Ocean is larger than all the Earth's landmass combined.",
    "🧠 Your brain generates enough electricity to power a small light bulb.",
    "⚡ Lightning strikes the Earth about 100 times every second.",
    "🦋 A group of butterflies is called a 'flutter'.",
    "🎵 Music can help plants grow faster.",
    "🔮 Cleopatra lived closer in time to the Moon landing than to the construction of the Great Pyramid.",
    "🐬 Dolphins sleep with one eye open.",
    "🌙 A day on Venus is longer than a year on Venus.",
];

const quotes = [
    "\"The only way to do great work is to love what you do.\" — Steve Jobs",
    "\"In the middle of every difficulty lies opportunity.\" — Albert Einstein",
    "\"It does not matter how slowly you go as long as you do not stop.\" — Confucius",
    "\"Life is what happens when you're busy making other plans.\" — John Lennon",
    "\"The future belongs to those who believe in the beauty of their dreams.\" — Eleanor Roosevelt",
    "\"Strive not to be a success, but rather to be of value.\" — Albert Einstein",
    "\"Two roads diverged in a wood and I took the one less traveled by.\" — Robert Frost",
    "\"The best time to plant a tree was 20 years ago. The second best time is now.\" — Chinese Proverb",
];

const riddles = [
    { q: "I speak without a mouth and hear without ears. I have no body but come alive with wind. What am I?", a: "An echo" },
    { q: "The more you take, the more you leave behind. What am I?", a: "Footsteps" },
    { q: "I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. I have roads, but no cars drive there. What am I?", a: "A map" },
    { q: "What has hands but can't clap?", a: "A clock" },
    { q: "What gets wetter as it dries?", a: "A towel" },
];

module.exports = [
    {
        commands:   ['joke'],
        description: 'Get a random joke',
        permission: 'public', group: true, private: true,
        run: async (sock, message, args, { jid, contextInfo, safeSend }) => {
            const joke = jokes[Math.floor(Math.random() * jokes.length)];
            await safeSend({ text: fmt(`😂 *Random Joke*\n\n${joke}`), contextInfo }, { quoted: message });
        }
    },
    {
        commands:   ['fact'],
        description: 'Get a random fun fact',
        permission: 'public', group: true, private: true,
        run: async (sock, message, args, { jid, contextInfo, safeSend }) => {
            const fact = facts[Math.floor(Math.random() * facts.length)];
            await safeSend({ text: fmt(`🌟 *Fun Fact*\n\n${fact}`), contextInfo }, { quoted: message });
        }
    },
    {
        commands:   ['quote'],
        description: 'Get an inspiring quote',
        permission: 'public', group: true, private: true,
        run: async (sock, message, args, { jid, contextInfo, safeSend }) => {
            const quote = quotes[Math.floor(Math.random() * quotes.length)];
            await safeSend({ text: fmt(`💭 *Quote of the Moment*\n\n${quote}`), contextInfo }, { quoted: message });
        }
    },
    {
        commands:   ['riddle'],
        description: 'Get a riddle',
        permission: 'public', group: true, private: true,
        run: async (sock, message, args, { jid, contextInfo, safeSend }) => {
            const r = riddles[Math.floor(Math.random() * riddles.length)];
            if (args[0] === 'answer' || args[0] === 'ans') {
                await safeSend({ text: fmt(`💡 *Answer:* ${r.a}`), contextInfo }, { quoted: message });
            } else {
                await safeSend({ text: fmt(`🧩 *Riddle*\n\n${r.q}\n\n_Reply with \`.riddle answer\` to reveal the answer._`), contextInfo }, { quoted: message });
            }
        }
    },
    {
        commands:   ['flip'],
        description: 'Flip a coin',
        permission: 'public', group: true, private: true,
        run: async (sock, message, args, { jid, contextInfo, safeSend }) => {
            const result = Math.random() < 0.5 ? '🪙 *Heads!*' : '🪙 *Tails!*';
            await safeSend({ text: fmt(result), contextInfo }, { quoted: message });
        }
    },
    {
        commands:   ['calc'],
        description: 'Calculate a math expression',
        permission: 'public', group: true, private: true,
        run: async (sock, message, args, { jid, contextInfo, safeSend }) => {
            if (!args.length) return safeSend({ text: fmt('❌ Usage: `.calc 2 + 2`') }, { quoted: message });
            try {
                const expr   = args.join(' ').replace(/[^0-9+\-*/.%()\s]/g, '');
                const result = Function('"use strict"; return (' + expr + ')')();
                await safeSend({ text: fmt(`🧮 *Calculator*\n\n\`${expr}\` = *${result}*`), contextInfo }, { quoted: message });
            } catch {
                await safeSend({ text: fmt('❌ Invalid expression.') }, { quoted: message });
            }
        }
    },
    {
        commands:   ['advice'],
        description: 'Get random life advice',
        permission: 'public', group: true, private: true,
        run: async (sock, message, args, { jid, contextInfo, safeSend }) => {
            const advices = [
                "Take care of yourself first — you can't pour from an empty cup.",
                "Start before you're ready. Done is better than perfect.",
                "Kindness costs nothing but means everything.",
                "Every expert was once a beginner.",
                "Small consistent actions lead to big changes over time.",
                "Invest in relationships — they're the real currency of life.",
                "Learn from yesterday, live for today, hope for tomorrow.",
                "The best view comes after the hardest climb.",
            ];
            const adv = advices[Math.floor(Math.random() * advices.length)];
            await safeSend({ text: fmt(`💡 *Advice*\n\n${adv}`), contextInfo }, { quoted: message });
        }
    },
];
