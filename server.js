// Nhà F Đi Làm: game server
// 2 chế độ: Solo (bảng xếp hạng tổng) và Thi đấu (tối đa 500 người, điểm cập nhật trực tiếp)
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
const MAX_SPEED = 500;                                // tốc độ tối đa trong game, dùng để chặn kết quả vô lý
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

// ---------- Trang ----------
const pub = path.join(__dirname, 'public');
app.use(express.static(pub, { extensions: ['html'], index: false }));
app.use('/fonts/bvp', express.static(path.join(__dirname, 'node_modules/@fontsource/be-vietnam-pro'), { maxAge: '7d' }));
app.use('/fonts/chakra', express.static(path.join(__dirname, 'node_modules/@fontsource/chakra-petch'), { maxAge: '7d' }));
app.get('/', (_, res) => res.sendFile(path.join(pub, 'play.html')));
app.get('/host', (_, res) => res.sendFile(path.join(pub, 'host.html')));
app.get('/bang', (_, res) => res.sendFile(path.join(pub, 'host.html')));
// Logo: đặt file logo-fpt.png, .svg, .webp hoặc .jpg vào thư mục public
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
};
app.get('/game-config.js', (_, res) => res.type('text/javascript').send('window.DCC=' + JSON.stringify(clientConfig)));
app.get('/api/bxh', (_, res) => res.json(soloBoard()));

// ---------- Tiện ích ----------
let seq = 0;
const newId = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 7);
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const int = (v, max) => clamp(Math.floor(+v) || 0, 0, max);

function finalScore(sec, progress, hits, reds, picks) {
  if (sec == null) return Math.max(0, Math.round(clamp(progress, 0, 1) * 500));
  return Math.max(0, Math.round(1000 + ((DEADLINE - sec) / 60) * 20 - hits * 20 - reds * 50 + picks * 10));
}
const liveScore = e => Math.max(0, Math.round(e.progress * 1000 - e.hits * 20 - e.reds * 50 + e.picks * 10));
const byRank = (a, b) => b.score - a.score || (a.sec == null ? 1e12 : a.sec) - (b.sec == null ? 1e12 : b.sec);
const maxProgress = elapsed => clamp((elapsed * MAX_SPEED) / CFG.ROUTE + 0.03, 0, 1);

// ---------- Trạng thái ----------
const profiles = new Map(); // token -> { id, token, name, dept }
const entries = new Map();  // profile id -> người chơi trong giải hiện tại
let soloRuns = [];          // mọi lượt solo
// phase: idle (chưa có giải) | lobby (đang nhận đăng ký) | racing | finished
let G = freshGame('idle');
function freshGame(phase) { return { id: newId(), phase, startAt: 0, endAt: 0, endedAt: 0 }; }

function loadData() {
  try {
    const d = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const p of d.profiles || []) profiles.set(p.token, p);
    soloRuns = d.soloRuns || [];
    if (d.game && d.game.phase === 'finished') { G = d.game; for (const e of d.entries || []) entries.set(e.id, e); }
    else if (d.game && d.game.phase === 'lobby') { for (const e of d.entries || []) if (!e.bot) entries.set(e.id, e); if (entries.size) G = d.game; }
  } catch (_) { /* lần đầu chạy, chưa có dữ liệu */ }
}
let saveTimer = null;
function saveSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const body = JSON.stringify({ profiles: [...profiles.values()], soloRuns, game: G, entries: [...entries.values()] });
    fs.mkdir(DATA_DIR, { recursive: true }, () => {
      fs.writeFile(DATA_FILE + '.tmp', body, err => { if (!err) fs.rename(DATA_FILE + '.tmp', DATA_FILE, () => {}); });
    });
  }, 2000);
}

// ---------- Solo ----------
function soloBoard() {
  const sorted = soloRuns.slice().sort(byRank);
  return {
    total: sorted.length,
    players: new Set(sorted.map(r => r.pid)).size,
    rows: sorted.slice(0, 200).map(r => ({ pid: r.pid, name: r.name, dept: r.dept, sec: r.sec, score: r.score })),
  };
}

function soloLeader() {
  let best = null;
  for (const r of soloRuns) if (!best || byRank(r, best) < 0) best = r;
  return best ? { n: best.name, d: best.dept, c: best.score, t: best.sec } : null;
}

// ---------- Thi đấu ----------
const elapsedNow = () => Math.max(0, (Date.now() - G.startAt) / 1000);

