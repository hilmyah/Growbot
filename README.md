<div align="center">
  <img src="asset/growmate.png" alt="Growmate Logo" width="120" height="120" style="border-radius:12px"/>
  <h1>Growbot</h1>
  <p>WhatsApp & Telegram Gateway untuk <a href="https://github.com/hilmyah/Growmate">Growmate</a> — sistem irigasi cerdas berbasis ESP8266 / WEMOS D1 Mini</p>
</div>

---

Growbot adalah server perantara berbasis **Node.js** yang menghubungkan **WhatsApp** (via Fonnte) dan **Telegram** dengan modul ESP8266 Growmate. Sistem irigasi dapat dipantau dan dikontrol dari jarak jauh melalui pesan teks biasa. Kedua platform berjalan bersamaan dan saling membackup — jika satu bermasalah, platform lainnya tetap berfungsi.

```
WhatsApp  →  Fonnte  ┐
                      ├→  Growbot (Railway)  →  Cloudflare Tunnel  →  ESP8266
Telegram  →  Polling ┘
```

> Repo firmware dan hardware: [hilmyah/Growmate](https://github.com/hilmyah/Growmate)

---

## Daftar Isi

- [Fitur](#fitur)
- [Cara Kerja Sistem](#cara-kerja-sistem)
- [Struktur Proyek](#struktur-proyek)
- [Persyaratan](#persyaratan)
- [Tahap 1 — Instalasi](#tahap-1--instalasi)
- [Tahap 2 — Setup WhatsApp (Fonnte)](#tahap-2--setup-whatsapp-fonnte)
- [Tahap 3 — Setup Telegram Bot](#tahap-3--setup-telegram-bot)
- [Tahap 4 — Remote Access](#tahap-4--remote-access)
  - [Opsi A — Cloudflare Tunnel](#opsi-a--cloudflare-tunnel-direkomendasikan)
  - [Opsi B — Tailscale Subnet Router](#opsi-b--tailscale-subnet-router)
- [Tahap 5 — Deploy ke Railway](#tahap-5--deploy-ke-railway)
- [Tahap 6 — Menjalankan Secara Lokal](#tahap-6--menjalankan-secara-lokal)
- [Referensi API ESP8266](#referensi-api-esp8266)

---

## Fitur

| Perintah | Fungsi |
|:---:|---|
| `1` | Status terkini — ADC, kelembaban %, kondisi tanah, mode, threshold, waktu terakhir disiram |
| `2` | Nyalakan pompa manual (mati otomatis dalam 60 detik) |
| `3` | Matikan pompa manual |
| `4` | Aktifkan mode otomatis |
| `5` | Atur nilai threshold (input multi-step, rentang 200–1024) |
| `6` | Tambah preset tanaman baru (nama + threshold, input multi-step) |
| `7` | Riwayat 5 data kelembaban terakhir |
| `8` | Jumlah sesi penyiraman hari ini |

Menu dikirim otomatis di setiap balasan. Kedua platform (WA & Telegram) mendukung seluruh perintah di atas. Token masing-masing bersifat opsional — platform hanya aktif jika token-nya diisi di `.env`.

---

## Cara Kerja Sistem

![Flowchart sistem Growmate](asset/flowchart.png)

Alur singkat:

1. **ESP8266 / WEMOS D1 Mini** membaca kelembaban tanah, menampilkan status di LCD, dan menjalankan web server HTTP lokal.
2. **Cloudflare Tunnel / Tailscale** mengekspos IP lokal ESP8266 ke internet secara aman.
3. **Growbot** (di Railway) menerima pesan dari Fonnte via webhook **atau** dari Telegram via polling, memproses perintah, lalu memanggil endpoint ESP melalui URL tunnel.
4. Balasan dikirim balik ke pengguna di platform yang sama.

Session state (multi-step untuk threshold dan preset) dipisah per platform menggunakan key format `wa:<nomor>` dan `tg:<chatId>`, sehingga keduanya tidak saling bentrok.

---

## Struktur Proyek

```
Growbot/
├── asset/
│   ├── flowchart.png     # Diagram alur sistem
│   └── growmate.png      # Logo proyek
├── index.js              # Server utama — webhook WA, polling TG, routing perintah
├── package.json
├── package-lock.json
├── .env.example          # Template variabel environment
└── .gitignore
```

### Penjelasan `index.js`

| Bagian | Keterangan |
|---|---|
| `sessions` | Object in-memory — state percakapan multi-step per platform & pengguna |
| `menuText()` | Generator teks menu yang disisipkan di setiap balasan |
| `sendMsg(platform, target, text)` | Abstraksi pengiriman pesan — WA via Fonnte, Telegram via `bot.sendMessage` |
| `handleMessage(platform, target, message)` | Logika terpusat — dipanggil oleh webhook WA dan listener Telegram |
| `getESPData()` | `GET /api/data` ke ESP |
| `cmdESP(path)` | `GET {path}` ke ESP — perintah `/on`, `/off`, `/auto`, `/api/threshold` |
| `POST /webhook` | Menerima pesan masuk dari Fonnte (WhatsApp) |
| `bot.on('message')` | Menerima pesan masuk dari Telegram via polling |

---

## Persyaratan

- Node.js v16 atau lebih baru
- Akun [Fonnte](https://fonnte.com) dengan device WhatsApp aktif *(opsional — bisa WA saja, TG saja, atau keduanya)*
- Bot Telegram dari [@BotFather](https://t.me/BotFather) *(opsional)*
- Firmware Growmate sudah berjalan di ESP8266 (lihat [hilmyah/Growmate](https://github.com/hilmyah/Growmate))
- `cloudflared` atau Tailscale di komputer yang satu jaringan dengan ESP8266

---

## Tahap 1 — Instalasi

**Clone dan install dependensi:**

```bash
git clone https://github.com/hilmyah/Growbot.git
cd Growbot
npm install
```

**Salin dan isi file environment:**

```bash
cp .env.example .env
```

```ini
# WhatsApp — token dari dashboard Fonnte (kosongkan jika tidak dipakai)
FONNTE_TOKEN=token_dari_fonnte

# Telegram — token dari @BotFather (kosongkan jika tidak dipakai)
TELEGRAM_TOKEN=1234567890:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# URL ESP8266 dari Cloudflare Tunnel atau Tailscale IP
ESP_URL=https://random-name.trycloudflare.com

PORT=3000
```

Saat server dijalankan, terminal menampilkan platform mana yang aktif:
```
WhatsApp (Fonnte) aktif.
Telegram Bot aktif.
Server aktif pada port 3000
```

---

## Tahap 2 — Setup WhatsApp (Fonnte)

1. Buka [fonnte.com](https://fonnte.com) → buat akun
2. **Tambah Device** → scan QR menggunakan WhatsApp yang dijadikan bot
3. Salin **Token** → masukkan ke `FONNTE_TOKEN` di `.env`
4. Setelah server di-deploy (lihat Tahap 5), isi **Webhook URL** di pengaturan device Fonnte:
   ```
   https://nama-app.up.railway.app/webhook
   ```
5. Kirim pesan apa saja ke nomor bot untuk memverifikasi webhook aktif

---

## Tahap 3 — Setup Telegram Bot

1. Buka [@BotFather](https://t.me/BotFather) di Telegram → kirim `/newbot`
2. Ikuti instruksi — pilih nama dan username bot
3. Salin **token** yang diberikan (format: `1234567890:AAHxxxxxxx`) → masukkan ke `TELEGRAM_TOKEN` di `.env`
4. Tidak perlu konfigurasi webhook — Growbot menggunakan **polling** sehingga langsung aktif saat server berjalan

> Telegram polling tidak memerlukan URL publik untuk bot itu sendiri. Yang memerlukan URL publik hanyalah `ESP_URL` (tunnel ke ESP8266).

---

## Tahap 4 — Remote Access

Server Growbot di Railway tidak dapat langsung menjangkau ESP8266 di jaringan lokal. Jalankan salah satu metode berikut di komputer yang **satu jaringan WiFi dengan ESP8266** dan biarkan berjalan selama sistem digunakan.

### Opsi A — Cloudflare Tunnel (Direkomendasikan)

```bash
# Instalasi
brew install cloudflared              # macOS
winget install Cloudflare.cloudflared # Windows

# Jalankan tunnel ke IP ESP8266
cloudflared tunnel --url http://192.168.X.X
```

URL publik muncul di terminal:
```
https://random-name.trycloudflare.com
```

Salin ke `ESP_URL` di `.env` atau variabel Railway.

> URL berubah setiap `cloudflared` dijalankan ulang. Untuk URL permanen, buat [Named Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) dengan akun Cloudflare gratis.

### Opsi B — Tailscale Subnet Router

```bash
# Linux / macOS
sudo tailscale up --advertise-routes=192.168.1.0/24

# Windows (PowerShell sebagai Administrator)
tailscale up --advertise-routes=192.168.1.0/24
```

Sesuaikan subnet dengan jaringan WiFi yang digunakan. Setujui route di [Tailscale Admin Console](https://login.tailscale.com/admin/machines), lalu gunakan IP lokal ESP8266 sebagai `ESP_URL`:

```ini
ESP_URL=http://192.168.1.X
```

---

## Tahap 5 — Deploy ke Railway

1. Push repo ini ke GitHub
2. Buka [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**
3. Pilih repo `Growbot`
4. Buka tab **Variables**, tambahkan:

   | Key | Value |
   |---|---|
   | `FONNTE_TOKEN` | Token Fonnte *(kosongkan jika tidak dipakai)* |
   | `TELEGRAM_TOKEN` | Token BotFather *(kosongkan jika tidak dipakai)* |
   | `ESP_URL` | URL Cloudflare Tunnel atau IP Tailscale |
   | `PORT` | `3000` |

5. Railway otomatis menjalankan `npm start`
6. Salin URL Railway → tempel ditambah `/webhook` ke Webhook URL di Fonnte

---

## Tahap 6 — Menjalankan Secara Lokal

```bash
npm start
```

Untuk menerima webhook Fonnte saat pengembangan lokal, buat URL publik sementara:

```bash
# Cloudflared
cloudflared tunnel --url http://localhost:3000

# ngrok
ngrok http 3000

# localhost.run (tanpa instalasi — menggunakan SSH bawaan sistem)
ssh -R 80:localhost:3000 nokey@localhost.run
```

Gunakan URL yang dihasilkan sebagai Webhook URL sementara di Fonnte.

> Telegram polling berjalan langsung tanpa URL publik — tidak perlu konfigurasi tambahan untuk pengujian lokal.

---

## Referensi API ESP8266

| Method | Endpoint | Keterangan |
|:---:|---|---|
| GET | `/api/data` | Status lengkap (ADC, kondisi, pompa, mode, threshold, count) |
| GET | `/api/threshold?val=700` | Ubah threshold |
| GET | `/api/presets` | Ambil daftar preset kustom |
| POST | `/api/presets` | Simpan preset kustom |
| GET | `/api/history` | 5 data ADC terakhir |
| GET | `/on` | Manual ON |
| GET | `/off` | Manual OFF |
| GET | `/auto` | Mode otomatis |

---

<div align="center">
  <sub>Growbot merupakan bagian dari proyek <a href="https://github.com/hilmyah/Growmate">Growmate</a> — Smart Irrigation System berbasis ESP8266 / WEMOS D1 Mini.</sub>
</div>