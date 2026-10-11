import { useEffect, useRef, useState } from 'react';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** First-page thumbnail rendered independently of browser PDF plug-ins. */
export function SubmissionPdfPreview({ url, name }: { url: string; name: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
    useEffect(() => {
        let cancelled = false;
        let destroy: (() => void) | undefined;
        setStatus('loading');
        void (async () => {
            try {
                const pdfjs = await import('pdfjs-dist');
                if (cancelled) return;
                pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
                const task = pdfjs.getDocument({ url });
                destroy = () => { void task.destroy(); };
                const document = await task.promise;
                const page = await document.getPage(1);
                if (cancelled || !canvasRef.current) return;
                const viewport = page.getViewport({ scale: 1 });
                const scaled = page.getViewport({ scale: Math.min(2, 900 / viewport.width) });
                const canvas = canvasRef.current;
                canvas.width = scaled.width;
                canvas.height = scaled.height;
                await page.render({ canvas, viewport: scaled }).promise;
                if (!cancelled) setStatus('ready');
            } catch {
                if (!cancelled) setStatus('failed');
            }
        })();
        return () => { cancelled = true; destroy?.(); };
    }, [url]);
    return <div className="eval-pdf-thumbnail">
        {status === 'loading' && <p role="status">Memuat pratinjau…</p>}
        {status === 'failed' && <p role="alert">Pratinjau tidak tersedia. Gunakan Buka penuh untuk melihat file asli.</p>}
        <a href={url} target="_blank" rel="noreferrer" aria-label={'Buka file asli: ' + name}>
            <canvas ref={canvasRef} role="img" aria-label={'Halaman pertama: ' + name} hidden={status !== 'ready'} />
        </a>
        {status === 'ready' && <small>Halaman pertama · klik untuk membuka seluruh dokumen</small>}
    </div>;
}
