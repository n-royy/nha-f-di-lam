# Nhà F Đi Làm

Trò chơi tương tác đa người chơi trên trình duyệt mô phỏng hành trình đến văn phòng trước mốc chấm công **08:15**. Hỗ trợ tối đa **500 cán bộ nhân viên** tham gia đồng thời, tích hợp **4 lộ trình văn phòng đặc trưng** và **2 chế độ chơi với 2 bảng xếp hạng tách biệt**.

## Tính năng nổi bật

- **2 chế độ chơi & 2 bảng xếp hạng tách biệt hoàn toàn:**
  - **Thi đấu · Chấm công 8:15** (`/api/bxh-thidau`): MC điều phối trực tiếp, đếm ngược 15 giây xuất phát đồng loạt, lộ trình 17.000 đơn vị với đồng hồ mô phỏng `07:30 → 08:15`, bóng đồng nghiệp xung quanh, bước quét khuôn mặt chấm công cuối chặng, xếp hạng cá nhân & phòng ban, xuất CSV.
  - **Solo · Thử thách vô tận** (`/api/bxh-solo`): Đường chạy sinh liên tục, tốc độ tăng tiến, dừng lượt sau 1 va chạm (có khiên bảo vệ), tính điểm vượt chướng ngại (+1), lách sát (+2), vật phẩm (+3), 4 hạng huy chương (Đồng 15 · Bạc 35 · Vàng 65 · Bạch Kim 100) và chơi lại tức thì.
- **4 lộ trình văn phòng với bối cảnh & tình huống riêng biệt:**
  1. **F-Town (Khu CNC, TP.HCM):** Mưa rào, điểm ngập sâu, cà phê sữa đá & áo mưa.
  2. **F-Ville (Hòa Lạc):** Sương mù buổi sáng, cầu vượt gió ngang, xe buýt tuyến tốc độ cao.
  3. **FPT Tower (Cầu Giấy, Hà Nội):** Đô thị giờ cao điểm với 6 ngã tư đèn tín hiệu mật độ cao.
  4. **FPT Complex (Ngũ Hành Sơn, Đà Nẵng):** Đại lộ ven biển, gió tạt ngang, vùng nắng gắt & dải gió xuôi tăng tốc.
- **Tối ưu điều khiển trên cả Desktop và Mobile:**
  - **Desktop:** `←`/`→` hoặc `A`/`D` điều hướng, `↑`/`W`/`Space` tăng ga, `↓`/`S` phanh.
  - **Mobile:** Vuốt trái/phải hoặc nghiêng máy để điều hướng, kết hợp nút `PHANH` và `TĂNG GA` riêng biệt.
- **Nhận diện đồng bộ & văn phong doanh nghiệp:** Xe xanh dương, áo cam, mũ xanh lá kèm lá cờ FPT bay phấp phới; khối tòa nhà 2.5D nối liền theo từng văn phòng; toàn bộ thông điệp lịch sự, chuẩn mực sự kiện doanh nghiệp.

## Khởi chạy nhanh

Yêu cầu **Node.js 18** trở lên.

```bash
npm install
npm start
```

Các đường dẫn chính sau khi khởi chạy:

| Đường dẫn | Mục đích |
| --- | --- |
| `/` | Trang người chơi (Mobile & Desktop) |
| `/host` | Bảng điều phối sự kiện dành cho MC |
| `/bang` | Màn hình trình chiếu trực tiếp hội trường |
| `/qr.svg` | Mã QR vào phòng thi đấu |

> **Lưu ý về cảm biến nghiêng máy trên điện thoại:** Chạy `HTTPS=1 npm start` (tự sinh chứng chỉ cho mạng LAN) hoặc triển khai qua máy chủ hỗ trợ HTTPS để mở khóa chế độ lái nghiêng máy trên iOS/Android.

## Bảng tính điểm

### Chế độ Thi đấu (8:15)

| Hạng mục | Điểm |
| --- | --- |
| Tới nơi đúng mốc `08:15:00` | `+1000` |
| Mỗi phút sớm hơn / muộn hơn `08:15` | `+20` / `-20` |
| Thu thập vật phẩm hỗ trợ | `+15` |
| Lách sát an toàn (Near-Miss) | `+5` |
| Va chạm phương tiện / chướng ngại | `-20` |
| Vượt đèn đỏ | `-50` |

### Chế độ Solo (Vô tận)

| Hạng mục | Điểm |
| --- | --- |
| Vượt qua mỗi chướng ngại / phương tiện | `+1` |
| Lách sát an toàn (Near-Miss) | `+2` |
| Thu thập vật phẩm theo bản đồ | `+3` |
| Va chạm khi không có khiên bảo vệ | Dừng lượt |

## Kiểm thử tải & Triển khai

Kiểm thử đồng thời 500 kết nối giả lập (khi máy chủ đang chạy):

```bash
npm run test:500
```

Triển khai trực tuyến qua **Render** (sử dụng tệp `render.yaml` đi kèm) hoặc bất kỳ máy chủ Node.js nào có hỗ trợ WebSocket. Tùy chỉnh mốc chấm công, danh sách phòng ban và tham số 4 lộ trình trong `config.js`.
