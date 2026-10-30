/** Empty section means a shared course session, visible to every parallel class. */
export function sessionInClass(session: {section?: string}, sectionId: string) {
 return !sectionId || !session.section || session.section === sectionId;
}
