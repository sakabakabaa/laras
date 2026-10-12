# Production domain

Primary URL: https://laras.zulficar.me

DNS A record points to 187.77.115.18. Traefik obtains HTTPS certificates using the existing Let's Encrypt HTTP challenge. The web container uses WEBSITE_DOMAIN=laras.zulficar.me when generating file URLs for AI integrations.

The previous laras.srv1957161.hstgr.cloud host redirects page paths and query strings to the primary host. Its /hcgi/platform/api routes remain available for existing file links and active legacy clients. PocketBase and its data volume are unchanged.

Users may need to log in again on the new host because browser authentication storage is scoped to the origin. Any externally configured OAuth callback must use the new host before that provider can be used there.

Deploy compose configuration with docker compose up -d; no application image rebuild is required for a hostname-only change. Reverting this commit and recreating the services restores the prior hostname configuration.
