import {
	data,
	isRouteErrorResponse,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
	useLocation,
} from 'react-router';
import { useEffect, useLayoutEffect } from 'react';
import type { Route } from './+types/root';
import stylesheet from '@/index.css?url';
import darkOverrides from '@/styles/dark-overrides.css?url';
import studentHome from '@/styles/student-home.css?url';
import premiumWorkspace from '@/styles/premium-workspace.css?url';
import personalPractice from '@/styles/personal-practice.css?url';
import { siteOrigin } from '@/lib/site-origin.server';
import { HorizonsPreviewScripts } from './horizons-preview-scripts';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ConfirmDialogHost } from '@/components/confirm-dialog';
import { EditorOverlayGuard } from '@/components/editor-overlay-guard';
import pb from '@/lib/pocketbase-client';

// The PocketBase SDK cancels an in-flight request when a new one shares its
// autoCancellation key — and that key is `method + path` only, ignoring query
// params (sort, filter, …). So every concurrent `getFullList('courses')` across
// the courses page, dashboard, global search, task board, etc. cancels the
// others, and the cancelled fetch is silently swallowed by the stale-while-
// revalidate cache — leaving a stale (empty) list that never refreshes. The
// local cache's `inflight` dedup already prevents true duplicate requests, so
// disabling autoCancellation is safe and matches the server client.
pb.autoCancellation(false);

const useClientLayoutEffect = typeof document === 'undefined' ? useEffect : useLayoutEffect;

export const links: Route.LinksFunction = () => [
	{ rel: 'stylesheet', href: stylesheet },
	{ rel: 'stylesheet', href: premiumWorkspace },
	{ rel: 'stylesheet', href: personalPractice },
	{ rel: 'stylesheet', href: darkOverrides },
	{ rel: 'stylesheet', href: studentHome },
	{ rel: 'icon', href: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
	{ rel: 'icon', href: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
	{ rel: 'icon', href: '/favicon.png', type: 'image/png', sizes: '48x48' },
	{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
	{
		rel: 'preconnect',
		href: 'https://fonts.gstatic.com',
		crossOrigin: 'anonymous',
	},
	{
		rel: 'stylesheet',
		href: 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap',
	},
];

/**
 * Publishes the site's public origin, which `seo()` reads to build canonical and
 * `og:url` tags, and advertises the sitemap to crawlers that read response
 * headers rather than HTML.
 *
 * A `meta` export can only reach server data through `matches`, and the `headers`
 * export cannot see loader data at all, so both have to travel this way.
 */
export function loader({ request }: Route.LoaderArgs) {
	const origin = siteOrigin(request);

	return data(
		{ origin },
		{ headers: { Link: `<${origin}/sitemap.xml>; rel="sitemap"; type="application/xml"` } },
	);
}

/**
 * A page route that exports `headers` replaces this one, so merge `parentHeaders`
 * there rather than returning only that route's own headers.
 */
export function headers({ loaderHeaders }: Route.HeadersArgs) {
	return loaderHeaders;
}

/**
 * The root loader only returns the site origin, which is derived from the
 * request host and never changes during a session. Without this, React Router
 * revalidates the root loader on every client-side navigation, firing a
 * `.data` request each time. Rapid navigation aborts those in-flight requests
 * and surfaces "Failed to fetch" errors. Returning `false` skips the
 * revalidation entirely — the origin computed on the initial server render is
 * reused for every subsequent navigation.
 */
export function shouldRevalidate() {
	return false;
}

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="id" suppressHydrationWarning>
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<script
					dangerouslySetInnerHTML={{
						__html: `(function(){try{var p=location.pathname;var lightOnly=p==='/'||p==='/login';var t=localStorage.getItem('laras-theme');var d=!lightOnly&&(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches));var r=document.documentElement;r.classList.toggle('dark',d);r.style.colorScheme=d?'dark':'light';var m=document.querySelector('meta[name="color-scheme"]');if(!m){m=document.createElement('meta');m.name='color-scheme';document.head.appendChild(m)}m.content=d?'dark light':'light'}catch(e){}})()`,
					}}
				/>
				<Meta />
				<Links />
				<HorizonsPreviewScripts />
			</head>
			{/* `suppressHydrationWarning` ignores attribute-only mismatches on <body>
			    caused by browser extensions (e.g. Grammarly's data-gr-ext-installed)
			    that mutate the DOM before React hydrates. */}
			<body suppressHydrationWarning>
				<div id="root">{children}</div>
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	const { pathname } = useLocation();
	useClientLayoutEffect(() => {
		const lightOnly = pathname === '/' || pathname === '/login';
		const savedTheme = localStorage.getItem('laras-theme');
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const isDark = !lightOnly && (savedTheme === 'dark' || (!savedTheme && prefersDark));
		const root = document.documentElement;
		root.classList.toggle('dark', isDark);
		root.style.colorScheme = isDark ? 'dark' : 'light';
		const colorScheme = document.querySelector('meta[name="color-scheme"]');
		colorScheme?.setAttribute('content', isDark ? 'dark light' : 'light');
	}, [pathname]);
	const isAppChrome =
		pathname.startsWith('/app') || pathname.startsWith('/login') || pathname.startsWith('/tugas') || pathname.startsWith('/analytics') || pathname.startsWith('/kalender');
	return (
		<>
			<EditorOverlayGuard />
			{!isAppChrome && <SiteHeader />}
			<Outlet />
			{!isAppChrome && <SiteFooter />}
			<ConfirmDialogHost />
		</>
	);
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let message = 'Oops!';
	let details = 'An unexpected error occurred.';
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		message = error.status === 404 ? '404' : 'Error';
		details =
			error.status === 404
				? 'The requested page could not be found.'
				: error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<main>
			<h1>{message}</h1>
			<p>{details}</p>
			{stack ? (
				<pre>
					<code>{stack}</code>
				</pre>
			) : null}
		</main>
	);
}
