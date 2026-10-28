import {newGame,applyCommand,advanceIfDue,removePlayer} from './online-logic.js';
import {firebaseConfig} from './firebase-config.js';

// Firebase only starts loading after someone selects multiplayer.
const SDK='https://www.gstatic.com/firebasejs/11.10.0/';
const ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const VALID_CODE=/^[A-HJ-NP-Z2-9]{7}$/;
const cleanName=value=>String(value||'Jogador').trim().slice(0,18)||'Jogador';
const validAvatar=value=>/^(masculino|feminino)-0[1-5]$/.test(value)?value:'masculino-01';
function randomCode(){
  const bytes=new Uint8Array(7);crypto.getRandomValues(bytes);
  return [...bytes].map(n=>ALPHABET[n%ALPHABET.length]).join('');
}
function friendlyError(error){
  const code=error?.code||'';
  if(code.includes('permission-denied'))return 'Acesso negado. Publique as regras do banco de dados e confira a autenticação anônima.';
  if(code.includes('network-request-failed'))return 'Sem conexão. Verifique a internet e tente novamente.';
  return error?.message||'Não foi possível conectar ao Firebase.';
}
export class FirebaseRooms{
  constructor({onRoom,onError}){
    this.onRoom=onRoom;this.onError=onError;
    this.sdk=null;this.auth=null;this.db=null;this.uid=null;this.roomCode=null;this.room=null;
    this.offset=0;this.unsub=[];this.hostTickTimer=null;this.ticking=false;
    this.offlineSince=new Map();this.handoffTarget=null;this.handoffRequest=0;this.leaving=false;
  }
  now(){return Date.now()+this.offset}
  get amHost(){return Boolean(this.room&&this.room.hostId===this.uid)}
  get configured(){return Boolean(firebaseConfig.apiKey&&firebaseConfig.appId&&firebaseConfig.projectId&&firebaseConfig.databaseURL)}
  async connect(){
    if(!this.configured)throw Error('O modo online ainda não foi ativado. Peça ao administrador para configurar as salas.');
    if(this.uid)return;
    try{
      const [appModule,authModule,dbModule]=await Promise.all([
        import(SDK+'firebase-app.js'),
        import(SDK+'firebase-auth.js'),
        import(SDK+'firebase-database.js')
      ]);
      this.sdk=dbModule;
      const app=appModule.getApps().length?appModule.getApp():appModule.initializeApp(firebaseConfig);
      this.auth=authModule.getAuth(app);this.db=dbModule.getDatabase(app);
      if(!this.auth.currentUser)await authModule.signInAnonymously(this.auth);
      this.uid=this.auth.currentUser?.uid;
      if(!this.uid)throw Error('Não foi possível identificar o jogador.');
      this.unsub.push(dbModule.onValue(dbModule.ref(this.db,'.info/serverTimeOffset'),snap=>{
        this.offset=Number(snap.val())||0;
      }));
    }catch(error){throw Error(friendlyError(error))}
  }
  roomPath(path=''){return 'rooms/'+this.roomCode+(path?'/'+path:'')}
  async create(name,avatar){
    await this.connect();
    await this.leave();
    const {ref,runTransaction}=this.sdk;
    let code='',created=false;
    for(let attempt=0;attempt<5&&!created;attempt++){
      code=randomCode();
      const room={
        hostId:this.uid,createdAt:this.now(),
        seats:{'0':{uid:this.uid,name:cleanName(name),avatar:validAvatar(avatar),joinedAt:this.now()}},
        state:{phase:'lobby',rev:0,turn:0,rounds:0}
      };
      const tx=await runTransaction(ref(this.db,'rooms/'+code),current=>current?undefined:room,{applyLocally:false});
      created=tx.committed;
    }
    if(!created)throw Error('Não foi possível criar uma sala. Tente novamente.');
    await this.subscribe(code);
    return code;
  }
  async join(code,name,avatar){
    await this.connect();
    const normalized=String(code||'').toUpperCase().replace(/\s/g,'');
    if(!VALID_CODE.test(normalized))throw Error('O código da sala deve ter 7 caracteres.');
    await this.leave();
    const {ref,get,runTransaction}=this.sdk;
    const base='rooms/'+normalized,room=(await get(ref(this.db,base))).val();
    if(!room)throw Error('Sala não encontrada. Confira o código.');
    const ownedSeat=Object.entries(room.seats||{}).find(([,seat])=>seat?.uid===this.uid);
    if(!ownedSeat&&room.state?.phase!=='lobby')throw Error('Esta partida já começou.');
    if(!ownedSeat){
      let accepted=false;
      for(let i=1;i<5&&!accepted;i++){
        const seatRef=ref(this.db,base+'/seats/'+i);
        const entry={uid:this.uid,name:cleanName(name),avatar:validAvatar(avatar),joinedAt:this.now()};
        try{
          const tx=await runTransaction(seatRef,seat=>seat?undefined:entry,{applyLocally:false});
          accepted=tx.committed;
        }catch(error){throw Error(friendlyError(error))}
      }
      if(!accepted)throw Error('A sala está cheia (máximo de 5 jogadores).');
    }
    await this.subscribe(normalized);
    return normalized;
  }
  async subscribe(code){
    const {ref,get,onValue,onChildAdded,set,onDisconnect}=this.sdk;
    this.roomCode=code;
    const roomRef=ref(this.db,'rooms/'+code);
    // Restore room metadata before processing queued commands after reconnect.
    this.room=(await get(roomRef)).val();
    if(this.room)this.onRoom(this.room,code);
    this.unsub.push(onValue(roomRef,snapshot=>{
      this.room=snapshot.val();
      if(!this.leaving)this.onRoom(this.room,code);
      void this.updateHandoff().catch(error=>this.onError(friendlyError(error)));
    },error=>this.onError(friendlyError(error))));
    // Only the host processes player requests. Others submit commands to Firebase.
    this.unsub.push(onChildAdded(ref(this.db,this.roomPath('commands')),snapshot=>{
      if(this.amHost)void this.processCommand(snapshot);
    },error=>this.onError(friendlyError(error))));
    const presenceRef=ref(this.db,this.roomPath('presence/'+this.uid));
    await onDisconnect(presenceRef).remove();
    await set(presenceRef,true);
    void this.updateHandoff().catch(error=>this.onError(friendlyError(error)));
    this.hostTickTimer=setInterval(()=>{if(this.amHost)void this.tick()},500);
  }
  async updateHandoff(){
    if(!this.roomCode||!this.db||this.leaving)return;
    const remaining=Object.values(this.room?.seats||{}).find(seat=>seat?.uid&&seat.uid!==this.uid)?.uid||null;
    const target=this.amHost?remaining:null;
    if(target===this.handoffTarget)return;
    this.handoffTarget=target;
    const serial=++this.handoffRequest;
    const ref=this.sdk.ref(this.db,this.roomPath('hostId'));
    const disconnect=this.sdk.onDisconnect(ref);
    // On an unplanned host disconnect, one remaining device becomes host.
    // The new host later removes the abandoned participant after a grace period.
    if(target)await disconnect.set(target);
    else await disconnect.cancel();
    if(serial!==this.handoffRequest)return;
  }
  async reconcile(){
    if(!this.amHost||!this.roomCode||!this.room?.state)return;
    const seats=Object.values(this.room.seats||{});
    const members=new Set(seats.map(seat=>seat?.uid).filter(Boolean));
    const state=this.room.state;
    // Explicit exits delete their seat immediately; clean their board state.
    const absent=state.order?.find(uid=>!members.has(uid));
    if(absent){
      await this.sdk.runTransaction(this.sdk.ref(this.db,this.roomPath('state')),current=>{
        if(!current?.order?.includes(absent))return;
        return removePlayer(current,absent,this.now())||undefined;
      },{applyLocally:false});
      return true;
    }
    const now=this.now(),GRACE_MS=20000;
    for(const uid of members){
      if(uid===this.uid||this.room.presence?.[uid]){
        this.offlineSince.delete(uid);
        continue;
      }
      if(!this.offlineSince.has(uid))this.offlineSince.set(uid,now);
      if(now-this.offlineSince.get(uid)<GRACE_MS)continue;
      this.offlineSince.delete(uid);
      await this.removeParticipant(uid,true);
      return true;
    }
    for(const uid of [...this.offlineSince.keys()])if(!members.has(uid))this.offlineSince.delete(uid);
  }
  async removeParticipant(uid,offline=false){
    if(!this.amHost||!this.roomCode||uid===this.uid)return false;
    const result=await this.sdk.runTransaction(this.sdk.ref(this.db,this.roomPath()),room=>{
      if(!room||room.hostId!==this.uid||!room.seats)return;
      const seatId=Object.keys(room.seats).find(key=>room.seats[key]?.uid===uid);
      if(seatId===undefined)return;
      if(offline&&room.presence?.[uid])return;
      const seats={...room.seats};
      delete seats[seatId];
      const presence={...room.presence};
      delete presence[uid];
      return {...room,seats,presence,
        state:removePlayer(room.state,uid,this.now())||room.state};
    },{applyLocally:false});
    return result.committed;
  }
  async start(){
    if(!this.amHost)throw Error('Somente o criador da sala pode iniciar.');
    const {ref,get,runTransaction}=this.sdk;
    const fresh=(await get(ref(this.db,this.roomPath('seats')))).val()||{};
    const initial=newGame(fresh,this.now());
    await runTransaction(ref(this.db,this.roomPath('state')),state=>{
      if(!state||(state.phase!=='lobby'&&state.phase!=='finished'))return;
      return initial;
    },{applyLocally:false});
  }
  async command(kind,value=null){
    if(!this.room||!this.uid)throw Error('Entre em uma sala primeiro.');
    if(!this.room.state?.order?.includes(this.uid))throw Error('Você não está nesta partida.');
    if(!['answer','power'].includes(kind))throw Error('Ação inválida.');
    const {ref,push,set}=this.sdk;
    const actionRef=push(ref(this.db,this.roomPath('commands')));
    await set(actionRef,{actor:this.uid,kind,value:kind==='answer'?Number(value):0,at:this.now()});
  }
  async processCommand(snapshot){
    if(!this.amHost)return;
    const command=snapshot.val(),key=snapshot.key;
    const {ref,runTransaction,remove}=this.sdk;
    const stateRef=ref(this.db,this.roomPath('state'));
    try{
      await runTransaction(stateRef,current=>{
        if(!current||!command||!key)return;
        if((current.lastCommands?.[command.actor]||'')>=key)return;
        const next=applyCommand(current,command,this.now());
        if(!next)return;
        next.lastCommands={...(next.lastCommands||{}),[command.actor]:key};
        return next;
      },{applyLocally:false});
      await remove(snapshot.ref);
    }catch(error){this.onError(friendlyError(error))}
  }
  async tick(){
    if(this.ticking||!this.amHost||!this.room?.state||this.leaving)return;
    this.ticking=true;
    try{
      if(await this.reconcile())return;
      if(!this.amHost||!this.room?.state)return;
      const current=this.room.state;
      const due=current.phase==='ready'||
        (current.phase==='question'&&current.question&&this.now()>=current.question.deadline)||
        ((current.phase==='feedback'||current.phase==='power')&&current.feedback&&this.now()>=current.feedback.until);
      if(!due)return;
      await this.sdk.runTransaction(this.sdk.ref(this.db,this.roomPath('state')),state=>{
        return advanceIfDue(state,this.now())||undefined;
      },{applyLocally:false});
    }catch(error){this.onError(friendlyError(error))}
    finally{this.ticking=false}
  }
  inviteLink(){
    const url=new URL(window.location.href);
    url.searchParams.set('room',this.roomCode);
    return url.toString();
  }
  async removeSeat(index){
    if(!this.amHost||this.room.state?.phase!=='lobby'||index<1||index>4)return;
    await this.sdk.remove(this.sdk.ref(this.db,this.roomPath('seats/'+index)));
  }
  async leave(){
    const room=this.room,code=this.roomCode,uid=this.uid;
    for(const unsubscribe of this.unsub.splice(1)){try{unsubscribe()}catch(e){}}
    if(this.hostTickTimer){clearInterval(this.hostTickTimer);this.hostTickTimer=null}
    if(code&&this.db&&uid){
      const {ref,remove,set,onDisconnect}=this.sdk;
      const base='rooms/'+code;
      try{
        const presence=ref(this.db,base+'/presence/'+uid);
        await onDisconnect(presence).cancel();
        if(room?.state?.phase==='lobby'&&room.hostId===uid){
          await remove(ref(this.db,base));
        }else{
          await set(presence,false);
          if(room?.state?.phase==='lobby'){
            const seat=Object.entries(room.seats||{}).find(([,value])=>value?.uid===uid);
            if(seat)await remove(ref(this.db,base+'/seats/'+seat[0]));
          }
        }
      }catch(error){console.warn('Não foi possível atualizar a presença ao sair.',error)}
    }
    this.roomCode=null;this.room=null;
  }
}
