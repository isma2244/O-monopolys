
import {
  START_MONEY, PASS_GO_AMOUNT, TOKENS, BOARD, PROPERTY_DATA, STATION_DATA, EVENT_CARDS, MONEY_CARDS
} from './data.js';

const TABLE = 'monopolis_games';

let client = null;
let channel = null;
let gameRow = null;
let state = null;
let myPlayerId = localStorage.getItem('monopolis.playerId') || crypto.randomUUID();
localStorage.setItem('monopolis.playerId', myPlayerId);

const $ = (id) => document.getElementById(id);
const fmt = (n) => `${Math.round(n).toLocaleString('de-DE')}€`;
const now = () => new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

const SQL = `-- O Monopolis · Supabase setup
create table if not exists public.monopolis_games (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  state jsonb not null,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.monopolis_games enable row level security;

create policy "monopolis read" on public.monopolis_games
for select using (true);

create policy "monopolis insert" on public.monopolis_games
for insert with check (true);

create policy "monopolis update" on public.monopolis_games
for update using (true) with check (true);

-- Activa realtime para la tabla:
alter publication supabase_realtime add table public.monopolis_games;`;

function boot() {
  $('sqlPreview').textContent = SQL;
  populateTokens();
  loadConfigToInputs();
  bind();
  initSupabase();
  const params = new URLSearchParams(location.search);
  const code = params.get('join');
  if (code) $('joinCode').value = code.toUpperCase();
  renderSetup();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
}

function populateTokens() {
  for (const id of ['createToken','joinToken']) {
    const sel = $(id);
    sel.innerHTML = TOKENS.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
  }
}

function loadConfigToInputs() {
  $('supabaseUrl').value = localStorage.getItem('monopolis.supabaseUrl') || '';
  $('supabaseKey').value = localStorage.getItem('monopolis.supabaseKey') || '';
}

function saveConfig() {
  localStorage.setItem('monopolis.supabaseUrl', $('supabaseUrl').value.trim());
  localStorage.setItem('monopolis.supabaseKey', $('supabaseKey').value.trim());
  initSupabase();
  toast('Configuración gardada');
}

function initSupabase() {
  const url = localStorage.getItem('monopolis.supabaseUrl');
  const key = localStorage.getItem('monopolis.supabaseKey');
  if (!url || !key || !window.supabase) {
    client = null;
    setConnection('sen configurar', 'muted');
    return false;
  }
  client = window.supabase.createClient(url, key);
  setConnection('listo', 'online');
  return true;
}

function bind() {
  $('saveConfigBtn').onclick = saveConfig;
  $('createGameBtn').onclick = createGame;
  $('joinGameBtn').onclick = joinGame;
  $('copyLinkBtn').onclick = copyLink;
  $('startGameBtn').onclick = startGame;
  $('leaveGameBtn').onclick = () => { disconnect(); location.href = location.pathname; };
  $('rollBtn').onclick = rollDice;
  $('endTurnBtn').onclick = endTurn;
  $('bankAddBtn').onclick = () => manualBank(+$('bankAmount').value || 0);
  $('bankSubBtn').onclick = () => manualBank(-(+$('bankAmount').value || 0));
}

