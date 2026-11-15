---
title: Platform secara sekilas
description: Peran, mata kuliah, pertemuan, tugas, kiriman, dan latihan di LARAS — tur berbahasa sederhana tentang cara aplikasi disusun.
sidebar_position: 1
---

# Platform secara sekilas

LARAS digunakan oleh dua peran utama: **dosen**, yang merancang mata kuliah, membuat tugas, dan menilai karya mahasiswa; serta **mahasiswa**, yang mengikuti pertemuan, mengumpulkan tugas, dan berlatih.

## Mata kuliah dan perencanaan

Sebuah **mata kuliah** adalah wadah utama. Setiap mata kuliah membawa rencana pembelajaran semester (**RPS**) yang memuat:

- **Capaian pembelajaran** — CPL (capaian pembelajaran lulusan), CPMK (capaian pembelajaran mata kuliah), dan Sub-CPMK (capaian yang lebih spesifik untuk pertemuan dan tugas tertentu).
- **Pertemuan mingguan**, yang dosen rakit dengan pembangun sesi visual: bagian, materi, dan aktivitas pembelajaran.
- **Struktur penilaian** — cara nilai disusun sepanjang semester.

Dosen memelihara **perpustakaan berkas** berupa bahan ajar. Berkas yang diunggah diproses menjadi teks, diversi (per versi), dan diorganisasikan ke dalam bagian yang dapat dipetakan ke capaian dan pertemuan. Perpustakaan ini penting untuk umpan balik AI: hanya bahan yang telah ditinjau dan disetujui dosen yang dapat dipakai sebagai dasar evaluasi AI (lihat [Bukti dan pengaitan](/docs/id/how-it-works/ai-feedback/grounding-and-evidence)).

## Tugas dan kiriman

Dosen membuat **tugas** dengan persyaratan, bentuk aktivitas, konfigurasi tugas terstruktur, dan **rubrik**. Usulan rubrik dapat dibantu AI, tetapi dosen memvalidasi rubrik akhir — rubrik adalah definisi soal penilaian.

Mahasiswa mengumpulkan karya melalui halaman ruang kerja kelasnya. Sebuah **kiriman** dapat berisi:

- **Teks ketikan atau tempelan**
- **Gambar** karya tulis tangan
- **Berkas PDF** — termasuk hasil pindai, yang halamannya dirender menjadi gambar dan dibaca dengan OCR
- **Rekaman audio** — yang ditranskripsikan menjadi teks oleh layanan pengenal ucapan

Kiriman juga dapat dijangkau lewat **tautan tugas bersama**, yang mengarahkan ke ruang kerja terdaftar mahasiswa — bukan membuat saluran anonim.

## Penilaian: draf AI, keputusan manusia

Saat karya dikumpulkan, platform dapat menghasilkan **draf evaluasi AI**: temuan (dengan kutipan dari karya mahasiswa), usulan rincian rubrik, dan usulan nilai. Ini adalah *draf* — disimpan terpisah dari nilai, dan hanya dosen yang dapat melihatnya.

Dosen meninjau draf di **ruang kerja evaluasi**: mengonfirmasi atau menolak temuan, menyesuaikan skor rubrik, menambah anotasi, lalu **menerbitkan**. Hanya hasil yang diterbitkan yang sampai ke mahasiswa. Lihat [Bagaimana umpan balik AI diberikan](/docs/id/how-it-works/ai-feedback) untuk alur lengkapnya.

## Latihan (tidak dinilai)

Di samping tugas resmi, mahasiswa memiliki **latihan pribadi** dan **latihan percakapan** dengan balasan AI, sintesis suara, dan transkripsi. Fitur ini memberi umpan balik dan refleksi tetapi **tidak pernah** dihitung sebagai nilai tugas resmi.

## Kelas terjadwal

Sesi mata kuliah dapat dijadwalkan untuk **berjalan tanpa pendampingan** (*kelas terjadwal*): aktivitas berjalan dengan pengatur waktu sementara mahasiswa berpartisipasi secara asinkron, dan kehadiran serta percobaan terekam untuk ditinjau dosen setelahnya.

## Asisten

Kedua peran memiliki **asisten AI** yang dapat menjawab pertanyaan tentang bahan ajar, membantu menyusun rencana pembelajaran, dan melakukan tindakan yang disetujui dosen. Tindakan asisten dicatat dan diaudit; permintaan dalam bahasa alami tidak pernah memberi kewenangan dengan sendirinya.

## Istilah

| Istilah | Arti |
|---|---|
| Mata kuliah | Course |
| RPS | Rencana pembelajaran semester |
| CPL / CPMK / Sub-CPMK | Capaian pembelajaran lulusan / mata kuliah / sub-capaian |
| Pertemuan | Sesi kelas (pertemuan mingguan) |
| Tugas | Assignment |
| Kiriman | Kiriman karya mahasiswa |
| Penilaian | Assessment / penilaian |
| Nilai | Grade |
| Berkas | Perpustakaan berkas dan bahan ajar |
| Latihan | Latihan pribadi |
| Percakapan | Latihan percakapan |
| Asisten | Asisten AI |
| Riset | Perkakas telaah dan analisis riset |
