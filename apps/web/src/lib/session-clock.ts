/** Session countdown, including sessions longer than one hour. */
export function sessionClock(totalSeconds:number):string{
 const seconds=Number.isFinite(totalSeconds)?Math.max(0,Math.floor(totalSeconds)):0;
 return [Math.floor(seconds/3600),Math.floor(seconds/60)%60,seconds%60].map(value=>String(value).padStart(2,'0')).join(':');
}
