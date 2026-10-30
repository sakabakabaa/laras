import{beforeEach,describe,it,expect,vi}from'vitest';
const m=vi.hoisted(()=>({auth:vi.fn(),context:vi.fn(),generate:vi.fn()}));
vi.mock('@/lib/api.server',()=>({withApi:(fn:unknown)=>fn,json:(data:unknown)=>Response.json(data),apiError:(status:number,error:string)=>Response.json({error},{status}),readJsonBody:(request:Request)=>request.json()}));
vi.mock('@/lib/context-retrieval.server',()=>({authenticateUser:m.auth}));
vi.mock('@/lib/scheduled-class-draft.server',()=>({scheduledAcademicContext:m.context,generateScheduledClassDraft:m.generate}));
import{action}from'@/routes/api.scheduled-class-draft';
const call=(body:Record<string,unknown>={sessionId:'session12345678',action:'generate'})=>action({request:new Request('http://localhost/api/scheduled-class-draft',{method:'POST',body:JSON.stringify(body)}),params:{}})as Promise<Response>;
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue({pb:{},user:{id:'faculty12345678',role:'faculty'}});});
describe('scheduled AI API',()=>{
 it('blocks students before loading private context or calling AI',async()=>{m.auth.mockResolvedValue({pb:{},user:{id:'student12345678',role:'student'}});expect((await call()).status).toBe(403);expect(m.context).not.toHaveBeenCalled();expect(m.generate).not.toHaveBeenCalled();});
 it('returns a usable settings instruction for rejected provider credentials',async()=>{m.generate.mockRejectedValue(new Error('Default request failed (HTTP 401)'));const response=await call();expect(response.status).toBe(503);expect((await response.json()).error).toContain('Pengaturan → Model AI');});
 it('preserves authorized context and validation responses',async()=>{m.context.mockResolvedValue({course:{id:'course'}});expect((await(await call({sessionId:'session12345678',action:'context'})).json()).context.course.id).toBe('course');m.generate.mockRejectedValue(Object.assign(new Error('Incomplete context'),{status:422}));expect((await call()).status).toBe(422);});
 it('returns proposals without scheduling and does not expose provider error details',async()=>{m.generate.mockResolvedValue({draft:{title:'Proposal'}});expect((await(await call()).json()).proposal.draft.title).toBe('Proposal');m.generate.mockRejectedValue(new Error('private upstream details'));const response=await call();expect(response.status).toBe(502);expect(JSON.stringify(await response.json())).not.toContain('private upstream details');});
});
