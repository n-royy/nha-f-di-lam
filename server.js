// Nhà F Đi Làm: game server
// 2 chế độ & 2 BXH tách biệt:
// - Solo: Arcade vô tận kiểu Flappy Bird (1 va chạm dừng, điểm tăng theo chướng ngại vượt qua, lách sát, vật phẩm)
// - Thi đấu: Giải 500 người chấm công 8:15, 4 bản đồ khác nhau, MC điều khiển trực tiếp
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const CFG = require('./config');

const CLOCK0 = 7.5 * 3600;
const DEADLINE = CFG.DEADLINE_HOUR * 3600;
const RATE = (DEADLINE - CLOCK0) / CFG.CLOCK_SECONDS; // giây trong game trên mỗi giây thực
const BASE_MAX_SPEED = 520;                           // tốc độ trần cơ bản dùng để chặn kết quả vô lý
const MAX_NEAR_MISS = 25;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'game.json');

const app = express();
const httpServer = http.createServer(app);
const io = new Server({ pingInterval: 20000, pingTimeout: 25000, maxHttpBufferSize: 1e4, perMessageDeflate: false });
io.attach(httpServer);

// ---------- Địa chỉ vào game ----------
function lanIps() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) out.push(i.address);
  }
  return out;
}
const IPS = lanIps();
const baseUrl = CFG.PUBLIC_URL || (CFG.HTTPS ? `https://${IPS[0] || 'localhost'}:${CFG.HTTPS_PORT}` : `http://${IPS[0] || 'localhost'}:${CFG.PORT}`);
const JOIN_URL = baseUrl.replace(/\/$/, '') + '/#thi-dau';
const TILT_READY = /^https:/.test(baseUrl);

// ---------- Bản đồ ----------
const MAPS = CFG.MAPS;
const validMapId = id => {
  const n = Math.floor(+id);
  return Number.isFinite(n) && n >= 0 && n < MAPS.length ? n : 0;
};
const mapOf = id => MAPS[validMapId(id)];
const newSeed = () => ((Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0) || 20261103;

// ---------- Trang ----------
const pub = path.join(__dirname, 'public');
app.use(express.static(pub, { extensions: ['html'], index: false }));
app.use('/fonts/bvp', express.static(path.join(__dirname, 'node_modules/@fontsource/be-vietnam-pro'), { maxAge: '7d' }));
app.use('/fonts/chakra', express.static(path.join(__dirname, 'node_modules/@fontsource/chakra-petch'), { maxAge: '7d' }));
app.get('/', (_, res) => res.sendFile(path.join(pub, 'play.html')));
app.get('/host', (_, res) => res.sendFile(path.join(pub, 'host.html')));
app.get('/bang', (_, res) => res.sendFile(path.join(pub, 'host.html')));
app.get('/logo', (_, res) => {
  for (const ext of ['svg', 'png', 'webp', 'jpg']) {
    const f = path.join(pub, 'logo-fpt.' + ext);
    if (fs.existsSync(f)) return res.sendFile(f);
  }
  res.status(404).end();
});
app.get('/qr.svg', async (_, res) => {
  const svg = await QRCode.toString(JOIN_URL, { type: 'svg', margin: 1, color: { dark: '#11181f', light: '#ffffff' } });
  res.type('image/svg+xml').send(svg);
});
const clientConfig = {
  route: CFG.ROUTE, deadline: DEADLINE, clock0: CLOCK0, rate: RATE, raceSeconds: CFG.RACE_SECONDS,
  max: CFG.MAX_PLAYERS, departments: CFG.DEPARTMENTS, fineK: CFG.LATE_FINE_K,
  maps: MAPS.map(m => ({ id: m.id, code: m.code, name: m.name, place: m.place, subtitle: m.subtitle, summary: m.summary, tags: m.tags, speedMul: m.speedMul })),
};
app.get('/game-config.js', (_, res) => res.type('text/javascript').send('window.DCC=' + JSON.stringify(clientConfig)));

// 2 API BXH tách biệt hoàn toàn: Solo vô tận & Thi đấu giải
app.get('/api/bxh-solo', (req, res) => {
  const m = req.query.map;
  const mapFilter = m !== undefined && m !== '' && m !== 'all' ? validMapId(m) : null;
  res.json(soloBoard(mapFilter));
});
app.get('/api/bxh', (req, res) => {
  const m = req.query.map;
  const mapFilter = m !== undefined && m !== '' && m !== 'all' ? validMapId(m) : null;
  res.json(soloBoard(mapFilter));
});
app.get('/api/bxh-thidau', (_, res) => res.json(contestBoardApi()));

// ---------- Tiện ích ----------
let seq = 0;
const newId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 7);
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const int = (v, max) => clamp(Math.floor(+v) || 0, 0, max);

