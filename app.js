import route from './assets/path.json' with {type:'json'};
import specialSpaces from './assets/special-spaces.json' with {type:'json'};
import {WeatherEngine} from './weather.js';
import {GameAudio} from './sound.js';
import {OnlineUI} from './online-ui.js';

const $ = selector => document.querySelector(selector);
const avatar = name => 'assets/avatars/'+name+'.svg';
const names=['masculino-01','masculino-02','masculino-03','masculino-04','masculino-05','feminino-01','feminino-02','feminino-03','feminino-04','feminino-05'];
const defaults=['masculino-01','feminino-01','masculino-02','feminino-02','masculino-03'];
const colors=['#ffe083','#87f1d0','#f5b2df','#b6d6ff','#fbad91'];
const climates=[
  {name:'sun',label:'☀️ Ensolarado'},
  {name:'rain',label:'🌧️ Chuva'},
  {name:'snow',label:'❄️ Neve'}
];
const MAX=route.length-1;
const specials=new Map(specialSpaces.map(item=>[item.position,item.type]));
const eventData={
  trap:{name:'Armadilha',icon:'trap.svg'},
  quicksand:{name:'Areia movediça',icon:'quicksand.svg'},
  portal:{name:'Portal misterioso',icon:'portal.svg'},
  chest:{name:'Baú surpresa',icon:'chest.svg'}
};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const rand=(a,b)=>a+Math.floor(Math.random()*(b-a+1));
const clamp=value=>Math.max(0,Math.min(MAX,value));
const diceFaces=['⚀','⚁','⚂','⚃','⚄','⚅'];
let players=[],turn=0,pending=null,phase='setup',completedTurns=0;
let toastTimer=null;

const QUESTION_SECONDS=30;
const POWER_MAX=3;
const POWER_EFFECTS=['back2','back3','skip'];
let answerDeadline=0;
let questionInterval=null;
function stopQuestionTimer(){
  if(questionInterval!==null){clearInterval(questionInterval);questionInterval=null}
  answerDeadline=0;
}
function updateQuestionTimer(){
  if(phase!=='question'||!pending||!answerDeadline)return;
  // Use real elapsed time even if the browser pauses timers in the background.
  const seconds=Math.max(0,Math.ceil((answerDeadline-Date.now())/1000));
  $('#timer-count').textContent=String(seconds);
  $('#timer-bar').style.width=(seconds/QUESTION_SECONDS*100)+'%';
  $('#question-timer').classList.toggle('urgent',seconds<=10);
  $('#question-timer').setAttribute('aria-label',seconds+' segundos para responder');
  if(seconds===0)void submitAnswer(null);
}
function startQuestionTimer(){
  stopQuestionTimer();
  answerDeadline=Date.now()+QUESTION_SECONDS*1000;
  $('#question-timer').hidden=false;
  phase='question';
  updateQuestionTimer();
  questionInterval=setInterval(updateQuestionTimer,100);
}
const climate=new WeatherEngine($('#weather-canvas'),$('#weather-fallback'));
const sound=new GameAudio();
sound.subscribe(settings=>{
 $('#audio-toggle').textContent=settings.enabled?'🔊':'🔇';
 $('#audio-toggle').setAttribute('aria-label',settings.enabled?'Desativar som':'Ativar som');
 $('#sound-enabled').checked=settings.enabled;
 for(const name of ['master','music','effects','ambience']){
  $('#sound-'+name).value=Math.round(settings[name]*100);
  $('#sound-'+name+'-value').textContent=Math.round(settings[name]*100)+'%';
 }
});

