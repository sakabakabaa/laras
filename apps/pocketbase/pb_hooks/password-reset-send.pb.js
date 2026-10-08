/// <reference path="../pb_data/types.d.ts" />

// Phase 5 — sends the password-reset link when a `password_resets` record is
// created (by the /api/recovery-email/request-reset route, which runs as
// superuser). Runs post-commit, so a mail failure never blocks the request.
// The link points at the public /reset-password page, which calls
// /api/recovery-email/reset-password with the token.
onRecordAfterCreateSuccess((e) => {
    const record = e.record;
    const email = record.get("email");
    const token = record.get("token");

    if (!email || !token) {
        e.next();
        return;
    }

    let appUrl = "";
    try {
        appUrl = $app.settings().meta.appUrl || "";
    } catch (_) {
        appUrl = "";
    }
    if (appUrl.endsWith("/")) appUrl = appUrl.slice(0, -1);

    const link = appUrl + "/reset-password?token=" + token;

    const message = new MailerMessage({
        from: { name: "LARAS" },
        to: [{ address: email }],
        subject: "Reset kata sandi LARAS",
        html: "" +
            "<div style=\"font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2733\">" +
            "<h2 style=\"color:#7d180f\">Reset kata sandi</h2>" +
            "<p>Kami menerima permintaan untuk mengubah kata sandi akun LARAS Anda.</p>" +
            "<p>Klik tautan di bawah untuk membuat kata sandi baru. Tautan ini kedaluwarsa dalam 24 jam dan hanya berlaku sekali:</p>" +
            "<p style=\"margin:24px 0\">" +
            "<a href=\"" + link + "\" style=\"display:inline-block;background:#7d180f;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700\">Reset kata sandi</a>" +
            "</p>" +
            "<p style=\"font-size:12px;color:#6b7280\">Jika Anda tidak merasa meminta perubahan ini, abaikan email ini. Kata sandi Anda tidak akan berubah sampai Anda membuat yang baru melalui tautan di atas.</p>" +
            "</div>",
    });

    try {
        $app.newMailClient().send(message);
    } catch (err) {
        $app.logger().error("password reset send failed", "to", email, "err", String(err));
    }

    e.next();
}, "password_resets");
