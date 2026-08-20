
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
let lastLandingShown = 0;
let lastPurchaseShown = 0;
let currentDisplayMode = localStorage.getItem('monopolis.displayMode') || 'full';

let myPlayerId = localStorage.getItem('monopolis.playerId') || crypto.randomUUID();
localStorage.setItem('monopolis.playerId', myPlayerId);

// Sistema de transacciones para evitar duplicación de acciones
let pendingTransaction = null;
let processedTransactions = new Set(); // Mantener registro de transacciones ya procesadas
let actionInProgress = false;

function withActionLock(fn) {
  return async function(...args) {
    if (actionInProgress) {
      toast('Operación en progreso...');
      return;
    }
    actionInProgress = true;
    try {
      await fn.apply(this, args);
    } finally {
      actionInProgress = false;
    }
  };
}

const $ = (id) => document.getElementById(id);
const fmt = (n) => `${Math.round(n).toLocaleString('de-DE')}€`;
const now = () => new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' });

async function boot() {
  populateTokens();
  bind();
  const serverReady = await initSupabase();

  const params = new URLSearchParams(location.search);
  const join = normalizeGameCode(params.get('join') || '');
  if (join) {
    $('joinCode').value = join;
    switchMode('join');
  }
  const viewMode = params.get('view');
  if (viewMode === 'host' || viewMode === 'player' || viewMode === 'full') currentDisplayMode = viewMode;
  setDisplayMode(currentDisplayMode);

  $('soundBtn').textContent = soundEnabled ? '🔊' : '🔇';
  resizeFxCanvas();
  window.addEventListener('resize', resizeFxCanvas);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  renderSetup();

  // Se este navegador xa pertencía á partida, recuperámola sen pedir nada outra vez.
  if (serverReady && join) await tryResumeGame(join);
}

function bind() {
  $('createGameBtn').onclick = createGame;
  $('joinGameBtn').onclick = joinGame;
  $('copyCodeBtn').onclick = copyCode;
  $('copyLinkBtn').onclick = copyLink;
  $('nativeShareBtn').onclick = nativeShare;
  $('startGameBtn').onclick = startGame;
  $('leaveGameBtn').onclick = () => { disconnect(); location.href = location.pathname; };
  $('rollBtn').onclick = rollDice;
  $('endTurnBtn').onclick = endTurn;
  $('bankAddBtn').onclick = () => manualBank(+$('bankAmount').value || 0);
  $('bankSubBtn').onclick = () => manualBank(-(+$('bankAmount').value || 0));
  $('moneyDeckBtn').onclick = () => { if (isMyTurn()) drawMoney(); };
  $('eventDeckBtn').onclick = () => { if (isMyTurn()) drawEvent(); };
  $('modeFullBtn').onclick = () => setDisplayMode('full');
  $('modePlayerBtn').onclick = () => setDisplayMode('player');
  $('modeHostBtn').onclick = () => setDisplayMode('host');
  $('fitBoardBtn').onclick = fitBoardToMe;
  $('zoomBoardBtn').onclick = toggleZoom;
  $('closeModalBtn').onclick = closeModal;
  $('sellHouseBtn').onclick = sellHouseSelected;
  $('bankruptBtn').onclick = declareBankruptcy;
  $('tradeBtn').onclick = quickTrade;
  $('soundBtn').onclick = toggleSound;
  $('tabCreate').onclick = () => switchMode('create');
  $('tabJoin').onclick = () => switchMode('join');
  $('joinCode').addEventListener('input', () => {
    const raw = $('joinCode').value.toUpperCase().replace(/\s+/g, '');
    $('joinCode').value = raw.replace(/[^A-Z0-9-]/g, '').slice(0, 11);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
    if (e.key === ' ' && state?.phase === 'playing' && isMyTurn() && !state.hasRolled) {
      e.preventDefault();
      rollDice();
    }
  });
}

