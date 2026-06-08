# Deploy Free Trên Oracle Cloud Always Free

Nền tảng đề xuất: Oracle Cloud Infrastructure Always Free.

Lý do chọn OCI cho repo này: dự án cần chạy nhiều process và service nền gồm Gateway HTTP/Socket.IO, 5 microservice Kafka, Postgres, MongoDB, Redis, Kafka và Zookeeper. Các PaaS free dạng Render/Koyeb phù hợp web service đơn lẻ hơn, còn Docker Compose full stack cần một VM. OCI Always Free có VM miễn phí và tài nguyên ARM Ampere A1 đủ để test microservice.

Tham khảo chính thức:

- OCI Always Free resources: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Render free limitations: https://render.com/docs/free
- Koyeb service model/WebSocket support: https://www.koyeb.com/docs/reference/services

## 1. Chuẩn Bị VM

Tạo VM trong OCI Console:

- Shape khuyến nghị: `VM.Standard.A1.Flex`, 2 OCPU, 12 GB RAM hoặc 4 OCPU, 24 GB RAM nếu region còn capacity.
- OS: Ubuntu 22.04/24.04 hoặc Oracle Linux.
- Boot volume: 50 GB là đủ để test.
- Mở ingress trong Security List/NSG: `22` cho SSH, `3088` cho API/socket test. Nếu dùng domain/Nginx thì mở thêm `80` và `443`.

## 2. Cài Docker Trên VM

Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Đăng xuất SSH rồi đăng nhập lại để group `docker` có hiệu lực.

## 3. Deploy Thủ Công Để Test

Trên VM:

```bash
git clone <your-repo-url> devchat
cd devchat
cp .env.deploy.example .env.deploy
nano .env.deploy
```

Các biến bắt buộc cần đổi:

- `POSTGRES_PASSWORD`
- `MONGO_INITDB_ROOT_PASSWORD`
- `MONGODB_URI` phải dùng đúng password Mongo.
- `JWT_SECRET`, `ACCESS_SECRET_KEY`, `REFRESH_SECRET_KEY`, `ID_ENCRYPTION_KEY`
- `CORS_ORIGINS`, `FE_URL`
- GitHub OAuth/App callback nếu test GitHub integration.
- Cloudflare R2/S3 và SMTP nếu test upload/email.

Chạy:

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d --build
docker compose --env-file .env.deploy -f docker-compose.deploy.yml ps
curl http://localhost:3088/v1/api/health
```

Log:

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml logs -f gateway
docker compose --env-file .env.deploy -f docker-compose.deploy.yml logs -f auth chat upload github notifications
```

Nếu muốn mở Kafdrop để debug Kafka:

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml --profile tools up -d kafdrop
```

Sau đó vào `http://<vm-ip>:9000`.

## 4. Test API Và Socket

Health:

```bash
curl http://<vm-ip>:3088/v1/api/health
```

Login/register theo [API docs](./API.md), lấy `access_token`, sau đó test bằng app frontend hoặc script dùng `socket.io-client`:

```ts
io('http://<vm-ip>:3088', {
  auth: { token: accessToken },
});
```

## 5. Ghi Chú Production

- Chỉ expose `gateway`. Postgres, MongoDB, Redis, Kafka nên ở network nội bộ Docker.
- Không commit `.env.deploy`.
- Nếu dùng domain, đặt Nginx/Caddy trước gateway và proxy WebSocket.
- Cập nhật GitHub OAuth callback, GitHub App redirect/webhook URL theo domain public.
- Kafka/Postgres/MongoDB trong Compose đủ để test. Khi production thật nên tách managed database/message broker.
