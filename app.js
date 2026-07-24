
import {
  START_MONEY, PASS_GO_AMOUNT, TOKENS, BOARD, PROPERTY_DATA, STATION_DATA, EVENT_CARDS, MONEY_CARDS
} from './data.js';

const TABLE = 'monopolis_games';

let client = null;
let channel = null;
let gameRow = null;
let state = null;
let zoomed = false;
let audioCtx = null;
let soundEnabled = localStorage.getItem('monopolis.sound') !== 'off';

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

drop policy if exists "monopolis read" on public.monopolis_games;
drop policy if exists "monopolis insert" on public.monopolis_games;
drop policy if exists "monopolis update" on public.monopolis_games;

create policy "monopolis read" on public.monopolis_games
for select using (true);

create policy "monopolis insert" on public.monopolis_games
for insert with check (true);

create policy "monopolis update" on public.monopolis_games
for update using (true) with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update on public.monopolis_games to anon, authenticated;

-- Si da error porque ya está añadida, ignóralo.
alter publication supabase_realtime add table public.monopolis_games;`;

function boot() {
  $('sqlPreview').textContent = SQL;
  populateTokens();
  loadConfigToInputs();
  bind();
  initSupabase();

  const params = new URLSearchParams(location.search);
  const join = params.get('join');
  if (join) {
    $('joinCode').value = join.toUpperCase();
    switchMode('join');
  }

  $('soundBtn').textContent = soundEnabled ? '🔊' : '🔇';
  resizeFxCanvas();
  window.addEventListener('resize', resizeFxCanvas);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

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
  $('bankAddBtn').onclick = () => manualBank(+$('bankAmount').value || 0);
  $('bankSubBtn').onclick = () => manualBank(-(+$('bankAmount').value || 0));
  $('fitBoardBtn').onclick = fitBoardToMe;
  $('zoomBoardBtn').onclick = toggleZoom;
  $('closeModalBtn').onclick = closeModal;
  $('sellHouseBtn').onclick = sellHouseSelected;
  $('bankruptBtn').onclick = declareBankruptcy;
  $('tradeBtn').onclick = quickTrade;
  $('soundBtn').onclick = toggleSound;
  $('tabCreate').onclick = () => switchMode('create');
  $('tabJoin').onclick = () => switchMode('join');
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === ' ' && state?.phase === 'playing' && isMyTurn() && !state.hasRolled) {
      e.preventDefault();
      rollDice();
    }
  });
}

function populateTokens() {
  for (const id of ['createToken','joinToken']) {
    const sel = $(id);
    sel.innerHTML = TOKENS.map(t => `<option value="${t.id}">${t.label}</option>`).join('');
  }
}

function switchMode(mode) {
  const create = mode === 'create';
  $('tabCreate').classList.toggle('active', create);
  $('tabJoin').classList.toggle('active', !create);
  $('createBox').classList.toggle('hidden', !create);
  $('joinBox').classList.toggle('hidden', create);
}

function sanitizeSupabaseUrl(raw) {
  return (raw || '')
    .trim()
    .replace(/\/rest\/v1\/?$/i, '')
    .replace(/\/+$/g, '');
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
  haptic(18);
  playSfx('ok');
  toast('Conexión gardada');
}

function initSupabase() {
  const url = sanitizeSupabaseUrl(localStorage.getItem('monopolis.supabaseUrl') || '');
  const key = localStorage.getItem('monopolis.supabaseKey') || '';
  if (!url || !key || !window.supabase) {
    client = null;
    setConnection('sen configurar', 'muted');
    return false;
  }
  try {
    client = window.supabase.createClient(url, key);
    setConnection('listo', 'online');
    return true;
  } catch {
    client = null;
    setConnection('erro config', 'error');
    return false;
  }
}

function setConnection(text, cls='muted') {
  $('connectionPill').textContent = text;
  $('connectionPill').className = `pill ${cls}`;
}

function showView(id) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $(id).classList.add('active');
}

function renderSetup() {
  showView('setupView');
}

function code() {
  return `PIOR-${Math.floor(1000 + Math.random()*9000)}`;
}

function shuffle(arr) {
  const a = arr.map((_, i) => i);
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

function normalizeState(s) {
  s.phase ||= 'lobby';
  s.players ||= [];
  s.currentTurn ||= 0;
  s.properties ||= {};
  s.decks ||= {};
  if (!Array.isArray(s.decks.event) || s.decks.event.length === 0) s.decks.event = shuffle(EVENT_CARDS);
  if (!Array.isArray(s.decks.money) || s.decks.money.length === 0) s.decks.money = shuffle(MONEY_CARDS);
  s.log ||= [];
  s.players.forEach(p => {
    p.money ??= START_MONEY;
    p.position ??= 0;
    p.skipTurns ??= 0;
    p.keptCards ||= [];
    p.bankrupt ||= false;
  });
  return s;
}

async function createGame() {
  if (!client && !initSupabase()) return toast('Configura Supabase primeiro');
  const name = $('createName').value.trim() || 'Xogador';
  const token = $('createToken').value;
  const payload = newState(name, token);

  setConnection('creando...', 'muted');
  for (let attempt=0; attempt<7; attempt++) {
    const c = code();
    const { data, error } = await client.from(TABLE).insert({ code:c, state:payload }).select().single();
    if (!error && data) {
      gameRow = data;
      state = normalizeState(data.state);
      localStorage.setItem(`monopolis.${c}.playerId`, myPlayerId);
      await subscribe(data.id);
      history.replaceState(null, '', `${location.pathname}?join=${c}`);
      renderLobby();
      playSfx('win');
      confettiBurst();
      return;
    }
  }
  setConnection('erro', 'error');
  toast('Non se puido crear a partida. Revisa SQL / URL / anon key.');
}

async function joinGame() {
  if (!client && !initSupabase()) return toast('Configura Supabase primeiro');
  const c = $('joinCode').value.trim().toUpperCase();
  const name = $('joinName').value.trim() || 'Xogador';
  const token = $('joinToken').value;
  if (!c) return toast('Falta o código');

  setConnection('buscando...', 'muted');
  const { data, error } = await client.from(TABLE).select('*').eq('code', c).single();
  if (error || !data) {
    setConnection('non atopada', 'error');
    return toast('Partida non atopada');
  }

  gameRow = data;
  state = normalizeState(data.state);

  const existing = state.players.find(p => p.id === myPlayerId);
  if (!existing) {
    if (state.phase !== 'lobby') return toast('A partida xa empezou');
    if (state.players.some(p => p.token === token)) return toast('Esa ficha xa está collida');
    state.players.push({ id: myPlayerId, name, token, money: START_MONEY, position:0, skipTurns:0, keptCards:[], connectedAt: Date.now() });
    log(`${name} entrou na partida`);
    const ok = await saveState('Entrando...');
    if (!ok) return toast('Conflito ao entrar, volve tentar');
  }

  localStorage.setItem(`monopolis.${c}.playerId`, myPlayerId);
  await subscribe(gameRow.id);
  history.replaceState(null, '', `${location.pathname}?join=${c}`);
  renderLobby();
  playSfx('ok');
}

async function subscribe(gameId) {
  if (channel) client.removeChannel(channel);
  channel = client.channel(`monopolis-${gameId}`)
    .on('postgres_changes', { event:'*', schema:'public', table:TABLE, filter:`id=eq.${gameId}` }, payload => {
      if (!payload.new) return;
      const prevTurn = currentPlayer()?.id;
      const prevRoll = state?.lastRoll?.join('-');
      gameRow = payload.new;
      state = normalizeState(payload.new.state);
      setConnection('sincronizado', 'online');
      render();
      if (state.phase === 'playing') {
        const newTurn = currentPlayer()?.id;
        const newRoll = state?.lastRoll?.join('-');
        if (newTurn === myPlayerId && prevTurn !== myPlayerId) {
          toast('É o teu turno');
          haptic([30, 40, 30]);
          playSfx('turn');
        }
        if (newRoll && newRoll !== prevRoll) animateDice(state.lastRoll[0], state.lastRoll[1]);
      }
    })
    .subscribe(status => setConnection(status === 'SUBSCRIBED' ? 'online' : status.toLowerCase(), status === 'SUBSCRIBED' ? 'online' : 'muted'));
}

function disconnect() {
  if (channel && client) client.removeChannel(channel);
  channel = null;
  gameRow = null;
  state = null;
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
    if (fresh.data) {
      gameRow = fresh.data;
      state = normalizeState(fresh.data.state);
      render();
    }
    return false;
  }

  gameRow = data;
  state = normalizeState(data.state);
  setConnection('sincronizado', 'online');
  render();
  return true;
}

function render() {
  if (!state) return renderSetup();
  if (state.phase === 'lobby') return renderLobby();
  renderGame();
}

function isHost() { return state?.hostId === myPlayerId; }
function me() { return state?.players.find(p => p.id === myPlayerId); }
function activePlayers() { return state?.players.filter(p => !p.bankrupt) || []; }
function currentPlayer() { return state?.players[state.currentTurn]; }
function isMyTurn() { const p = currentPlayer(); return p?.id === myPlayerId && !p.bankrupt; }

function renderLobby() {
  showView('lobbyView');
  $('lobbyCode').textContent = gameRow.code;
  $('startGameBtn').disabled = !isHost() || state.players.length < 2;
  $('lobbyPlayers').innerHTML = state.players.map(p => {
    const tok = tokenEmoji(p.token);
    const host = p.id === state.hostId ? '<span class="badge gold">host</span>' : '';
    return `<div class="player-row ${p.bankrupt ? 'bankrupt' : ''}">
      <div class="player-main"><span class="avatar">${tok}</span><span class="player-name">${escapeHtml(p.name)}</span>${host}${p.bankrupt ? '<span class="badge red">KO</span>' : ''}</div>
      <span>${fmt(p.money)}</span>
    </div>`;
  }).join('');
  renderQrLike(`${location.origin}${location.pathname}?join=${gameRow.code}`);
}

function renderQrLike(text) {
  let seed = 0;
  for (const ch of text) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const dots = [];
  for (let i=0; i<225; i++) {
    const x = i % 15, y = Math.floor(i / 15);
    const finder = (x<4 && y<4) || (x>10 && y<4) || (x<4 && y>10);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const on = finder || (seed % 7 < 3);
    dots.push(`<span class="qr-dot" style="opacity:${on ? 1 : 0}"></span>`);
  }
  $('qrCanvas').innerHTML = `<div class="qr-like-grid">${dots.join('')}</div>`;
}

function gameLink() {
  return `${location.origin}${location.pathname}?join=${gameRow.code}`;
}

function copyLink() {
  navigator.clipboard?.writeText(gameLink());
  toast('Ligazón copiada');
  haptic(18);
  playSfx('ok');
}

async function nativeShare() {
  const link = gameLink();
  if (navigator.share) {
    await navigator.share({ title:'O Monopolis', text:`Únete á partida ${gameRow.code}`, url: link }).catch(() => {});
  } else {
    copyLink();
  }
}

async function startGame() {
  if (!isHost()) return;
  state.phase = 'playing';
  state.currentTurn = 0;
  state.hasRolled = false;
  state.lastRoll = null;
  state.drawn = null;
  log(`Comeza a partida`);
  confettiBurst();
  playSfx('win');
  await saveState();
}

function renderGame() {
  showView('gameView');
  const cp = currentPlayer();
  $('turnLabel').textContent = cp ? cp.name : '—';
  $('boardSubtitle').textContent = gameRow?.code ? `${gameRow.code} · ${state.players.length} xogadores` : 'Partida en curso';
  $('diceLabel').textContent = state.lastRoll ? `🎲 ${state.lastRoll[0]} + ${state.lastRoll[1]} = ${state.lastRoll[0]+state.lastRoll[1]}` : '🎲 —';
  $('rollBtn').disabled = !isMyTurn() || state.hasRolled;
  $('endTurnBtn').disabled = !isMyTurn();

  renderTokens();
  renderBuildings();
  renderMyStatus();
  renderScoreboard();
  renderSpacePanel();
  renderBankSelect();
  renderTradeSelects();
  renderProperties();
  renderLog();
}

function renderTokens() {
  const layer = $('tokensLayer');
  const offsets = [[0,0],[1.15,0],[0,1.15],[-1.15,0],[0,-1.15],[1.15,1.15],[-1.15,-1.15],[1.15,-1.15]];
  layer.innerHTML = state.players.map((p, i) => {
    const sp = BOARD[p.position] || BOARD[0];
    const off = offsets[i % offsets.length];
    const active = currentPlayer()?.id === p.id && !p.bankrupt ? 'active' : '';
    const ko = p.bankrupt ? 'bankrupt' : '';
    return `<div class="token ${p.id===myPlayerId?'me':''} ${active} ${ko}" style="left:${sp.x+off[0]}%;top:${sp.y+off[1]}%" title="${escapeHtml(p.name)}">${tokenEmoji(p.token)}</div>`;
  }).join('');
}

function renderBuildings() {
  const layer = $('buildingsLayer');
  const html = [];
  for (const [id, ps] of Object.entries(state.properties || {})) {
    if (!PROPERTY_DATA[id] || !ps.houses) continue;
    const space = BOARD.find(s => s.propertyId === id);
    if (!space) continue;
    const content = ps.houses >= 5
      ? `<span class="hotel"></span>`
      : Array.from({ length: ps.houses }, () => `<span class="house"></span>`).join('');
    html.push(`<div class="building" style="left:${space.x}%;top:${Math.max(4, space.y-3)}%">${content}</div>`);
  }
  layer.innerHTML = html.join('');
}

function tokenEmoji(id) {
  return TOKENS.find(t => t.id === id)?.label?.split(' ')[0] || '●';
}

function renderMyStatus() {
  const p = me();
  if (!p) return;
  const sp = BOARD[p.position];
  const owned = Object.entries(state.properties || {}).filter(([,v]) => v.ownerId === p.id).length;
  $('myStatus').innerHTML = `
    <div class="between">
      <span class="badge">${tokenEmoji(p.token)} ${escapeHtml(p.name)}</span>
      ${isMyTurn() ? '<span class="badge ok">teu turno</span>' : ''}
    </div>
    <div class="money">${fmt(p.money)}</div>
    <div class="wallet-row">
      <span class="badge">📍 ${escapeHtml(sp?.name || '—')}</span>
      <span class="badge gold">🏘️ ${owned} posesións</span>
      <span class="badge">📊 patrimonio ${fmt(netWorth(p))}</span>
      ${p.skipTurns ? `<span class="badge red">⏳ perde ${p.skipTurns}</span>` : ''}
      ${p.bankrupt ? `<span class="badge red">💀 bancarrota</span>` : ''}
    </div>
    ${p.keptCards?.length ? `<div class="prop-item"><strong>Cartas gardadas</strong><span class="meta">${p.keptCards.map(escapeHtml).join(', ')}</span></div>` : ''}
  `;
}


function netWorth(player) {
  if (!player) return 0;
  let total = player.money || 0;
  for (const [id, ps] of Object.entries(state.properties || {})) {
    if (ps.ownerId !== player.id) continue;
    const data = PROPERTY_DATA[id] || STATION_DATA[id];
    if (!data) continue;
    total += ps.mortgaged ? data.mortgage : data.price;
    if (PROPERTY_DATA[id] && ps.houses) total += ps.houses * (data.houseCost * 0.5);
  }
  return Math.round(total);
}

function renderScoreboard() {
  const panel = $('scoreboardPanel');
  if (!panel) return;
  const rows = [...state.players]
    .sort((a,b) => netWorth(b) - netWorth(a))
    .map((p, idx) => {
      const owned = Object.values(state.properties || {}).filter(v => v.ownerId === p.id).length;
      return `<div class="score-row ${p.id===myPlayerId?'is-me':''} ${idx===0?'networth-glow':''} ${p.bankrupt?'bankrupt':''}">
        <span class="score-rank">${idx+1}</span>
        <span class="score-name"><strong>${tokenEmoji(p.token)} ${escapeHtml(p.name)}</strong><span>${owned} propiedades · ${p.bankrupt ? 'bancarrota' : fmt(p.money) + ' efectivo'}</span></span>
        <span class="score-money">${fmt(netWorth(p))}</span>
      </div>`;
    }).join('');
  panel.innerHTML = rows;
}

function renderTradeSelects() {
  const toSel = $('tradeToPlayer');
  const propSel = $('tradeProperty');
  if (!toSel || !propSel) return;
  const p = me();
  const others = state.players.filter(pl => pl.id !== myPlayerId && !pl.bankrupt);
  toSel.innerHTML = others.length
    ? others.map(pl => `<option value="${pl.id}">${escapeHtml(pl.name)}</option>`).join('')
    : `<option value="">Sen xogadores</option>`;

  const owned = Object.entries(state.properties || {})
    .filter(([, ps]) => ps.ownerId === myPlayerId)
    .map(([id, ps]) => ({ id, ps, data: PROPERTY_DATA[id] || STATION_DATA[id] }))
    .filter(x => x.data);

  propSel.innerHTML = `<option value="">Só diñeiro</option>` + owned.map(x => {
    const houses = x.ps.houses ? ` · ${x.ps.houses === 5 ? 'hotel' : x.ps.houses + ' casas'}` : '';
    return `<option value="${x.id}">${escapeHtml(x.data.name)}${houses}</option>`;
  }).join('');
}


function currentSpace() {
  const p = currentPlayer();
  return p ? BOARD[p.position] : null;
}

function propertyIdOf(space) {
  return space?.propertyId || space?.stationId;
}

function spaceInfo(space) {
  if (!space) return {};
  if (space.type === 'property') return PROPERTY_DATA[space.propertyId];
  if (space.type === 'station') return STATION_DATA[space.stationId];
  return {};
}

function propertyState(space) {
  const id = propertyIdOf(space);
  return id ? state.properties[id] : null;
}

function renderSpacePanel() {
  const p = currentPlayer();
  const space = p ? BOARD[p.position] : null;
  const data = spaceInfo(space);
  const propState = propertyState(space);
  let html = `<p class="small">Casilla actual</p><h3 class="space-title">${escapeHtml(space?.name || '—')}</h3>`;
  const actions = [];

  if (!space) {
    $('spacePanel').innerHTML = html;
    return;
  }

  if (space.type === 'property' || space.type === 'station') {
    const owner = propState?.ownerId ? state.players.find(pl => pl.id === propState.ownerId) : null;
    const color = data.group ? `<span class="prop-color group-${data.group}"></span>` : '🚉 ';
    html += `<p class="muted">${color} Prezo <strong>${fmt(data.price)}</strong> · Hipoteca ${fmt(data.mortgage)}</p>`;
    if (!owner) {
      actions.push(`<button onclick="window.gameActions.buyCurrent()">Comprar</button>`);
    } else {
      html += `<div class="prop-item"><strong>Dono: ${escapeHtml(owner.name)}</strong><span class="meta">${propState.mortgaged ? 'hipotecada' : 'activa'}${propState.houses ? ' · ' + (propState.houses === 5 ? 'hotel' : propState.houses + ' casa(s)') : ''}</span></div>`;
      if (owner.id !== p.id && !propState.mortgaged) {
        actions.push(`<button onclick="window.gameActions.payRent()">Pagar aluguer ${fmt(calcRent(space))}</button>`);
      }
      if (owner.id === myPlayerId) {
        if (space.type === 'property') {
          actions.push(`<button class="secondary" onclick="window.gameActions.buildCurrent()">Construír ${fmt(data.houseCost)}</button>`);
        }
        actions.push(`<button class="secondary" onclick="window.gameActions.toggleMortgageCurrent()">${propState.mortgaged ? 'Quitar hipoteca' : 'Hipotecar'}</button>`);
      }
    }
  } else if (space.type === 'event') {
    html += `<p class="muted">Colle unha carta de eventos.</p>`;
    actions.push(`<button onclick="window.gameActions.drawEvent()">Coller Evento</button>`);
  } else if (space.type === 'caixa') {
    html += `<p class="muted">Colle unha carta de diñeiro.</p>`;
    actions.push(`<button onclick="window.gameActions.drawMoney()">Coller Diñeiro</button>`);
  } else if (space.type === 'go') {
    html += `<p class="muted">Ao pasar por Piornedo cóbranse ${fmt(PASS_GO_AMOUNT)}.</p>`;
  } else if (space.type === 'service') {
    html += `<p class="muted">Servizos queda como casilla manual ou regra casera.</p>`;
  } else {
    html += `<p class="muted">Casilla especial. Aplicade a regra correspondente.</p>`;
  }

  if (state.drawn) {
    html += `<div class="prop-item"><strong>${escapeHtml(state.drawn.kind)}</strong><span class="meta">${escapeHtml(state.drawn.text)}</span></div>`;
  }

  html += `<div class="actions">${actions.join('')}</div>`;
  $('spacePanel').innerHTML = html;
}

function renderBankSelect() {
  $('bankPlayer').innerHTML = state.players.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

function renderProperties() {
  const groups = Object.entries(state.properties || {});
  if (!groups.length) {
    $('propertyPanel').innerHTML = '<p class="muted">Aínda non hai propiedades compradas.</p>';
    return;
  }

  groups.sort(([a], [b]) => {
    const ia = BOARD.findIndex(s => s.propertyId === a || s.stationId === a);
    const ib = BOARD.findIndex(s => s.propertyId === b || s.stationId === b);
    return ia - ib;
  });

  $('propertyPanel').innerHTML = groups.map(([id, ps]) => {
    const data = PROPERTY_DATA[id] || STATION_DATA[id];
    const owner = state.players.find(p => p.id === ps.ownerId);
    const color = data?.group ? `<span class="prop-color group-${data.group}"></span>` : '🚉 ';
    const houses = ps.houses ? ` · ${ps.houses === 5 ? 'hotel' : ps.houses + ' casa(s)'}` : '';
    return `<div class="prop-item">
      <strong>${color}${escapeHtml(data?.name || id)}</strong>
      <span class="meta">${owner ? escapeHtml(owner.name) : 'Sen dono'}${houses}${ps.mortgaged?' · hipotecada':''}</span>
    </div>`;
  }).join('');
}

function renderLog() {
  $('logPanel').innerHTML = (state.log || []).slice(-70).reverse().map(l => `<div class="log-entry">${escapeHtml(l)}</div>`).join('');
}

function movePlayer(p, steps, passGo=true) {
  const old = p.position;
  const len = BOARD.length;
  let next = (old + steps) % len;
  if (next < 0) next += len;
  if (passGo && steps > 0 && old + steps >= len) {
    p.money += PASS_GO_AMOUNT;
    log(`${p.name} pasa por Piornedo e cobra ${fmt(PASS_GO_AMOUNT)}`);
  }
  p.position = next;
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

async function rollDice() {
  if (!isMyTurn() || state.hasRolled) return;
  const p = currentPlayer();
  if (!p || p.bankrupt) return;

  if (p.skipTurns > 0) {
    p.skipTurns -= 1;
    log(`${p.name} perde a quenda`);
    nextTurn();
    playSfx('bad');
    haptic([30, 30, 30]);
    await saveState();
    return;
  }

  const d1 = 1 + Math.floor(Math.random()*6);
  const d2 = 1 + Math.floor(Math.random()*6);
  animateDice(d1, d2);
  haptic(28);
  playSfx('roll');

  state.lastRoll = [d1, d2];
  state.hasRolled = true;
  state.drawn = null;
  movePlayer(p, d1+d2);

  log(`${p.name} tira ${d1}+${d2} e cae en ${BOARD[p.position].name}`);
  await saveState();
  setTimeout(fitBoardToMe, 500);
}

function animateDice(d1, d2) {
  const rotations = {
    1:'rotateX(-18deg) rotateY(30deg)',
    2:'rotateX(-108deg) rotateY(28deg)',
    3:'rotateX(-18deg) rotateY(-60deg)',
    4:'rotateX(-18deg) rotateY(120deg)',
    5:'rotateX(72deg) rotateY(28deg)',
    6:'rotateX(-18deg) rotateY(210deg)'
  };

  const cubes = [$('diceCube1'), $('diceCube2')].filter(Boolean);
  const vals = [d1, d2];
  cubes.forEach((cube, i) => {
    cube.style.setProperty('--dice-final', rotations[vals[i]] || rotations[1]);
    cube.classList.remove('rolling');
    void cube.offsetWidth;
    setTimeout(() => cube.classList.add('rolling'), i * 80);
  });

  $('diceLabel').textContent = `🎲 ${d1} + ${d2} = ${d1+d2}`;
}

function nextTurn() {
  state.hasRolled = false;
  state.drawn = null;
  if (!state.players.length) return;
  if (activePlayers().length === 0) return;
  let next = state.currentTurn;
  for (let i=0; i<state.players.length; i++) {
    next = (next + 1) % state.players.length;
    if (!state.players[next]?.bankrupt) {
      state.currentTurn = next;
      break;
    }
  }
  state.dice = null;
}

async function endTurn() {
  if (!isMyTurn()) return;
  nextTurn();
  playSfx('turn');
  haptic(18);
  await saveState();
}

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
  playSfx('buy');
  haptic([20, 25, 20]);
  confettiBurst();
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
  playSfx('pay');
  haptic(24);
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
  playSfx('build');
  haptic([20, 30, 20]);
  confettiBurst(45);
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
    playSfx('ok');
  } else {
    if (ps.houses > 0) return toast('Vende casas antes de hipotecar');
    p.money += data.mortgage;
    ps.mortgaged = true;
    log(`${p.name} hipoteca ${data.name} e cobra ${fmt(data.mortgage)}`);
    playSfx('pay');
  }
  haptic(20);
  await saveState();
}

async function drawEvent() {
  if (!isMyTurn()) return;
  drawFromDeck('event');
  playSfx('card');
  haptic([18, 35, 18]);
  await saveState();
}

async function drawMoney() {
  if (!isMyTurn()) return;
  drawFromDeck('money');
  playSfx('card');
  haptic([18, 35, 18]);
  await saveState();
}

function drawFromDeck(kind) {
  const deck = state.decks[kind] || [];
  if (deck.length === 0) state.decks[kind] = kind === 'event' ? shuffle(EVENT_CARDS) : shuffle(MONEY_CARDS);
  const idx = state.decks[kind].shift();
  const card = kind === 'event' ? EVENT_CARDS[idx] : MONEY_CARDS[idx];
  state.decks[kind].push(idx);
  const p = currentPlayer();

  if (kind === 'money') {
    if (card.amount) {
      p.money += card.amount;
      state.drawn = { kind:'DIÑEIRO', text:card.text, amount:card.amount };
      log(`${p.name}: ${card.text} ${card.amount > 0 ? 'Cobra' : 'Paga'} ${fmt(Math.abs(card.amount))}`);
      if (card.amount > 0) confettiBurst(35);
    } else if (card.each) {
      for (const pl of state.players) pl.money += card.each;
      state.drawn = { kind:'DIÑEIRO', text:card.text, amount:card.each };
      log(`${card.text} ${fmt(Math.abs(card.each))} por persoa`);
    }
    showCardModal('DIÑEIRO', card.amount || card.each || 0, card.text);
    return;
  }

  state.drawn = { kind:'EVENTO', text:card.text };
  showCardModal('EVENTO', 0, card.text);
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
    confettiBurst();
  } else {
    log(`${p.name} colle evento: ${card.text}`);
  }
}


async function sellHouseSelected() {
  const p = me();
  if (!p || p.bankrupt) return;
  const selected = $('tradeProperty')?.value;
  const current = propertyIdOf(currentSpace());
  const id = selected || current;
  const ps = state.properties[id];
  const data = PROPERTY_DATA[id];
  if (!ps || !data || ps.ownerId !== myPlayerId) return toast('Escolle unha propiedade túa con casas');
  if (!ps.houses) return toast('Esa propiedade non ten casas/hotel');
  const refund = Math.round(data.houseCost / 2);
  ps.houses -= 1;
  p.money += refund;
  log(`${p.name} vende unha construción en ${data.name} e cobra ${fmt(refund)}`);
  playSfx('pay');
  haptic([18, 24, 18]);
  await saveState();
}

async function quickTrade() {
  const from = me();
  if (!from || from.bankrupt) return;
  const toId = $('tradeToPlayer')?.value;
  const to = state.players.find(p => p.id === toId);
  const propId = $('tradeProperty')?.value;
  const money = +($('tradeMoney')?.value || 0);
  if (!to) return toast('Escolle xogador destinatario');
  if (money > 0 && from.money < money) return toast('Non tes ese diñeiro');
  if (!propId && money <= 0) return toast('Escolle diñeiro ou propiedade');

  if (propId) {
    const ps = state.properties[propId];
    const data = PROPERTY_DATA[propId] || STATION_DATA[propId];
    if (!ps || ps.ownerId !== myPlayerId) return toast('Esa propiedade non é túa');
    if (ps.houses) return toast('Non transfiras propiedades con casas');
    ps.ownerId = to.id;
    log(`${from.name} entrega ${data.name} a ${to.name}`);
  }

  if (money > 0) {
    from.money -= money;
    to.money += money;
    log(`${from.name} entrega ${fmt(money)} a ${to.name}`);
  }

  playSfx('ok');
  haptic([20, 35, 20]);
  await saveState();
}

async function declareBankruptcy() {
  const p = me();
  if (!p || p.bankrupt) return;
  const ok = confirm('Seguro que queres declararte en bancarrota? As túas propiedades volverán quedar libres.');
  if (!ok) return;

  p.bankrupt = true;
  p.money = 0;
  p.skipTurns = 0;
  for (const [id, ps] of Object.entries(state.properties || {})) {
    if (ps.ownerId === p.id) delete state.properties[id];
  }
  log(`${p.name} declara bancarrota. As súas propiedades quedan libres.`);
  if (isMyTurn()) nextTurn();
  playSfx('bad');
  haptic([40, 40, 80]);
  await saveState();
}


async function manualBank(amount) {
  const pid = $('bankPlayer').value;
  const p = state.players.find(pl => pl.id === pid);
  if (!p || !amount) return;
  p.money += amount;
  log(`${p.name}: ${amount > 0 ? 'ingreso' : 'cobro'} manual de ${fmt(Math.abs(amount))}`);
  playSfx(amount > 0 ? 'buy' : 'pay');
  haptic(18);
  await saveState();
}

function fitBoardToMe() {
  const p = me() || currentPlayer();
  if (!p) return;
  const sp = BOARD[p.position] || BOARD[0];
  const scroll = $('boardScroll');
  const wrap = $('boardWrap');
  const x = wrap.scrollWidth * sp.x / 100 - scroll.clientWidth / 2;
  const y = wrap.scrollHeight * sp.y / 100 - scroll.clientHeight / 2;
  scroll.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior:'smooth' });
}

function toggleZoom() {
  zoomed = !zoomed;
  $('boardWrap').classList.toggle('zoomed', zoomed);
  setTimeout(fitBoardToMe, 260);
}

function showCardModal(kind, amount, text) {
  $('modalKind').textContent = kind;
  $('modalTitle').textContent = amount ? (amount > 0 ? `Cobra ${fmt(amount)}` : `Paga ${fmt(Math.abs(amount))}`) : kind;
  $('modalText').textContent = text;
  $('modalVisual').textContent = kind === 'DIÑEIRO' ? (amount >= 0 ? '€' : '💸') : '?';
  const modal = $('cardModal');
  modal.classList.remove('hidden');
  modal.classList.remove('flip-enter');
  void modal.offsetWidth;
  modal.classList.add('flip-enter');
}

function closeModal() {
  $('cardModal').classList.add('hidden');
}

function log(text) {
  state.log = state.log || [];
  state.log.push(`${now()} · ${text}`);
  if (state.log.length > 120) state.log = state.log.slice(-120);
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2600);
}

function haptic(pattern) {
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  localStorage.setItem('monopolis.sound', soundEnabled ? 'on' : 'off');
  $('soundBtn').textContent = soundEnabled ? '🔊' : '🔇';
  if (soundEnabled) playSfx('ok');
}

function playSfx(type='ok') {
  if (!soundEnabled) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const g = audioCtx.createGain();
    g.connect(audioCtx.destination);
    const seq = {
      ok: [[520,.06],[740,.07]],
      win: [[420,.08],[640,.08],[860,.12]],
      roll: [[160,.04],[240,.04],[320,.04],[420,.08]],
      buy: [[500,.05],[620,.05],[780,.1]],
      pay: [[360,.06],[220,.1]],
      bad: [[180,.12],[120,.16]],
      card: [[460,.05],[600,.09]],
      build: [[280,.05],[520,.06],[760,.12]],
      turn: [[650,.06],[500,.07]]
    }[type] || [[520,.08]];
    let offset = 0;
    seq.forEach(([freq, dur]) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + offset);
      gain.gain.setValueAtTime(0.0001, t + offset);
      gain.gain.exponentialRampToValueAtTime(0.045, t + offset + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + offset + dur);
      osc.connect(gain); gain.connect(g);
      osc.start(t + offset); osc.stop(t + offset + dur + 0.02);
      offset += dur * .86;
    });
  } catch {}
}

function resizeFxCanvas() {
  const c = $('fxCanvas');
  c.width = Math.floor(innerWidth * devicePixelRatio);
  c.height = Math.floor(innerHeight * devicePixelRatio);
  c.style.width = `${innerWidth}px`;
  c.style.height = `${innerHeight}px`;
}

function confettiBurst(count=70) {
  const c = $('fxCanvas');
  const ctx = c.getContext('2d');
  const W = c.width, H = c.height, dpr = devicePixelRatio || 1;
  const pieces = Array.from({ length: count }, () => ({
    x: W * (.35 + Math.random()*.3),
    y: H * (.22 + Math.random()*.2),
    vx: (Math.random()-.5) * 10 * dpr,
    vy: (-7 - Math.random()*8) * dpr,
    g: (.28 + Math.random()*.22) * dpr,
    r: (3 + Math.random()*5) * dpr,
    a: Math.random()*Math.PI,
    va: (Math.random()-.5)*.25,
    life: 80 + Math.random()*35,
    color: ['#17362b','#77ada0','#d6b35e','#fff1b8','#d64d44'][Math.floor(Math.random()*5)]
  }));
  let frame = 0;
  function tick() {
    frame++;
    ctx.clearRect(0,0,W,H);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.a += p.va; p.life--;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 80));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r/2, p.r*2, p.r);
      ctx.restore();
    });
    if (pieces.some(p => p.life > 0) && frame < 140) requestAnimationFrame(tick);
    else ctx.clearRect(0,0,W,H);
  }
  requestAnimationFrame(tick);
}

function escapeHtml(s='') {
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

window.gameActions = { buyCurrent, payRent, buildCurrent, toggleMortgageCurrent, drawEvent, drawMoney, sellHouseSelected, quickTrade, declareBankruptcy };

boot();
