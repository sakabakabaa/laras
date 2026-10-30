export const CONVERSATION_TURNS = 6;
export function conversationTurn(history: {role:string}[]) {
  const answered=history.filter(m=>m.role==='user').length;
  return {answered,remaining:Math.max(0,CONVERSATION_TURNS-answered-1),isFinal:answered===CONVERSATION_TURNS-1};
}
/** Never leave a final spoken turn with an unanswered question. */
export function closeConversation(reply:string,language?:string):string {
  if(!/[?¿？؟]/u.test(reply))return reply;
  const endings:Record<string,string>={de:'Danke für das Gespräch! Es hat mich gefreut, mit dir zu sprechen. Bis bald!',en:'Thank you for the conversation! It was nice talking with you. See you soon!',fr:'Merci pour cette conversation ! À bientôt !',es:'¡Gracias por la conversación! ¡Hasta pronto!',ja:'会話をありがとうございました。また話しましょう。',ko:'대화해 주셔서 감사합니다. 다음에 또 만나요!',zh:'谢谢你和我聊天！下次再见！',ar:'شكراً على المحادثة! إلى اللقاء!',id:'Terima kasih sudah berbincang. Sampai jumpa lagi!'};
  if(!language||!endings[language])throw new Error('Final conversation reply contains a question');
  return endings[language];
}