function setConnection(text, cls='muted') {
  $('connectionPill').textContent = text;
  $('connectionPill').className = `pill ${cls}`;
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

function code() {
  return `PIOR-${Math.floor(1000 + Math.random()*9000)}`;
}

function shuffle(arr) {
  const a = arr.map((v,i) => i);
  for (let i=a.length-1; i>0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newState(hostName, token) {
  const player = {
    id: myPlayerId,
    name: hostName || 'Host',
    token,
    money: START_MONEY,
    position: 0,
    skipTurns: 0,
    keptCards: [],
    connectedAt: Date.now()
  };
  return {
    phase: 'lobby',
    hostId: myPlayerId,
    players: [player],
    currentTurn: 0,
    dice: null,
    lastRoll: null,
    hasRolled: false,
    properties: {},
    decks: { event: shuffle(EVENT_CARDS), money: shuffle(MONEY_CARDS) },
    drawn: null,
    log: [`${now()} · ${player.name} creou a partida`]
  };
}

async function createGame() {
  if (!client && !initSupabase()) return toast('Configura Supabase primeiro');
  const name = $('createName').value.trim() || 'Xogador';
  const token = $('createToken').value;
  const payload = newState(name, token);
  for (let attempt=0; attempt<5; attempt++) {
    const c = code();
    const { data, error } = await client.from(TABLE).insert({ code:c, state:payload }).select().single();
    if (!error) {
      gameRow = data; state = data.state;
      localStorage.setItem(`monopolis.${c}.playerId`, myPlayerId);
      await subscribe(data.id);
      location.hash = c;
      renderLobby();
      return;
    }
  }
  toast('Non se puido crear a partida');
}

async function joinGame() {
  if (!client && !initSupabase()) return toast('Configura Supabase primeiro');
  const c = $('joinCode').value.trim().toUpperCase();
  const name = $('joinName').value.trim() || 'Xogador';
  const token = $('joinToken').value;
  if (!c) return toast('Falta o código');
  const { data, error } = await client.from(TABLE).select('*').eq('code', c).single();
  if (error || !data) return toast('Partida non atopada');
  gameRow = data; state = data.state;
  const existing = state.players.find(p => p.id === myPlayerId);
  if (!existing) {
    if (state.phase !== 'lobby') return toast('A partida xa empezou');
    if (state.players.some(p => p.token === token)) return toast('Esa ficha xa está collida');
    state.players.push({ id: myPlayerId, name, token, money: START_MONEY, position:0, skipTurns:0, keptCards:[], connectedAt: Date.now() });
    log(`${name} entrou na partida`);
    const ok = await saveState('Entrando...');
    if (!ok) return toast('Conflito ao entrar, tenta outra vez');
  }
  localStorage.setItem(`monopolis.${c}.playerId`, myPlayerId);
  await subscribe(gameRow.id);
  renderLobby();
}

async function subscribe(gameId) {
  if (channel) client.removeChannel(channel);
  channel = client.channel(`monopolis-${gameId}`)
    .on('postgres_changes', { event:'*', schema:'public', table:TABLE, filter:`id=eq.${gameId}` }, payload => {
      if (!payload.new) return;
      gameRow = payload.new;
      state = payload.new.state;
      setConnection('sincronizado', 'online');
      render();
    })
    .subscribe(status => setConnection(status === 'SUBSCRIBED' ? 'online' : status.toLowerCase(), status === 'SUBSCRIBED' ? 'online' : 'muted'));
}

function disconnect() {
  if (channel && client) client.removeChannel(channel);
  channel = null; gameRow = null; state = null;
}

async function saveState(pending='Gardando...') {
  if (!gameRow) return false;
  setConnection(pending, 'muted');
  const nextVersion = (gameRow.version || 1) + 1;
  const { data, error } = await client.from(TABLE)
    .update({ state, version: nextVersion, updated_at: new Date().toISOString() })
    .eq('id', gameRow.id)
    .eq('version', gameRow.version || 1)
    .select()
    .single();
  if (error || !data) {
    setConnection('conflito', 'error');
    const fresh = await client.from(TABLE).select('*').eq('id', gameRow.id).single();
    if (fresh.data) { gameRow = fresh.data; state = fresh.data.state; render(); }
    return false;
  }
  gameRow = data; state = data.state;
  setConnection('sincronizado', 'online');
  render();
  return true;
}

function renderSetup() {
  showView('setupView');
}

function render() {
  if (!state) return renderSetup();
  if (state.phase === 'lobby') return renderLobby();
  renderGame();
}

function renderLobby() {
  showView('lobbyView');
  $('lobbyCode').textContent = gameRow.code;
  $('startGameBtn').disabled = !isHost() || state.players.length < 2;
  $('lobbyPlayers').innerHTML = state.players.map(p => {
    const tok = TOKENS.find(t => t.id === p.token)?.label || p.token;
    const host = p.id === state.hostId ? ' · host' : '';
    return `<div class="player-row"><span>${tok} ${escapeHtml(p.name)}${host}</span><span>${fmt(p.money)}</span></div>`;
  }).join('');
  drawQR(`${location.origin}${location.pathname}?join=${gameRow.code}`);
}

function drawQR(text) {
  const canvas = $('qrCanvas');
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fbf5df'; ctx.fillRect(0,0,canvas.width,canvas.height);
  // Mini QR falso/legible-ish: para no depender de librerías. La ligazón copiable es la referencia real.
  ctx.fillStyle = '#28342B';
  ctx.font = 'bold 14px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(gameRow.code, canvas.width/2, 30);
  let seed = 0; for (const ch of text) seed = (seed*31 + ch.charCodeAt(0)) >>> 0;
  const cell = 7, offset = 38, size = 15;
  for (let y=0; y<size; y++) for (let x=0; x<size; x++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    if ((seed % 5) < 2 || (x<3&&y<3) || (x>11&&y<3) || (x<3&&y>11)) ctx.fillRect(offset+x*cell, offset+y*cell, cell-1, cell-1);
  }
}

function copyLink() {
  const link = `${location.origin}${location.pathname}?join=${gameRow.code}`;
  navigator.clipboard?.writeText(link);
  toast('Ligazón copiada');
}

async function startGame() {
  if (!isHost()) return;
  state.phase = 'playing';
  state.currentTurn = 0;
  state.hasRolled = false;
  log(`Comeza a partida`);
  await saveState();
}

function isHost() { return state?.hostId === myPlayerId; }
function me() { return state?.players.find(p => p.id === myPlayerId); }
function currentPlayer() { return state?.players[state.currentTurn]; }
function isMyTurn() { return currentPlayer()?.id === myPlayerId; }

function renderGame() {
  showView('gameView');
  const cp = currentPlayer();
  $('turnLabel').textContent = cp ? cp.name : '—';
  $('diceLabel').textContent = state.lastRoll ? `🎲 ${state.lastRoll[0]} + ${state.lastRoll[1]} = ${state.lastRoll[0]+state.lastRoll[1]}` : '🎲 —';
  $('rollBtn').disabled = !isMyTurn() || state.hasRolled;
  $('endTurnBtn').disabled = !isMyTurn();
  renderTokens();
  renderMyStatus();
  renderSpacePanel();
  renderBankSelect();
  renderProperties();
  renderLog();
}

function renderTokens() {
  const layer = $('tokensLayer');
  const offsets = [[0,0],[1.2,0],[0,1.2],[-1.2,0],[0,-1.2],[1.2,1.2],[-1.2,-1.2],[1.2,-1.2]];
  layer.innerHTML = state.players.map((p, i) => {
    const sp = BOARD[p.position] || BOARD[0];
    const tok = TOKENS.find(t => t.id === p.token)?.label?.split(' ')[0] || '●';
    const off = offsets[i % offsets.length];
    return `<div class="token ${p.id===myPlayerId?'me':''}" style="left:${sp.x+off[0]}%;top:${sp.y+off[1]}%" title="${escapeHtml(p.name)}">${tok}</div>`;
  }).join('');
}

function renderMyStatus() {
  const p = me();
  if (!p) return;
  const sp = BOARD[p.position];
  $('myStatus').innerHTML = `
    <div class="between"><span class="badge">${TOKENS.find(t=>t.id===p.token)?.label || p.token}</span><strong>${escapeHtml(p.name)}</strong></div>
    <div class="money">${fmt(p.money)}</div>
    <div><strong>Casilla:</strong> ${escapeHtml(sp?.name || '—')}</div>
    ${p.skipTurns ? `<div class="badge danger">Perde ${p.skipTurns} quenda(s)</div>` : ''}
    ${p.keptCards?.length ? `<div><strong>Cartas gardadas:</strong> ${p.keptCards.map(escapeHtml).join(', ')}</div>` : ''}
  `;
}

function spaceInfo(space) {
  if (!space) return {};
  if (space.type === 'property') return PROPERTY_DATA[space.propertyId];
  if (space.type === 'station') return STATION_DATA[space.stationId];
  return {};
}

function renderSpacePanel() {
  const p = currentPlayer();
  const space = p ? BOARD[p.position] : null;
  const data = spaceInfo(space);
  const propState = propertyState(space);
  let html = `<h3 class="space-title">${escapeHtml(space?.name || '—')}</h3><p class="small">${space?.type || ''}</p>`;
  const actions = [];

  if (!space) return $('spacePanel').innerHTML = html;

  if (space.type === 'property' || space.type === 'station') {
    const owner = propState?.ownerId ? state.players.find(pl => pl.id === propState.ownerId) : null;
    html += `<p>Prezo: <strong>${fmt(data.price)}</strong> · Hipoteca: ${fmt(data.mortgage)}</p>`;
    if (!owner) {
      actions.push(`<button onclick="window.gameActions.buyCurrent()">Comprar</button>`);
    } else {
      html += `<p>Dono: <strong>${escapeHtml(owner.name)}</strong>${propState.mortgaged?' · hipotecada':''}</p>`;
      if (owner.id !== p.id && !propState.mortgaged) {
        actions.push(`<button onclick="window.gameActions.payRent()">Pagar aluguer (${fmt(calcRent(space))})</button>`);
      }
      if (owner.id === myPlayerId) {
        if (space.type === 'property') {
          actions.push(`<button class="secondary" onclick="window.gameActions.buildCurrent()">Construír (${fmt(data.houseCost)})</button>`);
        }
        actions.push(`<button class="secondary" onclick="window.gameActions.toggleMortgageCurrent()">${propState.mortgaged?'Quitar hipoteca':'Hipotecar'}</button>`);
      }
    }
  } else if (space.type === 'event') {
    actions.push(`<button onclick="window.gameActions.drawEvent()">Coller Evento</button>`);
  } else if (space.type === 'caixa') {
    actions.push(`<button onclick="window.gameActions.drawMoney()">Coller Diñeiro</button>`);
  } else if (space.type === 'go') {
    html += `<p>Ao pasar por Piornedo cóbranse ${fmt(PASS_GO_AMOUNT)}.</p>`;
  } else if (space.type === 'service') {
    html += `<p>Casilla de servizos: aplicade a norma casera ou axuste manual.</p>`;
  }

  if (state.drawn) {
    html += `<div class="prop-item"><strong>${state.drawn.kind}</strong><span>${escapeHtml(state.drawn.text)}</span>${state.drawn.amount ? `<span>${state.drawn.amount > 0 ? 'Cobra' : 'Paga'} ${fmt(Math.abs(state.drawn.amount))}</span>` : ''}</div>`;
  }

  html += `<div class="actions">${actions.join('')}</div>`;
  $('spacePanel').innerHTML = html;
}

function renderBankSelect() {
  $('bankPlayer').innerHTML = state.players.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

function renderProperties() {
  const groups = Object.entries(state.properties || {});
  if (!groups.length) return $('propertyPanel').innerHTML = '<p class="small">Aínda non hai propiedades.</p>';
  $('propertyPanel').innerHTML = groups.map(([id, ps]) => {
    const data = PROPERTY_DATA[id] || STATION_DATA[id];
    const owner = state.players.find(p => p.id === ps.ownerId);
    const houses = ps.houses ? ` · ${ps.houses === 5 ? 'hotel' : ps.houses + ' casa(s)'}` : '';
    return `<div class="prop-item"><strong>${escapeHtml(data?.name || id)}</strong><span>${owner ? escapeHtml(owner.name) : 'Sen dono'}${houses}${ps.mortgaged?' · hipotecada':''}</span></div>`;
  }).join('');
}

function renderLog() {
  $('logPanel').innerHTML = (state.log || []).slice(-60).reverse().map(l => `<div class="log-entry">${escapeHtml(l)}</div>`).join('');
}

function propertyState(space) {
  if (!space) return null;
  const id = space.propertyId || space.stationId;
  return id ? state.properties[id] : null;
}

async function rollDice() {
  if (!isMyTurn() || state.hasRolled) return;
  const p = currentPlayer();
  if (p.skipTurns > 0) {
    p.skipTurns -= 1;
    log(`${p.name} perde a quenda`);
    nextTurn();
    await saveState();
    return;
  }
  const d1 = 1 + Math.floor(Math.random()*6);
  const d2 = 1 + Math.floor(Math.random()*6);
  state.lastRoll = [d1, d2];
  state.hasRolled = true;
  movePlayer(p, d1+d2);
  state.drawn = null;
  log(`${p.name} tira ${d1}+${d2} e cae en ${BOARD[p.position].name}`);
  await saveState();
}

function movePlayer(p, steps, passGo=true) {
  const old = p.position;
  let pos = (old + steps) % BOARD.length;
  if (passGo && old + steps >= BOARD.length) {
    p.money += PASS_GO_AMOUNT;
    log(`${p.name} pasa por Piornedo e cobra ${fmt(PASS_GO_AMOUNT)}`);
  }
  p.position = pos;
}

function moveTo(p, spaceId, passGo=false) {
  const target = BOARD.findIndex(s => s.id === spaceId || s.propertyId === spaceId || s.stationId === spaceId);
  if (target < 0) return;
  if (passGo && target < p.position) {
    p.money += PASS_GO_AMOUNT;
    log(`${p.name} pasa por Piornedo e cobra ${fmt(PASS_GO_AMOUNT)}`);
  }
  p.position = target;
}

function nextTurn() {
  state.hasRolled = false;
  state.drawn = null;
  state.currentTurn = (state.currentTurn + 1) % state.players.length;
  state.dice = null;
}

async function endTurn() {
  if (!isMyTurn()) return;
  nextTurn();
  await saveState();
}

function currentSpace() { return BOARD[currentPlayer()?.position]; }
function propertyIdOf(space) { return space?.propertyId || space?.stationId; }

async function buyCurrent() {
  if (!isMyTurn()) return;
  const space = currentSpace();
  const id = propertyIdOf(space);
  if (!id || state.properties[id]) return;
  const data = PROPERTY_DATA[id] || STATION_DATA[id];
  const p = currentPlayer();
  if (p.money < data.price) return toast('Non tes cartos suficientes');
  p.money -= data.price;
  state.properties[id] = { ownerId:p.id, mortgaged:false, houses:0 };
  log(`${p.name} compra ${data.name} por ${fmt(data.price)}`);
  await saveState();
}

function calcRent(space) {
  const id = propertyIdOf(space);
  const ps = state.properties[id];
  if (!ps || ps.mortgaged) return 0;
  if (space.type === 'station') {
    const owned = Object.entries(state.properties)
      .filter(([pid, v]) => STATION_DATA[pid] && v.ownerId === ps.ownerId && !v.mortgaged).length;
    return STATION_DATA[id].rents[Math.max(0, owned-1)];
  }
  const data = PROPERTY_DATA[id];
  const houses = ps.houses || 0;
  let rent = data.rents[Math.min(houses, 5)];
  if (houses === 0 && ownsFullGroup(ps.ownerId, data.group)) rent *= 2;
  return rent;
}

function ownsFullGroup(ownerId, group) {
  const ids = Object.entries(PROPERTY_DATA).filter(([,p]) => p.group === group).map(([id]) => id);
  return ids.every(id => state.properties[id]?.ownerId === ownerId && !state.properties[id]?.mortgaged);
}

async function payRent() {
  if (!isMyTurn()) return;
  const space = currentSpace();
  const id = propertyIdOf(space);
  const ps = state.properties[id];
  const payer = currentPlayer();
  const owner = state.players.find(p => p.id === ps.ownerId);
  if (!owner || owner.id === payer.id) return;
  const rent = calcRent(space);
  payer.money -= rent;
  owner.money += rent;
  log(`${payer.name} paga ${fmt(rent)} a ${owner.name} por ${space.name}`);
  await saveState();
}

async function buildCurrent() {
  const space = currentSpace();
  const id = propertyIdOf(space);
  const ps = state.properties[id];
  const data = PROPERTY_DATA[id];
  if (!ps || ps.ownerId !== myPlayerId || !data) return;
  const p = me();
  if (!ownsFullGroup(p.id, data.group)) return toast('Necesitas o grupo completo');
  if (ps.houses >= 5) return toast('Xa ten hotel');
  if (p.money < data.houseCost) return toast('Non tes cartos suficientes');
  p.money -= data.houseCost;
  ps.houses = (ps.houses || 0) + 1;
  log(`${p.name} constrúe en ${data.name}`);
  await saveState();
}

async function toggleMortgageCurrent() {
  const space = currentSpace();
  const id = propertyIdOf(space);
  const ps = state.properties[id];
  const data = PROPERTY_DATA[id] || STATION_DATA[id];
  if (!ps || ps.ownerId !== myPlayerId) return;
  const p = me();
  if (ps.mortgaged) {
    const cost = Math.ceil(data.mortgage * 1.1 / 10) * 10;
    if (p.money < cost) return toast('Non tes cartos suficientes');
    p.money -= cost;
    ps.mortgaged = false;
    log(`${p.name} quita a hipoteca de ${data.name} por ${fmt(cost)}`);
  } else {
    if (ps.houses > 0) return toast('Vende casas antes de hipotecar');
    p.money += data.mortgage;
    ps.mortgaged = true;
    log(`${p.name} hipoteca ${data.name} e cobra ${fmt(data.mortgage)}`);
  }
  await saveState();
}

async function drawEvent() {
  if (!isMyTurn()) return;
  drawFromDeck('event');
  await saveState();
}

async function drawMoney() {
  if (!isMyTurn()) return;
  drawFromDeck('money');
  await saveState();
}

function drawFromDeck(kind) {
  const deck = state.decks[kind];
  const idx = deck.shift();
  const card = kind === 'event' ? EVENT_CARDS[idx] : MONEY_CARDS[idx];
  deck.push(idx);
  const p = currentPlayer();
  if (kind === 'money') {
    if (card.amount) {
      p.money += card.amount;
      state.drawn = { kind:'DIÑEIRO', text:card.text, amount:card.amount };
      log(`${p.name}: ${card.text} ${card.amount > 0 ? 'Cobra' : 'Paga'} ${fmt(Math.abs(card.amount))}`);
    } else if (card.each) {
      for (const pl of state.players) pl.money += card.each;
      state.drawn = { kind:'DIÑEIRO', text:card.text, amount:card.each };
      log(`${card.text} ${fmt(Math.abs(card.each))} por persoa`);
    }
    return;
  }

  state.drawn = { kind:'EVENTO', text:card.text };
  applyEvent(card, p);
}

function applyEvent(card, p) {
  const a = card.action || { type:'manual' };
  if (a.type === 'moveTo') {
    moveTo(p, a.spaceId, a.passGo);
    if (a.skip) p.skipTurns += a.skip;
    log(`${p.name}: ${card.text}`);
  } else if (a.type === 'moveToPay') {
    moveTo(p, a.spaceId, false);
    p.money -= a.amount;
    log(`${p.name}: ${card.text} Paga ${fmt(a.amount)}`);
  } else if (a.type === 'moveRelative') {
    movePlayer(p, a.delta, false);
    log(`${p.name}: ${card.text}`);
  } else if (a.type === 'skip') {
    p.skipTurns += a.turns || 1;
    log(`${p.name}: ${card.text}`);
  } else if (a.type === 'keep') {
    p.keptCards = p.keptCards || [];
    p.keptCards.push(a.label);
    log(`${p.name} garda carta: ${a.label}`);
  } else if (a.type === 'takeProperty') {
    const ps = state.properties[a.propertyId];
    if (!ps) state.properties[a.propertyId] = { ownerId:p.id, mortgaged:false, houses:0 };
    else ps.ownerId = p.id;
    log(`${p.name} queda con ${PROPERTY_DATA[a.propertyId]?.name || a.propertyId}`);
  } else {
    log(`${p.name} colle evento: ${card.text}`);
  }
}

async function manualBank(amount) {
  const pid = $('bankPlayer').value;
  const p = state.players.find(pl => pl.id === pid);
  if (!p || !amount) return;
  p.money += amount;
  log(`${p.name}: ${amount > 0 ? 'ingreso' : 'cobro'} manual de ${fmt(Math.abs(amount))}`);
  await saveState();
}

function log(text) {
  state.log = state.log || [];
  state.log.push(`${now()} · ${text}`);
  if (state.log.length > 100) state.log = state.log.slice(-100);
}

function escapeHtml(s='') {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

window.gameActions = { buyCurrent, payRent, buildCurrent, toggleMortgageCurrent, drawEvent, drawMoney };

boot();
