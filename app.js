import route from './assets/path.json' with {type:'json'};
import specialSpaces from './assets/special-spaces.json' with {type:'json'};
import {WeatherEngine} from './weather.js';
import {GameAudio} from './sound.js';

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
    token.classList.toggle('current',index===turn);
    token.title=player.name+' · casa '+(player.pos+1);
  });
  [...layer.children].forEach(node=>{
    if(Number(node.dataset.player)>=players.length)node.remove();
  });
}
function renderPlayers(){
  const root=$('#players');
  root.replaceChildren();
  players.forEach((player,index)=>{
    const item=document.createElement('div');
    item.className='player'+(index===turn?' active':'');
    item.style.borderBottom='2px solid '+colors[index];
    const image=document.createElement('img');
    image.src=avatar(player.avatar);
    image.alt='';
    const name=document.createElement('strong');
    name.textContent=player.name;
    const count=document.createElement('small');
    count.textContent=(player.pos+1)+'/40'+(player.skipTurns?' 🕳️':'');
    item.append(image,name,count);
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
  phase='ready';
  pending=null;
  clearToast();
  const player=players[turn];
  render();
  $('#turn-avatar').src=avatar(player.avatar);
  $('#turn-name').textContent=player.name;
  $('#turn-progress').textContent='Casa '+(player.pos+1)+' de '+route.length;
  $('#turn-number').textContent='Vez do jogador '+(turn+1);
  $('#die').textContent='🎲';
  $('#die').classList.remove('rolling');
  $('#turn-help').textContent='Lance o dado e acerte a multiplicação para avançar!';
  $('#question').textContent='';
  $('#question').hidden=true;
  $('#options').replaceChildren();
  $('#options').hidden=true;
  $('#roll').hidden=false;
  $('#roll').disabled=false;
  if(!$('#turn-dialog').open)$('#turn-dialog').showModal();
  sound.play('turn');
}
function openSetup(){
  if(phase==='moving'||phase==='rolling')return;
  sound.stop();
  pending=null;
  phase='setup';
  if($('#turn-dialog').open)$('#turn-dialog').close();
  if($('#victory-dialog').open)$('#victory-dialog').close();
  $('#setup').showModal();
  renderRoster();
}
function startGame(){
  // Closing setup first keeps fullscreen gesture valid.
  $('#setup').close();
  configureFullscreen();
  void sound.unlock().then(()=>sound.play('start'));
  players=[...$('#roster').children].map((box,index)=>({
    name:box.querySelector('input').value.trim()||'Jogador '+(index+1),
    avatar:box.querySelector('.avatar-choices button.selected')?.title||defaults[index],
    pos:0,skipTurns:0
  }));
  turn=0;
  pending=null;
  completedTurns=0;
  phase='ready';
  document.body.classList.add('playing');
  $('#pieces').replaceChildren();
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
    sound.play('skip');
    showToast('🕳️ '+current.name+' perdeu a vez por causa da areia movediça!',0);
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
  const {die,answer}=pending;
  pending=null;
  phase='moving';
  $('#turn-dialog').close();
  const player=players[turn];
  if(value===answer){
    sound.play('correct');
    showToast('✅ '+player.name+' acertou! Avance '+die+' casas.',0);
    await sleep(360);
    await moveTo(player,player.pos+die);
    if(player.pos===MAX){celebrate();return}
    await triggerSpecial();
    if(player.pos===MAX){celebrate();return}
  }else{
    sound.play('wrong');
    showToast('❌ Resposta correta: '+answer+'. '+player.name+' permanece na casa.',0);
    await sleep(1200);
  }
  completedTurns++;
  setWeather();
  await sleep(800);
  await goToNextPlayer();
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
  phase='question';
}
$('#count').addEventListener('change',renderRoster);
$('#start').addEventListener('click',startGame);
$('#roll').addEventListener('click',rollDice);
$('#reconfigure').addEventListener('click',openSetup);
$('#restart').addEventListener('click',openSetup);
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
$('#setup').showModal();
renderRoster();
if('serviceWorker' in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
