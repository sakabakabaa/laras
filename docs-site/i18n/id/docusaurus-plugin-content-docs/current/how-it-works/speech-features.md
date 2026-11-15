---
title: Fitur suara
description: Latihan percakapan, sintesis suara (Hostinger, ElevenLabs) dan pengenal ucapan (sidecar Whisper mandiri, penyedia hosting) di LARAS.
sidebar_position: 4
---

# Fitur suara

LARAS memiliki latihan dan bantuan berbahasa lisan. Fitur ini adalah **perkakas belajar**, bukan penilaian resmi: fitur ini tidak pernah menghasilkan nilai tugas.

## Latihan percakapan

Latihan percakapan adalah latihan berbicara berbasis giliran:

- Mahasiswa berbicara; rekamannya **ditranskripsikan** menjadi teks.
- Platform menghasilkan **balasan model** dan melanjutkan percakapan.
- Balasan dibacakan dengan **sintesis suara**.
- Percakapan dibatasi sejumlah giliran tetap; sebuah refleksi disimpan ke profil mahasiswa untuk ditinjau.

Deteksi aktivitas suara berjalan di peramban. Alurnya adalah rangkaian giliran HTTP — bukan soket realtime yang terus-menerus — sehingga tetap andal pada koneksi sederhana.

## Pengenal ucapan (speech-to-text)

| Aspek | Detail |
|---|---|
| Opsi mandiri | Sidecar Whisper yang dipakai dengan prioritas untuk audio perpustakaan |
| Alternatif hosting | Titik uji transkripsi hosting (`whisper-1` secara bawaan) |
| Digunakan untuk | Latihan percakapan dan kiriman audio |

Hasil transkripsi diperlakukan sebagai **bukti** — dan satu aturan tegas mengikuti dari itu: umpan balik evaluasi AI **tidak pernah menilai pelafalan, intonasi, atau kelancaran dari transkrip**, karena transkrip tidak memuat informasi tersebut.

## Sintesis suara (text-to-speech)

| Penyedia | Status |
|---|---|
| Hostinger TTS | Penyedia sintesis suara bawaan |
| ElevenLabs | Alternatif opsional, dipilih oleh konfigurasi deployment |

Pilihan penyedia adalah konfigurasi tingkat deployment; situs dokumentasi ini tidak mencatat penyedia mana yang dipakai deployment tertentu.
