import {ClipboardCheck} from 'lucide-react';
import {CourseThumb} from '@/components/app/course-thumb';
import {CardCta} from '@/components/card-cta';
import {deadlineLabel} from '@/lib/assignments';
import type {BuilderRunItem} from '@/lib/builder-delivery';
import type {Course} from '@/lib/learning';
import {publicationClosed,publicationPath} from '@/lib/published-listings';

export function BuilderAssignmentCard({run,course}:{run:BuilderRunItem;course?:Course}){
  const closed=publicationClosed(run),collected=run.submittedCount||0,graded=run.gradedCount||0;
  return <article className="eval-board-card">{course?<CourseThumb course={course}/>:<span className="eval-board-thumb" aria-hidden="true"/>}<div className="eval-board-main"><span className="asg-type-chip formal"><ClipboardCheck size={12}/>Tugas formal</span><small>{run.courseTitle||'Mata kuliah'}</small><strong>{run.title}</strong><span className="asg-tags"><span className={`asg-tag status-${closed?'closed':'published'}`}>{closed?'Ditutup':'Diterbitkan'}</span><span className="asg-tag">{run.activityCount||0} kegiatan</span><span className="asg-tag">{deadlineLabel(run.dueAt)}</span></span></div><div className="eval-board-side"><div className="eval-board-counts"><em>{collected} terkumpul</em><em>{graded} nilai diterbitkan</em><em>{Math.max(collected-graded,0)} menunggu nilai</em></div><CardCta to={publicationPath(run)} label="Buka"/></div></article>;
}
