require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const FONNTE_TOKEN = process.env.FONNTE_TOKEN;
const ESP_BASE_URL = process.env.ESP_URL;

// State sementara untuk multi-step input (threshold/preset)
const sessions = {};

// Generator menu opsi
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

// Fungsi pengiriman pesan WA via Fonnte API
async function sendWA(to, message) {
  try {
    await axios.post('https://api.fonnte.com/send', {
      target: to,
      message: message
    }, {
      headers: { Authorization: FONNTE_TOKEN }
    });
  } catch (e) {
    console.error('Fonnte Error:', e.message);
  }
}

// Fungsi pengambilan data dari ESP8266
async function getESPData() {
  const res = await axios.get(`${ESP_BASE_URL}/api/data`, { timeout: 5000 });
  return res.data;
}

// Fungsi pengiriman perintah ke ESP8266
async function cmdESP(path) {
  const res = await axios.get(`${ESP_BASE_URL}${path}`, { timeout: 5000 });
  return res.data;
}

app.get('/', (req, res) => res.send('Server Growbot Aktif dan Terhubung!'));

app.post('/webhook', async (req, res) => {
  res.sendStatus(200);

  console.log('\n=== Pesan Baru Masuk ===');
  console.log(req.body);

  const sender = req.body.sender || req.body.from || '';
  const message = (req.body.message || req.body.text || '').trim();

  if (!sender || !message) return;

  const sess = sessions[sender] || null;

  try {
    // Multi-step: Menerima input nilai threshold
    if (sess && sess.step === 'await_threshold') {
      delete sessions[sender];
      const val = parseInt(message);
      if (isNaN(val) || val < 200 || val > 1024) {
        await sendWA(sender, 'Nilai tidak valid. Masukkan angka antara 200-1024.' + menuText());
        return;
      }
      await cmdESP(`/api/threshold?val=${val}`);
      await sendWA(sender, `Threshold berhasil diubah ke ${val}.` + menuText());
      return;
    }

    // Multi-step: Menerima input nama preset
    if (sess && sess.step === 'await_preset_name') {
      sessions[sender] = { step: 'await_preset_thr', data: { name: message.substring(0, 12) } };
      await sendWA(sender, `Nama: ${message}\nMasukkan nilai threshold (200-1024):`);
      return;
    }

    // Multi-step: Menerima input nilai threshold untuk preset
    if (sess && sess.step === 'await_preset_thr') {
      const name = sess.data.name;
      delete sessions[sender];
      const val = parseInt(message);
      if (isNaN(val) || val < 200 || val > 1024) {
        await sendWA(sender, 'Nilai tidak valid. Pembuatan preset dibatalkan.' + menuText());
        return;
      }
      
      const existingRes = await axios.get(`${ESP_BASE_URL}/api/presets`, { timeout: 5000 });
      const existing = existingRes.data || [];
      existing.push({ n: name, t: val });
      
      await axios.post(`${ESP_BASE_URL}/api/presets`, existing, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 5000
      });
      
      await sendWA(sender, `Preset ${name} (Threshold: ${val}) berhasil ditambahkan.` + menuText());
      return;
    }

    // Routing command utama
    switch (message) {
      case '1': {
        const d = await getESPData();
        const pct = Math.max(0, Math.min(100, Math.round((1 - d.adc / 1024) * 100)));
        const lastW = d.lastWatered === 0 ? 'Baru saja' : d.lastWatered < 60 ? `${d.lastWatered}s lalu` : `${Math.floor(d.lastWatered/60)}m ${d.lastWatered%60}s lalu`;
        const msg = `Status Growmate:\nKondisi: ${d.kondisi} (ADC: ${d.adc}, ${pct}%)\nPompa: ${d.pump}\nMode: ${d.mode}\nThreshold: ${d.threshold}\nTerakhir disiram: ${lastW}\nPenyiraman hari ini: ${d.count}x`;
        await sendWA(sender, msg + menuText());
        break;
      }
      case '2': {
        await cmdESP('/on');
        await sendWA(sender, 'Instruksi Manual ON terkirim. Pompa menyala dan akan mati otomatis dalam 60 detik.' + menuText());
        break;
      }
      case '3': {
        await cmdESP('/off');
        await sendWA(sender, 'Instruksi Manual OFF terkirim. Pompa dimatikan.' + menuText());
        break;
      }
      case '4': {
        await cmdESP('/auto');
        await sendWA(sender, 'Mode Auto diaktifkan. Pompa beroperasi berdasarkan threshold kelembaban.' + menuText());
        break;
      }
      case '5': {
        sessions[sender] = { step: 'await_threshold' };
        await sendWA(sender, 'Masukkan nilai threshold baru (200-1024).\n(Angka rendah = target tanah lebih basah, Angka tinggi = target tanah lebih kering)');
        break;
      }
      case '6': {
        sessions[sender] = { step: 'await_preset_name' };
        await sendWA(sender, 'Masukkan nama tanaman untuk preset (maksimal 12 karakter):');
        break;
      }
      case '7': {
        const histRes = await axios.get(`${ESP_BASE_URL}/api/history`, { timeout: 5000 });
        const hist = histRes.data || [];
        if (hist.length === 0) {
          await sendWA(sender, 'Data riwayat kelembaban belum tersedia.' + menuText());
        } else {
          const rows = hist.map((v, i) => `Data ${i + 1}: ADC ${v} (${Math.max(0, Math.min(100, Math.round((1 - v / 1024) * 100)))}%)`).join('\n');
          await sendWA(sender, `Riwayat Kelembaban (5 Terakhir):\n${rows}` + menuText());
        }
        break;
      }
      case '8': {
        const d = await getESPData();
        await sendWA(sender, `Jumlah penyiraman hari ini: ${d.count}x` + menuText());
        break;
      }
      default: {
        await sendWA(sender, menuText());
      }
    }
  } catch (err) {
    console.error('System Error:', err.message);
    await sendWA(sender, 'Gagal terhubung ke modul ESP8266. Pastikan modul menyala dan URL valid.' + menuText());
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server aktif pada port ${PORT}`));