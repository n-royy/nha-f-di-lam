// Giả lập N điện thoại nối qua mạng và tự đua đến hết giải.
// Chạy: node test/simulate.js [URL] [số người] [mật khẩu MC]
const { io } = require('socket.io-client');
const URL = process.argv[2] || 'http://localhost:3000';
const N = +(process.argv[3] || 500);
const KEY = process.argv[4] || 'admin';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const host = io(URL, { transports: ['websocket'] });
  let B = null, boardMsgs = 0, boardBytes = 0;
  host.on('board', b => { B = b; boardMsgs++; boardBytes += JSON.stringify(b).length; });
  const auth = await new Promise(r => host.emit('host:auth', KEY, r));
  if (!auth.ok) { console.log('Sai mật khẩu MC'); process.exit(1); }
  B = auth.board;
  host.emit('host:new', false);
  await sleep(500);

  const clients = [];
  let rankMsgs = 0, joined = 0, rejected = 0, results = 0, wrongWinner = 0, acks = 0, rtts = [];
  const t0 = Date.now();
  for (let i = 0; i < N + 3; i++) {
    const s = io(URL, { transports: ['websocket'], forceNew: true });
    s.on('rank', d => { rankMsgs++; s._rank = d; });
    s.on('results', r => { results++; s._res = r; if (!r.winner) wrongWinner++; });
    s.on('state', st => { s._state = st; if (st.phase === 'racing' && !s._racing && s._joined) { s._racing = true; race(s, st.startsInMs); } });
    s.emit('hello', '', () => {});
    s.emit('join', { name: `Người ${i + 1}`, dept: ['FSOFT', 'FIS', 'FTEL', 'FRT'][i % 4] }, r => { if (r.ok) { joined++; s._joined = true; } else rejected++; });
    clients.push(s);
    if (i % 50 === 49) await sleep(50);
  }
  await sleep(2500);
  console.log(`Đăng ký: ${joined} | Bị từ chối vì vượt giới hạn: ${rejected} | ${Date.now() - t0}ms`);

  function race(s, delay) {
    const seconds = 40 + Math.random() * 45;
    setTimeout(() => {
      const start = Date.now(); let hits = 0;
      const timer = setInterval(() => {
        const p = Math.min(1, (Date.now() - start) / 1000 / seconds);
        if (Math.random() < 0.05) hits++;
        const t1 = Date.now();
        if (p >= 1) {
          clearInterval(timer);
          s.emit('finish', { arrived: true, p: 1, h: hits, r: 0, b: 1 }, r => { acks++; rtts.push(Date.now() - t1); s._done = r; });
        } else s.volatile.emit('progress', { p, h: hits, r: 0, b: 1 });
      }, 2000 + Math.random() * 300);
    }, delay);
  }

  host.emit('host:start');
  const late = io(URL, { transports: ['websocket'], forceNew: true });
  await sleep(300);
  const lateRes = await new Promise(r => late.emit('join', { name: 'Đến muộn' }, r));
  console.log(`Sau khi chốt, người đến muộn: ${lateRes.ok ? 'VẪN VÀO ĐƯỢC (lỗi!)' : lateRes.error}`);

  const hard = Date.now() + 160000;
  let shown = 0;
  while (B.phase !== 'finished' && Date.now() < hard) {
    await sleep(5000);
    if (B.startsInMs < 0 && ++shown % 3 === 0) console.log(`  đang đua: về đích ${B.done}/${B.count}, dẫn đầu ${B.rows[0].n} ${B.rows[0].c} điểm, ${B.rows[0].p}%`);
  }
  await sleep(1500);
  const live = B.rows.filter(r => r.c > 0).length;
  const sorted = rtts.sort((a, b) => a - b);
  console.log(`Kết thúc: ${B.phase}. Về đích ${B.done}/${B.count}, đi muộn ${B.late}, quỹ phạt ${B.fineK}K`);
  console.log(`Người thắng: ${B.rows[0].n}, ${B.rows[0].c} điểm, giờ ${B.rows[0].t}`);
  console.log(`Thứ hạng gửi về điện thoại: ${rankMsgs} lần, ${clients.filter(c => c._rank).length} máy đã nhận`);
  console.log(`Máy nhận kết quả cuối: ${results}/${joined}`);
  console.log(`Gửi điểm về đích: ${acks} lần, thời gian phản hồi trung vị ${sorted[sorted.length >> 1]}ms, chậm nhất ${sorted[sorted.length - 1]}ms`);
  console.log(`Màn hình lớn: ${boardMsgs} lần cập nhật, trung bình ${(boardBytes / boardMsgs / 1024).toFixed(1)} KB mỗi lần`);
  process.exit(0);
})();
