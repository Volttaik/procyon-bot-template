# Procyon WhatsApp Bot

> Part of the [Procyon Bot Platform](https://procyon.replit.app) by Devatron

This is the auto-deployable WhatsApp bot template used by the Procyon platform. It is deployed to [Render](https://render.com) as a persistent web service after a user pairs their WhatsApp account.

## Features
- QR code & phone number pairing
- Session persistence via `SESSION_ID` environment variable
- Plugin system: alive, ping, menu, group management, fun commands
- Status broadcast viewer
- Anti-ViewOnce
- Automatic webhook reporting to Procyon API

## Environment Variables
| Variable | Description |
|----------|-------------|
| `SESSION_ID` | Procyon session string (auto-injected by platform) |
| `BOT_NAME` | Display name of the bot |
| `PREFIX` | Command prefix (default `.`) |
| `MODE` | `public` or `private` |
| `OWNER_NUMBER` | Owner WhatsApp number with country code |
| `PROCYON_BOT_ID` | Bot ID (auto-injected) |
| `PROCYON_API_URL` | Platform API URL (auto-injected) |
| `PROCYON_API_KEY` | Platform API key (auto-injected) |

## Deployment
This template is intended to be deployed automatically by the Procyon platform. Manual deployment is also supported via Render.

---
_Powered by Procyon — Devatron_
