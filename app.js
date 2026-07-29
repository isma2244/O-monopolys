import {
  START_MONEY, PASS_GO_AMOUNT, TOKENS, BOARD,
  PROPERTY_DATA, STATION_DATA, SERVICE_DATA, EVENT_CARDS, MONEY_CARDS
} from './data.js';

const TABLE = 'monopolis_games';
const MAX_CHAT = 100;
const MAX_LOG = 140;

let client = null;
let channel = null;
let gameRow = null;
let state = null;
let zoomed = false;
let audioCtx = null;
let ambientAudio = null;
let lastLandingShown = 0;
let lastPurchaseShown = 0;
let lastSeenChatAt = 0;
let lastSeenTradeAt = 0;
let currentDisplayMode = localStorage.getItem('monopolis.displayMode') || 'full';
let soundEnabled = localStorage.getItem('monopolis.sound') !== 'off';
let musicEnabled = localStorage.getItem('monopolis.music') === 'on';

let myPlayerId = localStorage.getItem('monopolis.playerId') || crypto.randomUUID();
localStorage.setItem('monopolis.playerId', myPlayerId);

const $ = id => document.getElementById(id);
const fmt = n => `${Math.round(Number(n) || 0).toLocaleString('es-ES')} €`;
const now = () => new Date().toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
const uid = () => crypto.randomUUID();

const SQL = `create table if not exists public.monopolis_games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monopolis_games enable row level security;
drop policy if exists "monopolis read" on public.monopolis_games;
drop policy if exists "monopolis insert" on public.monopolis_games;
drop policy if exists "monopolis update" on public.monopolis_games;
create policy "monopolis read" on public.monopolis_games for select using (true);
create policy "monopolis insert" on public.monopolis_games for insert with check (true);
create policy "monopolis update" on public.monopolis_games for update using (true) with check (true);
grant usage on schema public to anon, authenticated;
grant select, insert, update on public.monopolis_games to anon, authenticated;
alter publication supabase_realtime add table public.monopolis_games;`;

function boot() {
  $('sqlPreview').textContent = SQL;
  ambientAudio = $('ambientAudio');
  ambientAudio.volume = 0.22;
  populateTokens();
  loadConfigToInputs();
  bind();
  initSupabase();
  setAudioButtons();

  const params = new URLSearchParams(location.search);
  const join = params.get('join');
  if (join) {
    $('joinCode').value = join.toUpperCase();
    switchMode('join');
  }
  const viewMode = params.get('view');
  if (['host','player','full'].includes(viewMode)) currentDisplayMode = viewMode;
  setDisplayMode(currentDisplayMode);

  resizeFxCanvas();
  window.addEventListener('resize', resizeFxCanvas);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  renderSetup();
}

function bind() {
  $('saveConfigBtn').onclick = saveConfig;
  $('createGameBtn').onclick = createGame;
  $('joinGameBtn').onclick = joinGame;
  $('copyLinkBtn').onclick = copyLink;
  $('nativeShareBtn').onclick = nativeShare;
  $('startGameBtn').onclick = startGame;
  $('leaveGameBtn').onclick = () => { disconnect(); location.href = location.pathname; };
  $('rollBtn').onclick = rollDice;
  $('endTurnBtn').onclick = endTurn;
  $('moneyDeckBtn').onclick = drawMoney;
  $('eventDeckBtn').onclick = drawEvent;
  $('fitBoardBtn').onclick = fitBoardToMe;
  $('zoomBoardBtn').onclick = toggleZoom;
  $('modeFullBtn').onclick = () => setDisplayMode('full');
  $('modePlayerBtn').onclick = () => setDisplayMode('player');
  $('modeHostBtn').onclick = () => setDisplayMode('host');
  $('tabCreate').onclick = () => switchMode('create');
  $('tabJoin').onclick = () => switchMode('join');
  $('closeModalBtn').onclick = closeModal;
  $('sellHouseBtn').onclick = sellHouseSelected;
  $('mortgageAssetBtn').onclick = toggleMortgageSelected;
  $('bankruptBtn').onclick = declareBankruptcy;
  $('bankAddBtn').onclick = () => manualBank(+$('bankAmount').value || 0);
  $('bankSubBtn').onclick = () => manualBank(-(+$('bankAmount').value || 0));
  $('tradeToPlayer').onchange = renderTradeComposerLists;
  $('sendTradeBtn').onclick = sendTradeRequest;
  $('cancelCounterBtn').onclick = clearTradeComposer;
  $('sendChatBtn').onclick = sendChat;
  $('chatInput').addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); } });
  $('soundBtn').onclick = toggleSound;
  $('musicBtn').onclick = toggleMusic;
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    if (e.key === ' ' && state?.phase === 'playing' && isMyTurn() && !state.hasRolled) {
      e.preventDefault(); rollDice();
    }
  });
}

function populateTokens() {
  for (const id of ['createToken','joinToken']) {
    $(id).innerHTML = TOKENS.map(t => `<option value="${t.id}">${t.icon} ${escapeHtml(t.label)}</option>`).join('');
  }
}

function switchMode(mode) {
  const create = mode === 'create';
  $('tabCreate').classList.toggle('active', create);
  $('tabJoin').classList.toggle('active', !create);
  $('createBox').classList.toggle('hidden', !create);
  $('joinBox').classList.toggle('hidden', create);
}

function setDisplayMode(mode='full') {
  currentDisplayMode = mode;
  localStorage.setItem('monopolis.displayMode', mode);
  document.body.classList.toggle('mode-player', mode === 'player');
  document.body.classList.toggle('mode-host', mode === 'host');
  const map = { full:'modeFullBtn', player:'modePlayerBtn', host:'modeHostBtn' };
  Object.values(map).forEach(id => $(id)?.classList.remove('active'));
  $(map[mode])?.classList.add('active');
  if (mode !== 'player') setTimeout(fitBoardToMe, 120);
}

function sanitizeSupabaseUrl(raw) {
  return (raw || '').trim().replace(/\/rest\/v1\/?$/i, '').replace(/\/+$/g, '');
}

function loadConfigToInputs() {
  $('supabaseUrl').value = localStorage.getItem('monopolis.supabaseUrl') || '';
  $('supabaseKey').value = localStorage.getItem('monopolis.supabaseKey') || '';
}

function saveConfig() {
  const url = sanitizeSupabaseUrl($('supabaseUrl').value);
  const key = $('supabaseKey').value.trim();
  $('supabaseUrl').value = url;
  localStorage.setItem('monopolis.supabaseUrl', url);
  localStorage.setItem('monopolis.supabaseKey', key);
  initSupabase();
  haptic(18); playSfx('ok'); toast('Conexión gardada');
}

function initSupabase() {
  const url = sanitizeSupabaseUrl(localStorage.getItem('monopolis.supabaseUrl') || '');
  const key = localStorage.getItem('monopolis.supabaseKey') || '';
  if (!url || !key || !window.supabase) {
    client = null; setConnection('Sen configurar', 'muted'); return false;
  }
  try {
    client = window.supabase.createClient(url, key);
    setConnection('Preparado', 'online'); return true;
  } catch {
    client = null; setConnection('Erro de configuración', 'error'); return false;
  }
}

