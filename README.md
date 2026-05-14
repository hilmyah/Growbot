<div align="center">
  <img src="asset/growmate.png" alt="Growmate Logo" width="120" height="120" style="border-radius:12px"/>
  <h1>Growbot</h1>
  <p>WhatsApp Gateway untuk <a href="https://github.com/hilmyah/Growmate">Growmate</a> — sistem irigasi cerdas berbasis ESP8266 / WEMOS D1 Mini</p>
</div>

---

Growbot adalah server perantara berbasis **Node.js** yang menghubungkan WhatsApp (via Fonnte) dengan modul ESP8266 Growmate. Sistem irigasi dapat dipantau dan dikontrol dari jarak jauh hanya dengan mengirim pesan teks biasa ke nomor WhatsApp bot.

```
WhatsApp → Fonnte → Growbot (Railway) → Cloudflare Tunnel / Tailscale → ESP8266
```

> Repo firmware dan hardware: [hilmyah/Growmate](https://github.com/hilmyah/Growmate)

---

## Daftar Isi

- [Fitur](#fitur)
- [Cara Kerja Sistem](#cara-kerja-sistem)
- [Struktur Proyek](#struktur-proyek)
- [Persyaratan](#persyaratan)
- [Tahap 1 — Instalasi](#tahap-1--instalasi)
- [Tahap 2 — Setup Fonnte](#tahap-2--setup-fonnte)
- [Tahap 3 — Remote Access](#tahap-3--remote-access)
  - [Opsi A — Cloudflare Tunnel](#opsi-a--cloudflare-tunnel-direkomendasikan)
  - [Opsi B — Tailscale Subnet Router](#opsi-b--tailscale-subnet-router)
- [Tahap 4 — Deploy ke Railway](#tahap-4--deploy-ke-railway)
- [Tahap 5 — Menjalankan Secara Lokal](#tahap-5--menjalankan-secara-lokal)
- [Referensi API ESP8266](#referensi-api-esp8266)

---

## Fitur

| Perintah | Fungsi |
|:---:|---|
| `1` | Status terkini — ADC, kelembaban %, kondisi tanah, mode, threshold, waktu terakhir disiram |
| `2` | Nyalakan pompa manual (mati otomatis dalam 60 detik) |
| `3` | Matikan pompa manual |
| `4` | Aktifkan mode otomatis — pompa bekerja berdasarkan threshold |
| `5` | Atur nilai threshold kelembaban (input multi-step, rentang 200–1024) |
| `6` | Tambah preset tanaman baru (nama + threshold, input multi-step) |
| `7` | Riwayat 5 data kelembaban terakhir beserta persentasenya |
| `8` | Jumlah sesi penyiraman hari ini |

Menu perintah dikirimkan otomatis di setiap balasan sehingga pengguna tidak perlu menghapal.

---

## Cara Kerja Sistem

![Flowchart sistem Growmate](asset/flowchart.png)

Alur singkat:

1. **ESP8266 / WEMOS D1 Mini** membaca kelembaban tanah via ADC, menampilkan status di LCD, dan menjalankan web server HTTP lokal.
2. **Cloudflare Tunnel / Tailscale** mengekspos IP lokal ESP8266 ke internet secara aman.
3. **Growbot** (di Railway) menerima pesan dari Fonnte melalui webhook, memparsing perintah, lalu memanggil endpoint ESP melalui URL tunnel.
4. **Fonnte** meneruskan balasan dari Growbot ke WhatsApp pengguna.

---

## Struktur Proyek

```
growbot/
├── asset/
│   ├── flowchart.png     # Diagram alur sistem
│   └── growmate.png      # Logo proyek
├── index.js              # Server utama — webhook, routing perintah, komunikasi ESP
├── package.json
├── package-lock.json
├── .env.example          # Template variabel environment
└── .gitignore
```

### Penjelasan `index.js`

| Bagian | Keterangan |
|---|---|
| `sessions` | Object in-memory untuk menyimpan state percakapan multi-step (threshold, preset) |
| `menuText()` | Generator teks menu yang disisipkan di setiap balasan |
| `sendWA(to, msg)` | Mengirim pesan ke nomor WhatsApp tertentu via Fonnte API |
| `getESPData()` | `GET /api/data` ke ESP — mengambil status sensor, pompa, mode, threshold, dan data LCD |
| `cmdESP(path)` | `GET {path}` ke ESP — mengirim perintah seperti `/on`, `/off`, `/auto` |
| `POST /webhook` | Endpoint utama yang menerima pesan masuk dari Fonnte dan memroses perintah |

---

## Persyaratan

- Node.js v16 atau lebih baru
- Akun [Fonnte](https://fonnte.com) dengan device WhatsApp aktif
- Firmware Growmate sudah berjalan di ESP8266 / WEMOS D1 Mini (lihat [hilmyah/Growmate](https://github.com/hilmyah/Growmate))
- `cloudflared` **atau** Tailscale terinstal di komputer yang satu jaringan dengan ESP8266

---

## Tahap 1 — Instalasi

**1. Clone repo dan install dependensi**

```bash
git clone https://github.com/hilmyah/Growbot.git
cd Growbot
npm install
```

**2. Salin dan isi file environment**

```bash
cp .env.example .env
```

Edit `.env` dan isi nilainya:

```ini
FONNTE_TOKEN=token_dari_dashboard_fonnte
ESP_URL=https://url-tunnel.trycloudflare.com
PORT=3000
```

| Variabel | Keterangan |
|---|---|
| `FONNTE_TOKEN` | Token dari dashboard Fonnte (lihat Tahap 2) |
| `ESP_URL` | URL publik ESP8266 dari Cloudflare Tunnel atau IP via Tailscale (lihat Tahap 3) |
| `PORT` | Port server (default: `3000`) |

---

## Tahap 2 — Setup Fonnte

Fonnte berfungsi sebagai jembatan antara WhatsApp dan server Growbot.

1. Buka [fonnte.com](https://fonnte.com) dan buat akun.
2. Di dashboard, pilih **Tambah Device** → scan QR Code menggunakan WhatsApp yang akan dijadikan bot.
3. Salin **Token** yang muncul, masukkan ke `FONNTE_TOKEN` di file `.env`.
4. Setelah server Growbot di-deploy (lihat Tahap 4), buka pengaturan device di Fonnte dan isi kolom **Webhook URL**:
   ```
   https://nama-app.up.railway.app/webhook
   ```
5. Kirim pesan apa saja ke nomor bot untuk memastikan webhook aktif.

> Untuk pengujian lokal, baca [Tahap 5](#tahap-5--menjalankan-secara-lokal) untuk cara mendapatkan URL publik sementara.

---

## Tahap 3 — Remote Access

Server Growbot yang berjalan di Railway tidak dapat langsung menjangkau ESP8266 di jaringan lokal. Gunakan salah satu metode di bawah pada komputer yang **terhubung ke WiFi yang sama dengan ESP8266** dan biarkan berjalan selama sistem digunakan.

### Opsi A — Cloudflare Tunnel (Direkomendasikan)

Tidak memerlukan akun, URL publik langsung aktif tanpa konfigurasi port forwarding.

**Instalasi `cloudflared`:**

```bash
# macOS
brew install cloudflared

# Windows (via winget)
winget install Cloudflare.cloudflared

# Linux (Debian/Ubuntu)
curl -L https://pkg.cloudflare.com/cloudflared-stable-linux-amd64.deb -o cloudflared.deb
sudo dpkg -i cloudflared.deb
```

**Jalankan tunnel ke IP ESP8266:**

```bash
cloudflared tunnel --url http://192.168.X.X
# Ganti dengan IP ESP8266 yang tampil di Serial Monitor Arduino IDE
```

URL publik akan muncul di terminal:
```
https://random-name.trycloudflare.com
```

Salin URL ini ke `ESP_URL` di file `.env` atau variabel Railway.

> **Catatan:** URL berubah setiap kali `cloudflared` dijalankan ulang. Untuk URL permanen, daftar akun Cloudflare gratis dan buat [Named Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).

---

### Opsi B — Tailscale Subnet Router

Cocok jika akses ingin dibatasi hanya ke anggota tim atau perangkat tertentu. Koneksi berjalan lewat jaringan privat Tailscale tanpa URL publik.

**Instalasi Tailscale:** unduh di [tailscale.com/download](https://tailscale.com/download).

**Aktifkan subnet routing** di komputer yang satu jaringan dengan ESP8266:

```bash
# Linux / macOS
sudo tailscale up --advertise-routes=192.168.1.0/24

# Windows (PowerShell sebagai Administrator)
tailscale up --advertise-routes=192.168.1.0/24
```

> Sesuaikan `192.168.1.0/24` dengan subnet WiFi yang digunakan (cek dengan `ipconfig` / `ip a`).

Setelah itu:

1. Buka [Tailscale Admin Console](https://login.tailscale.com/admin/machines).
2. Temukan perangkat yang baru terhubung → klik **Edit route settings** → aktifkan subnet yang diiklankan.
3. Pastikan server Railway juga terdaftar di akun Tailscale yang sama (atau gunakan Tailscale Auth Key untuk otomasi).

Gunakan IP lokal ESP8266 sebagai `ESP_URL`:
```ini
ESP_URL=http://192.168.1.X
```

---

## Tahap 4 — Deploy ke Railway

Railway menjalankan Growbot secara permanen di cloud tanpa perlu menyalakan komputer sendiri.

1. Push repo ini ke GitHub (fork atau clone ke akun kamu).
2. Buka [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub Repo**.
3. Pilih repo `Growbot`.
4. Buka tab **Variables** di Railway dan tambahkan:

   | Key | Value |
   |---|---|
   | `FONNTE_TOKEN` | Token dari Fonnte |
   | `ESP_URL` | URL Cloudflare Tunnel atau IP via Tailscale |
   | `PORT` | `3000` |

5. Railway otomatis menjalankan `npm start` setelah deploy selesai.
6. Salin **URL domain Railway** yang diberikan (contoh: `https://growbot-production.up.railway.app`).
7. Tempel URL tersebut ditambah `/webhook` ke kolom Webhook URL di Fonnte (lihat [Tahap 2](#tahap-2--setup-fonnte)).

---

## Tahap 5 — Menjalankan Secara Lokal

```bash
npm start
```

Server berjalan di `http://localhost:3000`. Untuk menerima webhook dari Fonnte saat pengembangan lokal, buat URL publik sementara:

```bash
# Menggunakan cloudflared
cloudflared tunnel --url http://localhost:3000

# Atau menggunakan ngrok
ngrok http 3000
```

Gunakan URL yang dihasilkan sebagai Webhook URL di Fonnte sementara pengujian berlangsung.

---

## Referensi API ESP8266

Endpoint yang dikonsumsi Growbot dari firmware Growmate:

| Method | Endpoint | Keterangan |
|:---:|---|---|
| GET | `/api/data` | Status lengkap (ADC, kelembaban, kondisi, mode, threshold, count) |
| GET | `/api/threshold?val=700` | Ubah nilai threshold |
| GET | `/api/presets` | Ambil daftar preset tanaman |
| POST | `/api/presets` | Simpan preset baru |
| GET | `/api/history` | 5 data ADC terakhir |
| GET | `/on` | Nyalakan pompa — Manual ON |
| GET | `/off` | Matikan pompa — Manual OFF |
| GET | `/auto` | Aktifkan mode otomatis |

---

<div align="center">
  <sub>Growbot merupakan bagian dari proyek <a href="https://github.com/hilmyah/Growmate">Growmate</a> — Smart Irrigation System berbasis ESP8266 / WEMOS D1 Mini.</sub>
</div>