import { redirect } from 'react-router';
import type { Route } from './+types/home';

export function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	return redirect(`/login${url.search}`);
}
