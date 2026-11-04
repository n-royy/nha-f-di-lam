// ===== CẤU HÌNH NHÀ F ĐI LÀM =====
// Đổi trực tiếp ở đây hoặc qua biến môi trường khi chạy.
const env = process.env;
const num = (v, d) => (v !== undefined && v !== '' && !isNaN(+v) ? +v : d);

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
};
