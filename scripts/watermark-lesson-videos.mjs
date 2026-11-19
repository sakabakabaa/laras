import {mkdirSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

// Always read the originals. Never use an already watermarked file as input.
const [input,output,logo,lecturer='Novia Anjani Dewi']=process.argv.slice(2);
if(!input||!output||!logo)throw Error('Usage: node watermark-lesson-videos.mjs INPUT OUTPUT LOGO [LECTURER]');
if(input===output)throw Error('Input and output directories must differ');
mkdirSync(output,{recursive:true});
const run=(command,args)=>{const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:10*1024*1024});if(r.status!==0)throw Error(`${command} failed: ${r.stderr||r.error}`);return r.stdout.trim();};
const probe=file=>JSON.parse(run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file]));
const audioHash=file=>run('ffmpeg',['-v','error','-i',file,'-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','-']);
const nameFile=join(output,'.lecturer.txt');writeFileSync(nameFile,lecturer);
const labelFile=join(output,'.credit.txt');writeFileSync(labelFile,'MATERI & PENGAJARAN');
const font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const filter=`[1:v]scale=60:-1,format=rgba,colorchannelmixer=aa=0.55[logo];[0:v]drawtext=fontfile=${font}:textfile=${labelFile}:x=w-tw-132:y=52:fontsize=15:fontcolor=0x555555@0.60,drawtext=fontfile=${font}:textfile=${nameFile}:x=w-tw-132:y=79:fontsize=24:fontcolor=0x252525@0.72[frame];[frame][logo]overlay=1812:48[out]`;
const results=[];
for(const filename of readdirSync(input).filter(f=>f.endsWith('.mp4')).sort()){
 const source=join(input,filename),target=join(output,filename),before=probe(source),v=before.streams.find(s=>s.codec_type==='video');
 if(v.width!==1920||v.height!==1080)throw Error(`Unexpected resolution: ${filename}`);
 console.log(`Watermarking ${filename}`);
 run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',source,'-i',logo,'-filter_complex_threads','1','-filter_complex',filter,'-map','[out]','-map','0:a?','-c:v','libx264','-preset','veryfast','-crf','18','-threads','2','-pix_fmt','yuv420p','-c:a','copy','-movflags','+faststart',target]);
 const after=probe(target),outVideo=after.streams.find(s=>s.codec_type==='video');
 if(outVideo.width!==v.width||outVideo.height!==v.height||outVideo.nb_frames!==v.nb_frames||Math.abs(Number(after.format.duration)-Number(before.format.duration))>0.05)throw Error(`Video shape or duration changed: ${filename}`);
 const unchangedAudio=audioHash(source)===audioHash(target);if(!unchangedAudio)throw Error(`Audio changed: ${filename}`);
 run('ffmpeg',['-v','error','-threads','2','-i',target,'-f','null','-']);
 const poster=filename.replace(/\.mp4$/,'.jpg');
 run('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',join(input,poster),'-i',logo,'-filter_complex_threads','1','-filter_complex',filter,'-map','[out]','-frames:v','1','-q:v','2',join(output,poster)]);
 results.push({file:filename,width:outVideo.width,height:outVideo.height,frames:Number(outVideo.nb_frames),duration:Number(after.format.duration),unchangedAudio,decoded:true});
 console.log(`Verified ${filename}: ${outVideo.nb_frames} frames; audio unchanged`);
}
rmSync(nameFile);rmSync(labelFile);writeFileSync(join(output,'watermark-manifest.json'),JSON.stringify({lecturer,credit:'MATERI & PENGAJARAN',logoOpacity:0.55,version:'lecturer-upi-credit-v1',videos:results},null,2));
console.log(`Completed ${results.length} watermarked videos and posters.`);
