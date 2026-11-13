# SiteFetch

Website downloader sederhana berbasis Next.js untuk mengarsipkan halaman HTML publik dan aset satu domain yang ditemukan di halaman utama.

## Jalankan lokal

```bash
npm install
npm run dev
```

Buka http://localhost:3000.

## Deploy ke GitHub dan Vercel

1. Buat repository GitHub baru.
2. Upload seluruh isi folder project ini ke repository.
3. Di Vercel pilih **Add New → Project**, lalu import repository tersebut.
4. Framework akan terdeteksi sebagai Next.js. Klik **Deploy**.

Tidak perlu environment variable untuk versi awal ini.

## Batasan versi awal

- Mengunduh homepage HTML dan maksimal 35 aset publik satu domain.
- Batas tiap file 2 MB, total 12 MB.
- Tidak menjalankan JavaScript website target, tidak login, tidak mengambil halaman di balik autentikasi, dan bukan full-site crawler.
- Aset dari CDN/domain lain sengaja tidak diambil.
- Beberapa URL relatif, CSS bertingkat, konten dinamis, dan tautan internal mungkin perlu penyesuaian manual.
- Vercel Functions memiliki batas waktu dan ukuran respons; website besar mungkin gagal diproses.

## Penggunaan yang bertanggung jawab

Gunakan hanya untuk website milik sendiri atau website yang kamu punya izin untuk arsipkan. Jangan gunakan untuk menyalin identitas, konten, atau tampilan situs pihak lain untuk penipuan, phishing, atau penyamaran.