function publicState() {
  return {
    phase: G.phase, gameId: G.id, count: entries.size, max: CFG.MAX_PLAYERS,
    startsInMs: G.phase === 'racing' ? G.startAt - Date.now() : 0,
  };
}
function entryView(e) {
  return e ? { status: e.status, progress: e.progress, hits: e.hits, reds: e.reds, picks: e.picks, sec: e.sec, score: e.score } : null;
}
function results() {
  const all = [...entries.values()].sort(byRank);
  return { all, top: all.slice(0, 3).map(e => ({ id: e.id, name: e.name, dept: e.dept, score: e.score, sec: e.sec })) };
}
// Bảng rút gọn gửi về điện thoại người đã về đích, tránh gửi cả 500 dòng cho 500 máy
const TOP_ROWS = 30;
const rowForPhone = e => ({ i: e.id, n: e.name, d: e.dept, s: e.status, p: Math.round(e.progress * 100), c: e.score, t: e.sec });
function phoneBoard(sorted) {
  return { total: sorted.length, done: sorted.filter(e => e.sec != null).length, rows: sorted.slice(0, TOP_ROWS).map(rowForPhone) };
}
function sortedNow() {
  const list = [...entries.values()];
  for (const e of list) if (e.status === 'racing') e.score = liveScore(e);
  return list.sort(byRank);
}
function resultFor(id, cache) {
  const r = cache || results();
  const idx = r.all.findIndex(e => e.id === id);
  if (idx < 0) return null;
  const e = r.all[idx];
  return { rank: idx + 1, total: r.all.length, score: e.score, sec: e.sec, hits: e.hits, reds: e.reds, winner: r.top[0], runners: r.top.slice(1, 3), isWinner: idx === 0, board: phoneBoard(r.all) };
}
function startContest() {
  if (G.phase !== 'lobby' || entries.size < 1) return;
  G.phase = 'racing';
  G.startAt = Date.now() + CFG.COUNTDOWN_SECONDS * 1000;
  G.endAt = G.startAt + (CFG.RACE_SECONDS + 8) * 1000;
  for (const e of entries.values()) Object.assign(e, { status: 'racing', progress: 0, hits: 0, reds: 0, picks: 0, sec: null, score: 0, doneAt: 0 });
  startBots();
  io.to('players').emit('state', publicState());
  pushBoard(true);
  saveSoon();
}
function markDone(e, sec) {
  if (e.status === 'done') return;
  e.status = 'done';
  e.sec = sec == null ? null : Math.round(sec);
  e.score = finalScore(e.sec, e.progress, e.hits, e.reds, e.picks);
  e.doneAt = Date.now();
}
function endContest() {
  if (G.phase !== 'racing') return;
  G.phase = 'finished';
  G.endedAt = Date.now();
  for (const e of entries.values()) if (e.status !== 'done') markDone(e, null);
  stopBots();
  const r = results();
  for (const e of entries.values()) if (e.socketId) io.to(e.socketId).emit('results', resultFor(e.id, r));
  io.to('players').emit('state', publicState());
  pushBoard(true);
  saveSoon();
}
function newContest(keepPlayers) {
  stopBots();
  const old = [...entries.values()];
  io.socketsLeave('finishers');
  G = freshGame('lobby');
  entries.clear();
  if (keepPlayers) for (const e of old) if (!e.bot) entries.set(e.id, blankEntry(e));
  io.to('players').emit('state', publicState());
  io.to('players').emit('contest:reset', { kept: keepPlayers });
  pushBoard(true);
  saveSoon();
}
function blankEntry(p) {
  return { id: p.id, name: p.name, dept: p.dept, bot: !!p.bot, socketId: p.socketId || null, at: p.at || Date.now(), status: 'registered', progress: 0, hits: 0, reds: 0, picks: 0, sec: null, score: 0, doneAt: 0 };
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
  for (const e of entries.values()) if (e.bot) e.botSpeed = 1 / (48 + Math.random() * 50);
  clearInterval(botTimer);
  botTimer = setInterval(() => {
    if (G.phase !== 'racing' || Date.now() < G.startAt) return;
    for (const e of entries.values()) {
      if (!e.bot || e.status === 'done') continue;
      e.progress = clamp(e.progress + e.botSpeed, 0, 1);
      if (Math.random() < 0.012) e.hits++;
      if (Math.random() < 0.002) e.reds++;
      if (e.progress >= 1) markDone(e, CLOCK0 + elapsedNow() * RATE);
    }
  }, 1000);
}
function stopBots() { clearInterval(botTimer); botTimer = null; }

