<div align="center">
  <img src="asset/growmate.png" alt="Growbot Logo" width="120" height="120" style="border-radius:12px"/>
  <h1>Growbot</h1>
  <p>WhatsApp dan Telegram Gateway untuk sistem irigasi cerdas Growmate.</p>
  <p>
    <a href="https://github.com/hilmyah/Growmate">Growmate Firmware</a>
  </p>
</div>

![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?logo=node.js&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Railway%20%7C%20Local-lightgrey)

## Fitur

| Fitur | Deskripsi |
| --- | --- |
| Dual Platform Gateway | Menghubungkan kontrol irigasi melalui antarmuka pesan WhatsApp dan Telegram secara bersamaan. |
| Redundansi Akses | Kedua platform berjalan paralel. Jika salah satu layanan gagal, platform lainnya tetap berfungsi sebagai cadangan. |
| Realtime Monitoring | Memantau status kelembaban tanah, status pompa, dan mode operasi mikrokontroler dari jarak jauh. |
| Remote Control | Mengeksekusi penyiraman manual, mengubah batas ambang nilai kelembaban, dan mengonfigurasi jadwal irigasi. |

## Konsep dan Arsitektur

Server perantara ini memproses logika komunikasi asinkron antara pengguna akhir dan perangkat IoT (ESP8266). Sistem menggunakan Webhook untuk menangani lalu lintas data WhatsApp melalui Fonnte, dan menggunakan metode Polling untuk menangani instruksi Telegram.

![Alur Kerja Growbot](asset/flowchart.png)

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

## Prasyarat

| Komponen | Spesifikasi / Versi | Keterangan |
| --- | --- | --- |
| Node.js | >= 18.x | Runtime untuk mengeksekusi server backend aplikasi |
| npm | >= 9.x | Package manager untuk mengunduh dependensi |
| Akun Fonnte | Aktif | Layanan pihak ketiga penyedia API WhatsApp |
| Bot Telegram | BotFather | Membutuhkan kredensial token HTTP API |
| Publikator Port | Cloudflared / Ngrok | Diperlukan jika server berjalan di jaringan lokal (localhost) |

## Instalasi

Kloning repositori dan instal dependensi yang diperlukan:

```bash
git clone [https://github.com/hilmyah/Growbot.git](https://github.com/hilmyah/Growbot.git)
cd Growbot
npm install

```

## Konfigurasi

Persiapkan parameter environment sebelum menjalankan gateway. Salin konfigurasi bawaan:

```bash
cp .env.example .env

```

Sesuaikan nilai di dalam `.env` berdasarkan kredensial masing-masing platform.

| Variabel Lingkungan | Status | Default | Deskripsi |
| --- | --- | --- | --- |
| `FONNTE_TOKEN` | Wajib | - | Token akses API akun Fonnte untuk validasi request WhatsApp. |
| `TELEGRAM_BOT_TOKEN` | Wajib | - | Token identifikasi bot Telegram dari BotFather. |
| `ESP_IP` | Wajib | - | Alamat IP atau URL resolusi (tunnel) perangkat ESP8266 target. |
| `PORT` | Opsional | 3000 | Port eksekusi server Node.js lokal. |

## Manajemen dan Operasional

Menjalankan server Node.js:

```bash
npm start

```

### Konfigurasi Webhook Fonnte (Akses Lokal)

Telegram menggunakan metode *polling* sehingga dapat menerima pesan meskipun berjalan di localhost. Namun, untuk menerima *webhook* WhatsApp dari server Fonnte, *port* lokal harus diekspos ke jaringan publik menggunakan salah satu metode berikut:

```bash
# Menggunakan Cloudflared
cloudflared tunnel --url http://localhost:3000

# Menggunakan Ngrok
ngrok http 3000

# Menggunakan localhost.run (tanpa instalasi pihak ketiga)
ssh -R 80:localhost:3000 nokey@localhost.run

```

Salin URL publik yang dihasilkan oleh perintah di atas dan daftarkan pada pengaturan Webhook URL di *dashboard* Fonnte Anda.

## Referensi Terkait

Pemrosesan data sensor dan instruksi fisik secara detail ditangani oleh unit ESP8266. Dokumentasi instruksi API endpoint yang diakses oleh Growbot pada unit mikrokontroler dapat dilihat melalui repositori [Growmate](https://www.google.com/url?sa=E&source=gmail&q=https://github.com/hilmyah/Growmate).