function setConnection(text, cls='muted') {
  $('connectionPill').textContent = text;
  $('connectionPill').className = `connection-pill ${cls}`;
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
}
function renderSetup() { showView('setupView'); }
function roomCode() { return `PIOR-${Math.floor(1000 + Math.random()*9000)}`; }
function shuffle(arr) {
  const a = arr.map((_,i) => i);
  for (let i=a.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}

function newPlayer(name, token) {
  return { id:myPlayerId, name:name || 'Xogador', token, money:START_MONEY, position:0, skipTurns:0, keptCards:[], bankrupt:false, connectedAt:Date.now() };
}

function newState(hostName, token) {
  const player = newPlayer(hostName || 'Host', token);
  return {
    schemaVersion:5,
    phase:'lobby', hostId:myPlayerId, players:[player], currentTurn:0,
    turnSerial:0, turnAction:{ turnSerial:0, resolved:true, rolled:false },
    dice:null, lastRoll:null, hasRolled:false, properties:{},
    decks:{ event:shuffle(EVENT_CARDS), money:shuffle(MONEY_CARDS) },
    drawn:null, freePot:0, lastLanding:null, lastPurchase:null,
    trades:[], chat:[],
    log:[`${now()} · ${player.name} creou a partida`]
  };
}

function normalizeState(s) {
  s ||= {};
  s.schemaVersion = 5;
  s.phase ||= 'lobby'; s.players ||= []; s.currentTurn ||= 0; s.properties ||= {};
  s.freePot ||= 0; s.lastLanding ||= null; s.lastPurchase ||= null; s.decks ||= {};
  if (!Array.isArray(s.decks.event) || !s.decks.event.length) s.decks.event = shuffle(EVENT_CARDS);
  if (!Array.isArray(s.decks.money) || !s.decks.money.length) s.decks.money = shuffle(MONEY_CARDS);
  s.log ||= []; s.chat ||= []; s.trades ||= []; s.turnSerial ||= 0;
  s.turnAction ||= { turnSerial:s.turnSerial, resolved:true, rolled:!!s.hasRolled };
  s.players.forEach(p => {
    p.money ??= START_MONEY; p.position ??= 0; p.skipTurns ??= 0; p.keptCards ||= []; p.bankrupt ||= false;
  });
  return s;
}

async function createGame() {
  if (!client && !initSupabase()) return toast('Configura Supabase primeiro');
  const name = $('createName').value.trim() || 'Xogador';
  const token = $('createToken').value;
  const payload = newState(name, token);
  setConnection('Creando…');
  for (let attempt=0; attempt<8; attempt++) {
    const code = roomCode();
    const { data, error } = await client.from(TABLE).insert({ code, state:payload }).select().single();
    if (!error && data) {
      gameRow=data; state=normalizeState(data.state);
      localStorage.setItem(`monopolis.${code}.playerId`,myPlayerId);
      await subscribe(data.id);
      history.replaceState(null,'',`${location.pathname}?join=${code}`);
      renderLobby(); startAmbientIfEnabled(); playSfx('win'); confettiBurst(); return;
    }
  }
  setConnection('Erro','error');
  toast('Non se puido crear. Revisa Supabase e o SQL.');
}

async function joinGame() {
  if (!client && !initSupabase()) return toast('Configura Supabase primeiro');
  const code = $('joinCode').value.trim().toUpperCase();
  const name = $('joinName').value.trim() || 'Xogador';
  const token = $('joinToken').value;
  if (!code) return toast('Falta o código');
  setConnection('Buscando…');
  const { data, error } = await client.from(TABLE).select('*').eq('code',code).single();
  if (error || !data) { setConnection('Non atopada','error'); return toast('Partida non atopada'); }
  gameRow=data; state=normalizeState(data.state);
  let existing=state.players.find(p=>p.id===myPlayerId);
  if (!existing) {
    if (state.phase!=='lobby') return toast('A partida xa empezou neste dispositivo');
    if (state.players.some(p=>p.token===token)) return toast('Esa ficha xa está collida');
    const p=newPlayer(name,token); state.players.push(p); log(`${p.name} entrou na partida`);
    if (!await saveState('Entrando…')) return toast('Conflito ao entrar. Téntao outra vez.');
  }
  localStorage.setItem(`monopolis.${code}.playerId`,myPlayerId);
  await subscribe(gameRow.id);
  history.replaceState(null,'',`${location.pathname}?join=${code}`);
  render(); startAmbientIfEnabled(); playSfx('ok');
}

async function subscribe(gameId) {
  if (channel) client.removeChannel(channel);
  channel=client.channel(`monopolis-${gameId}`)
    .on('postgres_changes',{event:'*',schema:'public',table:TABLE,filter:`id=eq.${gameId}`},payload=>{
      if (!payload.new) return;
      const oldState=state;
      const prevTurn=currentPlayer()?.id;
      const prevRoll=state?.lastRoll?.join('-');
      const prevLanding=state?.lastLanding?.ts||0;
      const prevPurchase=state?.lastPurchase?.ts||0;
      gameRow=payload.new; state=normalizeState(payload.new.state); setConnection('En liña','online'); render();
      if (state.phase==='playing') {
        const newTurn=currentPlayer()?.id;
        const newRoll=state.lastRoll?.join('-');
        if (newTurn===myPlayerId && prevTurn!==myPlayerId) { toast('É a túa quenda'); haptic([30,35,30]); playSfx('turn'); }
        if (newRoll && newRoll!==prevRoll) animateDice(...state.lastRoll);
        if ((state.lastLanding?.ts||0)>prevLanding && (state.lastLanding?.ts||0)>lastLandingShown) showLandingZoom(state.lastLanding);
        if ((state.lastPurchase?.ts||0)>prevPurchase && (state.lastPurchase?.ts||0)>lastPurchaseShown) showAssetCardModal(state.lastPurchase.assetId,state.lastPurchase.playerName);
        notifyNewChat(oldState,state);
        notifyNewTrades(oldState,state);
      }
    })
    .subscribe(status=>setConnection(status==='SUBSCRIBED'?'En liña':status.toLowerCase(),status==='SUBSCRIBED'?'online':'muted'));
}

function disconnect() {
  if (channel&&client) client.removeChannel(channel);
  channel=null; gameRow=null; state=null;
}

function mergeUnique(a=[],b=[],key='id') {
  const map=new Map(); [...a,...b].forEach(x=>map.set(x?.[key]||JSON.stringify(x),x));
  return [...map.values()].sort((x,y)=>(x.createdAt||x.ts||0)-(y.createdAt||y.ts||0));
}

async function saveState(pending='Gardando…') {
  if (!gameRow) return false;
  const localSnapshot=structuredClone(state);
  for (let attempt=0;attempt<3;attempt++) {
    setConnection(pending,'muted');
    const nextVersion=(gameRow.version||1)+1;
    const {data,error}=await client.from(TABLE)
      .update({state,version:nextVersion,updated_at:new Date().toISOString()})
      .eq('id',gameRow.id).eq('version',gameRow.version||1).select().single();
    if (!error&&data) { gameRow=data; state=normalizeState(data.state); setConnection('En liña','online'); render(); return true; }
    const fresh=await client.from(TABLE).select('*').eq('id',gameRow.id).single();
    if (!fresh.data) break;
    gameRow=fresh.data;
    const remote=normalizeState(fresh.data.state);
    state=structuredClone(localSnapshot);
    state.chat=mergeUnique(remote.chat,state.chat).slice(-MAX_CHAT);
    state.trades=mergeUnique(remote.trades,state.trades);
    state.log=mergeUnique(remote.log.map((v,i)=>({id:v,ts:i,v})),state.log.map((v,i)=>({id:v,ts:i,v}))).map(x=>x.v).slice(-MAX_LOG);
  }
  setConnection('Conflito','error'); toast('Houbo un conflito de sincronización. Revisa o estado.'); return false;
}

function render() {
  if (!state) return renderSetup();
  if (state.phase==='lobby') return renderLobby();
  renderGame();
}

function isHost(){return state?.hostId===myPlayerId;}
function me(){return state?.players.find(p=>p.id===myPlayerId);}
function activePlayers(){return state?.players.filter(p=>!p.bankrupt)||[];}
function currentPlayer(){return state?.players[state.currentTurn];}
function isMyTurn(){const p=currentPlayer();return p?.id===myPlayerId&&!p.bankrupt;}
function currentSpace(){const p=currentPlayer();return p?BOARD[p.position]:null;}
function mySpace(){const p=me();return p?BOARD[p.position]:null;}
function tokenMeta(id){return TOKENS.find(t=>t.id===id)||TOKENS[0];}
function tokenEmoji(id){return tokenMeta(id).icon;}

function renderLobby() {
  showView('lobbyView');
  $('lobbyCode').textContent=gameRow.code; $('lobbyCount').textContent=state.players.length;
  $('startGameBtn').hidden=!isHost(); $('startGameBtn').disabled=state.players.length<2;
  $('lobbyPlayers').innerHTML=state.players.map(p=>{
    const t=tokenMeta(p.token);
    return `<div class="player-row"><span class="mini-token" style="--token:${t.color}">${t.icon}</span><div class="player-row-copy"><strong>${escapeHtml(p.name)}</strong><small>${p.id===state.hostId?'Host':'Xogador'}</small></div><span class="ready-dot">Listo</span></div>`;
  }).join('');
  renderCodePattern(`${location.origin}${location.pathname}?join=${gameRow.code}`);
}

function renderCodePattern(text) {
  let seed=0; for(const ch of text) seed=(seed*31+ch.charCodeAt(0))>>>0;
  let html='<div class="pattern-grid">';
  for(let i=0;i<169;i++){seed=(seed*1664525+1013904223)>>>0;html+=`<i class="${seed%7<3?'on':''}"></i>`;} html+='</div>';
  $('qrCanvas').innerHTML=html;
}
function gameLink(){return `${location.origin}${location.pathname}?join=${gameRow.code}`;}
function copyLink(){navigator.clipboard?.writeText(gameLink());toast('Ligazón copiada');playSfx('ok');}
async function nativeShare(){if(navigator.share)await navigator.share({title:'O Monopolis',text:`Únete á partida ${gameRow.code}`,url:gameLink()}).catch(()=>{});else copyLink();}

async function startGame(){
  if(!isHost())return;
  state.phase='playing';state.currentTurn=0;state.turnSerial=1;state.hasRolled=false;state.lastRoll=null;state.drawn=null;
  state.turnAction={turnSerial:1,playerId:currentPlayer()?.id,rolled:false,resolved:true};
  log('Comeza a partida');confettiBurst();playSfx('win');await saveState();
}

function renderGame(){
  showView('gameView');
  const cp=currentPlayer();
  $('turnLabel').textContent=cp?.name||'—';
  $('boardSubtitle').textContent=`${gameRow?.code||''} · ${activePlayers().length} xogadores`;
  $('diceLabel').textContent=state.lastRoll?`${state.lastRoll[0]} + ${state.lastRoll[1]} = ${state.lastRoll[0]+state.lastRoll[1]}`:'Sen tirar';
  const ownTurn=isMyTurn();
  $('rollBtn').hidden=!ownTurn||state.hasRolled;
  $('endTurnBtn').hidden=!ownTurn||!state.hasRolled;
  $('endTurnBtn').disabled=!canEndTurn();
  $('endTurnBtn').title=canEndTurn()?'':'Resolve primeiro a casilla';
  $('mainActions').classList.toggle('waiting',!ownTurn);
  $('bankDetails').hidden=!isHost();
  renderTokens();renderBuildings();renderMyStatus();renderScoreboard();renderSpacePanel();renderBankSelect();renderDecks();renderProperties();renderAssetManager();renderTradePanel();renderChat();renderLog();renderHostTicker();
}

function renderTokens(){
  const offsets=[[0,0],[1.1,0],[-1.1,0],[0,1.1],[0,-1.1],[.85,.85],[-.85,-.85],[.85,-.85]];
  $('tokensLayer').innerHTML=state.players.map((p,i)=>{
    const sp=BOARD[p.position]||BOARD[0],off=offsets[i%offsets.length],t=tokenMeta(p.token);
    return `<div class="board-token ${p.id===myPlayerId?'mine':''} ${currentPlayer()?.id===p.id&&!p.bankrupt?'current':''} ${p.bankrupt?'bankrupt':''}" style="left:${sp.x+off[0]}%;top:${sp.y+off[1]}%;--token:${t.color}" title="${escapeHtml(p.name)}"><span class="token-cap">${t.icon}</span><span class="token-stem"></span><span class="token-base"></span><b>${escapeHtml(p.name)}</b></div>`;
  }).join('');
}

function renderBuildings(){
  const html=[];
  for(const [id,ps] of Object.entries(state.properties||{})){
    if(!PROPERTY_DATA[id]||!ps.houses)continue;
    const sp=BOARD.find(s=>s.propertyId===id);if(!sp)continue;
    let x=sp.x,y=sp.y;if(y>85)y-=4;else if(y<15)y+=4;else if(x<15)x+=4;else if(x>85)x-=4;
    const pieces=ps.houses>=5?'<i class="hotel"></i>':Array.from({length:ps.houses},()=>'<i class="house"></i>').join('');
    html.push(`<span class="building" style="left:${x}%;top:${y}%">${pieces}</span>`);
  }
  $('buildingsLayer').innerHTML=html.join('');
}

function renderMyStatus(){
  const p=me();if(!p)return;
  const sp=BOARD[p.position],owned=Object.values(state.properties).filter(v=>v.ownerId===p.id).length,t=tokenMeta(p.token);
  $('myStatus').innerHTML=`<div class="status-top"><span class="mini-token large" style="--token:${t.color}">${t.icon}</span><div><p class="eyebrow">A túa ficha</p><h3>${escapeHtml(p.name)}</h3></div>${isMyTurn()?'<span class="turn-chip">A túa quenda</span>':''}</div><div class="balance">${fmt(p.money)}</div><div class="status-stats"><span>📍 ${escapeHtml(sp?.name||'—')}</span><span>Escrituras: ${owned}</span><span>Patrimonio: ${fmt(netWorth(p))}</span></div><div class="pot-row"><span>Bote Casa do Pobo</span><strong>${fmt(state.freePot)}</strong></div>${p.keptCards?.length?`<div class="kept-cards"><strong>Cartas gardadas</strong>${p.keptCards.map(c=>`<span>${escapeHtml(c)}</span>`).join('')}</div>`:''}`;
}

function assetData(id){return PROPERTY_DATA[id]||STATION_DATA[id]||SERVICE_DATA[id];}
function assetType(id){return PROPERTY_DATA[id]?'property':STATION_DATA[id]?'station':SERVICE_DATA[id]?'service':null;}
function propertyIdOf(space){return space?.propertyId||space?.stationId||space?.serviceId||null;}
function spaceInfo(space){const id=propertyIdOf(space);return id?assetData(id):{};}
function propertyState(space){const id=propertyIdOf(space);return id?state.properties[id]:null;}

function netWorth(player){
  let total=player?.money||0;
  for(const[id,ps]of Object.entries(state.properties||{}))if(ps.ownerId===player.id){const d=assetData(id);if(!d)continue;total+=ps.mortgaged?d.mortgage:d.price;if(PROPERTY_DATA[id]&&ps.houses)total+=ps.houses*d.houseCost*.5;}
  return Math.round(total);
}

function renderScoreboard(){
  $('scoreboardPanel').innerHTML=[...state.players].sort((a,b)=>netWorth(b)-netWorth(a)).map((p,i)=>`<div class="score-row ${p.id===myPlayerId?'me':''} ${p.bankrupt?'out':''}"><span>${i+1}</span><strong>${tokenEmoji(p.token)} ${escapeHtml(p.name)}</strong><b>${fmt(netWorth(p))}</b></div>`).join('');
}

function actionForCurrent(){return state.turnAction&&state.turnAction.turnSerial===state.turnSerial&&state.turnAction.playerId===currentPlayer()?.id?state.turnAction:null;}
function canEndTurn(){return isMyTurn()&&state.hasRolled&&!!actionForCurrent()?.resolved;}
function actionAllowed(kind){const a=actionForCurrent();return isMyTurn()&&state.hasRolled&&a&&!a.resolved&&a.kind===kind;}

function renderSpacePanel(){
  const p=currentPlayer(),space=p?BOARD[p.position]:null,data=spaceInfo(space),ps=propertyState(space),a=actionForCurrent();
  let html=`<div class="section-heading compact"><div><p class="eyebrow">Casilla actual</p><h3>${escapeHtml(space?.name||'—')}</h3></div>${a?.resolved?'<span class="resolved-chip">Resolto</span>':isMyTurn()&&state.hasRolled?'<span class="pending-chip">Pendiente</span>':''}</div>`;
  const buttons=[];
  if(!space){$('spacePanel').innerHTML=html;return;}
  const id=propertyIdOf(space);
  if(id){
    const owner=ps?.ownerId?state.players.find(x=>x.id===ps.ownerId):null;
    html+=`<p class="space-meta">${assetType(id)==='service'?'Servizo':assetType(id)==='station'?'Estación':'Propiedade'} · Compra ${fmt(data.price)} · Hipoteca ${fmt(data.mortgage)}</p>`;
    if(owner)html+=`<div class="owner-line"><span>Dono</span><strong>${tokenEmoji(owner.token)} ${escapeHtml(owner.name)}</strong>${ps.mortgaged?'<em>Hipotecada</em>':''}</div>`;
    if(actionAllowed('buy')){buttons.push(`<button class="primary-button" onclick="window.gameActions.buyCurrent()">Comprar por ${fmt(data.price)}</button>`);buttons.push(`<button class="text-button" onclick="window.gameActions.skipPurchase()">Non comprar</button>`);}
    if(actionAllowed('rent'))buttons.push(`<button class="primary-button" onclick="window.gameActions.payRent()">Pagar ${fmt(calcRent(space))}</button>`);
    if(owner?.id===p?.id)html+='<p class="helper">É túa: non hai ningún pago nesta quenda.</p>';
  } else if(space.type==='event') {
    html+='<p class="space-meta">Colle unha única carta do mazo de Eventos.</p>';if(actionAllowed('event'))buttons.push('<button class="primary-button" onclick="window.gameActions.drawEvent()">Coller evento</button>');
  } else if(space.type==='caixa') {
    html+='<p class="space-meta">Colle unha única carta do mazo de Diñeiro.</p>';if(actionAllowed('money'))buttons.push('<button class="primary-button" onclick="window.gameActions.drawMoney()">Coller diñeiro</button>');
  } else if(space.type==='fee') html+=`<p class="space-meta">Pagaches ${fmt(space.fee||1500)} ao bote da Casa do Pobo.</p>`;
  else if(space.type==='parking') html+=`<p class="space-meta">Casa do Pobo: cobras o bote acumulado. Bote actual: ${fmt(state.freePot)}</p>`;
  else if(space.id==='campo-futbol') html+='<p class="space-meta">Pachanga na Granxa Eloi. Caer aquí normalmente non ten penalización.</p>';
  else if(space.type==='go') html+=`<p class="space-meta">Ao pasar por Piornedo cobras ${fmt(PASS_GO_AMOUNT)}.</p>`;
  else html+='<p class="space-meta">Casilla de descanso: non hai acción obrigatoria.</p>';
  if(state.drawn)html+=`<div class="last-card"><strong>${escapeHtml(state.drawn.kind)}</strong><span>${escapeHtml(state.drawn.text)}</span></div>`;
  html+=`<div class="landing-actions">${buttons.join('')}</div>`;
  if(!isMyTurn())html+='<p class="waiting-note">Agardando pola acción do xogador actual.</p>';
  $('spacePanel').innerHTML=html;
}

function renderDecks(){
  $('eventDeckCount').textContent=`${state.decks.event.length} cartas`;$('moneyDeckCount').textContent=`${state.decks.money.length} cartas`;
  $('eventDeckBtn').disabled=!actionAllowed('event');$('moneyDeckBtn').disabled=!actionAllowed('money');
}

function renderProperties(){
  const items=Object.entries(state.properties||{}).sort(([a],[b])=>BOARD.findIndex(s=>propertyIdOf(s)===a)-BOARD.findIndex(s=>propertyIdOf(s)===b));
  $('propertyPanel').innerHTML=items.length?items.map(([id,ps])=>{const d=assetData(id),o=state.players.find(p=>p.id===ps.ownerId);return `<article class="property-row"><span class="asset-mark ${PROPERTY_DATA[id]?`group-${d.group}`:STATION_DATA[id]?'station':'service'}"></span><div><strong>${escapeHtml(d?.name||id)}</strong><small>${escapeHtml(o?.name||'Sen dono')}${ps.mortgaged?' · hipotecada':''}${ps.houses?` · ${ps.houses===5?'hotel':`${ps.houses} casas`}`:''}</small></div><b>${fmt(d?.price||0)}</b></article>`;}).join(''):'<p class="empty-state">Aínda non hai propiedades compradas.</p>';
}

function renderAssetManager(){
  const owned=Object.entries(state.properties||{}).filter(([,v])=>v.ownerId===myPlayerId);
  $('manageAssetSelect').innerHTML=owned.length?owned.map(([id,ps])=>`<option value="${id}">${escapeHtml(assetData(id)?.name||id)}${ps.mortgaged?' · hipotecada':''}</option>`).join(''):'<option value="">Sen propiedades</option>';
  $('sellHouseBtn').disabled=!owned.some(([id,ps])=>PROPERTY_DATA[id]&&ps.houses>0);
  $('mortgageAssetBtn').disabled=!owned.length;
}

function renderBankSelect(){$('bankPlayer').innerHTML=state.players.map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');}
function renderLog(){$('logPanel').innerHTML=(state.log||[]).slice(-60).reverse().map(x=>`<div>${escapeHtml(x)}</div>`).join('');}

function movePlayer(p,steps,passGo=true){const old=p.position,len=BOARD.length;let next=(old+steps)%len;if(next<0)next+=len;if(passGo&&steps>0&&old+steps>=len){p.money+=PASS_GO_AMOUNT;log(`${p.name} pasa por Piornedo e cobra ${fmt(PASS_GO_AMOUNT)}`);}p.position=next;}
function moveTo(p,spaceId,passGo=false){const target=BOARD.findIndex(s=>s.id===spaceId||propertyIdOf(s)===spaceId);if(target<0)return;if(passGo&&target<p.position){p.money+=PASS_GO_AMOUNT;log(`${p.name} pasa por Piornedo e cobra ${fmt(PASS_GO_AMOUNT)}`);}p.position=target;}

function prepareLandingAction(p,{fromCard=false}={}){
  const space=BOARD[p.position],id=propertyIdOf(space);
  const action={id:uid(),turnSerial:state.turnSerial,playerId:p.id,position:p.position,kind:'none',resolved:false,createdAt:Date.now()};
  if(id){
    const ps=state.properties[id];
    if(!ps){action.kind='buy';}
    else if(ps.ownerId===p.id||ps.mortgaged){action.kind='none';action.resolved=true;}
    else {action.kind='rent';}
  } else if(space.type==='event') action.kind='event';
  else if(space.type==='caixa') action.kind='money';
  else if(space.type==='fee'){
    const fee=space.fee||1500;p.money-=fee;state.freePot+=fee;action.resolved=true;log(`${p.name} paga ${fmt(fee)} en Caixa Veciñal`);playSfx('pay');
  } else if(space.type==='parking'){
    const pot=state.freePot||0;if(pot>0){p.money+=pot;state.freePot=0;log(`${p.name} leva ${fmt(pot)} da Casa do Pobo`);confettiBurst(80);playSfx('win');}else log(`${p.name} chega á Casa do Pobo, pero o bote está baleiro`);action.resolved=true;
  } else {action.resolved=true;if(space.id==='campo-futbol'&&!fromCard)log(`${p.name} bota unha pachanga na Granxa Eloi`);}
  state.turnAction=action;return action;
}

async function rollDice(){
  if(!isMyTurn()||state.hasRolled)return;
  const p=currentPlayer();if(!p||p.bankrupt)return;
  if(p.skipTurns>0){p.skipTurns--;log(`${p.name} perde a quenda por traballar na granxa`);nextTurn();playSfx('bad');haptic([30,30,30]);await saveState();return;}
  const d1=1+Math.floor(Math.random()*6),d2=1+Math.floor(Math.random()*6);
  state.lastRoll=[d1,d2];state.hasRolled=true;state.drawn=null;animateDice(d1,d2);playSfx('roll');haptic(25);
  movePlayer(p,d1+d2);prepareLandingAction(p);
  state.lastLanding={position:p.position,playerId:p.id,playerName:p.name,spaceName:BOARD[p.position].name,ts:Date.now()};
  log(`${p.name} tira ${d1}+${d2} e cae en ${BOARD[p.position].name}`);
  await saveState();setTimeout(fitBoardToMe,350);setTimeout(()=>showLandingZoom(state.lastLanding),160);
}

function animateDice(d1,d2){
  const rotations={1:'rotateX(-18deg) rotateY(30deg)',2:'rotateX(-108deg) rotateY(28deg)',3:'rotateX(-18deg) rotateY(-60deg)',4:'rotateX(-18deg) rotateY(120deg)',5:'rotateX(72deg) rotateY(28deg)',6:'rotateX(-18deg) rotateY(210deg)'};
  [$('diceCube1'),$('diceCube2')].forEach((cube,i)=>{cube.style.setProperty('--dice-final',rotations[[d1,d2][i]]);cube.classList.remove('rolling');void cube.offsetWidth;setTimeout(()=>cube.classList.add('rolling'),i*70);});
  $('diceLabel').textContent=`${d1} + ${d2} = ${d1+d2}`;
}

function nextTurn(){
  state.hasRolled=false;state.drawn=null;state.lastRoll=null;state.turnSerial++;
  if(!activePlayers().length)return;
  let next=state.currentTurn;for(let i=0;i<state.players.length;i++){next=(next+1)%state.players.length;if(!state.players[next].bankrupt){state.currentTurn=next;break;}}
  state.turnAction={turnSerial:state.turnSerial,playerId:currentPlayer()?.id,rolled:false,resolved:true};
}

async function endTurn(){if(!isMyTurn())return;if(!canEndTurn())return toast('Resolve primeiro a casilla');nextTurn();playSfx('turn');haptic(15);await saveState();}

async function buyCurrent(){
  if(!actionAllowed('buy'))return;
  const space=currentSpace(),id=propertyIdOf(space),d=assetData(id),p=currentPlayer();
  if(!id||state.properties[id])return;if(p.money<d.price)return toast('Non tes diñeiro suficiente');
  p.money-=d.price;state.properties[id]={ownerId:p.id,mortgaged:false,houses:0};state.turnAction.resolved=true;state.turnAction.purchaseDone=true;
  state.lastPurchase={assetId:id,playerId:p.id,playerName:p.name,ts:Date.now()};log(`${p.name} compra ${d.name} por ${fmt(d.price)}`);playSfx('buy');haptic([18,22,18]);confettiBurst(55);showAssetCardModal(id,p.name);await saveState();
}
async function skipPurchase(){if(!actionAllowed('buy'))return;state.turnAction.resolved=true;log(`${currentPlayer().name} non compra ${currentSpace().name}`);await saveState();}

function calcRent(space){
  const id=propertyIdOf(space),ps=state.properties[id];if(!ps||ps.mortgaged)return 0;
  if(STATION_DATA[id]){const count=Object.entries(state.properties).filter(([pid,v])=>STATION_DATA[pid]&&v.ownerId===ps.ownerId&&!v.mortgaged).length;return STATION_DATA[id].rents[Math.max(0,count-1)];}
  if(SERVICE_DATA[id]){const count=Object.entries(state.properties).filter(([pid,v])=>SERVICE_DATA[pid]&&v.ownerId===ps.ownerId&&!v.mortgaged).length;const dice=(state.lastRoll?.[0]||0)+(state.lastRoll?.[1]||0);return dice*SERVICE_DATA[id].multipliers[Math.max(0,count-1)];}
  const d=PROPERTY_DATA[id],houses=ps.houses||0;let rent=d.rents[Math.min(houses,5)];if(houses===0&&ownsFullGroup(ps.ownerId,d.group))rent*=2;return rent;
}
function ownsFullGroup(ownerId,group){return Object.entries(PROPERTY_DATA).filter(([,d])=>d.group===group).every(([id])=>state.properties[id]?.ownerId===ownerId&&!state.properties[id]?.mortgaged);}

async function payRent(){
  if(!actionAllowed('rent'))return;
  const space=currentSpace(),id=propertyIdOf(space),ps=state.properties[id],payer=currentPlayer(),owner=state.players.find(p=>p.id===ps.ownerId);if(!owner||owner.id===payer.id)return;
  const rent=calcRent(space);payer.money-=rent;owner.money+=rent;state.turnAction.resolved=true;state.turnAction.paymentDone=true;
  log(`${payer.name} paga ${fmt(rent)} a ${owner.name} por ${space.name}`);playSfx('pay');haptic(22);await saveState();
}

async function buildCurrent(id){
  id ||= $('manageAssetSelect').value;const ps=state.properties[id],d=PROPERTY_DATA[id],p=me();
  if(!ps||ps.ownerId!==myPlayerId||!d)return;if(!ownsFullGroup(p.id,d.group))return toast('Necesitas o grupo completo');if(ps.houses>=5)return toast('Xa ten hotel');if(p.money<d.houseCost)return toast('Non tes diñeiro suficiente');
  p.money-=d.houseCost;ps.houses=(ps.houses||0)+1;log(`${p.name} constrúe en ${d.name}`);playSfx('build');confettiBurst(35);await saveState();
}
async function sellHouseSelected(){const id=$('manageAssetSelect').value,ps=state.properties[id],d=PROPERTY_DATA[id],p=me();if(!ps||!d||ps.ownerId!==p.id||!ps.houses)return toast('Escolle unha propiedade con construcións');const refund=Math.round(d.houseCost/2);ps.houses--;p.money+=refund;log(`${p.name} vende unha construción en ${d.name} por ${fmt(refund)}`);playSfx('pay');await saveState();}
async function toggleMortgageSelected(){const id=$('manageAssetSelect').value,ps=state.properties[id],d=assetData(id),p=me();if(!ps||!d||ps.ownerId!==p.id)return;if(ps.mortgaged){const cost=Math.ceil(d.mortgage*1.1/10)*10;if(p.money<cost)return toast('Non tes diñeiro suficiente');p.money-=cost;ps.mortgaged=false;log(`${p.name} libera ${d.name} por ${fmt(cost)}`);}else{if(ps.houses)return toast('Vende as construcións antes de hipotecar');p.money+=d.mortgage;ps.mortgaged=true;log(`${p.name} hipoteca ${d.name} por ${fmt(d.mortgage)}`);}playSfx('ok');await saveState();}

async function drawEvent(){if(!actionAllowed('event'))return;drawFromDeck('event');playSfx('card');haptic([15,25,15]);await saveState();}
async function drawMoney(){if(!actionAllowed('money'))return;drawFromDeck('money');playSfx('card');haptic([15,25,15]);await saveState();}

function drawFromDeck(kind){
  const arr=kind==='event'?EVENT_CARDS:MONEY_CARDS;if(!state.decks[kind]?.length)state.decks[kind]=shuffle(arr);
  const idx=state.decks[kind].shift(),card=arr[idx];state.decks[kind].push(idx);const p=currentPlayer();state.turnAction.resolved=true;state.turnAction.cardDrawn=true;
  if(kind==='money'){
    if(card.amount){p.money+=card.amount;if(card.amount<0)state.freePot+=Math.abs(card.amount);log(`${p.name}: ${card.text} ${card.amount>0?'Cobra':'Paga'} ${fmt(Math.abs(card.amount))}`);}
    else if(card.each){for(const pl of activePlayers())pl.money+=card.each;if(card.each<0)state.freePot+=Math.abs(card.each)*activePlayers().length;log(`${card.text} ${fmt(Math.abs(card.each))} por persoa`);}
    state.drawn={kind:'DIÑEIRO',text:card.text,amount:card.amount||card.each||0};showCardModal('DIÑEIRO',card.amount||card.each||0,card.text);if((card.amount||card.each)>0)confettiBurst(30);return;
  }
  state.drawn={kind:'EVENTO',text:card.text};showCardModal('EVENTO',0,card.text);applyEvent(card,p);
}

function applyEvent(card,p){
  const a=card.action||{type:'manual'},land=()=>{prepareLandingAction(p,{fromCard:true});state.lastLanding={position:p.position,playerId:p.id,playerName:p.name,spaceName:BOARD[p.position].name,ts:Date.now()};};
  if(a.type==='moveTo'){moveTo(p,a.spaceId,a.passGo);if(a.skip)p.skipTurns+=a.skip;land();log(`${p.name}: ${card.text}`);}
  else if(a.type==='moveToPay'){moveTo(p,a.spaceId,false);p.money-=a.amount;state.freePot+=Math.abs(a.amount);land();log(`${p.name}: ${card.text} Paga ${fmt(a.amount)}`);}
  else if(a.type==='moveRelative'){movePlayer(p,a.delta,false);land();log(`${p.name}: ${card.text}`);}
  else if(a.type==='goToFarm'){moveTo(p,'campo-futbol',false);const saved=consumeFarmEscapeCard(p);if(saved)log(`${p.name} usa “${saved}” e libra da granxa`);else{p.skipTurns+=a.turns||2;log(`${p.name} vai á granxa e perde ${a.turns||2} quendas`);}state.turnAction.resolved=true;state.lastLanding={position:p.position,playerId:p.id,playerName:p.name,spaceName:BOARD[p.position].name,ts:Date.now()};}
  else if(a.type==='skip'){p.skipTurns+=a.turns||1;state.turnAction.resolved=true;log(`${p.name}: ${card.text}`);}
  else if(a.type==='keep'){p.keptCards.push(a.label);state.turnAction.resolved=true;log(`${p.name} garda: ${a.label}`);}
  else if(a.type==='takeProperty'){const ps=state.properties[a.propertyId];if(!ps)state.properties[a.propertyId]={ownerId:p.id,mortgaged:false,houses:0};else ps.ownerId=p.id;state.turnAction.resolved=true;log(`${p.name} queda con ${PROPERTY_DATA[a.propertyId]?.name||a.propertyId}`);confettiBurst();}
  else {state.turnAction.resolved=true;log(`${p.name} colle evento: ${card.text}`);}
}
function consumeFarmEscapeCard(p){const i=p.keptCards.findIndex(c=>/granxa|alcalde|Libre/i.test(c));if(i<0)return null;return p.keptCards.splice(i,1)[0];}

function renderTradePanel(){
  const pending=state.trades.filter(t=>t.status==='pending'&&(t.toId===myPlayerId||t.fromId===myPlayerId));
  const incoming=pending.filter(t=>t.toId===myPlayerId).length;$('tradeBadge').textContent=incoming;$('tradeBadge').classList.toggle('hidden',!incoming);
  $('tradeInbox').innerHTML=pending.length?pending.slice().reverse().map(renderTradeCard).join(''):'<p class="empty-state">Non hai propostas pendentes.</p>';
  $('tradeToPlayer').innerHTML=state.players.filter(p=>p.id!==myPlayerId&&!p.bankrupt).map(p=>`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')||'<option value="">Sen xogadores</option>';
  renderTradeComposerLists();
}
function bundleText(props=[],money=0){const names=props.map(id=>assetData(id)?.name||id);if(money>0)names.push(fmt(money));return names.length?names.join(', '):'Nada';}
function renderTradeCard(t){const from=state.players.find(p=>p.id===t.fromId),to=state.players.find(p=>p.id===t.toId),incoming=t.toId===myPlayerId;return `<article class="trade-request"><div class="trade-request-head"><strong>${incoming?'Proposta de':'Proposta para'} ${escapeHtml(incoming?from?.name:to?.name)}</strong><small>Revisión ${t.revision||1}</small></div><div class="trade-summary"><span><b>${escapeHtml(from?.name||'')}</b> entrega ${escapeHtml(bundleText(t.offerProps,t.offerMoney))}</span><span><b>${escapeHtml(to?.name||'')}</b> entrega ${escapeHtml(bundleText(t.askProps,t.askMoney))}</span></div><div class="trade-actions">${incoming?`<button onclick="window.gameActions.acceptTrade('${t.id}')">Aceptar</button><button onclick="window.gameActions.prepareCounterTrade('${t.id}')">Modificar</button><button class="text-button" onclick="window.gameActions.rejectTrade('${t.id}')">Rexeitar</button>`:`<button class="text-button" onclick="window.gameActions.cancelTrade('${t.id}')">Cancelar</button>`}</div></article>`;}
function ownedTradeable(playerId){return Object.entries(state.properties).filter(([,ps])=>ps.ownerId===playerId&&!ps.houses).map(([id])=>id);}
function renderTradeComposerLists(){
  const toId=$('tradeToPlayer').value;const give=ownedTradeable(myPlayerId),ask=ownedTradeable(toId);
  $('tradeGiveProps').innerHTML=give.length?give.map(id=>`<label class="check-item"><input type="checkbox" name="tradeGiveProp" value="${id}"/><span>${escapeHtml(assetData(id).name)}</span></label>`).join(''):'<p class="empty-state">Sen bens transferibles</p>';
  $('tradeAskProps').innerHTML=ask.length?ask.map(id=>`<label class="check-item"><input type="checkbox" name="tradeAskProp" value="${id}"/><span>${escapeHtml(assetData(id).name)}</span></label>`).join(''):'<p class="empty-state">Sen bens transferibles</p>';
}
function checkedValues(name){return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x=>x.value);}
async function sendTradeRequest(){
  const from=me(),toId=$('tradeToPlayer').value,to=state.players.find(p=>p.id===toId);if(!from||!to)return toast('Escolle outro xogador');
  const offerProps=checkedValues('tradeGiveProp'),askProps=checkedValues('tradeAskProp'),offerMoney=Math.max(0,+$('tradeGiveMoney').value||0),askMoney=Math.max(0,+$('tradeAskMoney').value||0);
  if(!offerProps.length&&!askProps.length&&!offerMoney&&!askMoney)return toast('A proposta está baleira');if(offerMoney>from.money)return toast('Non tes ese diñeiro');
  const parentId=$('counterTradeId').value||null,parent=state.trades.find(t=>t.id===parentId);if(parent)parent.status='countered';
  const trade={id:uid(),fromId:from.id,toId:to.id,offerProps,askProps,offerMoney,askMoney,status:'pending',revision:(parent?.revision||0)+1,counterOf:parentId,createdAt:Date.now()};
  state.trades.push(trade);log(`${from.name} envía unha proposta a ${to.name}`);clearTradeComposer();playSfx('ok');await saveState();
}
function validateTrade(t){const from=state.players.find(p=>p.id===t.fromId),to=state.players.find(p=>p.id===t.toId);if(!from||!to||from.money<t.offerMoney||to.money<t.askMoney)return false;return t.offerProps.every(id=>state.properties[id]?.ownerId===from.id&&!state.properties[id]?.houses)&&t.askProps.every(id=>state.properties[id]?.ownerId===to.id&&!state.properties[id]?.houses);}
async function acceptTrade(id){const t=state.trades.find(x=>x.id===id);if(!t||t.toId!==myPlayerId||t.status!=='pending')return;if(!validateTrade(t))return toast('A proposta xa non é válida');const from=state.players.find(p=>p.id===t.fromId),to=state.players.find(p=>p.id===t.toId);t.offerProps.forEach(id=>state.properties[id].ownerId=to.id);t.askProps.forEach(id=>state.properties[id].ownerId=from.id);from.money-=t.offerMoney;to.money+=t.offerMoney;to.money-=t.askMoney;from.money+=t.askMoney;t.status='accepted';t.resolvedAt=Date.now();log(`${to.name} acepta o intercambio con ${from.name}`);playSfx('win');confettiBurst(35);await saveState();}
async function rejectTrade(id){const t=state.trades.find(x=>x.id===id);if(!t||t.toId!==myPlayerId)return;t.status='rejected';t.resolvedAt=Date.now();await saveState();}
async function cancelTrade(id){const t=state.trades.find(x=>x.id===id);if(!t||t.fromId!==myPlayerId)return;t.status='cancelled';t.resolvedAt=Date.now();await saveState();}
function prepareCounterTrade(id){const t=state.trades.find(x=>x.id===id);if(!t||t.toId!==myPlayerId)return;$('tradeToPlayer').value=t.fromId;$('counterTradeId').value=t.id;$('tradeGiveMoney').value=t.askMoney||0;$('tradeAskMoney').value=t.offerMoney||0;$('sendTradeBtn').textContent='Enviar contraproposta';$('cancelCounterBtn').classList.remove('hidden');renderTradeComposerLists();setTimeout(()=>{t.askProps.forEach(id=>document.querySelector(`input[name="tradeGiveProp"][value="${CSS.escape(id)}"]`)?.click());t.offerProps.forEach(id=>document.querySelector(`input[name="tradeAskProp"][value="${CSS.escape(id)}"]`)?.click());},0);}
function clearTradeComposer(){$('counterTradeId').value='';$('tradeGiveMoney').value=0;$('tradeAskMoney').value=0;$('sendTradeBtn').textContent='Enviar proposta';$('cancelCounterBtn').classList.add('hidden');renderTradeComposerLists();}

function renderChat(){
  const messages=(state.chat||[]).slice(-50);$('chatMessages').innerHTML=messages.length?messages.map(m=>`<div class="chat-message ${m.playerId===myPlayerId?'mine':''}"><span>${escapeHtml(m.name)}</span><p>${escapeHtml(m.text)}</p><time>${new Date(m.createdAt).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</time></div>`).join(''):'<p class="empty-state">Aínda non hai mensaxes.</p>';
  const box=$('chatMessages');box.scrollTop=box.scrollHeight;const unread=messages.filter(m=>m.playerId!==myPlayerId&&m.createdAt>lastSeenChatAt).length;$('chatBadge').textContent=unread;$('chatBadge').classList.toggle('hidden',!unread);lastSeenChatAt=Math.max(lastSeenChatAt,...messages.map(m=>m.createdAt||0),0);
}
async function sendChat(){const input=$('chatInput'),text=input.value.trim(),p=me();if(!text||!p)return;state.chat.push({id:uid(),playerId:p.id,name:p.name,text:text.slice(0,220),createdAt:Date.now()});state.chat=state.chat.slice(-MAX_CHAT);input.value='';playSfx('chat');await saveState('Enviando…');}
function notifyNewChat(oldS,newS){const oldLast=Math.max(...(oldS?.chat||[]).map(m=>m.createdAt||0),0);const fresh=(newS.chat||[]).filter(m=>m.createdAt>oldLast&&m.playerId!==myPlayerId);if(fresh.length&&currentDisplayMode!=='host')playSfx('chat');}
function notifyNewTrades(oldS,newS){const oldIds=new Set((oldS?.trades||[]).map(t=>t.id));const fresh=(newS.trades||[]).filter(t=>!oldIds.has(t.id)&&t.toId===myPlayerId);if(fresh.length){toast('Tes unha nova proposta de intercambio');playSfx('turn');}}
function renderHostTicker(){const latest=(state.chat||[]).slice(-2);$('hostTicker').classList.toggle('hidden',currentDisplayMode!=='host'||!latest.length);$('hostTicker').innerHTML=latest.map(m=>`<span><b>${escapeHtml(m.name)}:</b> ${escapeHtml(m.text)}</span>`).join('');}

async function declareBankruptcy(){const p=me();if(!p||p.bankrupt)return;if(!confirm('Declararte en bancarrota? As túas propiedades quedarán libres.'))return;p.bankrupt=true;p.money=0;p.skipTurns=0;for(const[id,ps]of Object.entries(state.properties))if(ps.ownerId===p.id)delete state.properties[id];log(`${p.name} declara bancarrota`);if(isMyTurn())nextTurn();playSfx('bad');await saveState();}
async function manualBank(amount){if(!isHost())return;const p=state.players.find(x=>x.id===$('bankPlayer').value);if(!p||!amount)return;p.money+=amount;if(amount<0)state.freePot+=Math.abs(amount);log(`${p.name}: ${amount>0?'ingreso':'cobro'} manual de ${fmt(Math.abs(amount))}`);playSfx(amount>0?'buy':'pay');await saveState();}

function fitBoardToMe(){if(currentDisplayMode==='player')return;const p=me()||currentPlayer();if(!p)return;const sp=BOARD[p.position],scroll=$('boardScroll'),wrap=$('boardWrap');const x=wrap.scrollWidth*sp.x/100-scroll.clientWidth/2,y=wrap.scrollHeight*sp.y/100-scroll.clientHeight/2;scroll.scrollTo({left:Math.max(0,x),top:Math.max(0,y),behavior:'smooth'});}
function toggleZoom(){zoomed=!zoomed;$('boardWrap').classList.toggle('zoomed',zoomed);$('zoomBoardBtn').textContent=zoomed?'Reducir':'Ampliar';setTimeout(fitBoardToMe,250);}

function showLandingZoom(landing){
  if(!landing||!BOARD[landing.position]||currentDisplayMode==='player')return;
  lastLandingShown=landing.ts||Date.now();const sp=BOARD[landing.position],overlay=$('landingZoom'),viewport=$('landingViewport'),img=$('landingBoardImg'),marker=$('landingMarker');
  $('landingPlayer').textContent=landing.playerName||'Xogador';$('landingTitle').textContent=sp.name;$('landingSubtitle').textContent=landingDetail(sp);
  overlay.classList.remove('hidden');overlay.classList.add('visible');img.style.transition='none';img.style.transform='translate(0px,0px) scale(1)';marker.style.opacity='0';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{const w=viewport.clientWidth,h=viewport.clientHeight,scale=(sp.x<15||sp.x>85||sp.y<15||sp.y>85)?3.35:4.25;let tx=w/2-sp.x/100*w*scale,ty=h/2-sp.y/100*h*scale;tx=Math.min(0,Math.max(w-w*scale,tx));ty=Math.min(0,Math.max(h-h*scale,ty));img.style.transition='transform .62s cubic-bezier(.2,.8,.2,1)';img.style.transform=`translate(${tx}px,${ty}px) scale(${scale})`;marker.style.left=`${sp.x/100*w*scale+tx}px`;marker.style.top=`${sp.y/100*h*scale+ty}px`;marker.style.opacity='1';}));
  clearTimeout(showLandingZoom._out);showLandingZoom._out=setTimeout(()=>{img.style.transform='translate(0px,0px) scale(1)';marker.style.opacity='0';},1900);clearTimeout(showLandingZoom._hide);showLandingZoom._hide=setTimeout(()=>{overlay.classList.remove('visible');overlay.classList.add('hidden');},2550);
}
function landingDetail(sp){const id=propertyIdOf(sp),d=id?assetData(id):null;if(d)return `${assetType(id)==='service'?'Servizo':assetType(id)==='station'?'Estación':'Propiedade'} · ${fmt(d.price)}`;if(sp.type==='event')return 'Cartiña de Eventos';if(sp.type==='caixa')return 'Cartiña de Diñeiro';if(sp.type==='fee')return `Pago de ${fmt(sp.fee||1500)}`;return 'Casilla especial';}

function assetCardHTML(id,ownerName=''){const d=assetData(id);if(!d)return'';if(STATION_DATA[id])return `<div class="title-card station-card"><header>ESTACIÓN</header><h3>${escapeHtml(d.name)}</h3><dl><div><dt>Prezo</dt><dd>${fmt(d.price)}</dd></div><div><dt>1 estación</dt><dd>${fmt(d.rents[0])}</dd></div><div><dt>2 estacións</dt><dd>${fmt(d.rents[1])}</dd></div><div><dt>3 estacións</dt><dd>${fmt(d.rents[2])}</dd></div><div><dt>4 estacións</dt><dd>${fmt(d.rents[3])}</dd></div><div><dt>Hipoteca</dt><dd>${fmt(d.mortgage)}</dd></div></dl>${ownerName?`<footer>Dono: ${escapeHtml(ownerName)}</footer>`:''}</div>`;if(SERVICE_DATA[id])return `<div class="title-card service-card"><header>SERVIZO</header><h3>${escapeHtml(d.name)}</h3><p>O aluguer depende da tirada de dados.</p><dl>${d.multipliers.map((m,i)=>`<div><dt>${i+1} servizo${i?'s':''}</dt><dd>${m} × dados</dd></div>`).join('')}<div><dt>Hipoteca</dt><dd>${fmt(d.mortgage)}</dd></div></dl>${ownerName?`<footer>Dono: ${escapeHtml(ownerName)}</footer>`:''}</div>`;return `<div class="title-card property-card"><header class="group-${d.group}">${escapeHtml(d.name)}</header><dl><div><dt>Prezo</dt><dd>${fmt(d.price)}</dd></div><div><dt>Aluguer</dt><dd>${fmt(d.rents[0])}</dd></div>${d.rents.slice(1,5).map((r,i)=>`<div><dt>${i+1} casa${i?'s':''}</dt><dd>${fmt(r)}</dd></div>`).join('')}<div><dt>Hotel</dt><dd>${fmt(d.rents[5])}</dd></div><div><dt>Casa / hotel</dt><dd>${fmt(d.houseCost)}</dd></div><div><dt>Hipoteca</dt><dd>${fmt(d.mortgage)}</dd></div></dl>${ownerName?`<footer>Dono: ${escapeHtml(ownerName)}</footer>`:''}</div>`;}
function showAssetCardModal(id,ownerName=''){const d=assetData(id);if(!d)return;lastPurchaseShown=state?.lastPurchase?.ts||Date.now();$('modalVisual').textContent=SERVICE_DATA[id]?'⚙':STATION_DATA[id]?'↔':'⌂';$('modalKind').textContent='Título de propiedade';$('modalTitle').textContent=d.name;$('modalText').innerHTML=assetCardHTML(id,ownerName);openModal();}
function showCardModal(kind,amount,text){$('modalVisual').textContent=kind==='DIÑEIRO'?'€':'?';$('modalKind').textContent=kind;$('modalTitle').textContent=amount?(amount>0?`Cobras ${fmt(amount)}`:`Pagas ${fmt(Math.abs(amount))}`):kind;$('modalText').innerHTML=`<p class="card-copy">${escapeHtml(text)}</p>`;openModal();}
function openModal(){const m=$('cardModal');m.classList.remove('hidden');m.classList.remove('animate');void m.offsetWidth;m.classList.add('animate');}
function closeModal(){$('cardModal').classList.add('hidden');}

function log(text){state.log.push(`${now()} · ${text}`);state.log=state.log.slice(-MAX_LOG);}
function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('show'),2600);}
function haptic(pattern){if('vibrate'in navigator)navigator.vibrate(pattern);}
function setAudioButtons(){$('soundBtn').classList.toggle('active',soundEnabled);$('soundBtn').textContent=soundEnabled?'◖))':'◖×';$('musicBtn').classList.toggle('active',musicEnabled);$('musicBtn').textContent=musicEnabled?'♫':'♩';}
function toggleSound(){soundEnabled=!soundEnabled;localStorage.setItem('monopolis.sound',soundEnabled?'on':'off');setAudioButtons();if(soundEnabled)playSfx('ok');}
async function toggleMusic(){musicEnabled=!musicEnabled;localStorage.setItem('monopolis.music',musicEnabled?'on':'off');setAudioButtons();if(musicEnabled)await ambientAudio.play().catch(()=>{musicEnabled=false;localStorage.setItem('monopolis.music','off');setAudioButtons();toast('Toca de novo para activar a música');});else ambientAudio.pause();}
function startAmbientIfEnabled(){if(musicEnabled)ambientAudio.play().catch(()=>{});}

function playSfx(type='ok'){
  if(!soundEnabled)return;
  try{audioCtx||=new (window.AudioContext||window.webkitAudioContext)();const t=audioCtx.currentTime,master=audioCtx.createGain();master.gain.value=.75;master.connect(audioCtx.destination);const seq={ok:[[520,.05,'triangle'],[760,.08,'sine']],win:[[392,.08,'triangle'],[523,.08,'triangle'],[659,.15,'sine']],roll:[[140,.035,'square'],[210,.04,'square'],[310,.04,'triangle'],[460,.08,'triangle']],buy:[[330,.05,'triangle'],[495,.05,'triangle'],[660,.12,'sine']],pay:[[330,.07,'triangle'],[196,.13,'sine']],bad:[[170,.12,'sawtooth'],[105,.16,'sine']],card:[[520,.04,'sine'],[700,.09,'triangle']],build:[[250,.04,'square'],[500,.06,'triangle'],[750,.1,'sine']],turn:[[620,.06,'sine'],[470,.08,'triangle']],chat:[[740,.04,'sine'],[880,.05,'sine']]}[type]||[[520,.07,'sine']];let off=0;for(const[f,d,wave]of seq){const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type=wave;o.frequency.setValueAtTime(f,t+off);g.gain.setValueAtTime(.0001,t+off);g.gain.exponentialRampToValueAtTime(.055,t+off+.008);g.gain.exponentialRampToValueAtTime(.0001,t+off+d);o.connect(g);g.connect(master);o.start(t+off);o.stop(t+off+d+.02);off+=d*.8;}}catch{}
}

function resizeFxCanvas(){const c=$('fxCanvas'),d=devicePixelRatio||1;c.width=Math.floor(innerWidth*d);c.height=Math.floor(innerHeight*d);c.style.width=`${innerWidth}px`;c.style.height=`${innerHeight}px`;}
function confettiBurst(count=60){const c=$('fxCanvas'),ctx=c.getContext('2d'),d=devicePixelRatio||1,W=c.width,H=c.height,pieces=Array.from({length:count},()=>({x:W*(.35+Math.random()*.3),y:H*.28,vx:(Math.random()-.5)*9*d,vy:(-6-Math.random()*8)*d,g:(.25+Math.random()*.18)*d,r:(3+Math.random()*4)*d,a:Math.random()*6.28,va:(Math.random()-.5)*.3,life:80+Math.random()*30,color:['#17342a','#347565','#d7a84d','#f3e6b8','#b84c38'][Math.floor(Math.random()*5)]}));function tick(){ctx.clearRect(0,0,W,H);let alive=false;for(const p of pieces){if(p.life<=0)continue;alive=true;p.x+=p.vx;p.y+=p.vy;p.vy+=p.g;p.a+=p.va;p.life--;ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.a);ctx.globalAlpha=Math.min(1,p.life/50);ctx.fillStyle=p.color;ctx.fillRect(-p.r,-p.r/2,p.r*2,p.r);ctx.restore();}if(alive)requestAnimationFrame(tick);}tick();}
function escapeHtml(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}

window.gameActions={buyCurrent,skipPurchase,payRent,drawEvent,drawMoney,buildCurrent,acceptTrade,rejectTrade,cancelTrade,prepareCounterTrade};
boot();
