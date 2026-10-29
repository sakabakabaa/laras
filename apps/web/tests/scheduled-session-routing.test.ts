import {it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createMemoryRouter,RouterProvider} from 'react-router';
import CourseLayout from '../src/routes/course';
import pb from '../src/lib/pocketbase-client';

it('keeps student classroom links in the student layout before useAuth hydrates',()=>{
  pb.authStore.save('test-token',{id:'student',role:'student',name:'Student'});
  const path='/app/courses/course/pertemuan/session/terjadwal';
  const router=createMemoryRouter([{path:'/app/courses/:courseId',element:createElement(CourseLayout),children:[{path:'pertemuan/:sessionId/terjadwal',element:createElement('p',null,'Student classroom content')}]}],{initialEntries:[path]});
  try{const html=renderToStaticMarkup(createElement(RouterProvider,{router}));expect(html).toContain('Student classroom content');expect(html).not.toContain('cr-sidebar');expect(router.state.location.pathname).toBe(path);}finally{router.dispose();pb.authStore.clear();}
});
