import specialSpaces from './assets/special-spaces.json' with {type:'json'};
// Regras compartilhadas para o modo online; o anfitrião aplica as ações.
export const ANSWER_SECONDS=60;
export const POWER_STEPS=3;
export const LAST_SQUARE=39;
export const EVENTS=Object.fromEntries(specialSpaces.map(({position,type})=>[position,type]));
export const bounded=value=>Math.max(0,Math.min(LAST_SQUARE,value));
const roll=(min,max,random)=>Math.floor(random()*(max-min+1))+min;
const optionsFor=(answer,random)=>{
  const choices=new Set([answer]);
  while(choices.size<4){
    const candidate=answer+roll(-14,14,random);
    if(candidate>0&&candidate<=100)choices.add(candidate);
  }
  return [...choices].sort(()=>random()-.5);
};
const names=['masculino-01','masculino-02','masculino-03','masculino-04','masculino-05','feminino-01','feminino-02','feminino-03','feminino-04','feminino-05'];
const stamp=(state,data)=>({...state,rev:(state.rev||0)+1,event:{id:(state.rev||0)+1,...data}});
export function newGame(seats){
  const seatsInOrder=Object.entries(seats||{}).sort(([a],[b])=>Number(a)-Number(b)).slice(0,5);
  if(seatsInOrder.length<2)throw Error('São necessários pelo menos dois jogadores.');
  const players={},order=[];
  for(const [,participant] of seatsInOrder){
    if(!participant?.uid||order.includes(participant.uid))continue;
    const uid=participant.uid;
    players[uid]={name:String(participant.name||'Jogador').slice(0,18),avatar:names.includes(participant.avatar)?participant.avatar:names[0],pos:0,power:0,skipTurns:0};
    order.push(uid);
  }
  if(order.length<2)throw Error('São necessários dois participantes diferentes.');
  return {phase:'ready',rev:1,turn:0,rounds:0,order,players,question:null,feedback:null,event:{id:1,kind:'start'},lastCommands:{}};
}
function finishAnswer(state,command,now,random){
  if(state.phase!=='question'||!state.question)return null;
  const actor=state.order[state.turn];
  if(command.actor!==actor)return null;
  const question=state.question;
  const timeout=now>=question.deadline||command.kind==='timeout';
  const selected=timeout?null:Number(command.value);
  const correct=!timeout&&Number.isInteger(selected)&&selected===question.answer;
  const players={...state.players};
  const old=players[actor];
  const participant={...old};
  players[actor]=participant;
  const from=participant.pos;
  let position=from,landed=from,special=null;
  if(correct){
    participant.power=Math.min(POWER_STEPS,participant.power+1);
    landed=bounded(from+question.die);
    position=landed;
    // Reaching the final square wins before any special space.
    if(position!==LAST_SQUARE&&EVENTS[position]){
      const kind=EVENTS[position];
      if(kind==='trap'){position=bounded(position-3);special='Armadilha: voltou 3 casas.'}
      if(kind==='quicksand'){participant.skipTurns++;special='Areia movediça: perderá uma rodada.'}
      if(kind==='portal'){
        const forward=random()<.5;
        position=bounded(position+(forward?5:-5));
        special=forward?'Portal: avançou 5 casas.':'Portal: voltou 5 casas.';
      }
      if(kind==='chest'){
        const lucky=random()<.65;
        position=bounded(position+(lucky?3:-2));
        special=lucky?'Baú: ganhou 3 casas.':'Baú: perdeu 2 casas.';
      }
    }
    participant.pos=position;
  }
  const winner=correct&&position===LAST_SQUARE;
  const feedback={actor,answer:question.answer,selected,correct,timeout,from,to:position,landed,special,until:now+(correct?3400:3000)};
  return stamp({...state,phase:winner?'finished':'feedback',players,feedback,winner:winner?actor:null},
    {kind:winner?'victory':'answer',actor,from,to:position,correct,timeout,selected,answer:question.answer,special});
}
export function applyCommand(state,command,now,random=Math.random){
  if(!state||!command||!state.order?.includes(command.actor))return null;
  const actor=state.order[state.turn];
  if(command.actor!==actor)return null;
  if(command.kind==='roll'&&state.phase==='ready'){
    const a=roll(2,9,random),b=roll(2,9,random),die=roll(1,6,random);
    const question={a,b,answer:a*b,die,options:optionsFor(a*b,random),deadline:now+ANSWER_SECONDS*1000};
    return stamp({...state,phase:'question',question,feedback:null},{kind:'roll',actor,die});
  }
  if((command.kind==='answer'||command.kind==='timeout')&&state.phase==='question'){
    return finishAnswer(state,command,now,random);
  }
  if(command.kind==='power'&&state.phase==='ready'){
    if(state.players[actor].power<POWER_STEPS)return null;
    const adversaries=state.order.filter(uid=>uid!==actor);
    if(!adversaries.length)return null;
    const target=adversaries[roll(0,adversaries.length-1,random)];
    const effects=['back2','back3','skip'];
    const effect=effects[roll(0,effects.length-1,random)];
    const players={...state.players,[actor]:{...state.players[actor],power:0},[target]:{...state.players[target]}};
    const hit=players[target],from=hit.pos;
    if(effect==='skip')hit.skipTurns++;
    else hit.pos=bounded(hit.pos-(effect==='back2'?2:3));
    return stamp({...state,players},{kind:'power',actor,target,effect,from,to:hit.pos});
  }
  return null;
}
export function advanceIfDue(state,now,random=Math.random){
  if(!state)return null;
  if(state.phase==='question'&&state.question&&now>=state.question.deadline){
    return finishAnswer(state,{kind:'timeout',actor:state.order[state.turn]},now,random);
  }
  if(state.phase!=='feedback'||!state.feedback||now<state.feedback.until)return null;
  const players={...state.players};
  let turn=state.turn,skipped=[];
  for(let tries=0;tries<state.order.length;tries++){
    turn=(turn+1)%state.order.length;
    const uid=state.order[turn];
    const participant=players[uid];
    if(!(participant?.skipTurns>0))break;
    players[uid]={...participant,skipTurns:participant.skipTurns-1};
    skipped.push(uid);
  }
  return stamp({...state,players,phase:'ready',turn,rounds:(state.rounds||0)+1,question:null,feedback:null},
    {kind:'turn',actor:state.order[turn],skipped});
}
