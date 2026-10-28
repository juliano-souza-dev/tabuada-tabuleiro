import route from './assets/path.json' with {type:'json'};
import {FirebaseRooms} from './online.js';

const $=selector=>document.querySelector(selector);
const avatar=name=>'assets/avatars/'+name+'.svg';
const close=id=>{const modal=$(id);if(modal?.open)modal.close()};
const open=id=>{const modal=$(id);if(modal&&!modal.open)modal.showModal()};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const POWER_MAX=3;
function powerBar(node,power){
  node.replaceChildren();
  for(let i=0;i<POWER_MAX;i++){
    const segment=document.createElement('span');
    segment.className='power-segment'+(i<power?' charged':'');
    node.append(segment);
  }
}
function renderText(node,value){node.textContent=String(value||'')}
const sortedSeats=room=>Object.entries(room?.seats||{}).sort(([a],[b])=>Number(a)-Number(b)).map(([,value])=>value);
const normalizedArray=value=>Array.isArray(value)?value:Object.values(value||{});

export class OnlineUI{
  constructor({onBoard,onLocal,onExit,onGesture,onSound}){
    this.callbacks={onBoard,onLocal,onExit,onGesture,onSound};
    this.rooms=new FirebaseRooms({
      onRoom:(room,code)=>this.onRoom(room,code),
      onError:message=>this.error(message)
    });
    this.active=false;
    this.pending=false;
    this.revision=null;
    this.prevEvent=0;
    this.lastState=null;
    this.timer=setInterval(()=>this.updateClock(),180);
    this.bind();
    const inviteCode=new URLSearchParams(location.search).get('room');
    if(inviteCode)$('#online-code').value=inviteCode.toUpperCase().slice(0,7);
  }
  bind(){
    $('#mode-local').addEventListener('click',()=>{close('#mode-dialog');this.callbacks.onLocal()});
    $('#mode-online').addEventListener('click',()=>{close('#mode-dialog');this.active=true;open('#online-entry')});
    $('#online-back').addEventListener('click',()=>{close('#online-entry');this.active=false;open('#mode-dialog')});
    $('#online-create').addEventListener('click',()=>this.connect('create'));
    $('#online-join').addEventListener('click',()=>this.connect('join'));
    $('#online-start').addEventListener('click',async()=>{
      this.callbacks.onGesture();
      await this.busy(async()=>this.rooms.start());
    });
    $('#online-copy').addEventListener('click',async()=>{
      const link=this.rooms.inviteLink();
      try{await navigator.clipboard.writeText(link);renderText($('#online-lobby-hint'),'✅ Convite copiado!')}
      catch(error){renderText($('#online-lobby-hint'),link)}
    });
    $('#online-leave').addEventListener('click',()=>this.leave());
    $('#online-finish').addEventListener('click',()=>this.leave());
    $('#online-rematch').addEventListener('click',async()=>{
      this.callbacks.onGesture();
      await this.busy(async()=>this.rooms.start());
    });
    $('#online-roll').addEventListener('click',()=>{
      $('#online-roll').disabled=true;
      this.callbacks.onGesture();
      void this.send('roll');
    });
    $('#online-power').addEventListener('click',()=>{
      $('#online-power').disabled=true;
      this.callbacks.onGesture();
      void this.send('power');
    });
    for(const id of ['mode-dialog','online-entry','online-lobby','online-turn','online-victory']){
      $( '#'+id ).addEventListener('cancel',event=>event.preventDefault());
    }
  }
  async busy(callback){
    if(this.pending)return;
    this.pending=true;
    for(const id of ['online-create','online-join','online-start','online-rematch'])$('#'+id).disabled=true;
    try{await callback()}catch(error){this.error(error.message)}
    finally{
      this.pending=false;
      for(const id of ['online-create','online-join','online-start','online-rematch'])$('#'+id).disabled=false;
    }
  }
  error(message){
    const entry=$('#online-error');
    entry.textContent=message;
    entry.hidden=false;
    if(!$('#online-entry').open&&!$('#online-lobby').open){
      const banner=$('#online-banner');banner.hidden=false;banner.textContent=message;
    }else if($('#online-lobby').open){
      renderText($('#online-lobby-hint'),message);
    }
    console.warn('Sala online:',message);
  }
  async connect(kind){
    await this.busy(async()=>{
      $('#online-error').hidden=true;
      const name=$('#online-name').value;
      const character=$('#online-avatar').value;
      const code=kind==='create'
        ?await this.rooms.create(name,character)
        :await this.rooms.join($('#online-code').value,name,character);
      const url=new URL(location.href);
      url.searchParams.set('room',code);
      history.replaceState(null,'',url.pathname+url.search+url.hash);
    });
  }
  showLobby(room,code){
    close('#online-entry');close('#online-turn');close('#online-victory');
    renderText($('#online-room-code'),code);
    const roster=$('#online-roster');
    roster.replaceChildren();
    for(const person of sortedSeats(room)){
      const item=document.createElement('div');item.className='online-roster-item';
      const icon=document.createElement('img');icon.src=avatar(person.avatar);icon.alt='';
      const label=document.createElement('strong');label.textContent=person.name;
      const suffix=document.createElement('small');suffix.textContent=person.uid===room.hostId?'👑 Anfitrião':'Jogador';
      const connected=document.createElement('span');connected.className='connection'+(room.presence?.[person.uid]?'':' offline');
      item.append(icon,label,suffix,connected);roster.append(item);
    }
    const total=sortedSeats(room).length;
    const host=this.rooms.amHost;
    $('#online-start').hidden=!host;
    $('#online-start').disabled=total<2;
    $('#online-lobby-hint').textContent=host
      ?total<2?'Aguardando pelo menos mais um jogador...':total+' jogadores na sala. Pronto para começar!'
      :'Aguardando o anfitrião começar...';
    $('#online-banner').hidden=true;
    open('#online-lobby');
  }
  onRoom(room,code){
    if(!this.active)return;
    if(!room){this.error('A sala não está mais disponível.');return}
    if(room.state?.phase==='lobby'){
      this.revision=null;this.prevEvent=0;this.lastState=null;
      this.showLobby(room,code);
      return;
    }
    close('#online-entry');close('#online-lobby');
    if(!room.state?.order?.includes(this.rooms.uid)){
      this.error('Você não participa desta partida.');return;
    }
    document.body.classList.add('playing');
    const offline=!room.presence?.[room.hostId];
    const st=room.state;
    if(this.revision!==st.rev){
      this.revision=st.rev;this.lastState=st;
      this.callbacks.onBoard(st);
      const event=st.event;
      if(event&&event.id!==this.prevEvent){
        this.prevEvent=event.id;
        this.reactEvent(st,event);
      }
      this.renderTurn(st);
    }
    if(st.phase!=='finished'){
      const who=st.players[st.order[st.turn]];
      $('#online-banner').textContent=offline?'⚠️ Anfitrião desconectado. Aguardando reconexão.'
        :st.phase==='feedback'?'🎯 '+who.name+' finalizou a resposta.'
        :st.phase==='question'?'⏱️ '+who.name+' está respondendo.':
         '🎲 Vez de '+who.name+'.';
      const activePlayer=st.order[st.turn]===this.rooms.uid;
      $('#online-banner').hidden=activePlayer&&!offline;
    }
  }
  renderTurn(st){
    const active=st.order[st.turn]===this.rooms.uid;
    if(st.phase==='finished'){
      close('#online-turn');
      const winner=st.players[st.winner]||{name:'Jogador',avatar:'masculino-01'};
      $('#online-winner-avatar').src=avatar(winner.avatar);
      renderText($('#online-winner-message'),winner.name+' chegou ao castelo e venceu!');
      $('#online-rematch').hidden=!this.rooms.amHost;
      $('#online-rematch-wait').hidden=this.rooms.amHost;
      open('#online-victory');
      return;
    }
    close('#online-victory');
    if(!active){close('#online-turn');return}
    const person=st.players[this.rooms.uid];
    $('#online-turn-avatar').src=avatar(person.avatar);
    renderText($('#online-turn-name'),person.name);
    renderText($('#online-turn-progress'),'Casa '+(person.pos+1)+' de 40');
    renderText($('#online-power-count'),person.power+'/3');
    powerBar($('#online-power-meter'),person.power);
    const ready=st.phase==='ready';
    const question=st.question;
    $('#online-roll').hidden=!ready;
    $('#online-roll').disabled=false;
    $('#online-power').hidden=!ready||person.power<3;
    $('#online-power').disabled=false;
    $('#online-question').hidden=!question;
    $('#online-options').hidden=!question;
    $('#online-timer').hidden=!question;
    $('#online-die').textContent=question?['⚀','⚁','⚂','⚃','⚄','⚅'][question.die-1]:'🎲';
    if(question){
      renderText($('#online-question'),question.a+' × '+question.b+' = ?');
      const root=$('#online-options');root.replaceChildren();
      const choices=normalizedArray(question.options);
      for(const option of choices){
        const button=document.createElement('button');
        button.type='button';
        button.textContent=String(option);
        button.disabled=st.phase!=='question';
        button.addEventListener('click',()=>{
          root.querySelectorAll('button').forEach(b=>b.disabled=true);
          void this.send('answer',option);
        });
        if(st.phase==='feedback'){
          if(Number(option)===question.answer)button.classList.add('is-correct');
          else if(st.feedback?.selected===Number(option))button.classList.add('is-wrong');
        }
        root.append(button);
      }
    }
    $('#online-feedback').hidden=st.phase!=='feedback';
    if(st.phase==='feedback'){
      const f=st.feedback;
      $('#online-feedback').className='answer-feedback '+(f.correct?'feedback-correct':'feedback-wrong');
      $('#online-feedback').textContent=f.correct
        ?'✅ Correto! Avançou no tabuleiro. ⚡ Energia '+person.power+'/3.'
        :f.timeout?'⏰ O tempo acabou. Resposta correta: '+f.answer+'.'
         :'❌ Resposta incorreta! Resposta correta: '+f.answer+'.';
    }else{
      $('#online-feedback').className='answer-feedback';
    }
    $('#online-help').textContent=ready?'Lance o dado e acerte para avançar!'
      :st.phase==='question'?'Escolha a resposta antes do tempo acabar.':'Confira o resultado da rodada.';
    open('#online-turn');
    this.updateClock();
  }
  updateClock(){
    if(!this.active||!this.lastState||!$('#online-turn').open)return;
    const state=this.lastState;
    if(!state.question)return;
    const remaining=Math.max(0,Math.ceil((state.question.deadline-this.rooms.now())/1000));
    renderText($('#online-countdown'),remaining);
    $('#online-timer-bar').style.width=(remaining/60*100)+'%';
    $('#online-timer').classList.toggle('urgent',remaining<=10);
    if(remaining===0&&state.phase==='question'){
      $('#online-options').querySelectorAll('button').forEach(button=>button.disabled=true);
      $('#online-help').textContent='⏰ Tempo encerrado. Aguardando o resultado...';
    }
  }
  async send(kind,value=null){
    try{await this.rooms.command(kind,value)}
    catch(error){this.error(error.message);this.renderTurn(this.rooms.room?.state||this.lastState)}
  }
  reactEvent(state,event){
    const player=state.players[event.actor];
    if(event.kind==='power'){
      const target=state.players[event.target];
      const labels={back2:'voltou 2 casas',back3:'voltou 3 casas',skip:'perderá a próxima rodada'};
      $('#online-banner').textContent='⚡ '+player.name+' atingiu '+target.name+': '+labels[event.effect]+'!';
      this.callbacks.onSound('portal');
      this.powerAnimation(event,state);
    }else if(event.kind==='answer'||event.kind==='victory'){
      this.callbacks.onSound(event.correct?'correct':'wrong');
    }else if(event.kind==='roll')this.callbacks.onSound('dice');
    else if(event.kind==='start')this.callbacks.onSound('start');
    else if(event.kind==='turn')this.callbacks.onSound('turn');
  }
  async powerAnimation(event,state){
    const root=$('#power-effects');
    const source=route[event.origin??state.players[event.actor]?.pos??0];
    const target=route[event.from??state.players[event.target]?.pos??0];
    if(!source||!target)return;
    const rect=$('#board').getBoundingClientRect();
    const projectile=document.createElement('span');
    projectile.className='power-projectile';projectile.textContent='⚡';
    projectile.style.setProperty('--origin-x',source.x+'%');
    projectile.style.setProperty('--origin-y',source.y+'%');
    projectile.style.setProperty('--travel-x',((target.x-source.x)*rect.width/100)+'px');
    projectile.style.setProperty('--travel-y',((target.y-source.y)*rect.height/100)+'px');
    root.append(projectile);await sleep(850);projectile.remove();
    const impact=document.createElement('span');
    impact.className='power-impact';
    impact.style.setProperty('--hit-x',target.x+'%');
    impact.style.setProperty('--hit-y',target.y+'%');
    root.append(impact);await sleep(620);impact.remove();
  }
  async leave(){
    if(this.rooms.amHost&&this.rooms.room?.state?.phase!=='lobby'&&this.rooms.room?.state?.phase!=='finished'){
      if(!confirm('Se você sair, a partida online vai aguardar seu retorno. Sair mesmo assim?'))return;
    }
    await this.rooms.leave();
    this.active=false;this.revision=null;this.prevEvent=0;this.lastState=null;
    for(const id of ['online-entry','online-lobby','online-turn','online-victory'])close('#'+id);
    $('#online-banner').hidden=true;
    $('#power-effects').replaceChildren();
    const url=new URL(location.href);url.searchParams.delete('room');
    history.replaceState(null,'',url.pathname+url.search+url.hash);
    this.callbacks.onExit();
    open('#mode-dialog');
  }
}
