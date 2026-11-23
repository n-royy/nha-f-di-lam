// ===== CẤU HÌNH NHÀ F ĐI LÀM =====
// Đổi trực tiếp ở đây hoặc qua biến môi trường khi chạy.
const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !isNaN(+v) ? +v : d);

const MAPS = [
  {
    id: 0,
    code: 'ftown',
    name: 'F-TOWN',
    place: 'F-Town, TP.HCM',
    subtitle: 'Khu Công Nghệ Cao · Mùa Triều Cường',
    summary: 'Mưa rào bất chợt, đoạn đường ngập sâu dễ tắt máy, rào chắn công trình và xe giao hàng chuyển làn đột ngột.',
    tags: ['Mưa & Triều cường', 'Xe giao hàng chuyển làn', 'Rào chắn công trình'],
    speedMul: 1.0,
    maxPicks: 16,
  },
  {
    id: 1,
    code: 'fville',
    name: 'F-VILLE',
    place: 'F-Ville, Hòa Lạc',
    subtitle: 'Đại Lộ Thăng Long · Cao Tốc Sương Mù',
    summary: 'Tuyến cao tốc tốc độ cao, ít giao lộ nhưng có sương mù dày, xe tải trọng lớn, xe buýt FPT và gió ngang cầu vượt.',
    tags: ['Cao tốc +12%', 'Sương mù dày', 'Xe tải & Xe buýt FPT'],
    speedMul: 1.12,
    maxPicks: 16,
  },
  {
    id: 2,
    code: 'tower',
    name: 'FPT TOWER',
    place: 'FPT Tower, Cầu Giấy',
    subtitle: 'Nội Đô Hà Nội · Giờ Cao Điểm',
    summary: '6 ngã tư đèn tín hiệu liên tiếp, phương tiện chuyển hướng bất ngờ, mật độ giao thông cao và thông báo họp sáng liên tục.',
    tags: ['6 ngã tư đèn đỏ', 'Chuyển hướng bất ngờ', 'Giờ cao điểm nội đô'],
    speedMul: 0.98,
    maxPicks: 16,
  },
  {
    id: 3,
    code: 'complex',
    name: 'FPT COMPLEX',
    place: 'FPT Complex, Đà Nẵng',
    subtitle: 'Cung Đường Biển · Nắng Gió Miền Trung',
    summary: 'Gió biển thổi ngang làm lệch tay lái, nắng gắt dễ tăng nhiệt động cơ, làn xe đạp ven biển cùng các dải gió thuận tăng tốc.',
    tags: ['Gió biển thổi ngang', 'Nắng gắt tăng nhiệt', 'Dải gió thuận'],
    speedMul: 1.04,
    maxPicks: 16,
  },
];

module.exports = {
  PORT: num(env.PORT, 3000),
  HTTPS_PORT: num(env.HTTPS_PORT, 3443),

  // Bật HTTPS tự ký để điện thoại cho phép đọc cảm biến nghiêng (npm run start:https)
  HTTPS: process.argv.includes('--https') || env.HTTPS === 'true',

  MAX_PLAYERS: num(env.MAX_PLAYERS, 500),

  // Mật khẩu màn hình MC (trang /host). Nên đổi trước sự kiện.
  // Trên Render, nếu chưa đặt thì tự tạo mật khẩu ngẫu nhiên và in vào Logs.
  HOST_KEY: env.HOST_KEY || (env.RENDER ? require('crypto').randomBytes(9).toString('base64url') : 'admin'),

  // Địa chỉ in lên mã QR. Để trống: tự lấy IP mạng LAN.
  // Nếu dùng tên miền hoặc đường hầm: PUBLIC_URL=https://abc.ngrok.app
  PUBLIC_URL: env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || '',

  // Số giây đếm ngược từ lúc MC bấm bắt đầu đến khi cả phòng xuất phát
  COUNTDOWN_SECONDS: num(env.COUNTDOWN_SECONDS, 15),
  // Số giây tối đa của một lượt đua
  RACE_SECONDS: num(env.RACE_SECONDS, 100),

  // Khoảng cách giữa hai lần gửi thứ hạng về điện thoại (mili giây)
  RANK_MS: num(env.RANK_MS, 3000),

  // Chiều dài đường đua trong game. Giảm xuống khi cần thử nhanh.
  ROUTE: num(env.ROUTE, 17000),

  // Hạn chấm công, tính bằng giờ (8.25 = 8:15) và mức phạt đi muộn (nghìn đồng)
  DEADLINE_HOUR: num(env.DEADLINE_HOUR, 8.25),
  LATE_FINE_K: num(env.LATE_FINE_K, 20),

  // Số giây thực để đồng hồ game đi từ 7:30 đến hạn chấm công
  CLOCK_SECONDS: num(env.CLOCK_SECONDS, 70),

  DEPARTMENTS: (env.DEPARTMENTS || 'FSOFT,FIS,FTEL,FRT,FPT Education,FPT Corporation,Khác')
    .split(',').map(s => s.trim()).filter(Boolean),

  MAPS,
};
