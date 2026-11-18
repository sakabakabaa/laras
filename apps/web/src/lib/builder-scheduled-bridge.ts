import type {
	BuilderActivity,
	BuilderAsset,
	BuilderBlock,
	BuilderDocument,
	BuilderEnvelope,
	BuilderImage,
	BuilderQuestion,
	QuestionKind,
} from './builder-document';
import {
	appendBlock,
	appendQuestion,
	blankBuilder,
	newActivity,
	plain,
	questionIds,
	rich,
	uid,
} from './builder-document';
import { matchingPictures } from '@/components/app/builder/builder-classroom-blocks';
import { cardMatchingTargets } from './card-matching';
import { worksheetBlocks } from './worksheet-layout';
import type {
	ActivityKind,
	Bilingual,
	ScheduledActivity,
	ScheduledClassState,
	ScheduledWorksheet,
	WorksheetAnswerKeyEntry,
	WorksheetBlock as ScheduledWorksheetBlock,
	WorksheetDestination,
	WorksheetSegment,
} from './scheduled-classes';
import { flattenResolvedBlocks, resolveActivityLayout } from './builder-layout';
import type { ScheduledLesson } from './scheduled-lesson';
import type { QuizQuestionEditable } from './task-types';

export type ScheduledActivityPlan = {
	kind: ActivityKind;
	title: string;
	minutes: number;
	required: boolean;
	content: string;
	url: string;
	questions: QuizQuestionEditable[];
	worksheet?: ScheduledWorksheet;
	lesson?: ScheduledLesson;
	materialIds: string[];
	cpmkIds: string[];
	subCpmkIds: string[];
};

export type ScheduledGradingPlan = {
	activityIndex: number;
	mode: 'ungraded' | 'points' | 'rubric';
	maxPoints: number;
	criteria: { id: string; label: string; maxPoints: number }[];
};

export type ScheduledClassPlan = {
	title: string;
	instructions: string;
	section: string;
	startsAt: string;
	joinUntil: string;
	lateAfterMin: number;
	activities: ScheduledActivityPlan[];
	gradingSettings: ScheduledGradingPlan[];
};

function bilingualFromText(value: string, translation?: string): Bilingual {
	const trimmed = value.trim();
	const tr = translation?.trim();
	return {
		...(trimmed ? { de: trimmed } : {}),
		...(tr ? { id: tr } : {}),
	};
}

function splitPromptAndTranslation(text: string): { prompt: string; translation?: string } {
	const lines = text
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
	if (lines.length >= 2) {
		return {
			prompt: lines[0].slice(0, 1000),
			translation: lines.slice(1).join(' ').slice(0, 1000),
		};
	}
	return { prompt: (lines[0] || text.trim() || 'Pertanyaan').slice(0, 1000) };
}

function safeItemId(id: string, fallbackPrefix: string, index: number, used: Set<string>): string {
	const cleaned = id.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 70);
	let candidate = cleaned || `${fallbackPrefix}-${index + 1}`;
	let suffix = 2;
	while (used.has(candidate)) {
		candidate = `${(cleaned || fallbackPrefix).slice(0, 65)}-${suffix++}`;
	}
	used.add(candidate);
	return candidate;
}

function isPocketBaseId(value?: string): value is string {
	return Boolean(value && /^[a-zA-Z0-9]{15}$/.test(value));
}

