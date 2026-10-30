import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { scheduledRequest, type ScheduledClassState } from '@/lib/scheduled-classes';
import { ScheduledClassroom } from '@/components/app/scheduled-classroom';
import '@/styles/scheduled-session-workspace.css';
import '@/styles/scheduled-review-student-sidebar.css';
import '@/styles/scheduled-classes.css';
import '@/styles/scheduled-student-workspace.css';
import {ScheduledStudentPreview} from '@/components/app/scheduled-student-preview';
import {useCourseSections} from '@/hooks/use-course-sections';
import { useT } from '@/lib/i18n';
import {ScheduledLecturerSession} from '@/components/app/scheduled-lecturer-session';

export function meta() { return [{title: 'Kelas terjadwal | LARAS'}]; }

export default function ScheduledClassPage() {
  const t = useT();
  const {courseId = '', sessionId = ''} = useParams();
  const [searchParams] = useSearchParams();
  const {sections}=useCourseSections(courseId);
  const preview=searchParams.get('preview')==='student';
  const [state, setState] = useState<ScheduledClassState | null>(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [connected, setConnected] = useState(true);
  const [clock, setClock] = useState({server: 0, local: 0}), [elapsed, setElapsed] = useState(0);
  const scope = useRef(sessionId); scope.current = sessionId;
  const lastResponse = useRef(0);
