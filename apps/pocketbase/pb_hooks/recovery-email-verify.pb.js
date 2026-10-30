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

    const helper = require(`${__hooks}/mail-links.js`);
    const link = helper.link(e.app, "/verifikasi-email", token);
    if (!link) {
        e.next();
        return;
    }

    const from = { name: "LARAS" };
    const sender = helper.senderAddress(e.app);
    if (sender) from.address = sender;

    const template = require(`${__hooks}/account-email.js`).render({
        kind: "verify",
        baseUrl: helper.appBaseUrl(e.app),
        url: link,
    });
    const message = new MailerMessage({
        from: from,
        to: [{ address: email }],
        subject: template.subject,
        html: template.html,
        text: template.text,
    });

    try {
        $app.newMailClient().send(message);
    } catch (err) {
        $app.logger().error("recovery email verification send failed", "to", email, "err", String(err));
    }

    e.next();
}, "email_verifications");