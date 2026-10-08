import { createHash, randomUUID } from 'node:crypto';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** Recursively sort object keys; preserve array order and text bytes. */
export function canonicalEvidenceJson(value: unknown): string {
 const sorted = (item: unknown): unknown => {
  if (Array.isArray(item)) return item.map(sorted);
  if (item && typeof item === 'object') return Object.fromEntries(
   Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, sorted(entry)]),
  );
  return item;
 };
 return JSON.stringify(sorted(value));
}
function freeze<T>(value: T): T {
 if (value && typeof value === 'object') {
  Object.values(value).forEach(freeze);
  Object.freeze(value);
 }
 return value;
}

/** Generation-time evidence, never reconstructed from later assignment/submission state. */
export function createResearchSnapshot(input: {
 studentText: string; structuredAnswers: string; task: Record<string, unknown>;
 rubric: { label: string; weight: number }[]; userPrompt: string; systemPrompt: string;
 images: string[]; link: string; promptVersion: string; systemPromptVersion: string;
 providerConfig: { provider: string; model: string; modelVersion?: string; [key: string]: unknown };
 buildId?: string;
}) {
 const task = clone(input.task);
 const rubric = clone(input.rubric);
 // Explicit allowlist: never serialize env, API keys, headers or arbitrary provider options.
 const providerConfig = {
  provider: input.providerConfig.provider,
  model: input.providerConfig.model,
  modelVersion: input.providerConfig.modelVersion || 'unknown',
  endpoint: 'https://router.bynara.id/v1/chat/completions',
  stream: true,
  timeoutMs: 60000,
  parameters: { temperature: 'provider-default', maxTokens: 'provider-default' },
 };
 const evidence = {
  schemaVersion: 2, generationId: randomUUID(), capturedAt: new Date().toISOString(),
  buildId: input.buildId || 'unknown',
  studentText: input.studentText, structuredAnswers: input.structuredAnswers,
  task, rubric, userPrompt: input.userPrompt, systemPrompt: input.systemPrompt,
  images: [...input.images], link: input.link,
  promptVersion: input.promptVersion, systemPromptVersion: input.systemPromptVersion,
  providerConfig,
  hashes: {
   studentText: sha256(input.studentText), structuredAnswers: sha256(input.structuredAnswers),
   userPrompt: sha256(input.userPrompt), systemPrompt: sha256(input.systemPrompt),
   task: sha256(canonicalEvidenceJson(task)), rubric: sha256(canonicalEvidenceJson(rubric)),
   providerConfig: sha256(canonicalEvidenceJson(providerConfig)),
  },
 };
 return freeze({ ...evidence, snapshotHash: sha256(canonicalEvidenceJson(evidence)) });
}
