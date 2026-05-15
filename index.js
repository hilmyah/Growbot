require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const app     = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// -------------------------------------------------------------
//  Konfigurasi
// -------------------------------------------------------------
const ESP_BASE_URL    = process.env.ESP_URL;
const FONNTE_TOKEN    = process.env.FONNTE_TOKEN;
const TELEGRAM_TOKEN  = process.env.TELEGRAM_TOKEN;

// Telegram bot — hanya aktif jika token tersedia
let bot = null;
if (TELEGRAM_TOKEN) {
  const TelegramBot = require('node-telegram-bot-api');
  bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
  console.log('Telegram Bot aktif.');
} else {
  console.log('TELEGRAM_TOKEN tidak ditemukan — Telegram dinonaktifkan.');
}

if (FONNTE_TOKEN) {
  console.log('WhatsApp (Fonnte) aktif.');
} else {
  console.log('FONNTE_TOKEN tidak ditemukan — WhatsApp dinonaktifkan.');
}

// -------------------------------------------------------------
//  Session — shared antara WA dan Telegram
//  Key format:  "wa:<nomor>"  atau  "tg:<chatId>"
// -------------------------------------------------------------
const sessions = {};

// -------------------------------------------------------------
//  Menu
// -------------------------------------------------------------
function menuText() {
  return (
    '\n\n[ Menu Growbot ]\n' +
    '1. Status Terkini\n' +
    '2. Nyalakan Pompa (Manual ON)\n' +
    '3. Matikan Pompa (Manual OFF)\n' +
    '4. Mode Otomatis (Auto)\n' +
    '5. Atur Threshold\n' +
    '6. Tambah Preset Tanaman\n' +
    '7. Riwayat Kelembaban (5 Terakhir)\n' +
    '8. Jumlah Penyiraman Hari Ini'
  );
}

// -------------------------------------------------------------
//  ESP helpers
// -------------------------------------------------------------
async function getESPData() {
  const res = await axios.get(`${ESP_BASE_URL}/api/data`, { timeout: 5000 });
  return res.data;
}

async function cmdESP(path) {
  const res = await axios.get(`${ESP_BASE_URL}${path}`, { timeout: 5000 });
  return res.data;
}

// -------------------------------------------------------------
//  Pengirim pesan — abstraksi agar logika tidak duplikat
//  platform : 'wa' | 'tg'
//  target   : nomor WA atau chatId Telegram
// -------------------------------------------------------------
async function sendMsg(platform, target, text) {
  if (platform === 'wa') {
    await axios.post('https://api.fonnte.com/send',
      { target, message: text },
      { headers: { Authorization: FONNTE_TOKEN } }
    );
  } else if (platform === 'tg' && bot) {
    await bot.sendMessage(target, text);
  }
}