function shuffle(arr){
  for(let i=arr.length-1;i>0;i--){
    const j=rand(0,i);
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
}
function configureFullscreen(){
  // Fullscreen and orientation lock require a real user gesture on mobile.
  const enter=document.documentElement.requestFullscreen;
  if(!document.fullscreenElement&&typeof enter==='function'){
    try{
      Promise.resolve(enter.call(document.documentElement,{navigationUI:'hide'}))
        .then(()=>screen.orientation?.lock?.('landscape'))
        .catch(()=>{});
    }catch(error){console.info('Tela cheia depende do navegador.',error)}
  }else if(document.fullscreenElement){
    try{Promise.resolve(screen.orientation?.lock?.('landscape')).catch(()=>{})}catch(error){}
  }
}
function renderRoster(){
  const count=Number($('#count').value),root=$('#roster');
  root.replaceChildren();
  for(let i=0;i<count;i++){
    const box=document.createElement('div');
    box.className='setup-player';
    const label=document.createElement('label');
    label.textContent='Jogador '+(i+1);
    const input=document.createElement('input');
    input.value=players[i]?.name||'Jogador '+(i+1);
    input.maxLength=18;
    label.append(input);
    box.append(label);
    const picks=document.createElement('div');
    picks.className='avatar-choices';
    names.forEach(name=>{
      const button=document.createElement('button');
      button.type='button';
      button.className=name===(players[i]?.avatar||defaults[i])?'selected':'';
      button.title=name;
      button.setAttribute('aria-label','Selecionar avatar '+name);
      const image=document.createElement('img');
      image.src=avatar(name);
      image.alt='';
      button.append(image);
      button.onclick=()=>{
        picks.querySelectorAll('button').forEach(item=>item.classList.remove('selected'));
        button.classList.add('selected');
      };
      picks.append(button);
    });
    box.append(picks);
    root.append(box);
  }
}
function renderSpecialMarkers(){
  const layer=$('#events');
  layer.replaceChildren();
  specialSpaces.forEach(({position,type})=>{
    const point=route[position],data=eventData[type];
    if(!point||!data)return;
    const marker=document.createElement('span');
    marker.className='special-marker special-'+type;
    marker.dataset.position=String(position);
    marker.style.left=(point.x+1)+'%';
    marker.style.top=(point.y-2.1)+'%';
    marker.title=data.name+' · casa '+(position+1);
    const image=document.createElement('img');
    image.src='assets/events/'+data.icon;
    image.alt='';
    marker.append(image);
    layer.append(marker);
  });
}
function renderTokens(){
  const layer=$('#pieces'),elements=new Map();
  [...layer.children].forEach(node=>elements.set(Number(node.dataset.player),node));
  const groups=new Map();
  players.forEach((player,index)=>{
    const members=groups.get(player.pos)||[];
    members.push(index);
    groups.set(player.pos,members);
  });
  players.forEach((player,index)=>{
    let token=elements.get(index);
    if(!token){
      token=document.createElement('span');
      token.className='token';
      token.dataset.player=String(index);
      const image=document.createElement('img');
      image.src=avatar(player.avatar);
      image.alt=player.name;
      token.append(image);
      layer.append(token);
    }
    const occupants=groups.get(player.pos),slot=occupants.indexOf(index),columns=Math.min(3,occupants.length);
    const col=slot%columns,row=Math.floor(slot/columns),rows=Math.ceil(occupants.length/columns);
    const position=route[player.pos];
    token.style.left=(position.x+(col-(columns-1)/2)*.95)+'%';
    token.style.top=(position.y+(row-(rows-1)/2)*2.4)+'%';
    const tokenImage=token.querySelector('img');
    if(tokenImage&&tokenImage.getAttribute('src')!==avatar(player.avatar)){
      tokenImage.src=avatar(player.avatar);
    }
    if(tokenImage)tokenImage.alt=player.name;
    token.classList.toggle('current',index===turn);
    token.title=player.name+' · casa '+(player.pos+1);
  });
  [...layer.children].forEach(node=>{
    if(Number(node.dataset.player)>=players.length)node.remove();
  });
}
function renderPowerMeter(node,power){
  node.replaceChildren();
  for(let i=0;i<POWER_MAX;i++){
    const segment=document.createElement('span');
    segment.className='power-segment'+(i<power?' charged':'');
    node.append(segment);
  }
}
function powerMeter(power){
  const meter=document.createElement('span');
  meter.className='power-meter';
  meter.setAttribute('aria-hidden','true');
  renderPowerMeter(meter,power);
  return meter;
}
function renderPlayers(){
  const root=$('#players');
  root.replaceChildren();
  players.forEach((player,index)=>{
    const item=document.createElement('div');
    item.className='player'+(index===turn?' active':'')+(player.power>=POWER_MAX?' power-ready':'');
    item.style.borderBottom='2px solid '+colors[index];
    const image=document.createElement('img');
    image.src=avatar(player.avatar);
    image.alt='';
    const name=document.createElement('strong');
    name.textContent=player.name;
    const count=document.createElement('small');
    count.textContent=(player.pos+1)+'/40'+(player.skipTurns?' ⏳':'');
    const info=document.createElement('span');
    info.className='player-info';
    const top=document.createElement('span');
    top.className='player-top';
    top.append(name,count);
    info.append(top,powerMeter(player.power));
    item.title=player.name+' · superpoder '+player.power+'/'+POWER_MAX;
    item.append(image,info);
    root.append(item);
  });
}
function render(){renderTokens();renderPlayers()}
function showToast(message,duration=1600){
  if(toastTimer){clearTimeout(toastTimer);toastTimer=null}
  const toast=$('#map-toast');
  toast.textContent=message;
  toast.hidden=false;
  if(duration>0)toastTimer=setTimeout(()=>{toast.hidden=true;toastTimer=null},duration);
}
function clearToast(){
  if(toastTimer)clearTimeout(toastTimer);
  toastTimer=null;
  $('#map-toast').hidden=true;
  $('#events').querySelectorAll('.activated').forEach(item=>item.classList.remove('activated'));
}
function setWeather(){
  const mode=climates[Math.floor(completedTurns/3)%climates.length];
  $('#weather-indicator').textContent=mode.label;
  climate.setMode(mode.name);
  sound.setWeather(mode.name);
}
function openTurnPopup(){
  if(phase==='finished'||!players.length)return;
  stopQuestionTimer();
  phase='ready';
  pending=null;
  clearToast();
  const player=players[turn];
  render();
  $('#turn-avatar').src=avatar(player.avatar);
  $('#turn-name').textContent=player.name;
  $('#turn-progress').textContent='Casa '+(player.pos+1)+' de '+route.length;
  $('#turn-number').textContent='Vez do jogador '+(turn+1);
  $('#turn-power-count').textContent=player.power+'/'+POWER_MAX;
  renderPowerMeter($('#turn-power-meter'),player.power);
  $('#power-launch').hidden=player.power<POWER_MAX;
  $('#power-launch').disabled=false;
  $('#die').textContent='🎲';
  $('#die').classList.remove('rolling');
  $('#turn-help').textContent='Lance o dado e acerte a multiplicação para avançar!';
  $('#question').textContent='';
  $('#question').hidden=true;
  $('#question-timer').hidden=true;
  $('#question-timer').classList.remove('urgent');
  $('#timer-count').textContent=String(QUESTION_SECONDS);
  $('#timer-bar').style.width='100%';
  $('#answer-feedback').hidden=true;
  $('#answer-feedback').className='answer-feedback';
  $('#options').replaceChildren();
  $('#options').hidden=true;
  $('#roll').hidden=false;
  $('#roll').disabled=false;
  if(!$('#turn-dialog').open)$('#turn-dialog').showModal();
  sound.play('turn');
}
function openSetup(){
  if(phase==='moving'||phase==='rolling'||phase==='feedback'||phase==='power')return;
  stopQuestionTimer();
  sound.stop();
  pending=null;
  phase='setup';
  if($('#turn-dialog').open)$('#turn-dialog').close();
  if($('#victory-dialog').open)$('#victory-dialog').close();
  $('#setup').showModal();
  renderRoster();
}
function startGame(){
  stopQuestionTimer();
  // Closing setup first keeps fullscreen gesture valid.
  $('#setup').close();
  configureFullscreen();
  void sound.unlock().then(()=>sound.play('start'));
  players=[...$('#roster').children].map((box,index)=>({
    name:box.querySelector('input').value.trim()||'Jogador '+(index+1),
    avatar:box.querySelector('.avatar-choices button.selected')?.title||defaults[index],
    pos:0,skipTurns:0,skipReasons:[],power:0
  }));
  turn=0;
  pending=null;
  completedTurns=0;
  phase='ready';
  document.body.classList.add('playing');
  $('#pieces').replaceChildren();
  $('#power-effects').replaceChildren();
  renderSpecialMarkers();
  setWeather();
  render();
  openTurnPopup();
}
async function moveTo(player,destination){
  const target=clamp(destination),direction=Math.sign(target-player.pos);
  while(player.pos!==target){
    player.pos+=direction;
    sound.play('step');
    renderTokens();
    await sleep(285);
  }
  renderPlayers();
}
async function triggerSpecial(){
  const player=players[turn],position=player.pos,type=specials.get(position);
  if(!type)return;
  const marker=$('#events').querySelector('[data-position="'+position+'"]');
  marker?.classList.add('activated');
  let destination=position,message='';
  if(type==='trap'){
    sound.play('trap');
    destination=clamp(position-3);
    message='🪤 '+player.name+' caiu na armadilha! Volta 3 casas.';
  }else if(type==='quicksand'){
    sound.play('quicksand');
    player.skipTurns+=1;
    player.skipReasons.push('quicksand');
    message='🕳️ '+player.name+' ficou na areia movediça e perderá a próxima vez!';
  }else if(type==='portal'){
    sound.play('portal');
    const forward=Math.random()<.5;
    destination=clamp(position+(forward?5:-5));
    message='🌀 Portal! '+player.name+(forward?' avança 5 casas.':' volta 5 casas.');
  }else if(type==='chest'){
    const lucky=Math.random()<.65;
    sound.play(lucky?'chest-good':'chest-bad');
    destination=clamp(position+(lucky?3:-2));
    message='🎁 '+player.name+(lucky?' ganhou 3 casas no baú!':' perdeu 2 casas no baú!');
  }
  showToast(message,0);
  if(destination!==position)await moveTo(player,destination);
  render();
  await sleep(1450);
  // A landing caused by a special effect never triggers a second effect.
  marker?.classList.remove('activated');
}
function celebrate(){
  stopQuestionTimer();
  phase='finished';
  sound.play('victory');
  pending=null;
  clearToast();
  render();
  const player=players[turn];
  $('#winner-avatar').src=avatar(player.avatar);
  $('#winner-avatar').alt=player.name;
  $('#winner-message').textContent=player.name+' chegou à última casa e venceu a corrida!';
  $('#victory-dialog').showModal();
}
async function goToNextPlayer(){
  // Skip penalties are consumed automatically; no popup is opened for that lost turn.
  for(let checked=0;checked<players.length;checked++){
    turn=(turn+1)%players.length;
    const current=players[turn];
    render();
    if(!current.skipTurns)break;
    current.skipTurns-=1;
    const skipReason=current.skipReasons.shift();
    sound.play('skip');
    showToast((skipReason==='power'?'⚡ ':'🕳️ ')+current.name+(skipReason==='power'?' perdeu a vez por causa do superpoder!':' perdeu a vez por causa da areia movediça!'),0);
    renderPlayers();
    await sleep(1250);
    completedTurns++;
    setWeather();
  }
  await sleep(850);
  openTurnPopup();
}
async function submitAnswer(value){
  if(phase!=='question'||!pending)return;
  // A tap received after the deadline is treated as time expired.
  if(answerDeadline&&Date.now()>=answerDeadline)value=null;
  const {die,answer}=pending;
  stopQuestionTimer();
  pending=null;
  phase='feedback'; // Prevent duplicate responses and timeout races.
  const timedOut=value===null;
  const correct=value===answer;
  const player=players[turn];
  const feedback=$('#answer-feedback');
  $('#options').querySelectorAll('button').forEach(button=>{
    button.disabled=true;
    if(Number(button.textContent)===answer)button.classList.add('is-correct');
    else if(!timedOut&&Number(button.textContent)===value)button.classList.add('is-wrong');
  });
  feedback.className='answer-feedback '+(correct?'feedback-correct':'feedback-wrong');
  feedback.textContent=correct
    ?'✅ Resposta correta! Você avança '+die+' casas.'
    :timedOut
      ?'⏰ Tempo esgotado! A resposta correta é '+answer+'. Você perdeu a vez.'
      :'❌ Resposta incorreta. A resposta correta é '+answer+'. Você perdeu a vez.';
  feedback.hidden=false;
  $('#turn-help').textContent=timedOut?'O tempo acabou!':correct?'Muito bem!':'Confira a resposta destacada em verde.';
  if(timedOut){
    $('#timer-count').textContent='0';
    $('#timer-bar').style.width='0%';
    $('#question-timer').classList.add('urgent');
  }
  if(correct){
    player.power=Math.min(POWER_MAX,player.power+1);
    renderPlayers();
    feedback.textContent+=player.power===POWER_MAX?' ⚡ Superpoder pronto!':' ⚡ Energia '+player.power+'/'+POWER_MAX+'.';
  }
  sound.play(correct?'correct':'wrong');
  await sleep(correct?700:2600);
  if(phase!=='feedback')return;
  phase='moving';
  $('#turn-dialog').close();
  if(correct){
    showToast('✅ '+player.name+' acertou! Avance '+die+' casas.',0);
    await sleep(300);
    await moveTo(player,player.pos+die);
    if(player.pos===MAX){celebrate();return}
    await triggerSpecial();
    if(player.pos===MAX){celebrate();return}
  }else{
    showToast((timedOut?'⏰ Tempo esgotado! ':'❌ Resposta incorreta. ')+'Resposta correta: '+answer+'. '+player.name+' perdeu a vez.',0);
    await sleep(600);
  }
  completedTurns++;
  setWeather();
  await sleep(650);
  await goToNextPlayer();
}
async function launchSuperpower(){
  if(phase!=='ready'||players.length<2)return;
  const attacker=players[turn];
  if(attacker.power<POWER_MAX)return;
  // Exclude the caster: the target is one of the other players.
  const opponents=players.filter((_,index)=>index!==turn);
  const target=opponents[rand(0,opponents.length-1)];
  const effect=POWER_EFFECTS[rand(0,POWER_EFFECTS.length-1)];
  phase='power'; // Prevent duplicate shots, dice rolls or setup interruptions.
  attacker.power=0;
  $('#power-launch').disabled=true;
  $('#turn-dialog').close();
  renderPlayers();
  showToast('⚡ '+attacker.name+' lançou um superpoder!',0);
  sound.play('portal');
  const origin=route[attacker.pos];
  const hit=route[target.pos];
  const bounds=$('#board').getBoundingClientRect();
  const projectile=document.createElement('span');
  projectile.className='power-projectile';
  projectile.textContent='⚡';
  projectile.style.setProperty('--origin-x',origin.x+'%');
  projectile.style.setProperty('--origin-y',origin.y+'%');
  projectile.style.setProperty('--travel-x',((hit.x-origin.x)*bounds.width/100)+'px');
  projectile.style.setProperty('--travel-y',((hit.y-origin.y)*bounds.height/100)+'px');
  $('#power-effects').append(projectile);
  await sleep(850);
  projectile.remove();
  const impact=document.createElement('span');
  impact.className='power-impact';
  impact.style.setProperty('--hit-x',hit.x+'%');
  impact.style.setProperty('--hit-y',hit.y+'%');
  $('#power-effects').append(impact);
  sound.play('trap');
  await sleep(530);
  impact.remove();
  if(effect==='skip'){
    target.skipTurns+=1;
    target.skipReasons.push('power');
    showToast('⚡ '+target.name+' foi atingido e perderá a próxima rodada!',0);
    render();
  }else{
    const amount=effect==='back2'?2:3;
    showToast('⚡ '+target.name+' foi atingido! Volta '+amount+' casas.',0);
    await moveTo(target,target.pos-amount);
    render();
  }
  // Superpower landings do not activate special spaces and do not spend a regular turn.
  await sleep(1550);
  openTurnPopup();
}
async function rollDice(){
  if(phase!=='ready')return;
  phase='rolling';
  void sound.unlock();
  sound.play('dice');
  const die=rand(1,6),a=rand(2,9),b=rand(2,9),answer=a*b;
  pending={die,answer};
  $('#roll').disabled=true;
  $('#die').textContent='🎲';
  $('#die').classList.remove('rolling');
  void $('#die').offsetWidth;
  $('#die').classList.add('rolling');
  await sleep(500);
  if(phase!=='rolling')return;
  $('#die').textContent=diceFaces[die-1];
  $('#die').classList.remove('rolling');
  $('#turn-help').textContent='🎲 '+die+' casas se acertar!';
  $('#question').textContent=a+' × '+b+' = ?';
  $('#question').hidden=false;
  $('#roll').hidden=true;
  $('#options').hidden=false;
  const values=new Set([answer]);
  while(values.size<4){
    const wrong=answer+rand(-12,12);
    if(wrong>0)values.add(wrong);
  }
  $('#options').replaceChildren();
  shuffle([...values]).forEach(value=>{
    const button=document.createElement('button');
    button.type='button';
    button.textContent=value;
    button.onclick=()=>submitAnswer(value);
    $('#options').append(button);
  });
  startQuestionTimer();
}
$('#count').addEventListener('change',renderRoster);
$('#start').addEventListener('click',startGame);
$('#roll').addEventListener('click',rollDice);
$('#power-launch').addEventListener('click',launchSuperpower);
$('#reconfigure').addEventListener('click',openSetup);
$('#restart').addEventListener('click',()=>{if(onlineUI.active)void onlineUI.leave();else openSetup()});
$('#play-again').addEventListener('click',openSetup);
$('#audio-toggle').addEventListener('click',()=>{const enabled=!sound.settings.enabled;sound.set('enabled',enabled);if(enabled)void sound.unlock()});
$('#audio-settings').addEventListener('click',()=>$('#sound-dialog').showModal());
$('#sound-close').addEventListener('click',()=>$('#sound-dialog').close());
$('#sound-enabled').addEventListener('change',event=>{sound.set('enabled',event.target.checked);if(event.target.checked)void sound.unlock()});
for(const name of ['master','music','effects','ambience'])$('#sound-'+name).addEventListener('input',event=>sound.set(name,Number(event.target.value)/100));
$('#sound-test').addEventListener('click',()=>{void sound.unlock().then(()=>{sound.play('correct');window.testHowlerSound?.()})});
for(const id of ['setup','turn-dialog','victory-dialog']){
  // Prevent Escape/back from silently skipping the active turn or victory result.
  $('#'+id).addEventListener('cancel',event=>event.preventDefault());
}
renderSpecialMarkers();
$('#mode-dialog').showModal();
renderRoster();
let onlineAnimationVersion=0;
const onlineUI=new OnlineUI({
  onLocal:()=>{
    phase='setup';
    $('#setup').showModal();
    renderRoster();
  },
  onExit:()=>{
    onlineAnimationVersion++;
    sound.stop();
    stopQuestionTimer();
    players=[];turn=0;pending=null;completedTurns=0;phase='setup';
    clearToast();
    $('#pieces').replaceChildren();
    renderPlayers();
    document.body.classList.remove('playing');
  },
  onGesture:()=>{configureFullscreen();void sound.unlock()},
  onSound:name=>sound.play(name),
  onBoard:state=>{
    onlineAnimationVersion++;
    const version=onlineAnimationVersion;
    const order=Array.isArray(state.order)?state.order:Object.values(state.order||{});
    players=order.map(uid=>({...state.players[uid],uid}));
    turn=state.turn;
    completedTurns=state.rounds||0;
    phase='online';
    const event=state.event;
    const impactedId=event?.kind==='power'?event.target:
      event?.kind==='answer'||event?.kind==='victory'?event.actor:null;
    const index=players.findIndex(p=>p.uid===impactedId);
    const destination=index>=0?players[index].pos:null;
    const movement=index>=0&&typeof event.from==='number'&&typeof event.to==='number'&&event.from!==event.to;
    if(movement)players[index].pos=event.from;
    render();
    setWeather();
    if(movement){
      const participant=players[index];
      const direction=Math.sign(destination-participant.pos);
      void (async()=>{
        while(participant.pos!==destination&&version===onlineAnimationVersion){
          participant.pos+=direction;
          renderTokens();
          await sleep(215);
        }
        if(version===onlineAnimationVersion){participant.pos=destination;render()}
      })();
    }
  }
});
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