function extractFileIdFromUrl(url?: string): string | undefined {
	if (!url) return undefined;
	const match = url.match(/\/api\/files\/(?:file_library|[a-zA-Z0-9_]+)\/([a-zA-Z0-9]{15})\//);
	return match?.[1];
}

function defaultStepPair(title: string, instructions: string) {
	const clean = instructions.trim() || title.trim() || 'Pelajari penjelasan berikut.';
	return {
		de: clean.slice(0, 800),
		id: clean.slice(0, 800),
	};
}

function normalizeScheduledLesson(
	lesson: ScheduledLesson | undefined,
	activityTitle: string,
	fallbackInstructions: string,
	materialIds: string[],
): ScheduledLesson | undefined {
	if (!lesson) return undefined;
	const fallback = defaultStepPair(activityTitle, fallbackInstructions);
	const goal = {
		de: (lesson.goal?.de?.trim() || lesson.goal?.id?.trim() || fallback.de).slice(0, 500),
		id: (lesson.goal?.id?.trim() || lesson.goal?.de?.trim() || fallback.id).slice(0, 500),
	};
	const rawSteps = (lesson.steps || []).filter((s) => s?.de?.trim() || s?.id?.trim());
	const steps = (rawSteps.length ? rawSteps.slice(0, 8) : [fallback]).map((s) => ({
		de: (s.de?.trim() || s.id?.trim() || fallback.de).slice(0, 800),
		id: (s.id?.trim() || s.de?.trim() || fallback.id).slice(0, 800),
	}));
	const scenes = (lesson.scenes || []).slice(0, 10).map((scene) => {
		const titleDe = (scene.title?.de?.trim() || scene.title?.id?.trim() || activityTitle || 'Penjelasan').slice(0, 200);
		const titleId = (scene.title?.id?.trim() || scene.title?.de?.trim() || activityTitle || 'Penjelasan').slice(0, 200);
		const introDe = (scene.intro?.de?.trim() || scene.intro?.id?.trim() || goal.de).slice(0, 1500);
		const introId = (scene.intro?.id?.trim() || scene.intro?.de?.trim() || goal.id).slice(0, 1500);
		const out: ScheduledLesson['scenes'][number] = {
			kind: scene.kind,
			title: { de: titleDe, id: titleId },
			intro: { de: introDe, id: introId },
		};
		if (scene.cards?.length) {
			out.cards = scene.cards.slice(0, 8).map((c, idx) => ({
				label: (c.label?.trim() || `Kartu ${idx + 1}`).slice(0, 100),
				tone: ['neutral', 'must', 'may', 'stop'].includes(c.tone) ? c.tone : 'neutral',
				text: {
					de: (c.text?.de?.trim() || c.text?.id?.trim() || titleDe).slice(0, 1000),
					id: (c.text?.id?.trim() || c.text?.de?.trim() || titleId).slice(0, 1000),
				},
			}));
		}
		if (scene.sentence) {
			out.sentence = scene.sentence;
		}
		if (scene.turns?.length) {
			out.turns = scene.turns.slice(0, 16).map((t) => ({
				role: t.role === 'patient' ? 'patient' : 'doctor',
				text: {
					de: (t.text?.de?.trim() || t.text?.id?.trim() || '...').slice(0, 800),
					id: (t.text?.id?.trim() || t.text?.de?.trim() || '...').slice(0, 800),
				},
			}));
		}
		return out;
	});
	const out: ScheduledLesson = {
		goal,
		steps,
		scenes,
	};
	if (lesson.videos?.length) {
		const validVideos = lesson.videos.filter(
			(v) =>
				v.id?.trim() &&
				/^\/media\/lessons\/[a-z0-9/-]+\.mp4$/.test(v.src || '') &&
				/^\/media\/lessons\/[a-z0-9/-]+\.jpg$/.test(v.poster || ''),
		);
		if (validVideos.length) out.videos = validVideos.slice(0, 5);
	}
	if (lesson.videoNote?.de?.trim() && lesson.videoNote?.id?.trim()) {
		out.videoNote = {
			de: lesson.videoNote.de.trim().slice(0, 1000),
			id: lesson.videoNote.id.trim().slice(0, 1000),
		};
	}
	if (lesson.note?.de?.trim() && lesson.note?.id?.trim()) {
		out.note = {
			de: lesson.note.de.trim().slice(0, 1000),
			id: lesson.note.id.trim().slice(0, 1000),
		};
	}
	if (
		lesson.source &&
		materialIds.includes(lesson.source.sourceMaterialId) &&
		Number.isInteger(lesson.source.sourcePage) &&
		lesson.source.sourcePage >= 1
	) {
		out.source = {
			sourceMaterialId: lesson.source.sourceMaterialId,
			sourcePage: lesson.source.sourcePage,
			sourceLabel: (lesson.source.sourceLabel?.trim() || 'Buku').slice(0, 160),
		};
	}
	return out;
}

function isPureSingleChoiceActivity(activity: BuilderActivity, questionsById: Record<string, BuilderQuestion>): boolean {
	const blocks = flattenResolvedBlocks(resolveActivityLayout(activity));
	const assessable = blocks.filter((b) =>
		['question_group', 'matching', 'gap_passage', 'writing', 'reflection'].includes(b.type),
	);
	if (!assessable.length) return false;
	if (assessable.some((b) => b.type !== 'question_group')) return false;
	if (blocks.some((b) => b.type === 'lesson')) return false;
	const qids = assessable.flatMap(questionIds);
	if (!qids.length) return false;
	return qids.every((id) => {
		const q = questionsById[id];
		return q && q.kind === 'single_choice' && (q.options?.length || 0) >= 2 && (q.options?.length || 0) <= 6;
	});
}

/**
 * Converts a BuilderEnvelope (`kind: 'kelas'`) into a ScheduledClassPlan ready for
 * `scheduledRequest(meetingId, 'schedule' | 'savePlan', ...)`.
 */
export function builderToScheduledPlan(envelope: BuilderEnvelope): ScheduledClassPlan {
	const { document: d, privateKeys } = envelope;
	const totalPlannedMinutes = d.activities.reduce((sum, a) => sum + Math.max(1, Math.round(a.plannedMinutes || 15)), 0);
	const startsAtMs = Date.parse(d.delivery.startsAt);
	const endsAtMs = Date.parse(d.delivery.endsAt);
	const slotMinutes =
		Number.isFinite(startsAtMs) && Number.isFinite(endsAtMs) && endsAtMs > startsAtMs
			? Math.round((endsAtMs - startsAtMs) / 60000)
			: totalPlannedMinutes;

	const activities: ScheduledActivityPlan[] = [];
	const gradingSettings: ScheduledGradingPlan[] = [];

	d.activities.forEach((builderActivity, activityIndex) => {
		const blocks = flattenResolvedBlocks(resolveActivityLayout(builderActivity));
		const usedItemIds = new Set<string>();
		const usedBlockIds = new Set<string>();
		const materialIdSet = new Set<string>();
		const addMaterialId = (id?: string) => {
			if (isPocketBaseId(id) && materialIdSet.size < 8) {
				materialIdSet.add(id);
			}
		};

		// Collect instructions and reference URL
		const instructionTexts: string[] = [];
		let referenceUrl = '';
		let rawLesson: ScheduledLesson | undefined;

		for (const block of blocks) {
			if (block.type === 'instructions') {
				const text = plain(block.body).trim();
				if (text) instructionTexts.push(text);
			} else if (block.type === 'reference' && block.url && /^https:\/\//i.test(block.url.trim())) {
				if (!referenceUrl) referenceUrl = block.url.trim();
			} else if (block.type === 'lesson' && block.lesson) {
				if (!rawLesson) rawLesson = block.lesson;
			}
			if (block.asset?.fileId) addMaterialId(block.asset.fileId);
			for (const img of block.images || []) {
				if (img.asset?.fileId) addMaterialId(img.asset.fileId);
				addMaterialId(extractFileIdFromUrl(img.url));
			}
			for (const dest of block.destinations || []) {
				addMaterialId(extractFileIdFromUrl(dest.url));
			}
		}

		// Determine activity duration: if last activity and slotMinutes > totalPlannedMinutes, absorb remainder or keep plannedMinutes
		let minutes = Math.max(1, Math.min(600, Math.round(builderActivity.plannedMinutes || 15)));
		if (
			activityIndex === d.activities.length - 1 &&
			slotMinutes > totalPlannedMinutes &&
			slotMinutes - totalPlannedMinutes + minutes <= 600
		) {
			minutes = slotMinutes - totalPlannedMinutes + minutes;
		}

		const pureQuiz = isPureSingleChoiceActivity(builderActivity, d.questionsById);
		const hasReflection = blocks.some((b) => b.type === 'reflection');
		const hasAssessable = blocks.some((b) =>
			['question_group', 'matching', 'gap_passage', 'writing', 'reflection'].includes(b.type),
		);

		const kind: ActivityKind = pureQuiz
			? 'quiz'
			: hasReflection && !blocks.some((b) => ['matching', 'gap_passage', 'writing', 'question_group'].includes(b.type))
				? 'exit_ticket'
				: hasAssessable
					? 'assignment'
					: 'material';

		const content =
			instructionTexts.join('\n\n').slice(0, 20000) ||
			(kind !== 'quiz' ? builderActivity.title.trim() : '');

		const materialIds = [...materialIdSet];
		const lesson = normalizeScheduledLesson(rawLesson, builderActivity.title, content, materialIds);

		if (kind === 'quiz') {
			const qids = blocks.filter((b) => b.type === 'question_group').flatMap(questionIds);
			const questions: QuizQuestionEditable[] = qids.slice(0, 100).map((qid, qIdx) => {
				const q = d.questionsById[qid];
				const key = privateKeys.answersByQuestionId[qid];
				const options = (q?.options || []).slice(0, 6).map((o, oIdx) => o.label.trim() || `Pilihan ${oIdx + 1}`);
				const correctIndex = Math.max(
					0,
					(q?.options || []).findIndex((o) => o.id === key?.correctOptionId),
				);
				return {
					id: `q${qIdx}`,
					text: (plain(q?.prompt).trim() || `Pertanyaan ${qIdx + 1}`).slice(0, 2000),
					options: options.length >= 2 ? options : ['A', 'B'],
					correctIndex,
					points: Math.max(1, Math.min(100, Number(q?.points) || 1)),
					explanation: plain(key?.explanation).trim().slice(0, 2000),
				};
			});
			activities.push({
				kind: 'quiz',
				title: builderActivity.title.trim() || `Kegiatan ${activityIndex + 1}`,
				minutes,
				required: builderActivity.required !== false,
				content,
				url: referenceUrl,
				questions,
				...(lesson ? { lesson } : {}),
				materialIds,
				cpmkIds: [],
				subCpmkIds: [],
			});
			return;
		}

		if (kind === 'material') {
			const ackBlock = blocks.find((b) => b.type === 'acknowledgement');
			const ackText = plain(ackBlock?.body).trim();
			const fullContent = [content, ackText && ackText !== 'Saya sudah membaca dan memahami materi.' ? ackText : '']
				.filter(Boolean)
				.join('\n\n')
				.slice(0, 20000) || builderActivity.title.trim();
			activities.push({
				kind: 'material',
				title: builderActivity.title.trim() || `Kegiatan ${activityIndex + 1}`,
				minutes,
				required: builderActivity.required !== false,
				content: fullContent,
				url: referenceUrl,
				questions: [],
				...(lesson ? { lesson } : {}),
				materialIds,
				cpmkIds: [],
				subCpmkIds: [],
			});
			return;
		}

		// Build ScheduledWorksheet for 'assignment' or 'exit_ticket'
		const items: ScheduledWorksheet['items'] = [];
		const wsBlocks: ScheduledWorksheetBlock[] = [];
		const answerKeyItems: Record<string, WorksheetAnswerKeyEntry> = {};
		const rubricCriteria: { id: string; label: string; maxPoints: number }[] = [];
		let totalManualPoints = 0;
		let hasManualQuestion = false;
		let allFeedbackOnly = true;

		// Identify image blocks immediately preceding a matching block that provide destination pictures
		const consumedImageBlockIds = new Set<string>();
		for (let i = 0; i < blocks.length; i++) {
			const b = blocks[i];
			const prev = blocks[i - 1];
			if (b.type === 'matching' && prev?.type === 'image') {
				const matchedImgs = matchingPictures(b, prev.images);
				if (matchedImgs) consumedImageBlockIds.add(prev.id);
			}
		}

		for (let i = 0; i < blocks.length; i++) {
			const block = blocks[i];
			const prev = blocks[i - 1];
			const blockId = safeItemId(block.id, 'block', i, usedBlockIds);

			if (block.type === 'instructions') {
				const bodyText = plain(block.body).trim();
				// First instructions block is already in activity.content; additional instructions can be rendered in worksheet
				if (bodyText && i > 0) {
					wsBlocks.push({
						id: blockId,
						type: 'instructions',
						body: bilingualFromText(bodyText),
					});
				}
				continue;
			}

			if (block.type === 'image') {
				if (consumedImageBlockIds.has(block.id)) continue;
				const images = block.images?.length
					? block.images
					: block.asset || block.url
						? [{ id: block.id, asset: block.asset, url: block.url, alt: block.alt || '', caption: block.label || '' }]
						: [];
				for (const [imgIdx, img] of images.entries()) {
					const imgBlockId = safeItemId(`${blockId}-img-${imgIdx}`, 'img', imgIdx, usedBlockIds);
					const assetId = img.asset?.fileId || extractFileIdFromUrl(img.url);
					if (assetId) addMaterialId(assetId);
					wsBlocks.push({
						id: imgBlockId,
						type: 'image',
						body: bilingualFromText(img.alt || img.caption || 'Gambar'),
						...(img.caption ? { caption: bilingualFromText(img.caption) } : {}),
						...(assetId ? { asset: assetId } : img.url ? { asset: img.url.slice(0, 80) } : {}),
					});
				}
				continue;
			}

			if (block.type === 'audio') {
				const assetId = block.asset?.fileId || extractFileIdFromUrl(block.url) || block.url?.slice(0, 80);
				if (isPocketBaseId(assetId)) addMaterialId(assetId);
				if (assetId) {
					wsBlocks.push({
						id: blockId,
						type: 'audio',
						asset: assetId,
						...(block.label ? { label: block.label.slice(0, 80) } : {}),
					});
				}
				continue;
			}

			if (block.type === 'matching') {
				const pairedImages = prev?.type === 'image' ? matchingPictures(block, prev.images) : undefined;
				const rawDestinations = block.destinations?.length
					? block.destinations.slice(0, 6)
					: [
							{ id: 'A', label: 'A', title: 'Kelompok A' },
							{ id: 'B', label: 'B', title: 'Kelompok B' },
						];
				const usedLabels = new Set<string>();
				const destByOriginalId = new Map<string, WorksheetDestination>();
				const destinations: WorksheetDestination[] = rawDestinations.map((dest, dIdx) => {
					let label = (dest.label?.trim() || String.fromCharCode(65 + dIdx)).slice(0, 40);
					if (usedLabels.has(label)) label = `${label}-${dIdx + 1}`;
					usedLabels.add(label);
					const pairedImg = pairedImages?.[dIdx];
					const imageFileId =
						pairedImg?.asset?.fileId ||
						extractFileIdFromUrl(pairedImg?.url) ||
						extractFileIdFromUrl(dest.url);
					if (imageFileId) addMaterialId(imageFileId);
					const titleParts = splitPromptAndTranslation(dest.title || label);
					const wsDest: WorksheetDestination = {
						id: label,
						label,
						title: bilingualFromText(titleParts.prompt, titleParts.translation),
						...(isPocketBaseId(imageFileId) ? { image: imageFileId } : {}),
					};
					destByOriginalId.set(dest.id, wsDest);
					destByOriginalId.set(label, wsDest);
					return wsDest;
				});

				const optionLabels = destinations.map((d) => d.label);
				const cardItemIds: string[] = [];
				for (const [qIdx, qid] of (block.questionIds || []).entries()) {
					if (items.length >= 30) break;
					const q = d.questionsById[qid];
					if (!q) continue;
					const itemId = safeItemId(qid, 'match', qIdx, usedItemIds);
					const { prompt, translation } = splitPromptAndTranslation(plain(q.prompt));
					items.push({
						id: itemId,
						prompt,
						...(translation ? { translation } : {}),
						type: 'select',
						options: optionLabels,
					});
					cardItemIds.push(itemId);
					const key = privateKeys.answersByQuestionId[qid];
					const targetDest = key?.correctDestinationId
						? destByOriginalId.get(key.correctDestinationId)
						: undefined;
					if (targetDest) {
						answerKeyItems[itemId] = {
							mode: 'exact',
							accepted: [targetDest.label],
							points: Math.max(1, Math.min(100, Number(q.points) || 1)),
						};
						allFeedbackOnly = false;
					}
				}
				if (cardItemIds.length && destinations.length >= 2) {
					wsBlocks.push({
						id: blockId,
						type: 'match',
						prompt: bilingualFromText('Cocokkan pernyataan ke kelompok tujuan.'),
						layout: 'destinations-above',
						destinations,
						cardItemIds,
					});
				}
				continue;
			}

			if (block.type === 'gap_passage') {
				const sections: NonNullable<Extract<ScheduledWorksheetBlock, { type: 'passage' }>['sections']> = [];
				const usedSectionIds = new Set<string>();
				for (const [sIdx, sec] of (block.sections || []).slice(0, 12).entries()) {
					const secId = safeItemId(sec.id || `sec-${sIdx + 1}`, 'sec', sIdx, usedSectionIds);
					const segments: WorksheetSegment[] = [];
					let gapCountInSec = 0;
					for (const seg of sec.segments || []) {
						if (seg.type === 'text') {
							if (seg.text.trim()) {
								segments.push({
									type: 'text',
									text: { de: seg.text.slice(0, 2000) },
								});
							}
						} else if (seg.type === 'gap' && items.length < 30) {
							const q = d.questionsById[seg.questionId];
							if (!q) continue;
							gapCountInSec++;
							const itemId = safeItemId(seg.questionId, 'gap', items.length, usedItemIds);
							const rawPrompt = plain(q.prompt).trim();
							// Build context string for legacy fallback & clear prompt display
							const contextPreview = (sec.segments || [])
								.map((part, pIdx) => {
									if (part.type === 'text') return part.text;
									const gNum =
										(sec.segments || [])
											.slice(0, pIdx + 1)
											.filter((x) => x.type === 'gap').length;
									return `(${gNum}) ______`;
								})
								.join('')
								.trim();
							const itemPrompt =
								rawPrompt && rawPrompt !== 'Isian baru' && !/^Isian \d+$/i.test(rawPrompt)
									? rawPrompt.slice(0, 1000)
									: `Bagian ${sIdx + 1} · Lücke ${gapCountInSec}: ${contextPreview}`.slice(0, 1000);
							items.push({
								id: itemId,
								prompt: itemPrompt,
								type: 'text',
							});
							segments.push({ type: 'gap', itemId });
							const key = privateKeys.answersByQuestionId[seg.questionId];
							const accepted = (key?.accepted || []).map((v) => v.trim()).filter(Boolean);
							if (accepted.length) {
								answerKeyItems[itemId] = {
									mode: 'exact',
									accepted,
									points: Math.max(1, Math.min(100, Number(q.points) || 1)),
								};
								allFeedbackOnly = false;
							}
						}
					}
					if (segments.some((s) => s.type === 'gap')) {
						sections.push({ id: secId, segments });
					}
				}
				if (sections.length) {
					wsBlocks.push({
						id: blockId,
						type: 'passage',
						sections,
					});
				}
				continue;
			}

			if (block.type === 'writing' || block.type === 'reflection' || block.type === 'question_group') {
				const qids = questionIds(block);
				const reflectionItemIds: string[] = [];
				for (const [qIdx, qid] of qids.entries()) {
					if (items.length >= 30) break;
					const q = d.questionsById[qid];
					if (!q) continue;
					const key = privateKeys.answersByQuestionId[qid];
					const itemId = safeItemId(qid, 'item', items.length, usedItemIds);
					const { prompt, translation } = splitPromptAndTranslation(plain(q.prompt));

					if (q.kind === 'single_choice' && (q.options?.length || 0) >= 2) {
						const opts = q.options!.slice(0, 6).map((o, oIdx) => (o.label.trim() || `Pilihan ${oIdx + 1}`).slice(0, 200));
						items.push({
							id: itemId,
							prompt,
							...(translation ? { translation } : {}),
							type: 'select',
							options: opts,
						});
						const correctOpt = q.options!.find((o) => o.id === key?.correctOptionId);
						if (correctOpt) {
							answerKeyItems[itemId] = {
								mode: 'exact',
								accepted: [correctOpt.label.trim() || opts[0]],
								points: Math.max(1, Math.min(100, Number(q.points) || 1)),
							};
							allFeedbackOnly = false;
						}
						// Single-choice inside a mixed worksheet does not have a dedicated block type in scheduled-classes-domain.js;
						// if we have any select item in question_group, we omit wsBlocks for this activity so WorksheetAnswers renders all items natively.
					} else {
						items.push({
							id: itemId,
							prompt,
							...(translation ? { translation } : {}),
							type: 'text',
						});
						if (key?.strategy === 'exact_text') {
							const accepted = (key.accepted || []).map((v) => v.trim()).filter(Boolean);
							if (accepted.length) {
								answerKeyItems[itemId] = {
									mode: 'exact',
									accepted,
									points: Math.max(1, Math.min(100, Number(q.points) || 1)),
								};
								allFeedbackOnly = false;
							}
						} else if (key?.strategy === 'rubric') {
							hasManualQuestion = true;
							allFeedbackOnly = false;
							totalManualPoints += Math.max(0, Number(q.points) || 0);
							const modelAnswer = plain(key.modelAnswer).trim().slice(0, 4000);
							const guidance = plain(key.privateGuidance).trim().slice(0, 2000);
							if (q.rubric?.criteria.length) {
								for (const c of q.rubric.criteria) {
									if (c.label.trim() && c.maxPoints > 0) {
										rubricCriteria.push({
											id: safeItemId(c.id, 'crit', rubricCriteria.length, new Set(rubricCriteria.map((x) => x.id))),
											label: c.label.trim().slice(0, 200),
											maxPoints: c.maxPoints,
										});
									}
								}
							}
							const rubricSummary = [
								guidance,
								...(q.rubric?.criteria || []).map((c) => `${c.label.trim()} (${c.maxPoints} poin)`),
							]
								.filter(Boolean)
								.join('\n')
								.slice(0, 2000);
							if (modelAnswer || rubricSummary) {
								answerKeyItems[itemId] = {
									mode: 'reference',
									...(modelAnswer ? { modelAnswer } : {}),
									...(rubricSummary ? { rubric: rubricSummary } : {}),
								};
							}
						}

						if (block.type === 'reflection' || q.kind === 'reflection') {
							reflectionItemIds.push(itemId);
						} else {
							const isExtended = block.type === 'writing' || q.kind === 'long_writing';
							wsBlocks.push({
								id: safeItemId(`${blockId}-w-${qIdx}`, 'write', qIdx, usedBlockIds),
								type: 'writing',
								itemId,
								prompt: bilingualFromText(prompt, translation),
								responseLength: isExtended ? 'extended' : 'short',
								rows: isExtended ? 10 : 3,
							});
						}
					}
				}
				if (reflectionItemIds.length) {
					wsBlocks.push({
						id: blockId,
						type: 'reflection',
						itemIds: reflectionItemIds,
						prompt: bilingualFromText(builderActivity.title || 'Refleksi'),
					});
				}
			}
		}

		// Verify every item in `items` has exactly 1 answering location in `wsBlocks`
		const answeredIds = new Map<string, number>();
		const bump = (id: string) => answeredIds.set(id, (answeredIds.get(id) || 0) + 1);
		for (const wb of wsBlocks) {
			if (wb.type === 'match') wb.cardItemIds.forEach(bump);
			else if (wb.type === 'gap') wb.segments.filter((s) => s.type === 'gap').forEach((s) => bump(s.itemId));
			else if (wb.type === 'passage')
				wb.sections.forEach((sec) => sec.segments.filter((s) => s.type === 'gap').forEach((s) => bump(s.itemId)));
			else if (wb.type === 'writing') bump(wb.itemId);
			else if (wb.type === 'reflection') wb.itemIds.forEach(bump);
		}
		const validBlocks =
			wsBlocks.length > 0 &&
			wsBlocks.length <= 60 &&
			items.every((item) => answeredIds.get(item.id) === 1);

		const finalMaterialIds = [...materialIdSet];
		const worksheet: ScheduledWorksheet | undefined = items.length
			? {
					items,
					...(validBlocks ? { blocks: wsBlocks } : {}),
					...(Object.keys(answerKeyItems).length
						? { answerKey: { version: 1, items: answerKeyItems } }
						: {}),
				}
			: undefined;

		activities.push({
			kind,
			title: builderActivity.title.trim() || `Kegiatan ${activityIndex + 1}`,
			minutes,
			required: builderActivity.required !== false,
			content,
			url: referenceUrl,
			questions: [],
			...(worksheet ? { worksheet } : {}),
			...(lesson ? { lesson } : {}),
			materialIds: finalMaterialIds,
			cpmkIds: [],
			subCpmkIds: [],
		});

		if (hasManualQuestion) {
			if (rubricCriteria.length) {
				const maxPoints = rubricCriteria.reduce((s, c) => s + c.maxPoints, 0);
				gradingSettings.push({
					activityIndex,
					mode: 'rubric',
					maxPoints,
					criteria: rubricCriteria,
				});
			} else {
				gradingSettings.push({
					activityIndex,
					mode: 'points',
					maxPoints: totalManualPoints > 0 ? totalManualPoints : 100,
					criteria: [],
				});
			}
		} else if (kind === 'exit_ticket' && allFeedbackOnly) {
			gradingSettings.push({
				activityIndex,
				mode: 'ungraded',
				maxPoints: 0,
				criteria: [],
			});
		}
	});

	return {
		title: d.title.trim(),
		instructions: plain(d.instructions).trim(),
		section: d.context.sectionIds[0] || '',
		startsAt: d.delivery.startsAt,
		joinUntil: d.delivery.checkInClosesAt || d.delivery.startsAt,
		lateAfterMin: Number.isInteger(d.delivery.lateAfterMinutes) ? d.delivery.lateAfterMinutes : 10,
		activities,
		gradingSettings,
	};
}

function sourceToAsset(
	source: NonNullable<ScheduledActivity['sources']>[number],
): BuilderAsset | undefined {
	if (!source.id) return undefined;
	const filename =
		source.filename ||
		(source.url ? decodeURIComponent(source.url.split('/').pop() || '') : '');
	if (!filename) return undefined;
	return {
		fileId: source.id,
		filename,
		version: source.version || 1,
		name: source.title || filename,
	};
}

function populateQuestionFromWorksheetItem(
	envelope: BuilderEnvelope,
	item: ScheduledWorksheet['items'][number],
	key: WorksheetAnswerKeyEntry | undefined,
	kind: QuestionKind,
): string {
	const id = appendQuestion(envelope, kind);
	const q = envelope.document.questionsById[id];
	q.prompt = rich([item.prompt, item.translation].filter(Boolean).join('\n'));
	if (item.type === 'select' && kind === 'single_choice') {
		q.options = (item.options || []).map((label) => ({ id: uid(), label }));
	}
	if (key?.mode === 'exact') {
		q.points = key.points;
		if (kind === 'single_choice') {
			envelope.privateKeys.answersByQuestionId[id] = {
				strategy: 'single_choice',
				correctOptionId:
					q.options?.find((o) => key.accepted.includes(o.label))?.id || '',
			};
		} else if (kind === 'matching') {
			envelope.privateKeys.answersByQuestionId[id] = {
				strategy: 'matching',
				correctDestinationId: key.accepted[0] || '',
			};
		} else {
			envelope.privateKeys.answersByQuestionId[id] = {
				strategy: 'exact_text',
				accepted: [...key.accepted],
				comparison: { ignoreCase: true, ignorePunctuation: true },
			};
		}
	} else if (key?.mode === 'reference') {
		envelope.privateKeys.answersByQuestionId[id] = {
			strategy: 'rubric',
			modelAnswer: rich(key.modelAnswer || ''),
			privateGuidance: rich(key.rubric || ''),
		};
	}
	return id;
}

/**
 * Losslessly converts a ScheduledClassState into a BuilderEnvelope (`kind: 'kelas'`),
 * preserving matching blocks (with Berkas images), gap passages, lessons, audio/images,
 * writing rows, and answer keys.
 */
export function scheduledStateToBuilder(
	state: ScheduledClassState,
	context: BuilderDocument['context'],
	origin: string,
	options: { isCopy?: boolean } = { isCopy: true },
): BuilderEnvelope {
	const isCopy = options.isCopy !== false;
	const next = blankBuilder(
		'kelas',
		context.courseId,
		context.meetingId,
		context.sectionIds,
	);
	next.document.context = context;
	const baseTitle = state.class?.title || state.session.title || 'Kelas baru';
	next.document.title = (isCopy ? `${baseTitle} (salinan)` : baseTitle).slice(0, 200);
	next.document.instructions = rich(state.class?.instructions || '');
	if (!isCopy && state.class) {
		next.document.delivery = {
			...next.document.delivery,
			startsAt: state.class.startsAt || '',
			endsAt: state.class.endsAt || '',
			checkInClosesAt: state.class.joinUntil || '',
			lateAfterMinutes: state.class.lateAfterMin ?? 10,
		};
	}
	next.document.activities = [];

	for (const source of state.activities) {
		const activity = newActivity(source.title);
		activity.required = source.required;
		activity.plannedMinutes = source.minutes;
		next.document.activities.push(activity);

		if (source.content) {
			const id = appendBlock(next, activity.id, 'instructions');
			activity.blocks.find((b) => b.id === id)!.body = rich(source.content);
		}
		if (source.lesson) {
			const id = appendBlock(next, activity.id, 'lesson');
			activity.blocks.find((b) => b.id === id)!.lesson = structuredClone({
				goal: source.lesson.goal,
				steps: source.lesson.steps,
				scenes: source.lesson.scenes,
				...(source.lesson.videos ? { videos: source.lesson.videos } : {}),
				...(source.lesson.videoNote ? { videoNote: source.lesson.videoNote } : {}),
				...(source.lesson.note ? { note: source.lesson.note } : {}),
				...(source.lesson.source ? { source: source.lesson.source } : {}),
			});
			for (const video of source.lesson.videos || []) {
				const bid = appendBlock(next, activity.id, 'video'),
					b = activity.blocks.find((b) => b.id === bid)!;
				b.url = new URL(video.src, origin).href;
				b.label = video.title.de;
			}
		}
		if (source.url && source.url.startsWith('https://')) {
			const bid = appendBlock(next, activity.id, 'reference'),
				b = activity.blocks.find((b) => b.id === bid)!;
			b.url = source.url;
			b.label = 'Materi kegiatan';
		}

		// Attach any standalone audio sources from activity.sources if not already in worksheet.blocks
		const wsBlocks = source.worksheet?.blocks || [];
		const audioAssetsInBlocks = new Set(
			wsBlocks.filter((b): b is Extract<ScheduledWorksheetBlock, { type: 'audio' }> => b.type === 'audio').map((b) => b.asset),
		);
		for (const src of source.sources || []) {
			const nameOrUrl = src.filename || src.url || '';
			if (/\.(mp3|wav|ogg|m4a|aac)$/i.test(nameOrUrl) && src.id && !audioAssetsInBlocks.has(src.id)) {
				const asset = sourceToAsset(src);
				if (asset) {
					const bid = appendBlock(next, activity.id, 'audio');
					const b = activity.blocks.find((x) => x.id === bid)!;
					b.asset = asset;
					b.label = src.title;
				}
			}
		}

		const questions = source.kind === 'quiz' ? source.questions || [] : [];
		if (questions.length) {
			for (const item of questions) {
				const id = appendQuestion(next, 'single_choice'),
					q = next.document.questionsById[id];
				q.prompt = rich(item.text);
				q.points = item.points;
				q.options = item.options.map((label) => ({ id: uid(), label }));
				next.privateKeys.answersByQuestionId[id] = {
					strategy: 'single_choice',
					correctOptionId: q.options[item.correctIndex]?.id || '',
					explanation: rich(item.explanation || ''),
				};
				activity.blocks.push({
					id: uid(),
					type: 'question_group',
					questionIds: [id],
				});
			}
		}

		const sheet = source.worksheet;
		if (sheet?.items.length) {
			const itemsById = new Map(sheet.items.map((item) => [item.id, item]));
			const keys = sheet.answerKey?.items || {};

			// Case 1: Explicit worksheet.blocks exist
			if (wsBlocks.length) {
				for (const wb of wsBlocks) {
					if (wb.type === 'instructions') {
						const text = [wb.body.de, wb.body.id].filter(Boolean).join('\n');
						if (text) {
							const bid = appendBlock(next, activity.id, 'instructions');
							activity.blocks.find((b) => b.id === bid)!.body = rich(text);
						}
					} else if (wb.type === 'image') {
						const src = (source.sources || []).find((s) => s.id === wb.asset);
						const asset = src ? sourceToAsset(src) : undefined;
						const bid = appendBlock(next, activity.id, 'image');
						const b = activity.blocks.find((x) => x.id === bid)!;
						if (asset) b.asset = asset;
						else if (wb.asset && /^https:\/\//i.test(wb.asset)) b.url = wb.asset;
						b.alt = wb.body.de || wb.body.id || src?.title || 'Gambar';
						b.label = wb.caption?.de || wb.caption?.id || '';
					} else if (wb.type === 'audio') {
						const src = (source.sources || []).find((s) => s.id === wb.asset);
						const asset = src ? sourceToAsset(src) : undefined;
						const bid = appendBlock(next, activity.id, 'audio');
						const b = activity.blocks.find((x) => x.id === bid)!;
						if (asset) b.asset = asset;
						else if (/^https:\/\//i.test(wb.asset)) b.url = wb.asset;
						b.label = wb.label || src?.title || 'Audio';
					} else if (wb.type === 'match') {
						// Check if destinations reference file_library images
						const destImages: BuilderImage[] = [];
						for (const dest of wb.destinations) {
							if (dest.image) {
								const src = (source.sources || []).find((s) => s.id === dest.image);
								const asset = src ? sourceToAsset(src) : undefined;
								if (asset || src?.url) {
									destImages.push({
										id: uid(),
										...(asset ? { asset } : {}),
										...(src?.url && /^https:\/\//i.test(src.url) ? { url: src.url } : {}),
										alt: dest.title.de || dest.title.id || dest.label,
										caption: `${dest.label} · ${dest.title.de || dest.title.id || dest.label}`,
									});
								}
							}
						}
						if (destImages.length === wb.destinations.length) {
							activity.blocks.push({
								id: uid(),
								type: 'image',
								images: destImages,
								columns: Math.min(4, destImages.length),
							});
						}
						const destinations = wb.destinations.map((dest) => ({
							id: uid(),
							label: dest.label,
							title: [dest.title.de, dest.title.id].filter(Boolean).join(' / ') || dest.label,
						}));
						const destIdByLabel = new Map(destinations.map((d) => [d.label, d.id]));
						const qids: string[] = [];
						for (const itemId of wb.cardItemIds) {
							const item = itemsById.get(itemId);
							if (!item) continue;
							const key = keys[item.id];
							const qid = populateQuestionFromWorksheetItem(next, item, key, 'matching');
							const targetLabel = key?.mode === 'exact' ? key.accepted[0] : '';
							if (targetLabel && destIdByLabel.has(targetLabel)) {
								next.privateKeys.answersByQuestionId[qid].correctDestinationId = destIdByLabel.get(targetLabel)!;
							}
							qids.push(qid);
						}
						activity.blocks.push({
							id: uid(),
							type: 'matching',
							destinations,
							questionIds: qids,
						});
					} else if (wb.type === 'passage' || wb.type === 'gap') {
						const rawSections =
							wb.type === 'passage'
								? wb.sections
								: [{ id: wb.id, segments: wb.segments }];
						const sections: NonNullable<BuilderBlock['sections']> = [];
						for (const sec of rawSections) {
							const segments: NonNullable<BuilderBlock['sections']>[number]['segments'] = [];
							for (const seg of sec.segments) {
								if (seg.type === 'text') {
									segments.push({
										type: 'text',
										text: seg.text.de || seg.text.id || '',
									});
								} else if (seg.type === 'gap') {
									const item = itemsById.get(seg.itemId);
									if (!item) continue;
									const qid = populateQuestionFromWorksheetItem(next, item, keys[item.id], 'short_answer');
									segments.push({ type: 'gap', questionId: qid });
								}
							}
							if (segments.length) sections.push({ id: uid(), segments });
						}
						if (sections.length) {
							activity.blocks.push({
								id: uid(),
								type: 'gap_passage',
								sections,
							});
						}
					} else if (wb.type === 'writing') {
						const item = itemsById.get(wb.itemId);
						if (!item) continue;
						const key = keys[item.id];
						const isShortExact = key?.mode === 'exact' && wb.responseLength === 'short';
						const qKind: QuestionKind = isShortExact ? 'short_answer' : 'long_writing';
						const qid = populateQuestionFromWorksheetItem(next, item, key, qKind);
						activity.blocks.push({
							id: uid(),
							type: isShortExact ? 'question_group' : 'writing',
							...(isShortExact ? { questionIds: [qid] } : { questionId: qid }),
						});
					} else if (wb.type === 'reflection') {
						const qids: string[] = [];
						for (const itemId of wb.itemIds) {
							const item = itemsById.get(itemId);
							if (!item) continue;
							qids.push(populateQuestionFromWorksheetItem(next, item, keys[item.id], 'reflection'));
						}
						if (qids.length) {
							activity.blocks.push({
								id: uid(),
								type: 'reflection',
								questionIds: qids,
							});
						}
					}
				}
			} else {
				// Case 2: Legacy worksheet without explicit blocks (e.g. Beim Arzt session)
				const targets = cardMatchingTargets(source);
				if (targets.length >= 2) {
					// Build image gallery block for the matching pictures if backed by file_library
					const destImages: BuilderImage[] = [];
					for (const target of targets) {
						const label = target.value;
						const src = (source.sources || []).find(
							(s) =>
								s.available &&
								((s.title.match(/\bBild ([A-Z])\b/i)?.[1] ||
									s.title.match(/^([A-Z])\s*·/)?.[1]) === label ||
									s.title === target.title),
						);
						const asset = src ? sourceToAsset(src) : undefined;
						if (asset) {
							destImages.push({
								id: uid(),
								asset,
								alt: target.title,
								caption: `${label} · ${target.title}`,
							});
						}
					}
					if (destImages.length === targets.length) {
						activity.blocks.push({
							id: uid(),
							type: 'image',
							images: destImages,
							columns: Math.min(4, destImages.length),
						});
					}
					const destinations = targets.map((t) => ({
						id: uid(),
						label: t.value,
						title: t.title,
						...(t.url.startsWith('https://') ? { url: t.url } : {}),
					}));
					const destIdByLabel = new Map(destinations.map((d) => [d.label, d.id]));
					const qids: string[] = [];
					for (const item of sheet.items) {
						const key = keys[item.id];
						const qid = populateQuestionFromWorksheetItem(next, item, key, 'matching');
						const targetLabel = key?.mode === 'exact' ? key.accepted[0] : '';
						if (targetLabel && destIdByLabel.has(targetLabel)) {
							next.privateKeys.answersByQuestionId[qid].correctDestinationId = destIdByLabel.get(targetLabel)!;
						}
						qids.push(qid);
					}
					activity.blocks.push({
						id: uid(),
						type: 'matching',
						destinations,
						questionIds: qids,
					});
				} else {
					// Group numbered gap items via worksheetBlocks, or individual items
					const layoutBlocks = worksheetBlocks(sheet.items);
					for (const lb of layoutBlocks) {
						if (lb.context && lb.gaps?.length) {
							const segments: NonNullable<BuilderBlock['sections']>[number]['segments'] = [];
							const parts = lb.context.split(/(\(\d+\)\s*_{3,})/g);
							for (const part of parts) {
								const number = part.match(/^\((\d+)\)\s*_{3,}$/)?.[1];
								const gap = number ? lb.gaps.find((g) => g.number === number) : undefined;
								if (gap) {
									const qid = populateQuestionFromWorksheetItem(
										next,
										gap.item,
										keys[gap.item.id],
										'short_answer',
									);
									segments.push({ type: 'gap', questionId: qid });
								} else if (part) {
									segments.push({ type: 'text', text: part });
								}
							}
							activity.blocks.push({
								id: uid(),
								type: 'gap_passage',
								sections: [{ id: uid(), segments }],
							});
						} else {
							const item = lb.items[0];
							const key = keys[item.id];
							const kind: QuestionKind =
								item.type === 'select'
									? 'single_choice'
									: key?.mode === 'exact'
										? 'short_answer'
										: source.kind === 'exit_ticket'
											? 'reflection'
											: 'long_writing';
							const qid = populateQuestionFromWorksheetItem(next, item, key, kind);
							activity.blocks.push({
								id: uid(),
								type:
									kind === 'long_writing'
										? 'writing'
										: kind === 'reflection'
											? 'reflection'
											: 'question_group',
								...(kind === 'long_writing'
									? { questionId: qid }
									: { questionIds: [qid] }),
							});
						}
					}
				}
			}
		}

		// Attach gradingSetting criteria if present for this activity
		const gradingSetting = state.gradingSettings?.find((g) => g.activity === source.id);
		if (gradingSetting?.mode === 'rubric' && gradingSetting.criteria.length) {
			const writingQids = activity.blocks
				.filter((b) => b.type === 'writing' || b.type === 'reflection')
				.flatMap(questionIds);
			const firstWritingQid = writingQids[0];
			if (firstWritingQid && next.document.questionsById[firstWritingQid]) {
				const q = next.document.questionsById[firstWritingQid];
				q.rubric = {
					criteria: gradingSetting.criteria.map((c) => ({
						id: uid(),
						label: c.label,
						maxPoints: c.maxPoints,
					})),
				};
				q.points = gradingSetting.criteria.reduce((s, c) => s + c.maxPoints, 0);
			}
		}

		if (!activity.blocks.length) {
			appendBlock(next, activity.id, 'acknowledgement');
		}
	}
	return next;
}
