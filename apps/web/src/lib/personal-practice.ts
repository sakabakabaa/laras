export type PracticeSource = {
    id: string; title: string; locator: string; text: string;
    session: string; file?: string; version?: number;
};
export type PracticeLesson = { title: string; points: string[]; example: string; check: string };
export type PersonalQuestion = {
    skillId?: import('./student-progress').PracticeSkillId;
    type: 'multiple_choice' | 'short_writing'; prompt: string; skill: string;
    options: string[]; answerIndex: number; example: string; rubric: string[];
    explanation: string; sourceIds: string[]; lesson?: PracticeLesson;
};
export type PracticeResult = {
    verdict: 'correct' | 'partially_correct' | 'needs_work' | 'uncertain';
    explanation: string; correction: string; skill: string;
};
export type PracticeRound = {
    id: string; status: string; preview: boolean; total: number;
    answered: number; question: { ordinal: number; type: string; prompt: string; skill: string; options: string[] } | null;
    last: { ordinal: number; prompt: string; answer: string; result: PracticeResult; sources: PracticeSource[] } | null;
    results: PracticeResult[]; sessions: { id: string; title: string; week: number }[];
    review: { ordinal: number; prompt: string; answer: string; result: PracticeResult; sources: PracticeSource[] }[];
};
export type PracticeReadiness = {
    progress: import('./student-progress').StudentProgress | null;
    enabled: boolean; language: string; level: string; canEdit: boolean;
    activeRoundId: string;
    sessions: { id: string; title: string; week: number; date: string }[];
    sources: PracticeSource[]; reason: string; scopeNote: string;
    personalization: string; history: { id: string; created: string; correct: number; total: number }[];
    reports: { prompt: string; reason: string; created: string }[];
    sections: { id: string; title: string; locator: string; excerpt: string; extraction: string; session: string }[];
};
