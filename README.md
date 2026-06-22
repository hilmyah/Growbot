<div align="center">
  <img src="asset/growmate.png" alt="Growbot Logo" width="120" height="120" style="border-radius:12px"/>
  <h1>Growbot</h1>
  <p>WhatsApp dan Telegram Gateway untuk <a href="https://github.com/hilmyah/Growmate">Growmate</a>, sistem irigasi cerdas berbasis ESP8266 / WEMOS D1 Mini.</p>
</div>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Platform-Railway%20%7C%20Local-lightgrey" alt="Platform">
</p>

---

Growbot adalah server perantara berbasis Node.js dan Express yang menghubungkan WhatsApp (via Fonnte) dan Telegram dengan modul ESP8266 Growmate. Sistem irigasi dapat dipantau dan dikontrol dari jarak jauh melalui pesan teks biasa. Kedua platform berjalan bersamaan dan saling membackup, jika satu bermasalah, platform lainnya tetap berfungsi.

Repo firmware dan hardware: [hilmyah/Growmate](https://github.com/hilmyah/Growmate)

## Daftar Isi

- [Fitur](#fitur)
- [Konsep dan Arsitektur](#konsep-dan-arsitektur)
- [Struktur Repository](#struktur-repository)
- [Dependensi Utama](#dependensi-utama)
- [Prasyarat](#prasyarat)
- [Instalasi](#instalasi)
- [Konfigurasi Environment](#konfigurasi-environment)
- [Deployment](#deployment)
- [Manajemen dan Operasional](#manajemen-dan-operasional)
- [Referensi API](#referensi-api)
- [Troubleshooting](#troubleshooting)
- [Keamanan](#keamanan)
- [Lisensi](#lisensi)

---

## Fitur

| Perintah | Fungsi |
| :---: | --- |
| `1` | Status terkini, ADC, kelembaban %, kondisi tanah, mode, threshold, waktu terakhir disiram. |
| `2` | Nyalakan pompa manual (mati otomatis dalam 60 detik). |
| `3` | Matikan pompa manual. |
| `4` | Aktifkan mode otomatis. |
| `5` | Atur nilai threshold (input multi-step, rentang 200-1024). |
| `6` | Tambah preset tanaman baru (nama + threshold, input multi-step). |
| `7` | Riwayat 5 data kelembaban terakhir. |
| `8` | Atur jadwal penyiraman terjadwal (interval jam/menit, persisten di EEPROM Growmate). |

Menu dikirim otomatis di setiap balasan. Kedua platform (WA dan Telegram) mendukung seluruh perintah di atas. Token masing-masing bersifat opsional, platform hanya aktif jika token-nya diisi di `.env`; minimal salah satu dari `FONNTE_TOKEN` atau `TELEGRAM_TOKEN` perlu diisi agar bot memberikan respons.

| Fitur Sistem | Deskripsi |
| --- | --- |
| Dual Platform Gateway | Menghubungkan kontrol irigasi melalui WhatsApp dan Telegram secara bersamaan. |
| Redundansi Akses | Kedua platform berjalan paralel sebagai cadangan satu sama lain. |
| Realtime Monitoring | Memantau status kelembaban tanah, status pompa, dan mode operasi mikrokontroler dari jarak jauh. |
| Remote Control | Mengeksekusi penyiraman manual, mengubah threshold, dan mengonfigurasi jadwal irigasi. |
| Session Multi-Step | State percakapan (untuk perintah 5, 6, 8) disimpan in-memory per platform dan pengguna, terpisah menggunakan key `wa:<nomor>` dan `tg:<chatId>`. Catatan: state ini tidak persisten dan akan hilang setiap kali server di-restart atau di-redeploy. |

---

## Konsep dan Arsitektur

Server perantara ini memproses logika komunikasi asinkron antara pengguna akhir dan perangkat IoT (ESP8266). Sistem menggunakan webhook untuk menangani lalu lintas data WhatsApp melalui Fonnte, dan menggunakan metode polling untuk menangani instruksi Telegram.

```text
+------------+       Webhook       +-------------------+       HTTP GET       +-----------------+
|  WhatsApp  | <-----------------> |                   | <------------------> |                 |
|  (Fonnte)  |                     |  Growbot Server   |                      |  Growmate       |
+------------+                     |  (Node.js)        |                      |  (ESP8266)      |
                                   |                   |                      |                 |
+------------+       Polling       |                   |                      |                 |
|  Telegram  | <-----------------> |                   |                      |                 |
|  (Bot API) |                     +-------------------+                      +-----------------+
+------------+
```

Alur singkat:

1. ESP8266 / WEMOS D1 Mini membaca kelembaban tanah, menampilkan status di LCD, dan menjalankan web server HTTP lokal.
2. Cloudflare Tunnel / Tailscale mengekspos IP lokal ESP8266 ke internet secara aman.
3. Growbot menerima pesan dari Fonnte via webhook `POST /webhook`, atau dari Telegram via polling, memproses perintah, lalu memanggil endpoint ESP melalui `ESP_URL` (variabel `axios.get` ke `${ESP_URL}/api/data` dan `${ESP_URL}{path}`).
4. Pesan WhatsApp dikirim balik melalui `POST https://api.fonnte.com/send` dengan header `Authorization: <FONNTE_TOKEN>`; pesan Telegram dikirim melalui `bot.sendMessage`.

---

## Struktur Repository

```
Growbot/
├── index.js              Server utama, webhook WA, polling TG, routing perintah.
├── package.json
├── package-lock.json
├── .env.example          Template variabel environment.
├── .gitignore            Mengabaikan node_modules/ dan .env.
└── asset/
    ├── flowchart.png     Diagram alur sistem.
    └── growmate.png      Logo proyek.
```

### Penjelasan `index.js`

| Bagian | Keterangan |
| --- | --- |
| `sessions` | Object in-memory, state percakapan multi-step per platform dan pengguna. |
| `menuText()` | Generator teks menu yang disisipkan di setiap balasan. |
| `sendMsg(platform, target, text)` | Abstraksi pengiriman pesan, WA via Fonnte, Telegram via `bot.sendMessage`. |
| `handleMessage(platform, target, message)` | Logika terpusat, dipanggil oleh webhook WA dan listener Telegram. |
| `getESPData()` | `GET /api/data` ke ESP. |
| `cmdESP(path)` | `GET {path}` ke ESP, dipakai untuk perintah `/on`, `/off`, `/auto`, `/api/threshold`, `/api/schedule`. |
| `parseIntervalInput(input)` | Parser format interval jadwal, lihat detail format pada Penjelasan Kode. |
| `fmtInterval(totalMin)` | Konversi menit ke string yang mudah dibaca (`"1 jam 30 menit"`). |
| `app.post('/webhook')` | Menerima pesan masuk dari Fonnte (WhatsApp). |
| `bot.on('message')` | Menerima pesan masuk dari Telegram via polling. |
| `app.get('/')` | Endpoint healthcheck, mengembalikan status aktif/nonaktif masing-masing platform sebagai teks biasa. |

### Format input interval jadwal (`parseIntervalInput`)

| Format Input | Interpretasi |
| --- | --- |
| `"24"` (angka murni, <= 168) | Dianggap jam, dikonversi ke menit. |
| angka murni > 168 | Dianggap langsung sebagai menit. |
| `"24j"` atau `"24h"` | 24 jam. |
| `"90m"` | 90 menit. |
| `"1j30m"` | 1 jam 30 menit. |
| `"10:30"` | Format jam:menit, 10 jam 30 menit. |

Seluruh format dibatasi hasil akhir maksimum 10.080 menit (1 minggu); input di luar rentang ini ditolak (`null`).

---

## Dependensi Utama

Berdasarkan `package.json`:

| Dependensi | Versi | Keterangan |
| --- | --- | --- |
| express | ^5.2.1 | Menyediakan endpoint `POST /webhook` dan `GET /` (healthcheck). |
| axios | ^1.16.1 | Klien HTTP untuk memanggil API Growmate dan API kirim pesan Fonnte. |
| dotenv | ^17.4.2 | Memuat variabel environment dari `.env`. |
| node-telegram-bot-api | ^0.67.0 | Klien Telegram Bot API, mode polling. |

---

## Prasyarat

| Komponen | Spesifikasi / Versi | Keterangan |
| --- | --- | --- |
| Node.js | >= 18.x | Runtime untuk mengeksekusi server backend. |
| npm | >= 9.x | Package manager untuk mengunduh dependensi. |
| Akun Fonnte | Aktif (opsional) | Layanan pihak ketiga penyedia API WhatsApp. |
| Bot Telegram | Token dari [@BotFather](https://t.me/BotFather) (opsional) | Minimal salah satu dari Fonnte/Telegram harus aktif. |
| Firmware Growmate | Sudah berjalan di ESP8266 | Lihat [hilmyah/Growmate](https://github.com/hilmyah/Growmate). |
| Publikator Port | Cloudflared / Tailscale / Ngrok | Diperlukan agar Growbot di cloud dapat menjangkau ESP8266 di jaringan lokal. |

---

## Instalasi

```bash
git clone https://github.com/hilmyah/Growbot.git
cd Growbot
npm install
cp .env.example .env
```

---

## Konfigurasi Environment

Sesuaikan nilai di dalam `.env` berdasarkan kredensial masing-masing platform.

| Variabel Lingkungan | Wajib | Default | Deskripsi |
| --- | --- | --- | --- |
| `FONNTE_TOKEN` | Salah satu dari `FONNTE_TOKEN`/`TELEGRAM_TOKEN` wajib diisi | tidak ada | Token akses API akun Fonnte untuk validasi pengiriman pesan WhatsApp. Kosongkan jika WhatsApp tidak dipakai. |
| `TELEGRAM_TOKEN` | Salah satu dari `FONNTE_TOKEN`/`TELEGRAM_TOKEN` wajib diisi | tidak ada | Token bot Telegram dari BotFather. Kosongkan jika Telegram tidak dipakai. |
| `ESP_URL` | Ya | tidak ada | URL atau IP lokal/tunnel perangkat ESP8266 target, contoh `http://192.168.1.X` atau `https://nama-tunnel.trycloudflare.com`. |
| `PORT` | Tidak | `3000` | Port eksekusi server Node.js lokal. |

Contoh isi `.env`:

```ini
FONNTE_TOKEN=token_dari_fonnte
TELEGRAM_TOKEN=1234567890:AAHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
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

## Deployment

### Setup WhatsApp (Fonnte)

1. Buka [fonnte.com](https://fonnte.com), buat akun, **Tambah Device**, scan QR menggunakan WhatsApp yang dijadikan bot.
2. Salin **Token**, masukkan ke `FONNTE_TOKEN` di `.env` atau variabel deployment.
3. Setelah server di-deploy, isi **Webhook URL** di pengaturan device Fonnte: `https://<domain-deployment-anda>/webhook`.
4. Kirim pesan apa saja ke nomor bot untuk memverifikasi webhook aktif.

### Setup Telegram Bot

1. Buka [@BotFather](https://t.me/BotFather), kirim `/newbot`, ikuti instruksi nama dan username bot.
2. Salin token (format `1234567890:AAHxxxxxxx`), masukkan ke `TELEGRAM_TOKEN`.
3. Tidak perlu konfigurasi webhook, Growbot menggunakan polling sehingga langsung aktif saat server berjalan. Yang tetap memerlukan URL publik hanyalah `ESP_URL` (tunnel ke ESP8266), bukan bot Telegram itu sendiri.

### Deploy ke Railway

1. Push repository ke GitHub.
2. Buka [railway.app](https://railway.app), **New Project -> Deploy from GitHub Repo**, pilih repo `Growbot`.
3. Pada tab **Variables**, tambahkan `FONNTE_TOKEN`, `TELEGRAM_TOKEN`, `ESP_URL`, `PORT` sesuai kebutuhan.
4. Railway otomatis menjalankan `npm start`.
5. Salin URL Railway, tambahkan `/webhook`, daftarkan sebagai Webhook URL di Fonnte.

Catatan: sebagian besar platform PaaS menyediakan variabel `PORT` secara otomatis pada environment runtime; periksa dokumentasi Railway apabila ingin memastikan port yang benar-benar dipakai saat deployment.

### Remote Access ke ESP8266

Server Growbot di cloud tidak dapat langsung menjangkau ESP8266 di jaringan lokal. Jalankan salah satu metode berikut di komputer yang satu jaringan WiFi dengan ESP8266, dan biarkan berjalan selama sistem digunakan:

```bash
# Cloudflare Tunnel (direkomendasikan)
cloudflared tunnel --url http://192.168.X.X

# Tailscale Subnet Router
sudo tailscale up --advertise-routes=192.168.1.0/24
```

URL publik (Cloudflare) berubah setiap `cloudflared` dijalankan ulang; untuk URL permanen buat [Named Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) dengan akun Cloudflare gratis. Untuk Tailscale, setujui route di [Tailscale Admin Console](https://login.tailscale.com/admin/machines), lalu gunakan IP lokal ESP8266 sebagai `ESP_URL`.

---

## Manajemen dan Operasional

Menjalankan server secara lokal:

```bash
npm start
```

Untuk menerima webhook Fonnte saat pengembangan lokal, buat URL publik sementara untuk port server (bukan untuk ESP8266):

```bash
cloudflared tunnel --url http://localhost:3000
# atau
ngrok http 3000
# atau, tanpa instalasi pihak ketiga
ssh -R 80:localhost:3000 nokey@localhost.run
```

Gunakan URL yang dihasilkan sebagai Webhook URL sementara di Fonnte. Telegram polling berjalan langsung tanpa URL publik, tidak perlu konfigurasi tambahan untuk pengujian lokal.

---

## Referensi API

### Endpoint Growbot

| Method | Endpoint | Keterangan |
| :---: | --- | --- |
| GET | `/` | Healthcheck, mengembalikan teks status aktif/nonaktif WhatsApp dan Telegram. |
| POST | `/webhook` | Menerima payload pesan masuk dari Fonnte. Tidak melakukan verifikasi signature/asal request, lihat Keamanan. |

### Endpoint ESP8266 (Growmate) yang dipanggil Growbot

| Method | Endpoint | Keterangan |
| :---: | --- | --- |
| GET | `/api/data` | Status lengkap (ADC, kondisi, pompa, mode, threshold, count, jadwal). |
| GET | `/api/threshold?val=700` | Ubah threshold. |
| GET | `/api/presets` | Ambil daftar preset kustom, format `{"n": "nama", "t": threshold}`. |
| POST | `/api/presets` | Simpan preset kustom (array JSON). |
| GET | `/api/history` | 5 data ADC terakhir. |
| GET | `/api/schedule?min=60&en=1` | Atur jadwal penyiraman, `min` dalam menit, `en=0` untuk nonaktifkan. |
| GET | `/on` | Manual ON. |
| GET | `/off` | Manual OFF. |
| GET | `/auto` | Mode otomatis. |

Contoh respons `/api/data`:

```json
{
  "adc": 732,
  "kondisi": "KERING",
  "pump": "ON",
  "mode": "AUTO",
  "threshold": 700,
  "lastWatered": 143,
  "count": 3,
  "schedEnabled": true,
  "schedIntervalMin": 720,
  "schedElapsedMin": 45
}
```

---

## Troubleshooting

**Webhook Fonnte tidak pernah terpanggil**

Pastikan Webhook URL di dashboard Fonnte mengarah tepat ke `https://<domain>/webhook` (bukan domain root), dan server sudah dapat diakses secara publik (lewat deployment Railway atau tunnel lokal).

**Pesan terkirim tapi Growbot tidak merespons aksi ke ESP8266**

Periksa `ESP_URL` masih valid; URL Cloudflare Tunnel berubah setiap kali `cloudflared` dijalankan ulang sehingga harus diperbarui di `.env` atau variabel Railway setiap kali tunnel direstart, kecuali menggunakan Named Tunnel.

---

## Keamanan

- Endpoint `POST /webhook` tidak melakukan verifikasi signature atau token rahasia dari Fonnte. Kode hanya membaca field `sender`/`from` dan `message`/`text` dari body request apa pun yang masuk. Siapa pun yang mengetahui URL webhook dapat mengirim payload palsu dan menjalankan perintah kontrol pompa seakan-akan berasal dari nomor WhatsApp yang sah. Pertimbangkan menambahkan validasi token rahasia kustom pada query string atau header sebelum memproses request.
- Endpoint ESP8266 yang dipanggil Growbot (lihat README Growmate) tidak memiliki autentikasi sama sekali; keamanan sistem secara keseluruhan saat ini bergantung pada kerahasiaan URL `ESP_URL` dan endpoint webhook, bukan pada mekanisme otentikasi.
- Session percakapan multi-step disimpan in-memory tanpa enkripsi maupun batas waktu eksplisit; tidak ada dampak keamanan langsung karena tidak menyimpan kredensial, namun state akan hilang setiap restart/redeploy.
- `.env` dikecualikan dari version control melalui `.gitignore`. Jangan commit token Fonnte atau Telegram ke repository, dan rotasi token apabila pernah tidak sengaja terpublikasi.

---

## Lisensi

Repository ini tidak memiliki berkas `LICENSE`. Status lisensi belum dideklarasikan secara resmi.

---

<div align="center">
  <sub>Growbot merupakan bagian dari proyek <a href="https://github.com/hilmyah/Growmate">Growmate</a>, Smart Irrigation System berbasis ESP8266 / WEMOS D1 Mini.</sub>
</div>
