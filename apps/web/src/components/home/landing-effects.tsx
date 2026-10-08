import { useEffect } from 'react';

/**
 * Client-side landing enhancements:
 *  - marks the document as loaded so CSS reveal/entrance states engage
 *  - reveals [data-lp-reveal] elements as they scroll into view
 *  - lights workflow steps and tracks the student-journey rail/device
 *
 * Renders nothing; safe under SSR (effects run only in the browser).
 */
export function LandingEffects() {
	useEffect(() => {
		const root = document.documentElement;
		if (!root.classList.contains('lp-loaded')) root.classList.add('lp-loaded');

		const reveals = Array.from(
			document.querySelectorAll<HTMLElement>('[data-lp-reveal]'),
		);
		const io = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						entry.target.classList.add('lp-in');
						io.unobserve(entry.target);
					}
				}
			},
			{ rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
		);
		reveals.forEach((el) => io.observe(el));

		// Workflow spine + step lighting
		const flowList = document.querySelector<HTMLElement>('.lp-flow-list');
		let flowIo: IntersectionObserver | undefined;
		if (flowList) {
			const steps = Array.from(flowList.querySelectorAll<HTMLElement>('.lp-fstep'));
			flowIo = new IntersectionObserver(
				(entries) => {
					const visible = entries
						.filter((e) => e.isIntersecting)
						.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
					if (visible.length) {
						const top = visible[0];
						const idx = steps.indexOf(top.target as HTMLElement);
						const prog = steps.length > 1 ? idx / (steps.length - 1) : 0;
						flowList.style.setProperty('--prog', String(prog));
						steps.forEach((s, i) => s.classList.toggle('lit', i <= idx));
					}
				},
				{ rootMargin: '0px 0px -45% 0px', threshold: 0 },
			);
			steps.forEach((s) => flowIo!.observe(s));
		}

		// Student journey: rail progress + device screen switching
		const journey = document.querySelector('.lp-journey-steps');
		let journeyIo: IntersectionObserver | undefined;
		if (journey) {
			const steps = Array.from(journey.querySelectorAll<HTMLElement>('.lp-jstep'));
			const rail = journey.querySelector<HTMLElement>('.lp-journey-rail i');
			const screens = Array.from(
				document.querySelectorAll<HTMLElement>('.lp-screen'),
			);
			const dots = Array.from(
				document.querySelectorAll<HTMLElement>('.lp-device-top .steps-dots i'),
			);
			journeyIo = new IntersectionObserver(
				(entries) => {
					const visible = entries
						.filter((e) => e.isIntersecting)
						.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
					if (!visible.length) return;
					const active = visible[0];
					const idx = steps.indexOf(active.target as HTMLElement);
					const prog = steps.length > 1 ? idx / (steps.length - 1) : 0;
					if (rail) rail.style.setProperty('--prog', String(prog));
					steps.forEach((s, i) => {
						s.classList.toggle('done', i < idx);
						s.classList.toggle('current', i === idx);
					});
					screens.forEach((s, i) => {
						s.classList.toggle('on', i === idx);
						s.classList.toggle('past', i < idx);
					});
					dots.forEach((d, i) => d.classList.toggle('on', i <= idx));
				},
				{ rootMargin: '0px 0px -50% 0px', threshold: 0.6 },
			);
			steps.forEach((s) => journeyIo!.observe(s));
		}

		return () => {
			io.disconnect();
			flowIo?.disconnect();
			journeyIo?.disconnect();
			root.classList.remove('lp-loaded');
		};
	}, []);

	return (
		<>
			<script
				dangerouslySetInnerHTML={{
					__html: 'document.documentElement.classList.add("lp-loaded");',
				}}
			/>
		</>
	);
}
