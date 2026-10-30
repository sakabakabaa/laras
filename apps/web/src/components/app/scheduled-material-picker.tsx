import { useId, useState } from 'react';
import { ExternalLink, Search, X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import type { ScheduledSource } from '@/lib/scheduled-class-ai';

export function ScheduledMaterialPicker({materials, sessionId, value, onChange, ai = false}: {
  materials: ScheduledSource[]; sessionId: string; value: string[]; onChange: (ids: string[]) => void; ai?: boolean;
}) {
  const t = useT(), searchId = useId();
  const linked = materials.filter(m => m.sessionIds.includes(sessionId));
  const [scope, setScope] = useState<'session' | 'course'>(linked.length ? 'session' : 'course');
  const [query, setQuery] = useState(''), [shown, setShown] = useState(8);
  const limit = ai ? 4 : 8;
  const selected = materials.filter(m => value.includes(m.id));
  const candidates = (scope === 'session' ? linked : materials).filter(m => m.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const priority = (m: ScheduledSource) => /\.(pdf|docx?|pptx?|txt|odt)(?:$|\?)/i.test(m.url || '') ? m.access === 'student' ? 0 : 1 : 2;
  const sorted = [...candidates].sort((a,b) => Number(b.aiReady) - Number(a.aiReady) || priority(a) - priority(b) || a.title.localeCompare(b.title, undefined, {numeric: true}));
  const ready = materials.filter(m => m.aiReady).length;
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  return <section className={`sc-material-picker ${ai ? 'is-ai' : ''}`} aria-label={t(ai ? 'sessionMaterials.aiTitle' : 'sessionMaterials.title')}>
    <div className="sc-material-picker-heading"><h3>{t(ai ? 'sessionMaterials.aiTitle' : 'sessionMaterials.title')}</h3><span>{t('sessionMaterials.selected', {count: String(value.length), limit: String(limit)})}</span></div>
    {ai && <p className="sc-material-help">{t('sessionMaterials.readiness', {ready: String(ready), total: String(materials.length)})}</p>}
    <div className="sc-material-scopes" role="group" aria-label={t('sessionMaterials.scope')}>
      <button type="button" aria-pressed={scope === 'session'} onClick={() => {setScope('session'); setShown(8);}}>{t('sessionMaterials.meeting', {count: String(linked.length)})}</button>
      <button type="button" aria-pressed={scope === 'course'} onClick={() => {setScope('course'); setShown(8);}}>{t('sessionMaterials.course', {count: String(materials.length)})}</button>
    </div>
    <label className="sc-source-search" htmlFor={searchId}><span className="sc-sr-only">{t('sessionMaterials.search')}</span><Search size={16} aria-hidden="true"/><input id={searchId} type="search" placeholder={t('sessionMaterials.search')} value={query} onChange={e => {setQuery(e.target.value); setScope('course'); setShown(8);}}/></label>
    {selected.length > 0 && <div className="sc-selected-sources">{selected.map(m => <button type="button" key={m.id} onClick={() => toggle(m.id)} aria-label={t('sessionMaterials.remove', {title: m.title})}>{m.title}<X size={13} aria-hidden="true"/></button>)}</div>}
    <ul className="sc-source-list">{sorted.slice(0, shown).map(m => {
      const checked = value.includes(m.id), disabled = (ai && !m.aiReady) || (!checked && value.length >= limit);
      return <li key={m.id} className={checked ? 'is-selected' : ''}>
        <label className="sc-source-choice"><input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(m.id)} aria-label={m.title}/><span><strong>{m.title}</strong><span className="sc-source-tags"><span>{t(m.access === 'student' ? 'sessionMaterials.student' : 'sessionMaterials.faculty')}</span>{ai && <span className={m.aiReady ? 'is-ready' : 'is-unready'}>{t(m.aiReady ? 'sessionMaterials.ready' : 'sessionMaterials.notReady')}</span>}</span></span></label>
        <div className="sc-source-links">{m.url && <a href={m.url} target="_blank" rel="noreferrer" aria-label={t('sessionMaterials.openFile', {title: m.title})}>{t('sessionMaterials.open')}<ExternalLink size={12} aria-hidden="true"/></a>}{ai && <a href={`/app/berkas/${m.id}`} target="_blank" rel="noreferrer" aria-label={t('sessionMaterials.reviewFile', {title: m.title})}>{t('sessionMaterials.review')}<ExternalLink size={12} aria-hidden="true"/></a>}</div>
      </li>;
    })}</ul>
    {!candidates.length && <p className="sc-material-help">{t('sessionMaterials.empty')}</p>}
    {candidates.length > shown && <button className="sc-source-more" type="button" onClick={() => setShown(v => v + 12)}>{t('sessionMaterials.more', {count: String(candidates.length - shown)})}</button>}
    {ai && ready === 0 && <p className="sc-material-notice" role="status">{t('sessionMaterials.preparation')}</p>}
  </section>;
}
