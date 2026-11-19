import {describe,expect,it,vi} from 'vitest';
vi.mock('@/lib/require-auth',()=>({requireAuth:(destination:string)=>{throw new Response(null,{status:302,headers:{Location:destination}});}}));
vi.mock('@/components/app/app-shell',()=>({AppShell:()=>null}));
vi.mock('@/components/app/course-detail',()=>({CourseDetail:()=>null}));
vi.mock('@/components/app/course-rail',()=>({CourseRail:()=>null}));
vi.mock('@/hooks/use-auth',()=>({useAuth:()=>({})}));
vi.mock('@/hooks/use-course-route',()=>({useCourseByRoute:()=>({})}));
vi.mock('@/lib/pocketbase-client',()=>({default:{authStore:{}}}));
import {clientLoader} from '@/routes/course';
describe('course login return destination',()=>{
 it.each(['/app/courses/course/pertemuan/session/terjadwal','/app/courses/course/pertemuan/session/terjadwal?tab=overview'])('preserves the exact session path %s',path=>{
  try{clientLoader({request:new Request('https://laraslernen.com'+path)} as Parameters<typeof clientLoader>[0]);throw Error('Expected redirect');}
  catch(error){expect(error).toBeInstanceOf(Response);const target=new URL((error as Response).headers.get('Location')!,'https://laraslernen.com');expect(target.pathname).toBe('/login');expect(target.searchParams.get('next')).toBe(path);}
 });
});
