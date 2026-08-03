# NextGPT — The Next Generation AI Assistant

A production-ready AI website built with plain HTML, CSS and vanilla JavaScript on an Express backend, powered by **OpenRouter** using the free **`openai/gpt-oss-20b:free`** model.

All CSS and JavaScript live inside the HTML pages. The only JavaScript file outside HTML is `server.js`.

## Pages

| Route | File | Purpose |
| --- | --- | --- |
| `/` or `/home` | `index.html` | Landing page: animated background, floating AI particles, glassmorphism, features, pricing, FAQ, footer |
| `/auth` | `auth.html` | Login, register, forgot password, remember me, validation (localStorage only) |
| `/chat` | `chat.html` | Streaming chat, markdown, syntax highlighting, sidebar, history, export/import |
| `/workspace` | `workspace.html` | Code generation for 30+ languages: generate, explain, fix, optimise, improve, convert |
| `/settings` | `settings.html` | Profile picture, banner, username, display name, password, theme, language, notifications, passkeys, biometrics |

## Features

- Dark mode (default) and light mode with animated switching, remembered across pages
- Server-sent-events streaming with a stop button, typing/thinking animation and auto scroll
- Markdown rendering (headings, lists, tables, quotes, links) with fenced code blocks and per-block copy buttons
- Multiple conversations: new, rename, delete, search, export and import as JSON
- Message actions: copy, edit and resend, regenerate, delete, timestamps
- Workspace: language selector, task modes, fullscreen editor, dark syntax highlighting, copy and download
- Security: helmet-like headers, in-memory rate limiting, input validation and sanitisation, API key never exposed to the browser
- Everything user-facing is stored in `localStorage`: theme, chats, history, users, settings, workspace history, profile, banner, username, language

## Installation

```bash
git clone https://github.com/<your-user>/nextgpt.git
cd nextgpt
npm install
cp .env.example .env
```

Then add your OpenRouter key to `.env`:

```env
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENROUTER_MODEL=openai/gpt-oss-20b:free
PORT=3000
```

## Development

```bash
npm run dev     # node --watch server.js
npm start       # production start
```

Open http://localhost:3000

## Environment variables

| Name | Required | Description |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | Your OpenRouter API key. Read only from `process.env`, never hardcoded, never sent to the browser. |
| `OPENROUTER_MODEL` | no | Defaults to `openai/gpt-oss-20b:free`. |
| `PORT` | no | Local port, defaults to `3000`. |

## OpenRouter configuration

1. Create an account at https://openrouter.ai
2. Go to **Keys** and create a new API key
3. Put it in `.env` locally, and in Vercel's project environment variables for production

The browser only ever calls `POST /api/chat` on your own server. `server.js` adds the `Authorization` header server-side and proxies the stream back.

### API

```http
POST /api/chat
Content-Type: application/json

{
  "messages": [{ "role": "user", "content": "Hello" }],
  "stream": true,
  "temperature": 0.7
}
```

Streaming responses are `text/event-stream` frames in OpenRouter's format, terminated by `data: [DONE]`.
`GET /api/health` returns `{ ok, model, keyConfigured }`.

## Deploy to GitHub

```bash
git init
git add .
git commit -m "NextGPT"
git branch -M main
git remote add origin https://github.com/<your-user>/nextgpt.git
git push -u origin main
```

`.env` is gitignored — never commit your key.

## Deploy to Vercel

1. Import the GitHub repository at https://vercel.com/new
2. Add the environment variable `OPENROUTER_API_KEY` (and optionally `OPENROUTER_MODEL`)
3. Deploy — `vercel.json` routes every request to `server.js`, which serves the static pages and the API

No build step is required. Node 18+ is used so the global `fetch` is available.

## Browser support

Chrome, Edge, Firefox, Safari, Android and iOS. Layouts are tuned for desktop, tablet and mobile, and all animations respect `prefers-reduced-motion`.

## License

MIT
