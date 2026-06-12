// ── Translation dictionary (Indonesian → English) ───────────
//
// Keys are the Indonesian SOURCE strings exactly as they appear in
// t('...') calls. Values are the English translations. When the
// active language is 'en' and a key is missing here, the source
// (Indonesian) string is shown as a graceful fallback.
//
// Strings that are already English in the source (e.g. "Dashboard",
// "Home Page") need no entry — they read the same in both languages.
//
// Keep this sorted-ish by area to stay maintainable. New entries are
// appended per page/feature as translation coverage grows.

import { GENERATED } from './generated'

// Curated, hand-checked translations. These override the auto-generated
// ones below on key conflicts (spread order: GENERATED first, SEED last).
const SEED: Record<string, string> = {
  // ── Account menu / chrome ──
  'Edit Profil': 'Edit Profile',
  'Ubah Password': 'Change Password',
  'Ganti Bahasa': 'Change Language',
  'Setting Access': 'Access Settings',
  'Keluar': 'Log Out',
  'Ganti foto profil': 'Change profile photo',
  'Upload gagal, coba lagi': 'Upload failed, please try again',
  'Ukuran file maks 20MB': 'Max file size 20MB',

  // ── Sidebar nav (Indonesian items only) ──
  'Pencari Ide': 'Idea Finder',
  'Generator Gambar': 'Image Generator',
  'Template Gambar': 'Image Templates',
  'Generator Audio': 'Audio Generator',
  'Invoice & Bayar': 'Invoice & Payment',
  'Hak Akses': 'Access Control',
  'Cari menu': 'Search menu',
  'Tidak ada menu yang cocok.': 'No matching menu.',

  // ── Common actions / buttons ──
  'Simpan': 'Save',
  'Simpan Perubahan': 'Save Changes',
  'Simpan Password': 'Save Password',
  'Batal': 'Cancel',
  'Tutup': 'Close',
  'Hapus': 'Delete',
  'Hapus Post': 'Delete Post',
  'Post ini akan dihapus permanen. Tindakan ini tidak bisa dibatalkan.':
    'This post will be permanently deleted. This action cannot be undone.',
  'Memproses…': 'Processing…',
  'Lanjut': 'Continue',
  'Selesai': 'Done',
  // ── Post history / restore ──
  'Riwayat': 'History',
  'Riwayat — Post Terhapus': 'History — Deleted Posts',
  'Tidak ada post terhapus.': 'No deleted posts.',
  'dihapus': 'deleted',
  'Pulihkan': 'Restore',
  'Hapus Permanen': 'Delete Permanently',
  'Post ini akan dihapus permanen dan tidak bisa dipulihkan.':
    'This post will be permanently deleted and cannot be restored.',
  '(Tanpa judul)': '(Untitled)',
  // ── Comment @mentions ──
  'Tulis komentar… ketik @ untuk mention (⌘/Ctrl + Enter kirim)':
    'Write a comment… type @ to mention (⌘/Ctrl + Enter to send)',
  'me-mention kamu di komentar': 'mentioned you in a comment',
  'Anda di-tag pada post ini': 'You were tagged on this post',
  'Notifikasi muncul saat Anda di-tag pada post atau di-mention di komentar.':
    'Notifications appear when you are tagged on a post or mentioned in a comment.',

  // ── Post change history ──
  'Riwayat Perubahan': 'Change History',
  'Belum ada riwayat.': 'No history yet.',
  'Dibuat': 'Created',
  'Diubah': 'Changed',
  'diubah': 'changed',
  'Dihapus': 'Deleted',
  'Dipulihkan': 'Restored',
  'Dihapus permanen': 'Permanently deleted',
  'Tanggal': 'Date',
  'Hashtag': 'Hashtag',
  'Tipe konten': 'Content type',
  'Link video': 'Video link',
  'Link desain': 'Design link',
  'File video': 'Video file',
  'File desain': 'Design file',
  'Catatan': 'Notes',
  'Tag': 'Tag',
  'Rasio': 'Ratio',
  'File': 'File',
  'Brief': 'Brief',
  'Tambah Akun': 'Add Account',
  'Belum ada pesan. Mulai obrolan!': 'No messages yet. Start the conversation!',
  'Muat lebih lama': 'Load older',
  'Tulis pesan… (Enter kirim, Shift+Enter baris baru)': 'Write a message… (Enter to send, Shift+Enter for newline)',
  'Kirim': 'Send',
  'Saya': 'Me',
  '(gagal terkirim)': '(failed to send)',
  'Pilih Platform': 'Choose Platform',
  'Belum ada akun login': 'No account logged in',
  'Instagram hanya menyediakan data follower terbatas. Tren harian akan makin lengkap seiring sinkron berjalan tiap hari.': 'Instagram only provides limited follower data. The daily trend fills in as syncs run each day.',
  'Engagement per Konten': 'Engagement per Post',
  'Belum ada data engagement konten.': 'No content engagement data yet.',
  'Belum ada data reach.': 'No reach data yet.',
  'Memperbarui…': 'Updating…',
  'Konfirmasi': 'Confirm',
  'Putuskan': 'Disconnect',
  'Putuskan & hapus data akun ini?': "Disconnect & delete this account's data?",
  'Buat Akun': 'Create Account',
  'Atur Akses': 'Manage Access',
  'Edit Akun': 'Edit Account',
  'Ganti Foto': 'Change Photo',
  'Cari akun…': 'Search account…',
  'Pilih semua': 'Select all',
  'Kosongkan': 'Clear',

  // ── Password / profile fields ──
  'Password baru': 'New password',
  'Ulangi password baru': 'Repeat new password',
  'Tampilkan password': 'Show password',
  'Minimal 6 karakter': 'Minimum 6 characters',
  'Ketik ulang password': 'Re-type password',
  'Password minimal 6 karakter': 'Password must be at least 6 characters',
  'Konfirmasi password tidak cocok': 'Password confirmation does not match',
  'Gagal mengubah password': 'Failed to change password',
  'Password berhasil diubah. Gunakan password baru saat login berikutnya.':
    'Password changed successfully. Use the new password on your next login.',
  'Nama Project *': 'Project Name *',
  'Nama project...': 'Project name...',
  'Tulis headline...': 'Write the headline...',
  'Belum ada headline.': 'No headline yet.',
  'Project *': 'Project *',
  'Pilih project...': 'Select project...',
  'Pilih project terlebih dahulu!': 'Please select a project first!',
  'Nama project wajib diisi!': 'Project name is required!',
  'Salin': 'Copy',
  'Tersalin': 'Copied',
  '+ Upload': '+ Upload',
  'Mengupload…': 'Uploading…',
  'Gagal mengupload': 'Upload failed',
  'Belum ada lampiran.': 'No attachments yet.',
  'Nama lengkap': 'Full name',
  'Nomor telepon': 'Phone number',
  'Jabatan / posisi': 'Job / position',
  'Tanggal bergabung': 'Joined date',
  'Login terakhir': 'Last login',
  'Link konfirmasi akan dikirim ke email baru.': 'A confirmation link will be sent to the new email.',
  'Sesi tidak ditemukan': 'Session not found',

  // ── Access control page ──
  'Akses Menu per Akun': 'Menu Access per Account',
  'Akun super admin tidak bisa diubah': 'The super admin account cannot be edited',
  'Akun tidak ditemukan': 'Account not found',
  'Email tidak valid': 'Invalid email',
  'Email sudah terdaftar': 'Email already registered',
  'Email sudah dipakai akun lain': 'Email is already used by another account',
  'Super Admin': 'Super Admin',
  'Admin': 'Admin',
  'User': 'User',
}

export const DICT: Record<string, string> = { ...GENERATED, ...SEED }
