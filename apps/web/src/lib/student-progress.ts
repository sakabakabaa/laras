export const PRACTICE_SKILLS = {
    reading: 'Pemahaman bacaan', vocabulary: 'Kosakata', grammar: 'Tata bahasa',
    spelling: 'Ejaan dan tanda baca', writing: 'Menulis', pragmatics: 'Komunikasi sesuai konteks',
    general: 'Keterampilan bahasa',
} as const;
export type PracticeSkillId = keyof typeof PRACTICE_SKILLS;
export function normalizePracticeSkill(id: unknown, label: string): PracticeSkillId {
    if (typeof id === 'string' && Object.hasOwn(PRACTICE_SKILLS, id)) return id as PracticeSkillId;
    if (/ejaan|orthograph|spelling|tanda baca/i.test(label)) return 'spelling';
    if (/kosakata|vocab|lexi/i.test(label)) return 'vocabulary';
    if (/tata bahasa|gramm|konjug|akkus|artikel|kasus|syntax|morph|prepos|urutan kata/i.test(label)) return 'grammar';
    if (/baca|reading|memahami|verstehen/i.test(label)) return 'reading';
    if (/sopan|pragmat|register/i.test(label)) return 'pragmatics';
    if (/menulis|writing|schreib/i.test(label)) return 'writing';
    return 'general';
}
export type StudentProgress = {
    scoredTasks: number; practiceAnswers: number;
    skills: { id: string; label: string; correct: number; total: number; recentCorrect: number; recentTotal: number; status: 'building' | 'focus' | 'steady' | 'improving' }[];
    confirmed: { label: string; count: number }[];
    recent: { id: string; kind: 'practice' | 'task'; title: string; feedback: string; correction: string; date: string }[];
};