// Điểm chế độ Thi đấu (giữ nguyên luật hiện tại)
function finalScore(sec, progress, hits, reds, picks, near) {
  if (sec == null) return Math.max(0, Math.round(clamp(progress, 0, 1) * 500));
  return Math.max(0, Math.round(1000 + ((DEADLINE - sec) / 60) * 20 - hits * 20 - reds * 50 + picks * 15 + (near || 0) * 5));
}
function liveScore(e, elapsed) {
  const lateSec = Math.max(0, CLOCK0 + elapsed * RATE - DEADLINE);
  const latePen = (lateSec / 60) * 20;
  return Math.max(0, Math.round(e.progress * 1000 - latePen - e.hits * 20 - e.reds * 50 + e.picks * 15 + (e.near || 0) * 5));
}
const byRank = (a, b) => b.score - a.score || (a.sec == null ? 1e12 : a.sec) - (b.sec == null ? 1e12 : b.sec);
const bySoloRank = (a, b) => b.score - a.score || (b.dist || 0) - (a.dist || 0) || (a.at || 0) - (b.at || 0);

function maxProgress(elapsed, mapId) {
  const cap = BASE_MAX_SPEED * (mapOf(mapId).speedMul || 1);
  return clamp((elapsed * cap) / CFG.ROUTE + 0.03, 0, 1);
}
function minFinishSec(mapId) {
  const cap = BASE_MAX_SPEED * (mapOf(mapId).speedMul || 1);
  return (CFG.ROUTE / cap) * 0.85;
}
function fmtClock(s) {
  if (s == null) return 'Chưa tới';
  const sec = Math.floor(s);
  const h = Math.floor(sec / 3600);
  const m = Math.floor(sec / 60) % 60;
  const x = sec % 60;
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${x < 10 ? '0' : ''}${x}`;
}

// ---------- Trạng thái ----------
const profiles = new Map();    // token -> { id, token, name, dept }
const profileById = new Map(); // id -> profile
const entries = new Map();     // profile id -> người chơi trong giải Thi đấu hiện tại
let soloRuns = [];             // lượt chơi Mode Solo (vô tận kiểu Flappy Bird)
let lastContest = null;        // snapshot BXH giải Thi đấu gần nhất đã kết thúc
// phase: idle | lobby | racing | finished
let G = freshGame('idle', 0);
function freshGame(phase, mapId) {
  return { id: newId(), phase, mapId: validMapId(mapId), seed: newSeed(), startAt: 0, endAt: 0, endedAt: 0 };
}

function loadData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const p of d.profiles || []) {
      profiles.set(p.token, p);
      profileById.set(p.id, p);
    }
    // Chỉ giữ các lượt Solo vô tận (tách biệt với kiểu chấm công cũ)
    soloRuns = (d.soloRuns || []).filter(r => r && r.mode === 'endless').map(r => ({ ...r, mapId: validMapId(r.mapId) }));
    lastContest = d.lastContest || null;
    if (d.game && d.game.phase === 'finished') {
      G = { ...freshGame('finished', d.game.mapId), ...d.game, mapId: validMapId(d.game.mapId), seed: d.game.seed || newSeed() };
      for (const e of d.entries || []) entries.set(e.id, { near: 0, ...e });
    } else if (d.game && d.game.phase === 'lobby') {
      for (const e of d.entries || []) if (!e.bot) entries.set(e.id, { near: 0, ...e });
      if (entries.size) G = { ...freshGame('lobby', d.game.mapId), ...d.game, mapId: validMapId(d.game.mapId), seed: d.game.seed || newSeed() };
    }
  } catch (_) { /* lần đầu chạy */ }
}

let saveTimer = null;
let saveBusy = false;
function buildSavePayload() {
  return JSON.stringify({ profiles: [...profiles.values()], soloRuns, lastContest, game: G, entries: [...entries.values()] });
}
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (saveBusy) { saveSoon(); return; }
    saveBusy = true;
    const body = buildSavePayload();
    fs.mkdir(DATA_DIR, { recursive: true }, () => {
      fs.writeFile(DATA_FILE + '.tmp', body, err => {
        if (err) { saveBusy = false; return; }
        fs.rename(DATA_FILE + '.tmp', DATA_FILE, () => { saveBusy = false; });
      });
    });
  }, 2000);
}
function saveSyncNow() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(DATA_FILE + '.tmp', buildSavePayload());
    fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
  } catch (_) {}
}

// ---------- BXH Solo Vô Tận (tách biệt hoàn toàn với Thi đấu) ----------
function bestSoloRuns(mapFilter) {
  const bestByPlayer = new Map();
  let totalRuns = 0;
  for (const r of soloRuns) {
    if (mapFilter != null && validMapId(r.mapId) !== mapFilter) continue;
    totalRuns++;
    const prev = bestByPlayer.get(r.pid);
    if (!prev || bySoloRank(r, prev) < 0) bestByPlayer.set(r.pid, r);
  }
  const sorted = [...bestByPlayer.values()].sort(bySoloRank);
  return { sorted, totalRuns };
}

function soloBoard(mapFilter) {
  const { sorted, totalRuns } = bestSoloRuns(mapFilter);
  return {
    mode: 'solo',
    mapId: mapFilter,
    total: totalRuns,
    players: sorted.length,
    rows: sorted.slice(0, 200).map(r => ({
      pid: r.pid, name: r.name, dept: r.dept, score: r.score,
      passed: r.passed || 0, dist: r.dist || 0, mapId: validMapId(r.mapId),
    })),
  };
}

function soloLeader(mapFilter) {
  const { sorted } = bestSoloRuns(mapFilter);
  const best = sorted[0];
  return best ? { n: best.name, d: best.dept, c: best.score, dist: best.dist || 0, m: validMapId(best.mapId) } : null;
}

// ---------- Thi đấu (giữ nguyên luật 8:15) ----------
const elapsedNow = () => (G.startAt ? Math.max(0, (Date.now() - G.startAt) / 1000) : 0);

function publicState() {
  return {
    phase: G.phase, gameId: G.id, mapId: G.mapId, seed: G.seed, count: entries.size, max: CFG.MAX_PLAYERS,
    startsInMs: G.phase === 'racing' ? G.startAt - Date.now() : 0,
  };
}
function entryView(e) {
  return e ? { status: e.status, progress: e.progress, hits: e.hits, reds: e.reds, picks: e.picks, near: e.near || 0, sec: e.sec, score: e.score } : null;
}
function deptStandings(list) {
  const byDept = new Map();
  for (const e of list) {
    if (!e.dept) continue;
    let d = byDept.get(e.dept);
    if (!d) { d = { dept: e.dept, count: 0, totalScore: 0, done: 0, late: 0 }; byDept.set(e.dept, d); }
    d.count++;
    d.totalScore += e.score || 0;
    if (e.status === 'done' && e.sec != null) d.done++;
    if (e.status === 'done' && (e.sec == null || e.sec > DEADLINE)) d.late++;
  }
  return [...byDept.values()]
    .map(d => ({ dept: d.dept, count: d.count, avg: Math.round(d.totalScore / d.count), done: d.done, late: d.late, fineK: d.late * CFG.LATE_FINE_K }))
    .sort((a, b) => b.avg - a.avg || b.count - a.count)
    .slice(0, 6);
}
function results() {
  const all = [...entries.values()].sort(byRank);
  return {
    all,
    top: all.slice(0, 3).map(e => ({ id: e.id, name: e.name, dept: e.dept, score: e.score, sec: e.sec })),
    depts: deptStandings(all),
  };
}
const TOP_ROWS = 30;
const rowForPhone = e => ({ i: e.id, n: e.name, d: e.dept, s: e.status, p: Math.round(e.progress * 100), c: e.score, t: e.sec });
function phoneBoard(sorted) {
  return { total: sorted.length, done: sorted.filter(e => e.sec != null).length, mapId: G.mapId, rows: sorted.slice(0, TOP_ROWS).map(rowForPhone) };
}
function sortedNow() {
  const list = [...entries.values()];
  const el = elapsedNow();
  for (const e of list) if (e.status === 'racing') e.score = liveScore(e, el);
  return list.sort(byRank);
}
function contestBoardApi() {
  if ((G.phase === 'racing' || G.phase === 'finished') && entries.size > 0) {
    const list = sortedNow();
    const done = list.filter(e => e.status === 'done');
    const late = done.filter(e => e.sec == null || e.sec > DEADLINE).length;
    return {
      mode: 'contest', phase: G.phase, gameId: G.id, mapId: G.mapId, endedAt: G.endedAt || 0,
      total: list.length, done: done.filter(e => e.sec != null).length, late, fineK: late * CFG.LATE_FINE_K,
      depts: deptStandings(list),
      rows: list.slice(0, 200).map(e => ({ pid: e.id, name: e.name, dept: e.dept, status: e.status, progress: Math.round(e.progress * 100), sec: e.sec, score: e.score })),
    };
  }
  if (lastContest) return { mode: 'contest', ...lastContest };
  return { mode: 'contest', phase: G.phase, mapId: G.mapId, total: 0, done: 0, late: 0, fineK: 0, depts: [], rows: [] };
}
function resultFor(id, cache) {
  const r = cache || results();
  const idx = r.all.findIndex(e => e.id === id);
  if (idx < 0) return null;
  const e = r.all[idx];
  return {
    rank: idx + 1, total: r.all.length, score: e.score, sec: e.sec, hits: e.hits, reds: e.reds, picks: e.picks, near: e.near || 0,
    mapId: G.mapId, winner: r.top[0], runners: r.top.slice(1, 3), isWinner: idx === 0, board: phoneBoard(r.all),
  };
}
function startContest() {
  if (G.phase !== 'lobby' || entries.size < 1) return;
  G.phase = 'racing';
  G.seed = newSeed();
  G.startAt = Date.now() + CFG.COUNTDOWN_SECONDS * 1000;
  G.endAt = G.startAt + (CFG.RACE_SECONDS + 8) * 1000;
  for (const e of entries.values()) Object.assign(e, { status: 'racing', progress: 0, hits: 0, reds: 0, picks: 0, near: 0, sec: null, score: 0, doneAt: 0 });
  startBots();
  io.to('players').emit('state', publicState());
  pushBoard(true);
  saveSoon();
}
function markDone(e, sec) {
  if (e.status === 'done') return;
  e.status = 'done';
  e.sec = sec == null ? null : Math.round(sec);
  e.score = finalScore(e.sec, e.progress, e.hits, e.reds, e.picks, e.near || 0);
  e.doneAt = Date.now();
}
function endContest() {
  if (G.phase !== 'racing') return;
  G.phase = 'finished';
  G.endedAt = Date.now();
  for (const e of entries.values()) if (e.status !== 'done') markDone(e, null);
  stopBots();
  const r = results();
  const doneList = r.all.filter(e => e.status === 'done');
  const late = doneList.filter(e => e.sec == null || e.sec > DEADLINE).length;
  lastContest = {
    phase: 'finished', gameId: G.id, mapId: G.mapId, endedAt: G.endedAt,
    total: r.all.length, done: doneList.filter(e => e.sec != null).length, late, fineK: late * CFG.LATE_FINE_K,
    depts: r.depts,
    rows: r.all.slice(0, 200).map(e => ({ pid: e.id, name: e.name, dept: e.dept, status: e.status, progress: Math.round(e.progress * 100), sec: e.sec, score: e.score })),
  };
  for (const e of entries.values()) if (e.socketId) io.to(e.socketId).emit('results', resultFor(e.id, r));
  io.to('players').emit('state', publicState());
  pushBoard(true);
  saveSoon();
}
function newContest(keepPlayers, mapId) {
  stopBots();
  const old = [...entries.values()];
  const targetMap = mapId !== undefined ? validMapId(mapId) : G.mapId;
  io.socketsLeave('finishers');
  G = freshGame('lobby', targetMap);
  entries.clear();
  if (keepPlayers) for (const e of old) if (!e.bot) entries.set(e.id, blankEntry(e));
  io.to('players').emit('state', publicState());
  io.to('players').emit('contest:reset', { kept: keepPlayers, mapId: G.mapId });
  pushBoard(true);
  saveSoon();
}
function setContestMap(mapId) {
  if (G.phase !== 'lobby') return;
  G.mapId = validMapId(mapId);
  G.seed = newSeed();
  io.to('players').emit('state', publicState());
  pushBoard(true);
  saveSoon();
}
function kickPlayer(id) {
  if (G.phase !== 'lobby') return false;
  const e = entries.get(String(id || ''));
  if (!e) return false;
  entries.delete(e.id);
  if (e.socketId) io.to(e.socketId).emit('kicked', { reason: 'Ban Tổ Chức đã gỡ tên anh/chị khỏi danh sách đăng ký. Vui lòng đăng ký lại với tên hiển thị phù hợp.' });
  countDirty = true;
  pushBoard(true);
  saveSoon();
  return true;
}
function blankEntry(p) {
  return { id: p.id, name: p.name, dept: p.dept, bot: !!p.bot, socketId: p.socketId || null, at: p.at || Date.now(), status: 'registered', progress: 0, hits: 0, reds: 0, picks: 0, near: 0, sec: null, score: 0, doneAt: 0 };
}

// ---------- Xuất CSV cho MC ----------
function csvCell(v) {
  const s = String(v == null ? '' : v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function buildCsv() {
  const list = sortedNow();
  const m = mapOf(G.mapId);
  const header = ['Hạng', 'Họ tên', 'Đơn vị', 'Lộ trình', 'Trạng thái', 'Giờ về đích', 'Điểm', 'Va chạm', 'Vượt đèn đỏ', 'Vật phẩm', 'Vượt sát an toàn', 'Tiến độ (%)'];
  const lines = [header.map(csvCell).join(',')];
  list.forEach((e, i) => {
    const statusText = e.status === 'done'
      ? (e.sec == null ? 'Chưa tới cổng' : (e.sec <= DEADLINE ? 'Đúng giờ' : 'Đi muộn'))
      : (e.status === 'racing' ? 'Đang đua' : 'Đã đăng ký');
    lines.push([
      i + 1, e.name, e.dept || '', m.place, statusText, fmtClock(e.sec), e.score,
      e.hits, e.reds, e.picks, e.near || 0, Math.round(e.progress * 100),
    ].map(csvCell).join(','));
  });
  return '\uFEFF' + lines.join('\r\n');
}

// ---------- Người chơi ảo để tập dượt ----------
let botTimer = null;
function addBots(n) {
  if (G.phase !== 'lobby') return;
  for (let i = 0; i < n && entries.size < CFG.MAX_PLAYERS; i++) {
    const id = 'bot-' + newId();
    entries.set(id, blankEntry({ id, name: 'Bot ' + (entries.size + 1), dept: CFG.DEPARTMENTS[entries.size % CFG.DEPARTMENTS.length], bot: true }));
  }
}
function clearBots() {
  if (G.phase !== 'lobby') return;
  for (const [id, e] of entries) if (e.bot) entries.delete(id);
}
function startBots() {
  const spMul = mapOf(G.mapId).speedMul || 1;
  for (const e of entries.values()) if (e.bot) e.botSpeed = spMul / (48 + Math.random() * 50);
  clearInterval(botTimer);
  botTimer = setInterval(() => {
    if (G.phase !== 'racing' || Date.now() < G.startAt) return;
    for (const e of entries.values()) {
      if (!e.bot || e.status === 'done') continue;
      e.progress = clamp(e.progress + e.botSpeed, 0, 1);
      if (Math.random() < 0.012) e.hits++;
      if (Math.random() < 0.002) e.reds++;
      if (Math.random() < 0.03 && e.picks < 6) e.picks++;
      if (Math.random() < 0.04 && (e.near || 0) < 8) e.near = (e.near || 0) + 1;
      if (e.progress >= 1) markDone(e, CLOCK0 + elapsedNow() * RATE);
    }
  }, 1000);
}
function stopBots() { clearInterval(botTimer); botTimer = null; }

// ---------- Màn hình MC ----------
function boardPayload() {
  const list = sortedNow();
  const done = list.filter(e => e.status === 'done');
  const late = done.filter(e => e.sec == null || e.sec > DEADLINE).length;
  return {
    phase: G.phase, gameId: G.id, mapId: G.mapId, seed: G.seed, count: list.length, max: CFG.MAX_PLAYERS,
    startsInMs: G.phase === 'racing' ? G.startAt - Date.now() : 0,
    done: done.filter(e => e.sec != null).length, late, fineK: late * CFG.LATE_FINE_K,
    bots: list.filter(e => e.bot).length,
    online: io.of('/').adapter.rooms.get('players')?.size || 0,
    joinUrl: JOIN_URL, tilt: TILT_READY, soloTop: soloLeader(G.mapId) || soloLeader(null),
    depts: deptStandings(list),
    rows: list.map(e => ({ i: e.id, n: e.name, d: e.dept, s: e.status, p: Math.round(e.progress * 100), c: e.score, t: e.sec, b: e.bot ? 1 : 0 })),
  };
}
let boardDirty = true;
function pushBoard(force) {
  boardDirty = true;
  if (force) flushBoard();
}
function flushBoard() {
  if (!boardDirty && G.phase !== 'racing') return;
  boardDirty = false;
  io.to('board').emit('board', boardPayload());
}
setInterval(() => {
  if (G.phase === 'racing' && Date.now() > G.endAt) endContest();
  if (G.phase === 'racing' && Date.now() > G.startAt && [...entries.values()].every(e => e.status === 'done')) endContest();
  flushBoard();
}, 1000);

setInterval(() => {
  if (G.phase !== 'racing' || Date.now() < G.startAt) return;
  const list = sortedNow();
  list.forEach((e, i) => {
    if (e.socketId) {
      const ahead = i > 0 ? list[i - 1] : null;
      const behind = i + 1 < list.length ? list[i + 1] : null;
      io.to(e.socketId).volatile.emit('rank', {
        r: i + 1, t: list.length, c: e.score,
        ah: ahead ? { n: ahead.name, p: Math.round(ahead.progress * 1000) / 1000 } : null,
        bh: behind ? { n: behind.name, p: Math.round(behind.progress * 1000) / 1000 } : null,
      });
    }
  });
  io.to('finishers').volatile.emit('cboard', phoneBoard(list));
}, CFG.RANK_MS);

let countDirty = false;
setInterval(() => {
  if (countDirty) { countDirty = false; io.to('players').emit('count', entries.size); }
}, 2000);

// ---------- Kết nối ----------
io.on('connection', socket => {
  socket.data.isHost = false;

  socket.on('hello', (token, cb) => {
    if (typeof cb !== 'function') return;
    socket.join('players');
    const prof = profiles.get(String(token || ''));
    let entry = null;
    if (prof) {
      socket.data.pid = prof.id;
      entry = entries.get(prof.id) || null;
      if (entry) entry.socketId = socket.id;
      if (entry && entry.status === 'done') socket.join('finishers');
    }
    cb({
      state: publicState(),
      profile: prof ? { id: prof.id, name: prof.name, dept: prof.dept } : null,
      entry: entryView(entry),
      result: G.phase === 'finished' && entry ? resultFor(prof.id) : null,
      board: entry && entry.status === 'done' ? phoneBoard(sortedNow()) : null,
    });
  });

  function ensureProfile(data) {
    const name = clean(data && data.name, 40);
    if (name.length < 2) return { error: 'Vui lòng nhập họ tên từ 2 ký tự trở lên.' };
    const dept = clean(data && data.dept, 30);
    let prof = profiles.get(String((data && data.token) || ''));
    if (!prof) {
      prof = { id: newId(), token: newId() + newId(), name, dept };
      profiles.set(prof.token, prof);
      profileById.set(prof.id, prof);
    } else {
      prof.name = name;
      prof.dept = dept;
    }
    socket.data.pid = prof.id;
    socket.join('players');
    return { prof };
  }

  socket.on('profile', (data, cb) => {
    if (typeof cb !== 'function') return;
    const r = ensureProfile(data);
    if (r.error) return cb({ ok: false, error: r.error });
    saveSoon();
    cb({ ok: true, id: r.prof.id, token: r.prof.token });
  });

  socket.on('join', (data, cb) => {
    if (typeof cb !== 'function') return;
    const r = ensureProfile(data);
    if (r.error) return cb({ ok: false, error: r.error });
    const prof = r.prof;
    const cur = entries.get(prof.id);
    if (cur) {
      cur.name = prof.name; cur.dept = prof.dept; cur.socketId = socket.id;
      pushBoard();
      return cb({ ok: true, id: prof.id, token: prof.token, state: publicState(), entry: entryView(cur) });
    }
    if (G.phase === 'idle') return cb({ ok: false, id: prof.id, token: prof.token, error: 'Ban Tổ Chức chưa mở vòng thi đấu. Anh/chị có thể trải nghiệm chế độ Solo trong lúc chờ.' });
    if (G.phase !== 'lobby') return cb({ ok: false, id: prof.id, token: prof.token, error: 'Vòng thi đấu đã chốt danh sách tham gia. Anh/chị có thể trải nghiệm chế độ Solo trong lúc chờ vòng tiếp theo.' });
    if (entries.size >= CFG.MAX_PLAYERS) return cb({ ok: false, id: prof.id, token: prof.token, error: `Vòng thi đấu đã đạt giới hạn ${CFG.MAX_PLAYERS} người tham gia. Anh/chị có thể trải nghiệm chế độ Solo trong lúc chờ vòng tiếp theo.` });
    const e = blankEntry({ id: prof.id, name: prof.name, dept: prof.dept, socketId: socket.id });
    entries.set(prof.id, e);
    countDirty = true;
    pushBoard();
    saveSoon();
    cb({ ok: true, id: prof.id, token: prof.token, state: publicState(), entry: entryView(e) });
  });

  socket.on('leave', cb => {
    if (G.phase === 'lobby' && socket.data.pid && entries.delete(socket.data.pid)) { countDirty = true; pushBoard(); saveSoon(); }
    if (typeof cb === 'function') cb({ ok: true });
  });

  // Tiến độ Thi đấu
  socket.on('progress', d => {
    const e = entries.get(socket.data.pid);
    if (!e || G.phase !== 'racing' || e.status !== 'racing' || Date.now() < G.startAt || !d) return;
    const m = mapOf(G.mapId);
    const limit = maxProgress(elapsedNow(), G.mapId);
    e.progress = clamp(Math.max(e.progress, +d.p || 0), 0, limit);
    e.hits = Math.max(e.hits, int(d.h, 99));
    e.reds = Math.max(e.reds, int(d.r, 20));
    e.picks = Math.max(e.picks, int(d.b, m.maxPicks));
    e.near = Math.max(e.near || 0, int(d.nm, MAX_NEAR_MISS));
  });

  socket.on('finish', (d, cb) => {
    if (typeof cb !== 'function') return;
    const e = entries.get(socket.data.pid);
    if (!e || G.phase !== 'racing' || !d) return cb({ ok: false, error: 'Vòng thi đấu đã kết thúc.' });
    socket.join('finishers');
    if (e.status === 'done') return cb({ ok: true, sec: e.sec, score: e.score, board: phoneBoard(sortedNow()) });
    const elapsed = elapsedNow();
    const m = mapOf(G.mapId);
    e.progress = clamp(Math.max(e.progress, +d.p || 0), 0, maxProgress(elapsed, G.mapId));
    e.hits = Math.max(e.hits, int(d.h, 99));
    e.reds = Math.max(e.reds, int(d.r, 20));
    e.picks = Math.max(e.picks, int(d.b, m.maxPicks));
    e.near = Math.max(e.near || 0, int(d.nm, MAX_NEAR_MISS));
    const arrived = d.arrived === true && e.progress >= 0.85 && elapsed >= minFinishSec(G.mapId);
    markDone(e, arrived ? CLOCK0 + elapsed * RATE : null);
    pushBoard();
    saveSoon();
    cb({ ok: true, sec: e.sec, score: e.score, rejected: d.arrived === true && !arrived, board: phoneBoard(sortedNow()) });
  });

  // Solo Vô Tận (kiểu Flappy Bird): máy chủ cấp seed & tính điểm chống gian lận theo thời gian sống sót
  socket.on('solo:start', (opts, cb) => {
    if (typeof opts === 'function') { cb = opts; opts = {}; }
    const mapId = validMapId(opts && opts.mapId);
    const seed = newSeed();
    socket.data.soloAt = Date.now();
    socket.data.soloMapId = mapId;
    socket.data.soloSeed = seed;
    if (typeof cb === 'function') cb({ ok: true, mapId, seed });
  });
  socket.on('solo:finish', (d, cb) => {
    if (typeof cb !== 'function') return;
    const prof = profileById.get(socket.data.pid);
    if (!prof || !socket.data.soloAt || !d) return cb({ ok: false, error: 'Chưa ghi nhận được kết quả. Vui lòng thử lại.' });
    const elapsed = Math.max(0.1, (Date.now() - socket.data.soloAt) / 1000);
    const mapId = validMapId(socket.data.soloMapId);
    const m = mapOf(mapId);
    socket.data.soloAt = 0;

    // Giới hạn vật lý theo thời gian sống sót thực tế (chống gian lận điểm)
    const maxDist = Math.round(elapsed * BASE_MAX_SPEED * (m.speedMul || 1) * 1.45 + 450);
    const dist = clamp(Math.round(+d.dist || 0), 0, maxDist);
    const maxPassed = Math.floor(dist / 140) + 2;
    const maxNear = Math.min(300, maxPassed * 2 + 2);
    const maxPicks = Math.floor(dist / 320) + 2;
    const passed = int(d.passed, maxPassed);
    const near = int(d.near, maxNear);
    const picks = int(d.picks, maxPicks);
    const score = passed + near * 2 + picks * 3;
    const rejected = (+d.dist || 0) > maxDist * 1.25
      || (+d.passed || 0) > maxPassed + 3
      || (+d.near || 0) > maxNear + 3
      || (+d.picks || 0) > maxPicks + 3
      || (+d.score || 0) > score + 10;

    if (rejected) {
      const { sorted } = bestSoloRuns(null);
      const rankIdx = sorted.findIndex(r => r.pid === prof.id);
      const bestMine = rankIdx >= 0 ? sorted[rankIdx] : null;
      const mapBest = bestSoloRuns(mapId).sorted.find(r => r.pid === prof.id);
      return cb({
        ok: false, score: 0, bestScore: bestMine ? bestMine.score : 0, mapBest: mapBest ? mapBest.score : 0,
        rank: rankIdx >= 0 ? rankIdx + 1 : 0, total: sorted.length, rejected: true, error: 'Kết quả không hợp lệ theo quy chuẩn hệ thống.',
      });
    }

    const run = {
      id: newId(), mode: 'endless', pid: prof.id, name: prof.name, dept: prof.dept, mapId,
      score, passed, near, picks, dist, reason: clean(d.reason, 80), at: Date.now(),
    };
    soloRuns.push(run);
    if (soloRuns.length > 20000) soloRuns = soloRuns.sort(bySoloRank).slice(0, 15000);
    saveSoon();

    const { sorted } = bestSoloRuns(null);
    const rankIdx = sorted.findIndex(r => r.pid === prof.id);
    const bestMine = rankIdx >= 0 ? sorted[rankIdx] : run;
    const mapBest = bestSoloRuns(mapId).sorted.find(r => r.pid === prof.id);
    cb({
      ok: true, score: run.score, bestScore: bestMine.score, mapBest: mapBest ? mapBest.score : run.score,
      rank: rankIdx + 1, total: sorted.length, rejected: false,
    });
    io.to('board').emit('solo:changed');
  });

  // Màn hình lớn & MC
  socket.on('board:watch', cb => {
    socket.join('board');
    if (typeof cb === 'function') cb(boardPayload());
  });
  socket.on('host:auth', (key, cb) => {
    const ok = String(key) === CFG.HOST_KEY;
    socket.data.isHost = ok;
    if (ok) socket.join('board');
    if (ok && G.phase === 'idle') newContest(false, 0);
    if (typeof cb === 'function') cb({ ok, board: ok ? boardPayload() : null });
  });
  const hostOnly = (ev, fn) => socket.on(ev, (...a) => { if (socket.data.isHost) fn(...a); });
  hostOnly('host:start', startContest);
  hostOnly('host:end', endContest);
  hostOnly('host:new', (keep, mapId) => newContest(!!keep, mapId));
  hostOnly('host:setMap', mapId => setContestMap(mapId));
  hostOnly('host:kick', (id, cb) => { const ok = kickPlayer(id); if (typeof cb === 'function') cb({ ok }); });
  hostOnly('host:export', cb => {
    if (typeof cb !== 'function') return;
    const m = mapOf(G.mapId);
    cb({ ok: true, filename: `ket-qua-${m.code}-${G.id.slice(0, 6)}.csv`, csv: buildCsv() });
  });
  hostOnly('host:bots', () => { addBots(50); countDirty = true; pushBoard(true); });
  hostOnly('host:clearBots', () => { clearBots(); countDirty = true; pushBoard(true); });
  hostOnly('host:clearSolo', () => { soloRuns = []; saveSoon(); io.to('board').emit('solo:changed'); });

  socket.on('disconnect', () => {
    const e = entries.get(socket.data.pid);
    if (e && e.socketId === socket.id) e.socketId = null;
  });
});

// ---------- Chạy ----------
loadData();
httpServer.listen(CFG.PORT, '0.0.0.0', () => {
  console.log('\n  NHÀ F ĐI LÀM đã chạy\n');
  console.log(`  • Người chơi vào:   ${JOIN_URL}`);
  const adminBase = CFG.PUBLIC_URL ? baseUrl.replace(/\/$/, '') : `http://localhost:${CFG.PORT}`;
  console.log(`  • Màn hình MC:      ${adminBase}/host   (mật khẩu: ${process.env.HOST_KEY ? 'đã đặt trong biến HOST_KEY' : CFG.HOST_KEY})`);
  console.log(`  • Bảng điểm chiếu:  ${adminBase}/bang`);
  if (IPS.length > 1 && !CFG.PUBLIC_URL) console.log(`  • Các IP của máy:   ${IPS.join(', ')}   (đặt PUBLIC_URL nếu mã QR dùng sai IP)`);
  console.log(TILT_READY ? '  • Nghiêng máy:      BẬT' : '  • Nghiêng máy:      TẮT vì đang dùng HTTP, người chơi vuốt để lái (bật bằng: npm run start:https)');
  console.log('');
});
if (CFG.HTTPS) {
  const selfsigned = require('selfsigned');
  const certFile = path.join(DATA_DIR, 'cert.json');
  let pems;
  try { pems = JSON.parse(fs.readFileSync(certFile, 'utf8')); if (pems.ips !== IPS.join()) pems = null; } catch (_) { pems = null; }
  if (!pems) {
    const altNames = [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }, ...IPS.map(ip => ({ type: 7, ip }))];
    const g = selfsigned.generate([{ name: 'commonName', value: IPS[0] || 'localhost' }], { days: 365, keySize: 2048, algorithm: 'sha256', extensions: [{ name: 'subjectAltName', altNames }] });
    pems = { key: g.private, cert: g.cert, ips: IPS.join() };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(certFile, JSON.stringify(pems));
  }
  const httpsServer = https.createServer({ key: pems.key, cert: pems.cert }, app);
  io.attach(httpsServer);
  httpsServer.listen(CFG.HTTPS_PORT);
}

function shutdown() {
  saveSyncNow();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