// -------------------------------------------------------------
//  Handler utama — dipanggil oleh webhook WA maupun listener TG
//  platform : 'wa' | 'tg'
//  target   : nomor WA atau chatId Telegram
//  message  : teks pesan dari pengguna
// -------------------------------------------------------------
async function handleMessage(platform, target, message) {
  const sessionKey = `${platform}:${target}`;
  const sess = sessions[sessionKey] || null;

  // --- Multi-step: input threshold ---
  if (sess && sess.step === 'await_threshold') {
    delete sessions[sessionKey];
    const val = parseInt(message);
    if (isNaN(val) || val < 200 || val > 1024) {
      await sendMsg(platform, target, 'Nilai tidak valid. Masukkan angka antara 200-1024.' + menuText());
      return;
    }
    await cmdESP(`/api/threshold?val=${val}`);
    await sendMsg(platform, target, `Threshold berhasil diubah ke ${val}.` + menuText());
    return;
  }

  // --- Multi-step: input nama preset ---
  if (sess && sess.step === 'await_preset_name') {
    sessions[sessionKey] = { step: 'await_preset_thr', data: { name: message.substring(0, 12) } };
    await sendMsg(platform, target, `Nama: ${message}\nMasukkan nilai threshold (200-1024):`);
    return;
  }

  // --- Multi-step: input threshold preset ---
  if (sess && sess.step === 'await_preset_thr') {
    const name = sess.data.name;
    delete sessions[sessionKey];
    const val = parseInt(message);
    if (isNaN(val) || val < 200 || val > 1024) {
      await sendMsg(platform, target, 'Nilai tidak valid. Pembuatan preset dibatalkan.' + menuText());
      return;
    }
    const existingRes = await axios.get(`${ESP_BASE_URL}/api/presets`, { timeout: 5000 });
    const existing = existingRes.data || [];
    existing.push({ n: name, t: val });
    await axios.post(`${ESP_BASE_URL}/api/presets`, existing, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });
    await sendMsg(platform, target, `Preset ${name} (Threshold: ${val}) berhasil ditambahkan.` + menuText());
    return;
  }

  // --- Command utama ---
  switch (message) {
    case '1': {
      const d = await getESPData();
      const pct  = Math.max(0, Math.min(100, Math.round((1 - d.adc / 1024) * 100)));
      const lastW = d.lastWatered === 0      ? 'Baru saja'
                  : d.lastWatered < 60       ? `${d.lastWatered}s lalu`
                  : `${Math.floor(d.lastWatered / 60)}m ${d.lastWatered % 60}s lalu`;
      const out = `Status Growmate:\nKondisi: ${d.kondisi} (ADC: ${d.adc}, ${pct}%)\nPompa: ${d.pump}\nMode: ${d.mode}\nThreshold: ${d.threshold}\nTerakhir disiram: ${lastW}\nPenyiraman hari ini: ${d.count}x`;
      await sendMsg(platform, target, out + menuText());
      break;
    }
    case '2': {
      await cmdESP('/on');
      await sendMsg(platform, target, 'Instruksi Manual ON terkirim. Pompa menyala dan akan mati otomatis dalam 60 detik.' + menuText());
      break;
    }
    case '3': {
      await cmdESP('/off');
      await sendMsg(platform, target, 'Instruksi Manual OFF terkirim. Pompa dimatikan.' + menuText());
      break;
    }
    case '4': {
      await cmdESP('/auto');
      await sendMsg(platform, target, 'Mode Auto diaktifkan. Pompa beroperasi berdasarkan threshold kelembaban.' + menuText());
      break;
    }
    case '5': {
      sessions[sessionKey] = { step: 'await_threshold' };
      await sendMsg(platform, target, 'Masukkan nilai threshold baru (200-1024).\n(Angka rendah = target tanah lebih basah, Angka tinggi = target tanah lebih kering)');
      break;
    }
    case '6': {
      sessions[sessionKey] = { step: 'await_preset_name' };
      await sendMsg(platform, target, 'Masukkan nama tanaman untuk preset (maksimal 12 karakter):');
      break;
    }
    case '7': {
      const histRes = await axios.get(`${ESP_BASE_URL}/api/history`, { timeout: 5000 });
      const hist = histRes.data || [];
      if (hist.length === 0) {
        await sendMsg(platform, target, 'Data riwayat kelembaban belum tersedia.' + menuText());
      } else {
        const rows = hist.map((v, i) => {
          const p = Math.max(0, Math.min(100, Math.round((1 - v / 1024) * 100)));
          return `Data ${i + 1}: ADC ${v} (${p}%)`;
        }).join('\n');
        await sendMsg(platform, target, `Riwayat Kelembaban (5 Terakhir):\n${rows}` + menuText());
      }
      break;
    }
    case '8': {
      const d = await getESPData();
      await sendMsg(platform, target, `Jumlah penyiraman hari ini: ${d.count}x` + menuText());
      break;
    }
    default: {
      await sendMsg(platform, target, menuText());
    }
  }
}

// -------------------------------------------------------------
//  WhatsApp — webhook Fonnte
// -------------------------------------------------------------
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);   // balas cepat agar Fonnte tidak retry

  console.log('[WA] Pesan masuk:', req.body);

  const sender  = req.body.sender || req.body.from || '';
  const message = (req.body.message || req.body.text || '').trim();

  if (!sender || !message) return;
  if (!FONNTE_TOKEN) {
    console.log('[WA] Token tidak ada, pesan diabaikan.');
    return;
  }

  try {
    await handleMessage('wa', sender, message);
  } catch (err) {
    console.error('[WA] Error:', err.message);
    try {
      await sendMsg('wa', sender, 'Gagal terhubung ke modul ESP8266. Pastikan modul menyala dan URL valid.' + menuText());
    } catch (_) {}
  }
});

// -------------------------------------------------------------
//  Telegram — polling listener
// -------------------------------------------------------------
if (bot) {
  bot.on('message', async (msg) => {
    const chatId  = msg.chat.id;
    const message = msg.text ? msg.text.trim() : '';

    if (!message) return;

    console.log(`[TG] Pesan dari ${chatId}:`, message);

    try {
      await handleMessage('tg', chatId, message);
    } catch (err) {
      console.error('[TG] Error:', err.message);
      try {
        await sendMsg('tg', chatId, 'Gagal terhubung ke modul ESP8266. Pastikan modul menyala dan URL valid.' + menuText());
      } catch (_) {}
    }
  });

  bot.on('polling_error', (err) => {
    console.error('[TG] Polling error:', err.message);
  });
}

// -------------------------------------------------------------
//  Health check
// -------------------------------------------------------------
app.get('/', (req, res) => {
  const wa = FONNTE_TOKEN  ? 'aktif' : 'nonaktif';
  const tg = TELEGRAM_TOKEN ? 'aktif' : 'nonaktif';
  res.send(`Growbot berjalan — WhatsApp: ${wa} | Telegram: ${tg}`);
});

// -------------------------------------------------------------
//  Start server
// -------------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server aktif pada port ${PORT}`);
});