// ---------- Màn hình MC ----------
function boardPayload() {
  const list = [...entries.values()];
  for (const e of list) if (e.status === 'racing') e.score = liveScore(e);
  list.sort(byRank);
  const done = list.filter(e => e.status === 'done');
  const late = done.filter(e => e.sec == null || e.sec > DEADLINE).length;
  return {
    phase: G.phase, gameId: G.id, count: list.length, max: CFG.MAX_PLAYERS,
    startsInMs: G.phase === 'racing' ? G.startAt - Date.now() : 0,
    done: done.filter(e => e.sec != null).length, late, fineK: late * CFG.LATE_FINE_K,
    bots: list.filter(e => e.bot).length,
    online: io.of('/').adapter.rooms.get('players')?.size || 0,
    joinUrl: JOIN_URL, tilt: TILT_READY, soloTop: soloLeader(),
    rows: list.map(e => ({ n: e.name, d: e.dept, s: e.status, p: Math.round(e.progress * 100), c: e.score, t: e.sec, b: e.bot ? 1 : 0 })),
  };
}
let boardDirty = true, lastBoardAt = 0;
function pushBoard(force) {
  boardDirty = true;
  if (force) flushBoard();
}
function flushBoard() {
  if (!boardDirty && G.phase !== 'racing') return;
  boardDirty = false;
  lastBoardAt = Date.now();
  io.to('board').emit('board', boardPayload());
}
setInterval(() => {
  if (G.phase === 'racing' && Date.now() > G.endAt) endContest();
  if (G.phase === 'racing' && Date.now() > G.startAt && [...entries.values()].every(e => e.status === 'done')) endContest();
  flushBoard();
}, 1000);

// Gửi thứ hạng hiện tại về từng điện thoại trong lúc đua
setInterval(() => {
  if (G.phase !== 'racing' || Date.now() < G.startAt) return;
  const list = [...entries.values()];
  for (const e of list) if (e.status === 'racing') e.score = liveScore(e);
  list.sort(byRank);
  list.forEach((e, i) => {
    if (e.socketId) io.to(e.socketId).volatile.emit('rank', { r: i + 1, t: list.length, c: e.score });
  });
  io.to('finishers').volatile.emit('cboard', phoneBoard(list));
}, CFG.RANK_MS);

// Báo số người đăng ký cho điện thoại, gom lại để không gửi dồn dập
let countDirty = false;
setInterval(() => {
  if (countDirty) { countDirty = false; io.to('players').emit('count', entries.size); }
}, 2000);

