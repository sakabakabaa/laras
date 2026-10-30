/** End a speech turn after a pause, ignoring short microphone clicks. */
export class ConversationVad {
  private voicedMs = 0;
  private lastVoice = 0;
  private previous = 0;
  sample(rms: number, now: number): boolean {
    const elapsed = this.previous ? Math.min(now - this.previous, 100) : 0;
    this.previous = now;
    if (this.voicedMs < 250 && now - this.lastVoice > 500) this.voicedMs = 0;
    if (rms > 0.022) { this.voicedMs += elapsed; this.lastVoice = now; }
    return this.voicedMs >= 250 && now - this.lastVoice >= 1200;
  }
  get hasSpeech() { return this.voicedMs >= 250; }
}
