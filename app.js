import route from './assets/path.json' with {type:'json'};
import specialSpaces from './assets/special-spaces.json' with {type:'json'};

const $ = selector => document.querySelector(selector);
const names = ['masculino-01','masculino-02','masculino-03','masculino-04','masculino-05','feminino-01','feminino-02','feminino-03','feminino-04','feminino-05'];
const avatar = name => 'assets/avatars/' + name + '.svg';
const defaults = ['masculino-01','feminino-01','masculino-02','feminino-02','masculino-03'];
const colors = ['#ffe083','#87f1d0','#f5b2df','#b6d6ff','#fbad91'];
const MAX = route.length - 1;
const specialByPosition = new Map(specialSpaces.map(item => [item.position,item.type]));
const eventData = {
  trap: {name:'Armadilha',icon:'trap.svg',color:'danger'},
  quicksand: {name:'Areia movediça',icon:'quicksand.svg',color:'danger'},
  portal: {name:'Portal misterioso',icon:'portal.svg',color:'magic'},
  chest: {name:'Baú surpresa',icon:'chest.svg',color:'reward'}
};
let players=[], turn=0, pending=null, busy=false, winner=false;

const sleep = ms => new Promise(resolve => setTimeout(resolve,ms));
const rand = (a,b) => a + Math.floor(Math.random() * (b-a+1));
const clamp = pos => Math.max(0,Math.min(MAX,pos));
function shuffle(arr) {
  for(let i=arr.length-1;i>0;i--){
    const j=rand(0,i);
    [arr[i],arr[j]]=[arr[j],arr[i]];
  }
  return arr;
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
      const btn=document.createElement('button');
      btn.type='button';
      btn.title=name;
      btn.className=name===(players[i]?.avatar||defaults[i])?'selected':'';
      const img=document.createElement('img');
      img.src=avatar(name);
      img.alt=name;
      btn.append(img);
      btn.onclick=()=>{
        picks.querySelectorAll('button').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');
      };
      picks.append(btn);
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
    const icon=document.createElement('img');
    icon.src='assets/events/'+data.icon;
    icon.alt='';
    marker.append(icon);
    layer.append(marker);
  });
}
function renderTokens(){
  const layer=$('#pieces'),oldTokens=new Map();
  [...layer.children].forEach(el=>oldTokens.set(Number(el.dataset.player),el));
  const groups=new Map();
  players.forEach((player,i)=>{
    const occupants=groups.get(player.pos)||[];
    occupants.push(i);
    groups.set(player.pos,occupants);
  });
  players.forEach((player,i)=>{
    let token=oldTokens.get(i);
    if(!token){
      token=document.createElement('span');
      token.className='token';
      token.dataset.player=String(i);
      const image=document.createElement('img');
      image.src=avatar(player.avatar);
      image.alt=player.name;
      token.append(image);
      layer.append(token);
    }
    const position=route[player.pos],occupants=groups.get(player.pos),slot=occupants.indexOf(i);
    const columns=Math.min(3,occupants.length);
    const rows=Math.ceil(occupants.length/columns);
    const col=slot%columns,row=Math.floor(slot/columns);
    token.style.left=(position.x+(col-(columns-1)/2)*0.95)+'%';
    token.style.top=(position.y+(row-(rows-1)/2)*2.4)+'%';
    token.classList.toggle('current',i===turn);
    token.title=player.name+' · casa '+(player.pos+1);
  });
  [...layer.children].forEach(el=>{
    if(Number(el.dataset.player)>=players.length)el.remove();
  });
}
function renderPlayers(){
  const root=$('#players');
  root.replaceChildren();
  players.forEach((player,i)=>{
    const el=document.createElement('div');
    el.className='player'+(i===turn?' active':'');
    el.style.borderBottom='2px solid '+colors[i];
    const img=document.createElement('img');
    img.src=avatar(player.avatar);
    img.alt='';
    const name=document.createElement('strong');
    name.textContent=player.name;
    const label=document.createElement('small');
    label.textContent=(player.pos+1)+'/40'+(player.skipTurns?' 🕳️':'');
    el.append(img,name,label);
    root.append(el);
  });
  $('#turn').textContent=winner?'🏆 Fim de jogo':'Vez de '+(players[turn]?.name||'');
}
function render(){
  renderTokens();
  renderPlayers();
}
function clearEvent(){
  const element=$('#event-banner');
  element.hidden=true;
  element.replaceChildren();
  element.className='event-banner';
  $('#events').querySelectorAll('.activated').forEach(el=>el.classList.remove('activated'));
}
function showEvent(type,message,position){
  const data=eventData[type],el=$('#event-banner');
  el.replaceChildren();
  const image=document.createElement('img');
  image.src='assets/events/'+data.icon;
  image.alt='';
  const text=document.createElement('div');
  const heading=document.createElement('strong');
  heading.textContent=data.name;
  const explanation=document.createElement('p');
  explanation.textContent=message;
  text.append(heading,explanation);
  el.append(image,text);
  el.className='event-banner visible '+data.color;
  el.hidden=false;
  const marker=$('#events').querySelector('[data-position="'+position+'"]');
  marker?.classList.add('activated');
  $('#status').textContent=message;
}
function newGame(){
  players=[...$('#roster').children].map((box,i)=>({
    name:box.querySelector('input').value.trim()||'Jogador '+(i+1),
    avatar:box.querySelector('.selected')?.querySelector('img').alt||defaults[i],
    pos:0,skipTurns:0
  }));
  turn=0;pending=null;busy=false;winner=false;
  $('#setup').close();
  $('#pieces').replaceChildren();
  clearEvent();
  $('#roll').disabled=false;
  $('#options').replaceChildren();
  $('#question').textContent='🎯';
  $('#status').textContent='Lance o dado para começar!';
  renderSpecialMarkers();
  render();
}
async function animateTo(player,destination){
  const target=clamp(destination),direction=Math.sign(target-player.pos);
  while(player.pos!==target){
    player.pos+=direction;
    renderTokens();
    await sleep(255);
  }
  renderPlayers();
}
async function applySpecial(){
  const player=players[turn],position=player.pos;
  const type=specialByPosition.get(position);
  if(!type)return;
  let message='';
  if(type==='trap'){
    const target=clamp(position-3);
    message=player.name+' caiu na armadilha e voltou '+(position-target)+' casas!';
    showEvent(type,message,position);
    await animateTo(player,target);
  }else if(type==='quicksand'){
    player.skipTurns+=1;
    message=player.name+' ficou preso na areia movediça e perderá a próxima vez!';
    showEvent(type,message,position);
    render();
  }else if(type==='portal'){
    const advance=Math.random()<.5;
    const target=clamp(position+(advance?5:-5));
    message=player.name+(advance?' avançou 5 casas no portal!':' voltou 5 casas no portal!');
    showEvent(type,message,position);
    await animateTo(player,target);
  }else if(type==='chest'){
    const reward=Math.random()<.65;
    const target=clamp(position+(reward?3:-2));
    message=player.name+(reward?' ganhou 3 casas no baú!':' encontrou uma surpresa e voltou 2 casas!');
    showEvent(type,message,position);
    await animateTo(player,target);
  }
  await sleep(1250);
  // Deslocamentos causados pela trap não ativam outras casas especiais.
}
function announceWinner(){
  winner=true;
  $('#status').textContent='🏆 '+players[turn].name+' venceu a partida!';
  $('#question').textContent='🎉';
  $('#roll').disabled=true;
  render();
}
async function nextTurn(){
  // Pular turnos é resolvido dentro do rodízio, sem pedir lançamento de dado.
  for(let i=0;i<players.length;i++){
    turn=(turn+1)%players.length;
    const player=players[turn];
    render();
    if(player.skipTurns===0)break;
    player.skipTurns-=1;
    $('#status').textContent='🕳️ '+player.name+' perdeu a vez na areia movediça!';
    render();
    await sleep(1100);
  }
  $('#question').textContent='🎯';
  $('#roll').disabled=false;
}
$('#count').onchange=renderRoster;
$('#start').onclick=newGame;
$('#restart').onclick=()=>{
  if(!busy){
    $('#setup').showModal();
    renderRoster();
  }
};
$('#roll').onclick=()=>{
  if(pending||busy||winner||!players.length)return;
  clearEvent();
  const die=rand(1,6),a=rand(2,9),b=rand(2,9),answer=a*b;
  pending={die,answer};
  $('#roll').disabled=true;
  $('#status').textContent='🎲 '+die+' casas se acertar!';
  $('#question').textContent=a+' × '+b+' = ?';
  const options=new Set([answer]);
  while(options.size<4){
    const wrong=answer+rand(-12,12);
    if(wrong>0)options.add(wrong);
  }
  $('#options').replaceChildren();
  shuffle([...options]).forEach(value=>{
    const button=document.createElement('button');
    button.textContent=value;
    button.onclick=()=>respond(value);
    $('#options').append(button);
  });
};
async function respond(value){
  if(!pending||busy||winner)return;
  busy=true;
  const {die,answer}=pending;
  pending=null;
  $('#options').replaceChildren();
  if(value===answer){
    $('#status').textContent='✅ Acertou! Avance '+die+' casas.';
    await animateTo(players[turn],players[turn].pos+die);
    if(players[turn].pos===MAX){
      announceWinner();
      busy=false;
      return;
    }
    await applySpecial();
    if(players[turn].pos===MAX){
      announceWinner();
      busy=false;
      return;
    }
  }else{
    $('#status').textContent='❌ Resposta certa: '+answer+'. Permanece na mesma casa.';
    await sleep(900);
  }
  await nextTurn();
  busy=false;
}
renderSpecialMarkers();
$('#setup').showModal();
renderRoster();
if('serviceWorker'in navigator){
  window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
}
