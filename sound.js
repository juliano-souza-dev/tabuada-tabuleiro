const KEY='tabuada-audio-v1';
const defaults={enabled:true,master:.75,music:.35,effects:.85,ambience:.45};
const notes={C3:130.81,C4:261.63,D4:293.66,E4:329.63,F4:349.23,G4:392,A4:440,C5:523.25,D5:587.33,E5:659.25,G5:783.99,C6:1046.5};
const rand=(a,b)=>a+Math.random()*(b-a);
export class GameAudio{
 constructor(){
  let saved={};try{saved=JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){}
  this.settings={...defaults,...saved};this.ctx=null;this.buses={};this.active=false;this.paused=false;this.weather='sun';this.weatherNodes=null;this.musicTimer=null;this.musicIndex=0;this.listeners=[];
  document.addEventListener('visibilitychange',()=>{this.paused=document.hidden;this.levels();if(this.paused)this.stop();else if(this.active){this.setWeather(this.weather,true);this.startMusic()}});
 }
 subscribe(fn){this.listeners.push(fn);fn(this.settings)}
 set(key,value){
  if(!(key in defaults))return;
  this.settings[key]=key==='enabled'?Boolean(value):Math.max(0,Math.min(1,Number(value)||0));
  try{localStorage.setItem(KEY,JSON.stringify(this.settings))}catch(e){}
  this.listeners.forEach(fn=>fn(this.settings));this.levels();
  if(!this.settings.enabled)this.stop();
  else if(this.active){this.setWeather(this.weather,true);this.startMusic()}
 }
 setup(){
  if(this.ctx)return true;
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return false;
  try{
   this.ctx=new Audio({latencyHint:'interactive'});
   this.master=this.ctx.createGain();
   const limiter=this.ctx.createDynamicsCompressor();limiter.threshold.value=-18;limiter.ratio.value=3;limiter.attack.value=.005;limiter.release.value=.18;
   this.master.connect(limiter);limiter.connect(this.ctx.destination);
   for(const name of ['music','effects','ambience']){const g=this.ctx.createGain();g.connect(this.master);this.buses[name]=g}
   this.levels();return true;
  }catch(e){console.warn('Web Audio indisponível',e);return false}
 }
 async unlock(){
  if(!this.settings.enabled||!this.setup())return;
  try{if(this.ctx.state==='suspended')await this.ctx.resume();this.active=true;if(!this.paused){this.setWeather(this.weather,true);this.startMusic()}}catch(e){console.warn('Áudio bloqueado pelo navegador',e)}
 }
 levels(){
  if(!this.ctx)return;const t=this.ctx.currentTime;
  this.master.gain.setTargetAtTime(this.settings.enabled&&!this.paused?this.settings.master:0,t,.07);
  for(const name of ['music','effects','ambience'])this.buses[name].gain.setTargetAtTime(this.settings[name],t,.07);
 }
 tone(freq,delay=0,duration=.2,volume=.12,wave='sine',end=null,bus='effects'){
  if(!this.ctx||!this.settings.enabled||this.paused)return;
  const t=this.ctx.currentTime+delay,o=this.ctx.createOscillator(),g=this.ctx.createGain();
  o.type=wave;o.frequency.setValueAtTime(Math.max(35,freq),t);
  if(end)o.frequency.exponentialRampToValueAtTime(Math.max(35,end),t+duration);
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  o.connect(g);g.connect(this.buses[bus]);o.start(t);o.stop(t+duration+.025);
  o.onended=()=>{o.disconnect();g.disconnect()};
 }
 note(name,delay=0,duration=.2,volume=.12,wave='triangle',bus='effects'){this.tone(notes[name],delay,duration,volume,wave,null,bus)}
 noise(delay=0,duration=.16,volume=.12,frequency=1000){
  if(!this.ctx||!this.settings.enabled||this.paused)return;
  const ctx=this.ctx,t=ctx.currentTime+delay;
  if(!this.noiseBuffer){
   const b=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),data=b.getChannelData(0);
   for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
   this.noiseBuffer=b;
  }
  const src=ctx.createBufferSource(),f=ctx.createBiquadFilter(),g=ctx.createGain();
  src.buffer=this.noiseBuffer;f.type='lowpass';f.frequency.value=frequency;
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(volume,t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+duration);
  src.connect(f);f.connect(g);g.connect(this.buses.effects);src.start(t);src.stop(t+duration+.02);
  src.onended=()=>{src.disconnect();f.disconnect();g.disconnect()};
 }
 play(event){
  if(!this.ctx||!this.settings.enabled||this.paused)return;
  switch(event){
   case 'start': ['C4','E4','G4','C5'].forEach((n,i)=>this.note(n,i*.10,.3,.12));break;
   case 'turn':this.note('G4',0,.15,.09);this.note('C5',.13,.27,.12);break;
   case 'dice':for(let i=0;i<7;i++){this.noise(i*.065,.055,.09,rand(600,2100));this.tone(rand(120,250),i*.065,.06,.055,'triangle')}this.note('G4',.47,.16,.12);break;
   case 'correct':['C5','E5','G5','C6'].forEach((n,i)=>this.note(n,i*.09,.28,.13));break;
   case 'wrong':this.tone(290,0,.25,.13,'triangle',205);this.tone(185,.19,.3,.1,'sine',135);break;
   case 'step':this.noise(0,.085,.07,530);this.tone(rand(85,115),0,.09,.04,'sine',65);break;
   case 'trap':this.noise(0,.35,.22,1300);this.tone(400,0,.5,.17,'sawtooth',90);break;
   case 'quicksand':this.tone(200,0,.6,.13,'triangle',65);this.noise(.05,.5,.12,350);break;
   case 'portal':for(let i=0;i<6;i++)this.tone(180+i*90,i*.08,.48,.09,'sine',680+i*100);break;
   case 'chest-good':['E5','G5','C6'].forEach((n,i)=>this.note(n,.08+i*.12,.38,.14));break;
   case 'chest-bad':this.noise(0,.2,.14,950);this.tone(320,.1,.42,.13,'triangle',130);break;
   case 'skip':this.tone(275,0,.24,.1,'sine',180);break;
   case 'weather':this.note('G4',0,.22,.06);this.note('D5',.13,.4,.08);break;
   case 'victory':
    this.stopMusic();['C5','E5','G5','C6','G5','C6'].forEach((n,i)=>this.note(n,i*.19,i===5?1.2:.34,.18));
    for(let i=0;i<9;i++)this.tone(rand(850,1800),.4+i*.14,.26,.025);
    break;
  }
 }
 setWeather(mode,force=false){
  if(!['sun','rain','snow'].includes(mode))return;
  if(mode===this.weather&&!force)return;
  this.weather=mode;
  if(!this.active||!this.ctx||this.paused||!this.settings.enabled)return;
  this.stopWeather();
  if(!force)this.play('weather');
  const ctx=this.ctx,src=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();
  if(!this.noiseBuffer){
   const b=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate),d=b.getChannelData(0);
   for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
   this.noiseBuffer=b;
  }
  src.buffer=this.noiseBuffer;src.loop=true;filter.type=mode==='rain'?'lowpass':'bandpass';
  filter.frequency.value=mode==='rain'?1300:mode==='snow'?400:2100;filter.Q.value=.55;
  gain.gain.setValueAtTime(0,ctx.currentTime);gain.gain.setTargetAtTime(mode==='rain'?.15:mode==='snow'?.018:.008,ctx.currentTime,.7);
  src.connect(filter);filter.connect(gain);gain.connect(this.buses.ambience);src.start();
  this.weatherNodes={src,filter,gain};
 }
 stopWeather(){
  if(!this.weatherNodes||!this.ctx)return;
  const {src,filter,gain}=this.weatherNodes,t=this.ctx.currentTime;
  gain.gain.cancelScheduledValues(t);gain.gain.setTargetAtTime(0,t,.12);
  try{src.stop(t+.55)}catch(e){}
  src.onended=()=>{src.disconnect();filter.disconnect();gain.disconnect()};
  this.weatherNodes=null;
 }
 startMusic(){
  if(!this.ctx||!this.active||this.paused||!this.settings.enabled||this.musicTimer!==null)return;
  const melody=['C5',null,'E5','G5',null,'E5','D4',null,'A4',null,'C5','E5',null,'D4','G4',null,'F4',null,'A4','C5',null,'A4','G4',null,'E4',null,'G4','C5',null,'G4','C5',null];
  const bass=['C3','A4','F4','G4'];
  const tick=()=>{
   if(!this.active||this.paused||!this.settings.enabled){this.musicTimer=null;return}
   const i=this.musicIndex%melody.length,n=melody[i];
   if(n)this.note(n,0,.28,.048,'triangle','music');
   if(i%8===0)this.note(bass[Math.floor(i/8)],0,1,.032,'sine','music');
   this.musicIndex++;this.musicTimer=setTimeout(tick,400);
  };
  tick();
 }
 stopMusic(){if(this.musicTimer!==null){clearTimeout(this.musicTimer);this.musicTimer=null}}
 stop(){this.stopWeather();this.stopMusic()}
}
