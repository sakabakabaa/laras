import {beforeEach,describe,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn(),retrieve:vi.fn(),resolve:vi.fn(),generate:vi.fn(),access:vi.fn(),commit:vi.fn(),release:vi.fn()}));
vi.mock('@/lib/lesson-plans.server',()=>({lessonSession:mocks.session}));
vi.mock('@/lib/context-retrieval.server',()=>({retrieveContextBundle:mocks.retrieve}));
vi.mock('@/lib/ai/providers.server',()=>({resolveModel:mocks.resolve}));
vi.mock('@/lib/ai/openai-compatible.server',()=>({collectChatCompletion:mocks.generate}));
vi.mock('@/lib/ai-usage.server',()=>({enforceAiAccess:mocks.access,commitUsage:mocks.commit}));
vi.mock('@/lib/feedback.server',()=>({parseModelJson:JSON.parse}));
import {generateScheduledClassDraft} from '@/lib/scheduled-class-draft.server';
const user={id:'teacher12345678',role:'faculty' as const};
const sessionId='session12345678';
let status:string|null;
const pb={send:async()=>({class:status?{status}:null}),filter:()=>'',collection:(name:string)=>({getOne:async()=>({id:'course123456789',title:'German',rps:''}),getFullList:async()=>[],getList:async()=>({items:[]})})};
beforeEach(()=>{
 vi.clearAllMocks();status=null;
 mocks.session.mockResolvedValue({id:sessionId,course:'course123456789',title:'Word order',topic:'German main clauses',learningMaterial:'Students study how the finite verb occupies the second position in German declarative main clauses.',cpmks:[],subCpmks:[]});
 mocks.resolve.mockResolvedValue({model:'configured',apiKey:'private'});
 mocks.access.mockResolvedValue({ok:true,release:mocks.release});
 mocks.generate.mockResolvedValue({model:'configured',content:JSON.stringify({title:'Study',instructions:'Work independently.',activities:['material','assignment','exit_ticket'].map(kind=>({kind,title:kind,content:'Follow the RPS activity.',minutes:10}))})});
});
describe('scheduled draft generation boundary',()=>{
 it('uses the owner model, RPS fallback, and releases quota without publishing',async()=>{
  const draft=await generateScheduledClassDraft(pb as never,user,{sessionId,minutes:60});
  expect(mocks.resolve).toHaveBeenCalledWith(user.id,'lesson_plan');expect(mocks.retrieve).not.toHaveBeenCalled();expect(draft.draft.activities).toHaveLength(3);expect(draft.draft.notes[0]).toContain('RPS');expect(mocks.generate.mock.calls[0][1].prompt).toContain('"includeQuiz":false');expect(mocks.commit).toHaveBeenCalledOnce();expect(mocks.release).toHaveBeenCalledOnce();
 });
 it('refuses published classes before calling a model',async()=>{status='scheduled';await expect(generateScheduledClassDraft(pb as never,user,{sessionId,minutes:60})).rejects.toMatchObject({status:422});expect(mocks.generate).not.toHaveBeenCalled();});
 it('rejects material IDs outside the authorized context',async()=>{await expect(generateScheduledClassDraft(pb as never,user,{sessionId,minutes:60,materialIds:['foreign12345678']})).rejects.toMatchObject({status:422});expect(mocks.retrieve).not.toHaveBeenCalled();expect(mocks.access).not.toHaveBeenCalled();});
 it('releases quota on malformed model output without charging a success',async()=>{mocks.generate.mockResolvedValue({content:'{}'});await expect(generateScheduledClassDraft(pb as never,user,{sessionId,minutes:60})).rejects.toThrow();expect(mocks.release).toHaveBeenCalledOnce();expect(mocks.commit).not.toHaveBeenCalled();});
 it('respects existing ownership checks',async()=>{mocks.session.mockRejectedValue(Object.assign(new Error('Forbidden'),{status:403}));await expect(generateScheduledClassDraft(pb as never,user,{sessionId,minutes:60})).rejects.toMatchObject({status:403});expect(mocks.generate).not.toHaveBeenCalled();});
});
