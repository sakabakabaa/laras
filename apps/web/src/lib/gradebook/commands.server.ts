import type PocketBase from 'pocketbase';
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import type { ScoreOperation } from './validation';

export type GradeChangeInput = { componentId: string; studentId: string; operation: ScoreOperation };
export type GradeState = { value: number | null; note: string; chapters: Record<string, 'done' | 'partial' | 'missing'> };
export type GradeProposalRef = { proposalId: string; revision: number; payloadHash: string };
export type GradeProposal = {
 id: string; course: string; revision: number; payloadHash: string;
 status: 'awaiting_approval' | 'approved' | 'committed' | 'verified' | 'committed_unverified' | 'conflicted' | 'expired' | 'rejected' | 'cancelled';
 items: Array<{ componentId: string; studentId: string; operations: ScoreOperation[]; before: GradeState; after: GradeState; restore?: boolean; removeEntry?: boolean; expected: { id: string; revision: number } | null }>;
 result: { entries?: Array<{ id: string; componentId: string; studentId: string; revision: number; deleted?: boolean }>; verifiedAt?: string; conflicts?: string[] } | null;
};
export type PrepareGradeChangesInput = { courseId: string; operationKey: string; source?: 'ui' | 'assistant_input' | 'import'; items: GradeChangeInput[] };
const endpoint = '/api/gradebook/commands';
const send = (pb: PocketBase, body: Record<string, unknown>) => pb.send<GradeProposal>(endpoint, { method: 'POST', body, requestKey: null });
/** PB derives owner from this faculty user's token, never from the payload. */
export const prepareGradeChanges = (pb: PocketBase, input: PrepareGradeChangesInput) => send(pb, { ...input, action: 'prepare' });
/** Call ONLY from an authenticated explicit user-action HTTP handler, never an assistant tool. */
export const approveGradeChanges = (input: GradeProposalRef & { ownerId: string }): Promise<GradeProposal> => pocketbaseAdmin.send(endpoint, { method: 'POST', body: { ...input, action: 'approve' }, requestKey: null });
export const applyGradeChanges = (pb: PocketBase, input: GradeProposalRef) => send(pb, { ...input, action: 'apply' });
export const reconcileGradeChanges = (pb: PocketBase, input: { proposalId: string }) => send(pb, { ...input, action: 'reconcile' });
export const getGradeChangeStatus = reconcileGradeChanges;
export const rejectGradeChanges = (pb: PocketBase, input: GradeProposalRef) => send(pb, { ...input, action: 'reject' });
export const prepareGradeRevert = (pb: PocketBase, input: { proposalId: string; operationKey: string }) => send(pb, { ...input, action: 'revert' });
