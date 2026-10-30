/** Server-only speech generation. The selected language is supplied by course settings. */
export async function synthesizeElevenLabsSpeech({text,language,speed=.9}:{text:string;language?:string;speed?:number}):Promise<Uint8Array> {
  const apiKey=process.env.ELEVENLABS_API_KEY;
  if(!apiKey)throw new Error('ElevenLabs is not configured');
  const voiceId=process.env.ELEVENLABS_VOICE_ID || 'JBFqnCBsd6RMkjVDRZzb'; // George, male preset.
  const model=process.env.ELEVENLABS_TTS_MODEL || 'eleven_flash_v2_5';
  const response=await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,{
    method:'POST',headers:{'xi-api-key':apiKey,'Content-Type':'application/json',Accept:'audio/mpeg'},
    body:JSON.stringify({text,model_id:model,...(language?{language_code:language}:{}),voice_settings:{stability:.5,similarity_boost:.75,speed:Math.max(.8,Math.min(1.2,speed))}}),
    signal:AbortSignal.timeout(90000),
  });
  if(!response.ok)throw new Error(`ElevenLabs speech failed (HTTP ${response.status})`);
  const contentType=response.headers.get('content-type') || '';
  if(!contentType.startsWith('audio/'))throw new Error('ElevenLabs returned an invalid audio response');
  const audio=new Uint8Array(await response.arrayBuffer());
  if(audio.byteLength<64)throw new Error('ElevenLabs returned empty audio');
  return audio;
}
