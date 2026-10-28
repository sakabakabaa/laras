/// <reference path="../pb_data/types.d.ts" />
onMailerSend((e) => {
    if (e.app.settings().smtp.enabled) {
        return e.next()
    }

    const apiUrl = ($os.getenv("BUILDER_MAILER_API_URL") || "").replace(/\/+$/, "")
    const apiKey = $os.getenv("BUILDER_MAILER_API_KEY") || ""
    const senderAddress = $os.getenv("BUILDER_MAILER_SENDER_ADDRESS") || ""

    // Without SMTP and without the builder transport there is no way to send.
    // Fail with a clear log line instead of a DNS error against "/api/v2/email".
    if (!apiUrl || !apiKey) {
        e.app.logger().error(
            "no mail transport configured: enable SMTP settings or set BUILDER_MAILER_API_URL and BUILDER_MAILER_API_KEY",
            "subject", e.message.subject,
            "to", e.message.to && e.message.to.length ? e.message.to[0].address : ""
        )
        throw new ApiError(500, "Mail transport is not configured.")
    }

    const cc = (e.message.cc || []).map((recipient) => recipient.address).filter(Boolean);
    const bcc = (e.message.bcc || []).map((recipient) => recipient.address).filter(Boolean);

    const payload = {
        "subject": e.message.subject,
        "content": {
            ...(e.message.html ? {
                "html": e.message.html,
            } : {
                "text": e.message.text,
            }),
            "type": "plain",
        },
        "from": senderAddress,
        "fromName": e.message.from?.name,
        "replyTo": senderAddress,
        "to": e.message.to[0].address,
        ...(cc.length ? { "cc": cc } : {}),
        ...(bcc.length ? { "bcc": bcc } : {}),
    }

    const response = $http.send({
        url: `${apiUrl}/api/v2/email`,
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
    });
    
    if (response.statusCode !== 200) {
        $app.logger().error("Failed to send email", "error", response.json);

        throw new ApiError(500, response.json?.message || 'Failed to send email');
    }
})