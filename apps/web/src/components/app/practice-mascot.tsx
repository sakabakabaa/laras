import { useEffect, useRef } from 'react';

type MascotMood = 'ready' | 'thinking' | 'happy' | 'oops';

/** A small illustrated book character for the practice game. */
export function PracticeMascot({ mood = 'ready', size = 88, followCursor = false }: { mood?: MascotMood; size?: number; followCursor?: boolean }) {
    const svgRef = useRef<SVGSVGElement>(null);
    const eyesRef = useRef<SVGGElement>(null);
    useEffect(() => {
        if (!followCursor) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const finePointer = window.matchMedia('(any-pointer: fine)');
        let frame = 0;
        let pointer: { x: number; y: number } | null = null;
        const reset = () => {
            pointer = null;
            window.cancelAnimationFrame(frame);
            frame = 0;
            eyesRef.current?.setAttribute('transform', 'translate(0 0)');
        };
        const update = () => {
            frame = 0;
            const svg = svgRef.current;
            const matrix = svg?.getScreenCTM();
            if (!svg || !matrix || !pointer) return;
            // Convert from screen space so the gaze still works while the book tilts.
            const point = svg.createSVGPoint();
            point.x = pointer.x;
            point.y = pointer.y;
            const local = point.matrixTransform(matrix.inverse());
            const dx = local.x - 56;
            const dy = local.y - 58;
            const distance = Math.hypot(dx, dy);
            const amount = Math.min(distance / 65, 1);
            const x = distance ? dx / distance * 2.6 * amount : 0;
            const y = distance ? dy / distance * 2 * amount : 0;
            eyesRef.current?.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
        };
        const move = (event: PointerEvent) => {
            if (reducedMotion.matches || !finePointer.matches || event.pointerType !== 'mouse') {
                reset();
                return;
            }
            pointer = { x: event.clientX, y: event.clientY };
            if (!frame) frame = window.requestAnimationFrame(update);
        };
        const leave = (event: PointerEvent) => { if (!event.relatedTarget) reset(); };
        window.addEventListener('pointermove', move, { passive: true });
        window.addEventListener('pointerout', leave);
        window.addEventListener('blur', reset);
        window.addEventListener('scroll', reset, true);
        reducedMotion.addEventListener('change', reset);
        finePointer.addEventListener('change', reset);
        return () => {
            reset();
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerout', leave);
            window.removeEventListener('blur', reset);
            window.removeEventListener('scroll', reset, true);
            reducedMotion.removeEventListener('change', reset);
            finePointer.removeEventListener('change', reset);
        };
    }, [followCursor]);
	return <svg ref={svgRef} className={`pp-mascot pp-mascot-${mood}`} width={size} height={size} viewBox="0 0 112 112" aria-hidden="true" focusable="false">
		<ellipse cx="56" cy="101" rx="32" ry="6" fill="currentColor" opacity=".12" />
		<path d="M24 31c0-7 5-12 12-12h41c7 0 12 5 12 12v48c0 6-5 10-11 8-14-5-26-5-41 0-7 2-13-2-13-9V31Z" fill="#8f2019" />
		<path d="M31 29c0-4 3-7 7-7h17v56c-6-4-14-5-24-2V29Z" fill="#fffaf0" />
		<path d="M55 22h18c4 0 7 3 7 7v47c-9-3-17-2-25 2V22Z" fill="#fffdf7" />
		<path d="M55 24v53" fill="none" stroke="#e5d7c7" strokeWidth="2" />
		<path d="M39 34h10M39 40h10M65 34h9M65 40h9" stroke="#d8c9b7" strokeWidth="2" strokeLinecap="round" />
		<g className="pp-mascot-face">
			<g ref={eyesRef} className="pp-mascot-eyes">
			<ellipse cx="47" cy="58" rx="3" ry="4" fill="#37251f" />
			<ellipse cx="65" cy="58" rx="3" ry="4" fill="#37251f" />
			</g>
			<path className="pp-mascot-mouth" d={mood === 'oops' ? 'M52 69c2-5 8-5 10 0' : mood === 'thinking' ? 'M53 68h7' : 'M51 66c3 6 8 6 11 0'} fill="none" stroke="#8f2019" strokeWidth="2.6" strokeLinecap="round" />
			{(mood === 'happy' || mood === 'oops') && <><circle cx="39" cy="64" r="3" fill="#ef9f89" opacity=".7" /><circle cx="73" cy="64" r="3" fill="#ef9f89" opacity=".7" /></>}
		</g>
		<path className="pp-mascot-bookmark" d="M77 22h9v22l-4.5-4-4.5 4V22Z" fill="#efaa38" />
		<path className="pp-mascot-star" d="m87 13 2 4 4 1-4 2-2 4-2-4-4-2 4-1 2-4Z" fill="#efaa38" />
	</svg>;
}
