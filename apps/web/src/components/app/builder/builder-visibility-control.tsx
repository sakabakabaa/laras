import { useState } from 'react';
import type { BuilderVisibilityDevice } from '@/lib/builder-document';

export function BuilderVisibilityControl({ value, disabled, onChange }: { value?: Partial<Record<BuilderVisibilityDevice, boolean>>; disabled: boolean; onChange: (value: Partial<Record<BuilderVisibilityDevice, boolean>> | undefined) => void }) {
 const [device, setDevice] = useState<BuilderVisibilityDevice>('desktop');
 const current = value?.[device];
 const set = (next: string) => {
  const copy = { ...(value || {}) };
  if (next === '') delete copy[device]; else copy[device] = next === 'visible';
  onChange(Object.keys(copy).length ? copy : undefined);
 };
 return <fieldset className="bd-fields bd-visibility-control" disabled={disabled}>
  <legend>Visibilitas presentasi</legend>
  <p className="bd-help">Menyembunyikan hanya tampilan pada perangkat ini; konten tetap dikirim dan bukan perlindungan data.</p>
  <label>Perangkat<select aria-label="Perangkat visibilitas" value={device} onChange={event => setDevice(event.target.value as BuilderVisibilityDevice)}><option value="desktop">Desktop</option><option value="tablet">Tablet (hingga 900 px)</option><option value="mobile">Ponsel (hingga 600 px)</option></select></label>
  <label>Tampilan<select aria-label="Tampilan perangkat" value={current === undefined ? '' : current ? 'visible' : 'hidden'} onChange={event => set(event.target.value)}><option value="">Ikuti perangkat lebih besar (default terlihat)</option><option value="visible">Terlihat</option><option value="hidden">Tersembunyi</option></select></label>
 </fieldset>;
}
