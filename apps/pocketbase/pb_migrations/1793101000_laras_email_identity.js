/// <reference path="../pb_data/types.d.ts" />

// Remove the inherited preview-host identity from native PocketBase emails.
// Custom recovery mail uses the same public URL and the shared LARAS template.
migrate((app) => {
    const settings = app.settings();
    const base = ($os.getenv("PUBLIC_APP_URL") || settings.meta.appURL || "").trim().replace(/\/+$/, "");
    if (!/^https?:\/\/[^/\s]+(?:\/[^\s]*)?$/.test(base)) {
        throw new Error("A valid PUBLIC_APP_URL is required for LARAS email branding.");
    }
    settings.meta.appName = "LARAS";
    settings.meta.senderName = "LARAS";
    settings.meta.appURL = base;
    app.save(settings);
}, () => {
    // Deployment identity should not revert to an obsolete preview domain.
});