function setDisplayMode(mode='full') {
  currentDisplayMode = mode;
  localStorage.setItem('monopolis.displayMode', mode);
  document.body.classList.toggle('mode-player', mode === 'player');
  document.body.classList.toggle('mode-host', mode === 'host');
  ['modeFullBtn','modePlayerBtn','modeHostBtn'].forEach(id => {
    const el = $(id);
    if (el) el.classList.toggle('active', id.toLowerCase().includes(mode));
  });
  if (mode !== 'player') setTimeout(fitBoardToMe, 150);
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

async function initSupabase() {
  const cfg = window.OMONOPOLIS_CONFIG || {};
  const url = sanitizeSupabaseUrl(cfg.SUPABASE_URL || '');
  const key = String(cfg.SUPABASE_ANON_KEY || '').trim();

  if (!url || !key || !window.supabase) {
    client = null;
    setConnection('servidor non dispoñible', 'error');
    console.error('O Monopolis: falta configurar SUPABASE_URL / SUPABASE_ANON_KEY en config.js');
    return false;
  }

  try {
    client = window.supabase.createClient(url, key);
    setConnection('conectando...', 'muted');

    const { data: sessionData, error: sessionError } = await client.auth.getSession();
    if (sessionError) throw sessionError;

    if (!sessionData?.session) {
      const { error: authError } = await client.auth.signInAnonymously();
      if (authError) throw authError;
    }

    setConnection('listo', 'online');
    return true;
  } catch (err) {
    client = null;
    setConnection('erro de acceso', 'error');
    console.error('O Monopolis: erro ao iniciar sesión anónima en Supabase', err);
    toast('Non se puido iniciar a sesión do xogo');
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

function normalizeGameCode(value='') {
  const clean = String(value).trim().toUpperCase().replace(/\s+/g, '');
  if (/^\d{4,6}$/.test(clean)) return `PIOR-${clean}`;
  return clean;
}

function friendlyServerError(error) {
  const msg = String(error?.message || error || '');
  if (msg.includes('PARTIDA_NON_ATOPADA')) return 'Partida non atopada';
  if (msg.includes('PARTIDA_XA_COMEZOU')) return 'A partida xa empezou';
  if (msg.includes('FICHA_OCUPADA')) return 'Esa ficha xa está collida';
  if (msg.includes('PARTIDA_CHEA')) return 'A partida xa ten 8 xogadores';
  if (msg.includes('FICHA_NON_VALIDA')) return 'Ficha non válida';
  if (msg.includes('VERSION_CONFLICT')) return 'A partida cambiou noutro dispositivo';
  if (msg.includes('AUTH_REQUIRED')) return 'Non hai sesión válida no servidor';
  if (msg.includes('HOST_ONLY')) return 'Só o host pode facer esa acción';
  if (msg.includes('MIN_PLAYERS_2')) return 'Fan falta polo menos 2 xogadores';
  if (msg.includes('PLAYER_IDENTITY_IMMUTABLE')) return 'A lista de xogadores cambiou; actualiza a partida';
  return 'Erro de servidor. Volve tentalo.';
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
    freePot: 0,
    lastLanding: null,
    lastPurchase: null,
    log: [`${now()} · ${player.name} creou a partida`]
  };
}

function normalizeState(s) {
  s.phase ||= 'lobby';
  s.players ||= [];
  s.currentTurn ||= 0;
  s.properties ||= {};
  s.freePot ||= 0;
  s.lastLanding ||= null;
  s.lastPurchase ||= null;
  s.lastRent ||= null;
  s.lastDrawn ||= null;
  s.lastPotCollection ||= null;
  s.processedTransactions ||= [];
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
  if (!client && !(await initSupabase())) return toast('Non se puido conectar co servidor');
  const name = $('createName').value.trim() || 'Xogador';
  const token = $('createToken').value;
  const payload = newState(name, token);

  setConnection('creando...', 'muted');
  const { data, error } = await client
    .rpc('monopolis_create_game', { p_state: payload, p_player_id: myPlayerId })
    .single();

  if (error || !data) {
    setConnection('erro', 'error');
    console.error('Erro creando partida', error);
    return toast(friendlyServerError(error));
  }

  gameRow = data;
  state = normalizeState(data.state);
  localStorage.setItem(`monopolis.${data.code}.playerId`, myPlayerId);
  await subscribe(data.id);
  history.replaceState(null, '', `${location.pathname}?join=${data.code}`);
  renderLobby();
  playSfx('win');
  confettiBurst();
}

async function joinGame() {
  if (!client && !(await initSupabase())) return toast('Non se puido conectar co servidor');
  const c = normalizeGameCode($('joinCode').value);
  const name = $('joinName').value.trim() || 'Xogador';
  const token = $('joinToken').value;
  if (!c) return toast('Falta o código');
  $('joinCode').value = c;

  setConnection('entrando...', 'muted');
  const { data, error } = await client
    .rpc('monopolis_join_game', {
      p_code: c,
      p_player_id: myPlayerId,
      p_name: name,
      p_token: token
    })
    .single();

  if (error || !data) {
    setConnection('non se puido entrar', 'error');
    console.error('Erro entrando na partida', error);
    return toast(friendlyServerError(error));
  }

  gameRow = data;
  state = normalizeState(data.state);
  localStorage.setItem(`monopolis.${c}.playerId`, myPlayerId);
  await subscribe(gameRow.id);
  history.replaceState(null, '', `${location.pathname}?join=${c}`);
  render();
  playSfx('ok');
}

async function tryResumeGame(c) {
  if (!client || !localStorage.getItem(`monopolis.${c}.playerId`)) return false;

  setConnection('recuperando...', 'muted');
  const { data, error } = await client.from(TABLE).select('*').eq('code', c).maybeSingle();
  if (error || !data) {
    setConnection('listo', 'online');
    return false;
  }

  const restored = normalizeState(data.state);
  if (!restored.players.some(p => p.id === myPlayerId)) {
    setConnection('listo', 'online');
    return false;
  }

  gameRow = data;
  state = restored;
  await subscribe(data.id);
  render();
  toast('Partida recuperada');
  return true;
}

async function subscribe(gameId) {
  if (channel) client.removeChannel(channel);
  channel = client.channel(`monopolis-${gameId}`)
    .on('postgres_changes', { event:'*', schema:'public', table:TABLE, filter:`id=eq.${gameId}` }, payload => {
      if (!payload.new) return;
      const prevTurn = currentPlayer()?.id;
      const prevRoll = state?.lastRoll?.join('-');
      const prevLandingTs = state?.lastLanding?.ts || 0;
      const prevPurchaseTs = state?.lastPurchase?.ts || 0;
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
        if ((state.lastLanding?.ts || 0) > prevLandingTs && (state.lastLanding?.ts || 0) > lastLandingShown) {
          showLandingZoom(state.lastLanding);
        }
        if ((state.lastPurchase?.ts || 0) > prevPurchaseTs && (state.lastPurchase?.ts || 0) > lastPurchaseShown) {
          showPropertyCardModal(state.lastPurchase.propertyId, state.lastPurchase.playerName);
        }
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
  if (!gameRow || !client) return false;
  setConnection(pending, 'muted');

  const { data, error } = await client
    .rpc('monopolis_save_game', {
      p_game_id: gameRow.id,
      p_expected_version: gameRow.version || 1,
      p_state: state
    })
    .single();

  if (error || !data) {
    setConnection('conflito', 'error');
    console.warn('Conflito/erro gardando partida', error);
    const fresh = await client.from(TABLE).select('*').eq('id', gameRow.id).maybeSingle();
    if (fresh.data) {
      gameRow = fresh.data;
      state = normalizeState(fresh.data.state);
      render();
    }
    if (error) {
      const isConflict = String(error.message || '').includes('VERSION_CONFLICT');
      toast(isConflict ? 'A partida actualizouse noutro móbil. Repite a acción.' : friendlyServerError(error));
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
  $('lobbyCount').textContent = `${state.players.length}/8`;
  $('startGameBtn').disabled = !isHost() || state.players.length < 2;
  $('startGameBtn').textContent = isHost() ? 'Comezar partida' : 'Agardando ao host…';
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
  const el = $('qrCanvas');
  el.innerHTML = '';

  if (window.QRCode) {
    new window.QRCode(el, {
      text,
      width: 170,
      height: 170,
      correctLevel: window.QRCode.CorrectLevel.M
    });
    return;
  }

  // A ligazón segue dispoñible aínda que a libraría QR non cargue.
  el.innerHTML = '<span class="muted">QR non dispoñible</span>';
}

function copyCode() {
  const c = gameRow?.code || '';
  if (!c) return;
  navigator.clipboard?.writeText(c);
  toast('Código copiado');
  haptic(18);
  playSfx('ok');
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
  renderDecks();
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
    <div class="pot-display"><span>🏛️ Bote Casa do Pobo</span><strong>${fmt(state.freePot || 0)}</strong></div>
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
      const canAfford = p && p.money >= data.price;
      actions.push(`<button ${!isMyTurn() || !canAfford ? 'disabled' : ''} onclick="window.gameActions.buyCurrent()">Comprar</button>`);
    } else {
      html += `<div class="prop-item"><strong>Dono: ${escapeHtml(owner.name)}</strong><span class="meta">${propState.mortgaged ? 'hipotecada' : 'activa'}${propState.houses ? ' · ' + (propState.houses === 5 ? 'hotel' : propState.houses + ' casa(s)') : ''}</span></div>`;
      if (owner.id !== p.id && !propState.mortgaged) {
        const rent = calcRent(space);
        const canPayRent = p && p.money >= rent;
        actions.push(`<button ${!isMyTurn() || !canPayRent ? 'disabled' : ''} onclick="window.gameActions.payRent()">Pagar aluguer ${fmt(rent)}</button>`);
      }
      if (owner.id === myPlayerId) {
        if (space.type === 'property') {
          const canBuild = p && ownsFullGroup(p.id, data.group) && (propState.houses || 0) < 5 && p.money >= data.houseCost;
          actions.push(`<button class="secondary" ${!isMyTurn() || !canBuild ? 'disabled' : ''} onclick="window.gameActions.buildCurrent()">Construír ${fmt(data.houseCost)}</button>`);
        }
        actions.push(`<button class="secondary" ${!isMyTurn() ? 'disabled' : ''} onclick="window.gameActions.toggleMortgageCurrent()">${propState.mortgaged ? 'Quitar hipoteca' : 'Hipotecar'}</button>`);
      }
    }
  } else if (space.type === 'event') {
    html += `<p class="muted">Cartiña de eventos: colle unha carta do mazo de eventos.</p>`;
    actions.push(`<button ${!isMyTurn() ? 'disabled' : ''} onclick="window.gameActions.drawEvent()">Coller Evento</button>`);
  } else if (space.type === 'money') {
    html += `<p class="muted">Cartiña de diñeiro: colle unha carta do mazo co símbolo €.</p>`;
    actions.push(`<button ${!isMyTurn() ? 'disabled' : ''} onclick="window.gameActions.drawMoney()">Coller Diñeiro</button>`);
  } else if (space.type === 'fee') {
    const fee = space.fee || 1500;
    html += `<p class="muted">Caixa Veciñal: aquí págase ${fmt(fee)} ao bote da Casa do Pobo.</p>`;
    html += `<div class="pot-display"><span>Pago desta casilla</span><strong>${fmt(fee)}</strong></div>`;
  } else if (space.type === 'parking') {
    html += `<p class="muted">Casa do Pobo: quen cae aquí cobra o bote acumulado das multas e contribucións.</p>`;
    html += `<div class="pot-display"><span>Bote actual</span><strong>${fmt(state.freePot || 0)}</strong></div>`;
  } else if (space.id === 'campo-futbol') {
    html += `<p class="muted">Caer aquí de normal é pachanga no Campo de Fútbol: non pasa nada. Só perdes quendas se te manda o Rumano á granxa.</p>`;
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

function renderDecks() {
  const ev = $('eventDeckCount');
  const mo = $('moneyDeckCount');
  if (ev) ev.textContent = `${state.decks?.event?.length || 0} cartas`;
  if (mo) mo.textContent = `${state.decks?.money?.length || 0} cartas`;
  const canDrawEvent = isMyTurn() && currentSpace()?.type === 'event';
  const canDrawMoney = isMyTurn() && currentSpace()?.type === 'money';
  if ($('eventDeckBtn')) $('eventDeckBtn').disabled = !canDrawEvent;
  if ($('moneyDeckBtn')) $('moneyDeckBtn').disabled = !canDrawMoney;
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


function applyLandingEffects(p, fromCard=false) {
  const space = BOARD[p.position];
  if (!space) return;

  if (space.type === 'fee') {
    const fee = space.fee || 1500;
    p.money -= fee;
    state.freePot = (state.freePot || 0) + fee;
    log(`${p.name} cae en Caixa Veciñal e paga ${fmt(fee)} ao bote da Casa do Pobo`);
    playSfx('pay');
    haptic([20, 30, 20]);
  }

  if (space.type === 'parking') {
    // Usar flag para garantizar que Casa do Pobo se cobra una sola vez
    const collectedPotKey = `collected-pot-${p.id}`;
    const alreadyCollected = state.lastPotCollection?.playerId === p.id && 
                             state.lastPotCollection?.ts > Date.now() - 5000;
    
    if (alreadyCollected) {
      log(`${p.name} chegou á Casa do Pobo pero xa cobrara o bote nesta movida`);
    } else {
      const pot = state.freePot || 0;
      if (pot > 0) {
        p.money += pot;
        state.lastPotCollection = { playerId:p.id, amount:pot, ts:Date.now() };
        state.freePot = 0;
        log(`${p.name} chega á Casa do Pobo e cobra o bote de ${fmt(pot)}`);
        confettiBurst(90);
        playSfx('win');
      } else {
        state.lastPotCollection = { playerId:p.id, amount:0, ts:Date.now() };
        log(`${p.name} chega á Casa do Pobo, pero o bote está baleiro`);
      }
    }
  }

  if (space.id === 'campo-futbol' && !fromCard) {
    log(`${p.name} cae no Campo de Fútbol e bota unha pachanga`);
  }
}

function consumeFarmEscapeCard(p) {
  const cards = p.keptCards || [];
  const idx = cards.findIndex(c => /granxa|alcalde|Libre/i.test(c));
  if (idx < 0) return null;
  const [card] = cards.splice(idx, 1);
  return card;
}

function showLandingZoom(landing) {
  if (!landing || !BOARD[landing.position]) return;
  lastLandingShown = landing.ts || Date.now();
  if (currentDisplayMode === 'player') {
    toast(`${landing.playerName || 'Xogador'} cae en ${landing.spaceName || BOARD[landing.position].name}`);
    return;
  }

  const space = BOARD[landing.position];
  const overlay = $('landingZoom');
  const viewport = $('landingViewport');
  const title = $('landingTitle');
  const subtitle = $('landingSubtitle');
  if (!overlay || !viewport) return;

  viewport.style.backgroundPosition = `${space.x}% ${space.y}%`;
  title.textContent = space.name;
  subtitle.textContent = `${landing.playerName || 'Xogador'} chegou aquí`;
  overlay.classList.remove('hidden');
  haptic(16);
  clearTimeout(showLandingZoom._t);
  showLandingZoom._t = setTimeout(() => overlay.classList.add('hidden'), 2450);
}

function groupColorClass(group) {
  return group ? `group-${group}` : '';
}

function propertyCardHTML(id, ownerName='') {
  const data = PROPERTY_DATA[id] || STATION_DATA[id];
  if (!data) return '<p>Propiedade non atopada.</p>';

  if (STATION_DATA[id]) {
    return `<div class="property-card-preview station">
      <div class="card-band">ESTACIÓN</div>
      <div class="card-body">
        <h3>${escapeHtml(data.name)}</h3>
        <div class="rent-row"><span>Prezo</span><strong>${fmt(data.price)}</strong></div>
        <div class="rent-row"><span>Hipoteca</span><strong>${fmt(data.mortgage)}</strong></div>
        <div class="rent-row"><span>1 estación</span><strong>${fmt(data.rents[0])}</strong></div>
        <div class="rent-row"><span>2 estacións</span><strong>${fmt(data.rents[1])}</strong></div>
        <div class="rent-row"><span>3 estacións</span><strong>${fmt(data.rents[2])}</strong></div>
        <div class="rent-row"><span>4 estacións</span><strong>${fmt(data.rents[3])}</strong></div>
        ${ownerName ? `<span class="owner-chip">👤 ${escapeHtml(ownerName)}</span>` : ''}
      </div>
    </div>`;
  }

  return `<div class="property-card-preview">
    <div class="card-band ${groupColorClass(data.group)}">${escapeHtml(data.name)}</div>
    <div class="card-body">
      <div class="rent-row"><span>Prezo</span><strong>${fmt(data.price)}</strong></div>
      <div class="rent-row"><span>Aluguer</span><strong>${fmt(data.rents[0])}</strong></div>
      <div class="rent-row"><span>1 casa</span><strong>${fmt(data.rents[1])}</strong></div>
      <div class="rent-row"><span>2 casas</span><strong>${fmt(data.rents[2])}</strong></div>
      <div class="rent-row"><span>3 casas</span><strong>${fmt(data.rents[3])}</strong></div>
      <div class="rent-row"><span>4 casas</span><strong>${fmt(data.rents[4])}</strong></div>
      <div class="rent-row"><span>Hotel</span><strong>${fmt(data.rents[5])}</strong></div>
      <div class="rent-row"><span>Hipoteca</span><strong>${fmt(data.mortgage)}</strong></div>
      <div class="rent-row"><span>Casa / hotel</span><strong>${fmt(data.houseCost)}</strong></div>
      ${ownerName ? `<span class="owner-chip">👤 ${escapeHtml(ownerName)}</span>` : ''}
    </div>
  </div>`;
}

function showPropertyCardModal(id, ownerName='') {
  const data = PROPERTY_DATA[id] || STATION_DATA[id];
  if (!data) return;
  lastPurchaseShown = state?.lastPurchase?.ts || Date.now();
  $('modalKind').textContent = 'TÍTULO DE PROPIEDADE';
  $('modalTitle').textContent = data.name;
  $('modalText').innerHTML = propertyCardHTML(id, ownerName);
  $('modalVisual').textContent = STATION_DATA[id] ? '🚉' : '🏠';
  const modal = $('cardModal');
  modal.classList.remove('hidden');
  modal.classList.remove('flip-enter');
  void modal.offsetWidth;
  modal.classList.add('flip-enter');
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
  applyLandingEffects(p, false);
  state.lastLanding = { position:p.position, playerId:p.id, playerName:p.name, spaceName:BOARD[p.position].name, ts:Date.now() };

  log(`${p.name} tira ${d1}+${d2} e cae en ${BOARD[p.position].name}`);
  await saveState();
  setTimeout(fitBoardToMe, 500);
  setTimeout(() => showLandingZoom(state.lastLanding), 180);
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
  state.lastDrawn = null;  // Limpiar última carta dibujada para que se pueda dibujar siguiente turno
  const p = currentPlayer();
  if (p && p.skipTurns && p.skipTurns > 0) {
    p.skipTurns--;
    if (p.skipTurns > 0) {
      log(`${p.name} salta un turno (le quedan ${p.skipTurns})`);
      // Avanzar al siguiente turno recursivamente
      const nextPlayerTurnStart = state.currentTurn;
      if (!state.players.length) return;
      if (activePlayers().length === 0) return;
      let next = state.currentTurn;
      for (let i=0; i<state.players.length; i++) {
        next = (next + 1) % state.players.length;
        if (!state.players[next]?.bankrupt && state.players[next]?.skipTurns === 0) {
          state.currentTurn = next;
          break;
        }
      }
      state.dice = null;
      return nextTurn();  // Verificar si el siguiente también salta
    }
  }
  if (!state.players.length) return;
  if (activePlayers().length === 0) return;
  let next = state.currentTurn;
  for (let i=0; i<state.players.length; i++) {
    next = (next + 1) % state.players.length;
    if (!state.players[next]?.bankrupt && (!state.players[next]?.skipTurns || state.players[next]?.skipTurns === 0)) {
      state.currentTurn = next;
      break;
    }
  }
  state.dice = null;
}

async function endTurn() {
  if (!isMyTurn()) return;
  
  // Validar que no haya acciones pendientes
  const space = currentSpace();
  if (space) {
    // Si está en una casilla que requiere acción, no permitir acabar turno
    if (space.type === 'property' || space.type === 'station') {
      const propState = state.properties[propertyIdOf(space)];
      if (!propState) {
        // Propiedad sin dueño = debería comprar o rechazar
        toast('Debe comprar o rechazar la propiedad');
        return;
      }
    } else if (space.type === 'fee' || space.type === 'parking') {
      // Caixa Veciñal y Casa do Pobo son automáticas, OK
    } else if (space.type === 'event' || space.type === 'money') {
      // Si aún no ha dibujado, debe hacerlo
      if (!state.lastDrawn || state.lastDrawn?.playerId !== currentPlayer().id) {
        toast('Debe sacar carta antes de rematar el turno');
        return;
      }
    }
  }
  
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
  
  // Crear ID de transacción único
  const txId = `buy-${id}-${p.id}-${Date.now()}`;
  if (state.processedTransactions?.includes(txId)) {
    toast('Xa compraches esta propiedade');
    return;
  }
  
  p.money -= data.price;
  state.properties[id] = { ownerId:p.id, mortgaged:false, houses:0 };
  
  // Marcar como procesada
  state.processedTransactions ??= [];
  state.processedTransactions.push(txId);
  
  state.lastPurchase = { propertyId:id, playerId:p.id, playerName:p.name, ts:Date.now() };
  log(`${p.name} compra ${data.name} por ${fmt(data.price)}`);
  playSfx('buy');
  haptic([20, 25, 20]);
  confettiBurst();
  showPropertyCardModal(id, p.name);
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
  if (!owner || owner.id === payer.id || ps.mortgaged) return;
  
  // Crear ID de transacción único para esta acción
  const txId = `rent-${id}-${payer.id}-${Date.now()}`;
  
  // Verificar si esta transacción ya fue procesada
  if (state.processedTransactions?.includes(txId)) {
    toast('Ya pagaste el alquiler en esta casilla');
    return;
  }
  
  const rent = calcRent(space);
  payer.money -= rent;
  owner.money += rent;
  
  // Marcar esta transacción como procesada
  state.processedTransactions ??= [];
  state.processedTransactions.push(txId);
  
  state.lastRent = { propertyId:id, payerId:payer.id, ownerId:owner.id, amount:rent, ts:Date.now() };
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
  const space = currentSpace();
  if (space?.type !== 'event') {
    toast('Non es unha cartiña de eventos');
    return;
  }
  
  // Verificar si ya se dibujó carta en esta posición esta vuelta
  const txId = `draw-event-${currentPlayer().id}-${Date.now()}`;
  if (state.lastDrawn?.type === 'event' && state.lastDrawn?.playerId === currentPlayer().id) {
    toast('Xa sacaches carta nesta vuelta');
    return;
  }
  
  drawFromDeck('event');
  playSfx('card');
  haptic([18, 35, 18]);
  await saveState();
}

async function drawMoney() {
  if (!isMyTurn()) return;
  const space = currentSpace();
  if (space?.type !== 'money') {
    toast('Non é unha cartiña de diñeiro');
    return;
  }
  
  // Verificar si ya se dibujó carta en esta posición esta vuelta
  if (state.lastDrawn?.type === 'money' && state.lastDrawn?.playerId === currentPlayer().id) {
    toast('Xa sacaches carta nesta vuelta');
    return;
  }
  
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
      if (card.amount < 0) state.freePot = (state.freePot || 0) + Math.abs(card.amount);
      state.drawn = { kind:'DIÑEIRO', text:card.text, amount:card.amount };
      state.lastDrawn = { type:'money', playerId:p.id, ts:Date.now() };
      log(`${p.name}: ${card.text} ${card.amount > 0 ? 'Cobra' : 'Paga'} ${fmt(Math.abs(card.amount))}${card.amount < 0 ? ' ao bote da Casa do Pobo' : ''}`);
      if (card.amount > 0) confettiBurst(35);
    } else if (card.each) {
      for (const pl of state.players) pl.money += card.each;
      if (card.each < 0) state.freePot = (state.freePot || 0) + Math.abs(card.each) * state.players.filter(pl => !pl.bankrupt).length;
      state.drawn = { kind:'DIÑEIRO', text:card.text, amount:card.each };
      state.lastDrawn = { type:'money', playerId:p.id, ts:Date.now() };
      log(`${card.text} ${fmt(Math.abs(card.each))} por persoa${card.each < 0 ? ' ao bote da Casa do Pobo' : ''}`);
    }
    showCardModal('DIÑEIRO', card.amount || card.each || 0, card.text);
    return;
  }

  state.drawn = { kind:'EVENTO', text:card.text };
  state.lastDrawn = { type:'event', playerId:p.id, ts:Date.now() };
  showCardModal('EVENTO', 0, card.text);
  applyEvent(card, p);
}

function applyEvent(card, p) {
  const a = card.action || { type:'manual' };

  if (a.type === 'moveTo') {
    moveTo(p, a.spaceId, a.passGo);
    if (a.skip) p.skipTurns += a.skip;
    applyLandingEffects(p, true);
    state.lastLanding = { position:p.position, playerId:p.id, playerName:p.name, spaceName:BOARD[p.position].name, ts:Date.now() };
    log(`${p.name}: ${card.text}`);
  } else if (a.type === 'moveToPay') {
    moveTo(p, a.spaceId, false);
    p.money -= a.amount;
    state.freePot = (state.freePot || 0) + Math.abs(a.amount);
    applyLandingEffects(p, true);
    state.lastLanding = { position:p.position, playerId:p.id, playerName:p.name, spaceName:BOARD[p.position].name, ts:Date.now() };
    log(`${p.name}: ${card.text} Paga ${fmt(a.amount)} ao bote da Casa do Pobo`);
  } else if (a.type === 'moveRelative') {
    movePlayer(p, a.delta, false);
    applyLandingEffects(p, true);
    state.lastLanding = { position:p.position, playerId:p.id, playerName:p.name, spaceName:BOARD[p.position].name, ts:Date.now() };
    log(`${p.name}: ${card.text}`);
  } else if (a.type === 'goToFarm') {
    moveTo(p, 'campo-futbol', false);
    const saved = consumeFarmEscapeCard(p);
    if (saved) {
      log(`${p.name} libra de traballar na granxa usando "${saved}"`);
    } else {
      p.skipTurns += a.turns || 2;
      log(`${p.name} vai traballar á granxa do Eloi e perde ${a.turns || 2} quendas`);
    }
    state.lastLanding = { position:p.position, playerId:p.id, playerName:p.name, spaceName:BOARD[p.position].name, ts:Date.now() };
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
  
  const txId = `sell-${id}-${p.id}-${Date.now()}`;
  if (state.processedTransactions?.includes(txId)) {
    toast('Xa vendiche nesta casilla');
    return;
  }
  
  const refund = Math.round(data.houseCost / 2);
  ps.houses -= 1;
  p.money += refund;
  
  state.processedTransactions ??= [];
  state.processedTransactions.push(txId);
  
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
  if (to.id === from.id) return toast('Non podes intercambiar contigo mesmo');
  if (money > 0 && from.money < money) return toast('Non tes ese diñeiro');
  if (!propId && money <= 0) return toast('Escolle diñeiro ou propiedade');

  const txId = `trade-${from.id}-${to.id}-${Date.now()}`;
  if (state.processedTransactions?.includes(txId)) {
    toast('Xa fixaches este intercambio');
    return;
  }

  if (propId) {
    const ps = state.properties[propId];
    const data = PROPERTY_DATA[propId] || STATION_DATA[propId];
    if (!ps || ps.ownerId !== myPlayerId) return toast('Esa propiedade non é túa');
    if (ps.houses) return toast('Non transfiras propiedades con casas');
    // Validar que aínda existe a propiedade no estado
    if (!state.properties[propId]) return toast('A propiedade xa non existe');
    ps.ownerId = to.id;
    log(`${from.name} entrega ${data.name} a ${to.name}`);
  }

  if (money > 0) {
    from.money -= money;
    to.money += money;
    log(`${from.name} entrega ${fmt(money)} a ${to.name}`);
  }

  state.processedTransactions ??= [];
  state.processedTransactions.push(txId);

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
  if (amount < 0) state.freePot = (state.freePot || 0) + Math.abs(amount);
  log(`${p.name}: ${amount > 0 ? 'ingreso' : 'cobro'} manual de ${fmt(Math.abs(amount))}${amount < 0 ? ' ao bote da Casa do Pobo' : ''}`);
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

window.gameActions = { 
  buyCurrent: withActionLock(buyCurrent), 
  payRent: withActionLock(payRent), 
  buildCurrent: withActionLock(buildCurrent), 
  toggleMortgageCurrent: withActionLock(toggleMortgageCurrent), 
  drawEvent: withActionLock(drawEvent), 
  drawMoney: withActionLock(drawMoney), 
  sellHouseSelected: withActionLock(sellHouseSelected), 
  quickTrade: withActionLock(quickTrade), 
  declareBankruptcy: withActionLock(declareBankruptcy) 
};

boot();
