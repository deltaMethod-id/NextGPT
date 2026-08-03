require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const pub = f => path.join(__dirname, 'public', f);
app.get('/', (req, res) => res.sendFile(pub('index.html')));
app.get('/auth', (req, res) => res.sendFile(pub('auth.html')));
app.get('/chat', (req, res) => res.sendFile(pub('chat.html')));
app.get('/settings', (req, res) => res.sendFile(pub('settings.html')));
app.get('/workspace', (req, res) => res.sendFile(pub('workspace.html')));

async function callOpenRouter(messages) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
      'X-Title': 'NextGPT'
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-oss-20b:free',
      messages
    })
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenRouter error ${response.status}: ${errText}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content || '(Tidak ada respon dari AI)';
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || !messages.length) {
      return res.status(400).json({ error: 'Pesan kosong' });
    }
    const fullMessages = [
      { role: 'system', content: 'Kamu adalah NextGPT, asisten AI yang ramah, jelas, dan membantu. Jawab dalam Bahasa Indonesia kecuali user memakai bahasa lain.' },
      ...messages
    ];
    const reply = await callOpenRouter(fullMessages);
    res.json({ reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal menghubungi AI: ' + e.message });
  }
});

app.post('/api/workspace/generate', async (req, res) => {
  try {
    const { prompt, history } = req.body || {};
    if (!prompt) return res.status(400).json({ error: 'Perintah kosong' });
    const messages = [
      { role: 'system', content: 'Kamu adalah NextGPT Workspace, AI code generator. Jawab dengan penjelasan singkat lalu kode lengkap siap pakai dalam blok kode markdown (```bahasa ... ```).' },
      ...(Array.isArray(history) ? history : []),
      { role: 'user', content: prompt }
    ];
    const reply = await callOpenRouter(messages);
    res.json({ result: reply });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal generate kode: ' + e.message });
  }
});

if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => console.log(`NextGPT jalan di http://localhost:${PORT}`));
}

module.exports = app;
