# Nhà F Đi Làm

**Kịp 8:15 hay mất 20K?** Game đua xe máy trên điện thoại, tối đa **500 người** cùng chơi. Có 2 chế độ: **Thi đấu** và **Solo**. Người chơi quét mã QR trên màn hình lớn là vào được, không cần cài app hay tạo tài khoản.

- **Màn hình MC:** `http://localhost:3000/host`
- **Bảng điểm chỉ để chiếu:** `http://localhost:3000/bang`
- **Người chơi:** quét mã QR trên màn hình MC

## 1. Cài đặt và chạy

Cần có **Node.js 18 trở lên**. Mở PowerShell trong thư mục này rồi chạy:

```powershell
npm install
npm start
```

Cửa sổ sẽ in địa chỉ cho người chơi và màn hình MC. Mật khẩu MC mặc định là `admin`.

Lần đầu chạy, nếu Windows Firewall hỏi, hãy bấm **Allow** cho Node.js ở mạng đang dùng. Nếu không, điện thoại sẽ không vào được.

### Thêm logo

Đặt file logo vào thư mục `public` với tên `logo-fpt.png` (hoặc `logo-fpt.svg`, `.webp`, `.jpg`), rồi tải lại trang. Logo sẽ hiện ở trang chính, phòng chờ, cổng công ty, máy quét mặt, phiếu kết quả và màn hình MC. Chưa có file thì game vẫn chạy bình thường. Hãy xin phép đơn vị quản lý thương hiệu trước khi chiếu logo ở sự kiện.

### Chạy trên Render miễn phí

Tệp `render.yaml` đã cấu hình sẵn. Render tự tạo mật khẩu `HOST_KEY` trong phần Environment của dịch vụ và tự dùng địa chỉ HTTPS của dịch vụ cho mã QR, nên lái bằng nghiêng máy hoạt động mà không có cảnh báo bảo mật.

Gói miễn phí tự ngủ sau 15 phút không có truy cập, lần mở sau mất khoảng một phút. Khi dịch vụ ngủ, khởi động lại hoặc deploy lại, bảng xếp hạng solo và người chơi đã đăng ký sẽ mất. Render khuyên không dùng gói này cho môi trường production, nên hãy thử tải trước khi tổ chức giải đông người.

## 2. Bật lái bằng nghiêng máy

Điện thoại chỉ cho đọc cảm biến nghiêng trên địa chỉ HTTPS. Có 3 cách chạy:

| Cách chạy | Lái bằng | Lưu ý |
|---|---|---|
| `npm start` | Vuốt màn hình | Không có cảnh báo trình duyệt |
| `npm run start:https` | Nghiêng máy | Chứng chỉ tự ký: mỗi máy phải bấm qua cảnh báo bảo mật một lần |
| Đường hầm HTTPS, hoặc deploy, rồi đặt `PUBLIC_URL` | Nghiêng máy | Không có cảnh báo, nhưng cần Internet và phải kiểm tra giới hạn số kết nối của dịch vụ |

Ví dụ dùng đường hầm trên PowerShell:

```powershell
ngrok http 3000
$env:PUBLIC_URL="https://xxxx.ngrok.app"; npm start
```

Trên iPhone, game hỏi quyền chuyển động khi bấm nút Đăng ký hoặc Nổ máy. Từ chối thì vẫn chơi được bằng cách vuốt.

## 3. Mạng cho người chơi

Máy chạy game và điện thoại phải vào **cùng một mạng**. Wi-Fi văn phòng thường có thể nghẽn hoặc chặn các máy nói chuyện với nhau khi 300 đến 500 điện thoại vào cùng lúc. Nên thử trước tại đúng phòng thi. Nếu mạng yếu, hãy deploy lên Internet (Render, Railway, VPS) để mọi người dùng 4G.

Máy có nhiều mạng thì mã QR có thể lấy sai IP. Khi đó hãy đặt `PUBLIC_URL`, ví dụ `$env:PUBLIC_URL="http://192.168.1.25:3000"; npm start`.

## 4. Cách tổ chức giải