// ---------- Kết nối ----------
io.on('connection', socket => {
  socket.data.isHost = false;

  // Điện thoại mở trang: nhận lại hồ sơ cũ nếu đã từng đăng ký
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
      state: publicState(), profile: prof ? { name: prof.name, dept: prof.dept } : null,
      entry: entryView(entry), result: G.phase === 'finished' && entry ? resultFor(prof.id) : null,
      board: entry && entry.status === 'done' ? phoneBoard(sortedNow()) : null,
    });
  });

  // Tạo hoặc cập nhật hồ sơ, dùng chung cho cả hai chế độ
  function ensureProfile(data) {
    const name = clean(data && data.name, 40);
    if (name.length < 2) return { error: 'Nhập họ tên từ 2 ký tự trở lên.' };
    const dept = clean(data && data.dept, 30);
    let prof = profiles.get(String((data && data.token) || ''));
    if (!prof) { prof = { id: newId(), token: newId() + newId(), name, dept }; profiles.set(prof.token, prof); }
    else { prof.name = name; prof.dept = dept; }
    socket.data.pid = prof.id;
    socket.join('players');
    return { prof };
  }

  socket.on('profile', (data, cb) => {
    if (typeof cb !== 'function') return;
    const r = ensureProfile(data);
    if (r.error) return cb({ ok: false, error: r.error });
    saveSoon();
    cb({ ok: true, token: r.prof.token });
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
      return cb({ ok: true, token: prof.token, state: publicState(), entry: entryView(cur) });
    }
    if (G.phase === 'idle') return cb({ ok: false, token: prof.token, error: 'MC chưa tạo giải. Bạn có thể chơi Solo trong lúc chờ.' });
    if (G.phase !== 'lobby') return cb({ ok: false, token: prof.token, error: 'Giải đã chốt danh sách. Bạn có thể chơi Solo trong lúc chờ giải sau.' });
    if (entries.size >= CFG.MAX_PLAYERS) return cb({ ok: false, token: prof.token, error: `Giải đã đủ ${CFG.MAX_PLAYERS} người. Bạn có thể chơi Solo trong lúc chờ giải sau.` });
    const e = blankEntry({ id: prof.id, name: prof.name, dept: prof.dept, socketId: socket.id });
    entries.set(prof.id, e);
    countDirty = true;
    pushBoard();
    saveSoon();
    cb({ ok: true, token: prof.token, state: publicState(), entry: entryView(e) });
  });

  socket.on('leave', cb => {
    if (G.phase === 'lobby' && socket.data.pid && entries.delete(socket.data.pid)) { countDirty = true; pushBoard(); saveSoon(); }
    if (typeof cb === 'function') cb({ ok: true });
  });

  // Điện thoại báo tiến độ khoảng 2 giây một lần
  socket.on('progress', d => {
    const e = entries.get(socket.data.pid);
    if (!e || G.phase !== 'racing' || e.status !== 'racing' || Date.now() < G.startAt || !d) return;
    const limit = maxProgress(elapsedNow());
    e.progress = clamp(Math.max(e.progress, +d.p || 0), 0, limit);
    e.hits = Math.max(e.hits, int(d.h, 99));
    e.reds = Math.max(e.reds, int(d.r, 20));
    e.picks = Math.max(e.picks, int(d.b, 30));
  });

  socket.on('finish', (d, cb) => {
    if (typeof cb !== 'function') return;
    const e = entries.get(socket.data.pid);
    if (!e || G.phase !== 'racing' || !d) return cb({ ok: false, error: 'Giải đã kết thúc.' });
    socket.join('finishers');
    if (e.status === 'done') return cb({ ok: true, sec: e.sec, score: e.score, board: phoneBoard(sortedNow()) });
    const elapsed = elapsedNow();
    e.progress = clamp(Math.max(e.progress, +d.p || 0), 0, maxProgress(elapsed));
    e.hits = Math.max(e.hits, int(d.h, 99));
    e.reds = Math.max(e.reds, int(d.r, 20));
    e.picks = Math.max(e.picks, int(d.b, 30));
    const arrived = d.arrived === true && e.progress >= 0.8;
    markDone(e, arrived ? CLOCK0 + elapsed * RATE : null);
    pushBoard();
    saveSoon();
    cb({ ok: true, sec: e.sec, score: e.score, rejected: d.arrived === true && !arrived, board: phoneBoard(sortedNow()) });
  });

  // Solo: máy chủ tự tính giờ để kết quả công bằng
  socket.on('solo:start', cb => {
    socket.data.soloAt = Date.now();
    if (typeof cb === 'function') cb({ ok: true });
  });
  socket.on('solo:finish', (d, cb) => {
    if (typeof cb !== 'function') return;
    const prof = [...profiles.values()].find(p => p.id === socket.data.pid);
    if (!prof || !socket.data.soloAt || !d) return cb({ ok: false, error: 'Chưa ghi được điểm. Hãy tải lại trang rồi chơi lại.' });
    const elapsed = (Date.now() - socket.data.soloAt) / 1000;
    socket.data.soloAt = 0;
    const p = clamp(+d.p || 0, 0, maxProgress(elapsed));
    const arrived = d.arrived === true && p >= 0.8;
    const sec = arrived ? Math.round(CLOCK0 + elapsed * RATE) : null;
    const hits = int(d.h, 99), reds = int(d.r, 20), picks = int(d.b, 30);
    const run = { id: newId(), pid: prof.id, name: prof.name, dept: prof.dept, sec, score: finalScore(sec, p, hits, reds, picks), hits, reds, at: Date.now() };
    soloRuns.push(run);
    if (soloRuns.length > 20000) soloRuns = soloRuns.sort(byRank).slice(0, 15000);
    saveSoon();
    const sorted = soloRuns.slice().sort(byRank);
    cb({ ok: true, sec, score: run.score, rank: sorted.findIndex(r => r.id === run.id) + 1, total: sorted.length, rejected: d.arrived === true && !arrived });
    io.to('board').emit('solo:changed');
  });

  // Màn hình lớn
  socket.on('board:watch', cb => {
    socket.join('board');
    if (typeof cb === 'function') cb(boardPayload());
  });
  socket.on('host:auth', (key, cb) => {
    const ok = String(key) === CFG.HOST_KEY;
    socket.data.isHost = ok;
    if (ok) socket.join('board');
    // Nhập đúng mật khẩu khi chưa có giải thì tạo game mới; giải đang diễn ra được giữ nguyên
    if (ok && G.phase === 'idle') newContest(false);
    if (typeof cb === 'function') cb({ ok, board: ok ? boardPayload() : null });
  });
  const hostOnly = (ev, fn) => socket.on(ev, (...a) => { if (socket.data.isHost) fn(...a); });
  hostOnly('host:start', startContest);
  hostOnly('host:end', endContest);
  hostOnly('host:new', keep => newContest(!!keep));
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
httpServer.listen(CFG.PORT, () => {
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
process.on('SIGINT', () => {
  const body = JSON.stringify({ profiles: [...profiles.values()], soloRuns, game: G, entries: [...entries.values()] });
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(DATA_FILE, body); } catch (_) {}
  process.exit(0);
});
