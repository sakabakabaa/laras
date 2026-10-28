// Shared by the recovery-email hooks: resolves the public site base URL, the
// absolute link that goes into the email, and the configured sender address.
//
// PocketBase exposes app settings with their JSON tag names, so the public URL
// field is `meta.appURL`. Reading `meta.appUrl` yields undefined, which is how
// these mails used to ship a relative href ("/reset-password?token=…") that no
// mail client can open. `PUBLIC_APP_URL` wins over the stored setting so a
// deployment can point links at its real host without editing pb_data.
function appBaseUrl(app) {
    let url = "";
    try {
        url = String($os.getenv("PUBLIC_APP_URL") || "").trim();
    } catch (_) {
        url = "";
    }
    if (!url) {
        try {
            url = String(app.settings().meta.appURL || "").trim();
        } catch (_) {
            url = "";
        }
    }
    while (url.length > 1 && url.endsWith("/")) url = url.slice(0, -1);
    return url;
}

// Returns "" (and logs) when no base URL is configured, so the caller can skip
// sending a mail whose only link would be dead.
function link(app, path, token) {
    const base = appBaseUrl(app);
    if (!base) {
        app.logger().error(
            "mail link skipped: PUBLIC_APP_URL and settings.meta.appURL are both empty",
            "path",
            path,
        );
        return "";
    }
    return base + path + "?token=" + encodeURIComponent(token);
}

function senderAddress(app) {
    try {
        return String(app.settings().meta.senderAddress || "").trim();
    } catch (_) {
        return "";
    }
}

module.exports = { appBaseUrl, link, senderAddress };