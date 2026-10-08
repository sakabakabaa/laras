/// <reference path="../pb_data/types.d.ts" />

// Phase 3 — sends the recovery-email verification link when a pending
// `email_verifications` record is created (by the /api/recovery-email/request
// route, which runs as superuser). Runs post-commit, so a mail failure never
// blocks the request. The link points at the public /verifikasi-email page,
// which calls /api/recovery-email/verify with the token.
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

    const link = appUrl + "/verifikasi-email?token=" + token;

    const message = new MailerMessage({
        from: { name: "LARAS" },
        to: [{ address: email }],
        subject: "Verifikasi email pemulihan LARAS",
        html: "" +
            "<div style=\"font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#1f2733\">" +
            "<h2 style=\"color:#7d180f\">Verifikasi email Anda</h2>" +
            "<p>Kami menerima permintaan untuk menambahkan email ini sebagai email pemulihan akun LARAS Anda.</p>" +
            "<p>Klik tautan di bawah untuk mengonfirmasi. Tautan ini kedaluwarsa dalam 24 jam:</p>" +
            "<p style=\"margin:24px 0\">" +
            "<a href=\"" + link + "\" style=\"display:inline-block;background:#7d180f;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:700\">Verifikasi email</a>" +
            "</p>" +
            "<p style=\"font-size:12px;color:#6b7280\">Jika Anda tidak merasa meminta perubahan ini, abaikan email ini.</p>" +
            "</div>",
    });

    try {
        $app.newMailClient().send(message);
    } catch (err) {
        $app.logger().error("recovery email verification send failed", "to", email, "err", String(err));
    }

    e.next();
}, "email_verifications");
