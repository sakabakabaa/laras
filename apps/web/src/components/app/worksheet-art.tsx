/** Decorative worksheet illustrations. Presentation only — never convey status. */

const ART = {
	writing: '/images/worksheet-writing.png',
	speaking:
		'https://images.hostinger.com/5f647a42-048a-4588-8b24-c77d8dcdadb1.png',
	checklist: '/images/worksheet-checklist.png',
	books: '/images/worksheet-books.png',
	empty:
		'https://images.hostinger.com/e1f3035b-8f95-41ef-ac18-b631a36ea611.png',
	folder:
		'https://images.hostinger.com/b7df7b2a-0c35-4db2-a53d-0dc80f6c175a.png',
} as const;

export type WorksheetArtName = keyof typeof ART;

export function WorksheetArt({
	name,
	size = 'md',
}: {
	name: WorksheetArtName;
	size?: 'sm' | 'md' | 'lg';
}) {
	return (
		<img
			className={`ws-art ${size}`}
			src={ART[name]}
			alt=""
			aria-hidden="true"
			draggable={false}
		/>
	);
}
