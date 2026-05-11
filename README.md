# Growbot — WhatsApp Gateway for Growmate

Growbot adalah server perantara (middleware) berbasis Node.js yang menghubungkan layanan WhatsApp API (Fonnte) dengan modul ESP8266 melalui Cloudflare Tunnel. Bot ini memungkinkan kontrol dan pemantauan sistem irigasi Growmate secara jarak jauh melalui perintah teks WhatsApp.

## Fitur Utama

- Monitoring status kelembaban tanah (ADC dan persentase).
- Kontrol pompa air (Manual ON, Manual OFF, dan Auto Mode).
- Pengaturan nilai threshold kelembaban secara dinamis.
- Penambahan preset tanaman baru ke dalam sistem.
- Riwayat 5 data kelembaban terakhir.
- Penghitung jumlah penyiraman harian.
- Menu instruksi otomatis pada setiap balasan pesan.

## Persyaratan Sistem

- Node.js versi 16.x atau lebih baru.
- Akun Fonnte (untuk WhatsApp API).
- Cloudflare Tunnel (cloudflared) terinstal di host lokal ESP8266.
- Modul ESP8266 dengan firmware Growmate yang sudah aktif.

## Persiapan dan Instalasi

1. Clone repository atau siapkan folder proyek.
2. Instal dependensi yang diperlukan:
   ```bash
   npm install