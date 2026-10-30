// Shared, email-client-friendly branding for account recovery messages.
function escape(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
        .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function render(options) {
    const reset = options.kind === "reset";
    const title = reset ? "Buat kata sandi baru" : "Verifikasi email Anda";
    const subject = reset ? "Reset kata sandi LARAS" : "Verifikasi email pemulihan LARAS";
    const intro = reset
        ? "Kami menerima permintaan untuk mengubah kata sandi akun LARAS Anda. Gunakan tombol di bawah untuk membuat kata sandi baru."
        : "Konfirmasikan alamat email ini agar Anda dapat memulihkan akses ke akun LARAS saat lupa kata sandi.";
    const button = reset ? "Reset kata sandi" : "Verifikasi email";
    const notice = reset
        ? "Jika Anda tidak meminta reset ini, abaikan email ini. Kata sandi Anda tetap aman dan hanya berubah setelah Anda menyimpan kata sandi baru."
        : "Jika Anda tidak meminta verifikasi ini, abaikan email ini. Alamat ini hanya ditautkan ke akun setelah Anda mengonfirmasinya.";
    const base = options.baseUrl.replace(/\/+$/, "");
    const domain = base.replace(/^https?:\/\//, "").split("/")[0];
    const url = escape(options.url), home = escape(base), host = escape(domain);
    const logo = home + "/laras-mark.png";
    const html = `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${subject}</title>
<style>@media only screen and (max-width:600px){.outer{padding:20px 12px!important}.content{padding:28px 24px!important}.brand{padding:24px!important}.title{font-size:28px!important}.action{display:block!important;text-align:center!important}}</style></head>
<body style="margin:0;padding:0;background-color:#f5f6f8;color:#14181f;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(button)} untuk akun LARAS Anda. Tautan berlaku 24 jam.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f5f6f8"><tr><td class="outer" align="center" style="padding:40px 16px;">
<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden;" bgcolor="#ffffff">
<tr><td style="height:5px;background-color:#b3261e;font-size:0;line-height:0;" bgcolor="#b3261e">&nbsp;</td></tr>
<tr><td class="brand" style="padding:30px 36px 26px;border-bottom:1px solid #eceef1;">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td width="56" valign="middle"><a href="${home}" style="text-decoration:none;"><img src="${logo}" width="42" alt="" style="display:block;width:42px;height:auto;border:0;"></a></td><td valign="middle"><a href="${home}" style="font-size:22px;line-height:28px;font-weight:700;letter-spacing:2px;color:#14181f;text-decoration:none;">LARAS</a><br><a href="${home}" style="font-size:12px;line-height:20px;color:#626b78;text-decoration:none;">${host}</a></td></tr></table>
</td></tr>
<tr><td class="content" style="padding:34px 36px 36px;">
<p style="margin:0 0 12px;font-size:11px;line-height:18px;font-weight:700;letter-spacing:1.5px;color:#b3261e;">KEAMANAN AKUN</p>
<h1 class="title" style="margin:0 0 18px;font-size:32px;line-height:1.2;font-weight:700;letter-spacing:-0.8px;color:#14181f;">${title}</h1>
<p style="margin:0 0 26px;font-size:15px;line-height:25px;color:#4b5563;">${intro}</p>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 24px;"><tr><td bgcolor="#b3261e" style="border-radius:9px;background-color:#b3261e;text-align:center;mso-padding-alt:16px 28px;"><a class="action" href="${url}" style="display:inline-block;padding:16px 28px;border:1px solid #b3261e;border-radius:9px;font-size:15px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;mso-padding-alt:0;">${button}</a></td></tr></table>
<p style="margin:0 0 26px;font-size:12px;line-height:20px;color:#626b78;">Tautan berlaku <strong style="color:#374151;">24 jam</strong> dan hanya dapat digunakan sekali.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:16px 18px;background-color:#faf5f4;border-left:3px solid #b3261e;border-radius:0 8px 8px 0;font-size:13px;line-height:22px;color:#62606a;" bgcolor="#faf5f4">${notice}</td></tr></table>
<p style="margin:26px 0 8px;font-size:12px;line-height:20px;color:#626b78;">Tombol tidak berfungsi? Salin tautan berikut ke browser Anda:</p>
<p style="margin:0;font-size:12px;line-height:20px;word-break:break-all;overflow-wrap:anywhere;"><a href="${url}" style="color:#9f211a;text-decoration:underline;word-break:break-all;">${url}</a></p>
</td></tr></table>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;"><tr><td align="center" style="padding:22px 20px;font-size:11px;line-height:19px;color:#697382;">Dikirim oleh LARAS &middot; <a href="${home}" style="color:#697382;text-decoration:underline;">${host}</a><br>Email otomatis. Mohon tidak membalas email ini.</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
    const text = ["LARAS — " + domain, title, intro, button + ": " + options.url,
        "Tautan berlaku 24 jam dan hanya dapat digunakan sekali.", notice,
        "Dikirim oleh LARAS · " + base, "Email otomatis. Mohon tidak membalas email ini."].join("\n\n");
    return { subject, html, text };
}

module.exports = { render };
