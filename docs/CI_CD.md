# CI/CD

Repo đã có:

- `.github/workflows/ci.yml`: install dependencies, build toàn bộ Nest monorepo, Docker build smoke test.
- `.github/workflows/deploy.yml`: build image multi-arch, push GHCR, SSH vào VM và chạy Docker Compose.

## Secrets Cần Tạo Trên GitHub

Vào `Settings -> Secrets and variables -> Actions -> New repository secret`:

| Secret | Mô tả |
| --- | --- |
| `SSH_HOST` | IP/domain của VM OCI |
| `SSH_USER` | User SSH, ví dụ `ubuntu` |
| `SSH_PORT` | Port SSH, thường là `22` |
| `SSH_PRIVATE_KEY` | Private key dùng để SSH vào VM |
| `DEPLOY_PATH` | Thư mục deploy trên VM, ví dụ `/home/ubuntu/devchat` |
| `GHCR_TOKEN` | GitHub PAT có quyền `read:packages`; dùng để VM pull image private từ GHCR |

Trên VM, tạo sẵn file env:

```bash
mkdir -p /home/ubuntu/devchat
cd /home/ubuntu/devchat
nano .env.deploy
```

Nội dung lấy từ `.env.deploy.example` và thay bằng secret thật.

## Luồng CI

1. Push hoặc mở PR.
2. GitHub Actions chạy `yarn install --frozen-lockfile`.
3. Chạy `yarn build:all`.
4. Build thử Docker image `devchat-api:ci`.

## Luồng CD

1. Push vào `main`/`master` hoặc chạy manual `workflow_dispatch`.
2. Build Docker image multi-arch: `linux/amd64`, `linux/arm64`.
3. Push image lên GitHub Container Registry.
4. Copy `docker-compose.deploy.yml` và thư mục `docker/` lên VM.
5. SSH vào VM, pull image mới và chạy:

```bash
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d --remove-orphans
```

6. Kiểm tra:

```bash
curl -fsS http://127.0.0.1:3088/v1/api/health
```

## Rollback

Trên GitHub Actions, lấy lại image tag của commit cũ, rồi trên VM:

```bash
cd /home/ubuntu/devchat
export APP_IMAGE=ghcr.io/<owner>/<repo>/devchat-api:<old_sha>
docker compose --env-file .env.deploy -f docker-compose.deploy.yml pull
docker compose --env-file .env.deploy -f docker-compose.deploy.yml up -d --remove-orphans
```