1. Trên trang chủ bấm **Thi đấu** (hoặc mở `/host`), nhập mật khẩu để tạo game mới, rồi nhấn F11 để toàn màn hình. Phím **H** ẩn hoặc hiện thanh điều khiển.
2. Mọi người quét QR, bấm **Xem luật chơi** nếu cần, rồi nhập họ tên và đơn vị. Máy chủ chặn đúng ở người thứ 500.
3. MC bấm **Bắt đầu**. Danh sách được chốt và tất cả máy xuất phát sau 15 giây.
4. Màn hình lớn hiện người cao điểm nhất và bảng điểm tạm tính, cập nhật mỗi giây. Ai về đích sẽ hiện giờ và điểm chính thức. Mỗi điện thoại thấy hạng của mình kèm một câu hài hước, cập nhật khoảng 3 giây một lần.
5. Giải tự kết thúc khi mọi người về đích hoặc sau khoảng 108 giây. Người thắng hiện to giữa màn hình lớn và mọi điện thoại. Người chơi thi xong chỉ thấy bảng xếp hạng trực tiếp cho đến khi MC tạo game mới.
6. Bấm **Chơi lại, giữ người chơi** để chơi tiếp, hoặc **Tạo game mới** để mọi người đăng ký lại từ đầu.

Người chơi lỡ tải lại trang hoặc mất mạng trong trận chỉ cần mở lại trang là chạy tiếp từ quãng đường đã đi, đồng hồ không dừng.

**Solo:** chọn Solo trên điện thoại. Mọi lượt được lưu vào bảng xếp hạng tổng và vẫn còn sau khi tắt máy chủ.

## 5. Cách tính điểm

| Tình huống | Điểm |
|---|---|
| Tới cổng đúng 8:15 | 1.000 |
| Mỗi phút sớm hơn hoặc muộn hơn | +20 hoặc −20 |
| Mỗi lần va chạm | −20 |
| Mỗi lần vượt đèn đỏ | −50 |
| Mỗi lần nhặt cà phê hoặc bánh mì | +10 |
| Không tới được cổng | Tối đa 500, theo quãng đường |

Máy chủ tự tính giờ về đích và chặn tốc độ vô lý. Số va chạm do điện thoại gửi lên nên vẫn có thể bị sửa. Với giải thưởng lớn, nên kiểm tra lại top đầu.

## 6. Cấu hình

Sửa `config.js` hoặc đặt biến môi trường, ví dụ `$env:HOST_KEY="matkhaumoi"; npm start`.

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `HOST_KEY` | admin | Mật khẩu MC. **Nên đổi** |
| `MAX_PLAYERS` | 500 | Số người tối đa |
| `PUBLIC_URL` | tự lấy IP LAN | Địa chỉ in lên mã QR |
| `PORT` / `HTTPS_PORT` | 3000 / 3443 | Cổng chạy |
| `COUNTDOWN_SECONDS` | 15 | Đếm ngược trước khi xuất phát |
| `RACE_SECONDS` | 100 | Thời gian tối đa một lượt |
| `ROUTE` | 17000 | Độ dài đường. Giảm để thử nhanh |
| `DEADLINE_HOUR` | 8.25 | Hạn chấm công (8.25 là 8:15) |
| `LATE_FINE_K` | 20 | Mức phạt đi muộn, tính bằng nghìn đồng |
| `DEPARTMENTS` | FSOFT, FIS, ... | Đơn vị gắn cho bot thử. Người chơi tự nhập đơn vị của mình |

Dữ liệu nằm trong thư mục `data`. Xóa thư mục này khi máy chủ đang tắt để làm mới toàn bộ, gồm cả bảng xếp hạng solo.

## 7. Kiểm tra trước sự kiện

```powershell
npm start                    # cửa sổ 1
npm install                  # cửa sổ 2, nếu chưa cài
node test/simulate.js http://localhost:3000 500    # cửa sổ 2
```

Bài test xóa người chơi trong giải hiện tại rồi giả lập 500 điện thoại đua đến hết giải, mất khoảng 2 phút. Nó kiểm tra máy chủ, **không** kiểm tra được Wi-Fi của phòng thi.

**Checklist ngày tổ chức:**
- [ ] Đổi `HOST_KEY`, sửa `DEPARTMENTS`
- [ ] Thử quét QR bằng iPhone và Android tại đúng phòng thi
- [ ] Xóa bot trước khi chơi thật
- [ ] Laptop cắm sạc, tắt chế độ ngủ
