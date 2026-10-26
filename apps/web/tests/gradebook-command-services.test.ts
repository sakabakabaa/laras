import { describe, expect, it, vi } from 'vitest';
import type PocketBase from 'pocketbase';
vi.mock('@/lib/pocketbase-client.server',()=>({pocketbaseAdmin:{send:vi.fn()}}));
import { pocketbaseAdmin } from '@/lib/pocketbase-client.server';
import { prepareGradeChanges, approveGradeChanges, applyGradeChanges, reconcileGradeChanges, prepareGradeRevert } from '@/lib/gradebook/commands.server';
import { requireGradebookFaculty, authorizeGradebookCourse } from '@/lib/gradebook/authorization.server';
import { getGradeChangeHistory } from '@/lib/gradebook/history.server';

describe('shared gradebook server services',()=>{
 it('derives faculty identity and rejects non-faculty and foreign courses',async()=>{
  const pb={authStore:{isValid:true,record:{id:'faculty',collectionName:'users',role:'faculty'}},collection:vi.fn(()=>({getOne:vi.fn(async()=>({id:'course',owner:'foreign'}))}))} as unknown as PocketBase;
  expect(requireGradebookFaculty(pb)).toBe('faculty');
  await expect(authorizeGradebookCourse(pb,'course')).rejects.toThrow(/own/i);
  (pb.authStore.record as Record<string,unknown>).role='student';expect(()=>requireGradebookFaculty(pb)).toThrow(/faculty/i);
 });
 it('sends proposal-only execution references and uses isolated admin approval',async()=>{
  const pb={send:vi.fn(async()=>({id:'proposal'}))} as unknown as PocketBase;
  const ref={proposalId:'proposal',revision:1,payloadHash:'hash'};
  await prepareGradeChanges(pb,{courseId:'course',operationKey:'operation-1',items:[{componentId:'component',studentId:'student',operation:{op:'clear_score'}}]});
  await applyGradeChanges(pb,ref);await reconcileGradeChanges(pb,{proposalId:'proposal'});await prepareGradeRevert(pb,{proposalId:'proposal',operationKey:'revert-1'});await approveGradeChanges({...ref,ownerId:'faculty'});
  expect(pb.send).toHaveBeenNthCalledWith(2,'/api/gradebook/commands',expect.objectContaining({body:{...ref,action:'apply'},requestKey:null}));
  expect(pocketbaseAdmin.send).toHaveBeenCalledWith('/api/gradebook/commands',expect.objectContaining({body:{...ref,ownerId:'faculty',action:'approve'}}));
 });
 it('uses bounded owner-scoped immutable history queries',async()=>{
  const getList=vi.fn(async()=>({items:[],page:1,totalPages:0}));const pb={authStore:{isValid:true,record:{id:'faculty',collectionName:'users',role:'faculty'}},filter:vi.fn(()=> 'escaped'),collection:vi.fn(()=>({getList}))} as unknown as PocketBase;
  await getGradeChangeHistory(pb,{courseId:'course',page:1,perPage:25});
  expect(getList).toHaveBeenCalledWith(1,25,expect.objectContaining({filter:'escaped',sort:'-created,-id'}));
 });
});
