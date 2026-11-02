import {ArrowRight,Trash2} from 'lucide-react';
import {Link} from 'react-router';
import type {BuilderListItem} from '@/lib/builder-document';

export function BuilderDraftCard({draft,disabled,onDelete}:{draft:BuilderListItem;disabled:boolean;onDelete:(draft:BuilderListItem)=>void}){
	return <article className="bd-draft-card"><Link to={`/app/builder/${draft.id}`}><span className="bd-eyebrow">DRAF · {draft.courseTitle}</span><strong>{draft.title}</strong><span>{draft.activityCount} kegiatan <ArrowRight size={14}/></span></Link><button type="button" className="bd-icon bd-draft-delete" aria-label={`Hapus draf ${draft.title}`} title="Hapus draf" disabled={disabled} onClick={()=>onDelete(draft)}><Trash2 size={16}/></button></article>;
}
