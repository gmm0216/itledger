# IT 资产台账系统 Docker 部署指南

## 前置要求

- 服务器已安装 Docker 和 Docker Compose
- 服务器有足够的磁盘空间（建议至少 1GB）
- 服务器端口 3000 未被占用

## 需要上传的文件和文件夹

将以下文件和文件夹从本地项目上传到服务器的某个目录（例如 `/opt/it-ledger`）：

### 必须上传的文件：
- `Dockerfile` - Docker 镜像构建文件
- `docker-compose.yml` - Docker Compose 配置文件
- `.dockerignore` - Docker 构建忽略文件
- `package.json` - Node.js 依赖配置文件
- `package-lock.json` - Node.js 依赖锁定文件
- `server.js` - 服务器主程序文件

### 必须上传的文件夹：
- `public/` - 前端静态文件文件夹（包含 index.html, styles.css, app.js 等）

### 不需要上传的文件/文件夹：
- `node_modules/` - 依赖包（Docker 构建时会自动安装）
- `data/` - 数据目录（首次部署时需要手动创建，数据库文件会在容器内自动创建）
- `uploads/` - 上传文件目录（会自动创建并通过 volume 持久化）
- `backups/` - 备份文件目录（会自动创建并通过 volume 持久化）
- `.git/` - Git 版本控制目录
- `README.md` - 项目说明文档

## 部署步骤

### 1. 上传文件到服务器

使用 SCP、SFTP 或其他方式将上述文件上传到服务器：

```bash
# 在本地执行（假设服务器IP为 192.168.1.100，上传到 /opt/it-ledger 目录）
scp Dockerfile docker-compose.yml .dockerignore package.json package-lock.json server.js user@192.168.1.100:/opt/it-ledger/
scp -r public/ user@192.168.1.100:/opt/it-ledger/
```

或者使用 FTP 客户端（如 FileZilla）上传文件。

### 2. 登录服务器

```bash
ssh user@192.168.1.100
```

### 3. 进入项目目录

```bash
cd /opt/it-ledger
```

### 4. 创建数据目录

在服务器上创建数据目录（重要！）：

```bash
mkdir -p data
```

### 5. 验证文件完整性

确保所有必要文件都已上传：

```bash
ls -la
```

应该看到以下文件：
- Dockerfile
- docker-compose.yml
- .dockerignore
- package.json
- package-lock.json
- server.js
- public/
- data/ (刚创建的目录)

### 6. 创建必要的目录（可选）

Docker Compose 会自动创建这些目录，但可以手动创建以确保权限正确：

```bash
mkdir -p uploads backups
```

### 7. 构建 Docker 镜像

```bash
docker compose build
```

这个过程可能需要几分钟，取决于网络速度和服务器性能。它会：
- 下载 Node.js 18 Alpine 镜像
- 安装项目依赖
- 复制应用代码

### 8. 启动容器

```bash
docker compose up -d
```

参数说明：
- `-d` 表示后台运行（detached mode）

### 9. 查看容器状态

```bash
docker compose ps
```

应该看到容器状态为 `Up`。

### 10. 查看容器日志（如有问题）

```bash
docker compose logs -f
```

按 `Ctrl+C` 退出日志查看。

### 11. 验证服务是否正常运行

在浏览器中访问：
```
http://服务器IP:3000
```

例如：`http://192.168.1.100:3000`

应该能看到登录页面。

## 常用管理命令

### 停止容器

```bash
docker compose stop
```

### 启动容器

```bash
docker-compose start
```

### 重启容器

```bash
docker compose restart
```

### 停止并删除容器

```bash
docker compose down
```

### 查看容器日志

```bash
docker compose logs -f
```

### 进入容器内部（调试用）

```bash
docker compose exec app sh
```

### 更新应用代码

1. 上传新的代码文件到服务器
2. 重新构建并启动：

```bash
docker compose down
docker compose build
docker compose up -d
```

## 数据持久化说明

Docker Compose 配置了以下 volume 挂载，确保数据不会因容器重启而丢失：

- `./data:/app/data` - 数据目录（包含 data.db 数据库文件）
- `./uploads:/app/uploads` - 上传的图片文件
- `./backups:/app/backups` - 备份文件

这些文件会保存在宿主机的项目目录中，即使删除容器，数据也会保留。

## 数据备份

### 自动备份

在系统设置的"数据备份"功能中点击"导出数据备份"，备份文件会保存到 `backups/` 目录。

### 手动备份

```bash
# 备份数据库
cp data/data.db data/data.db.backup.$(date +%Y%m%d_%H%M%S)

# 备份上传文件
tar -czf uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz uploads/
```

## 故障排查

### 端口被占用

如果端口 3000 被占用，可以修改 `docker-compose.yml` 中的端口映射：

```yaml
ports:
  - "8080:3000"  # 将宿主机端口改为 8080
```

### 容器无法启动

查看日志：

```bash
docker-compose logs
```

常见问题：
- 权限问题：确保 `uploads/` 和 `backups/` 目录有写权限
- 磁盘空间不足：检查服务器磁盘空间
- 依赖安装失败：检查网络连接

### 文件上传失败

确保 `uploads/` 目录存在且有写权限：

```bash
chmod 755 uploads/
```

## 安全建议

1. **修改默认密码**：首次登录后立即修改 admin 账号密码
2. **使用 HTTPS**：建议使用 Nginx 或 Caddy 反向代理，配置 SSL 证书
3. **防火墙配置**：只开放必要的端口
4. **定期备份**：定期备份数据库和上传文件
5. **更新依赖**：定期更新 Docker 镜像和依赖包

## 使用 Nginx 反向代理（可选）

如果需要使用域名和 HTTPS，可以配置 Nginx 反向代理：

### 安装 Nginx

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install nginx

# CentOS/RHEL
sudo yum install nginx
```

### 配置 Nginx

创建配置文件 `/etc/nginx/sites-available/it-ledger`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/it-ledger /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 配置 HTTPS（使用 Let's Encrypt）

```bash
# 安装 Certbot
sudo apt install certbot python3-certbot-nginx

# 获取证书
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

## 性能优化

### 限制容器资源

在 `docker-compose.yml` 中添加资源限制：

```yaml
services:
  app:
    build: .
    container_name: it-ledger
    ports:
      - "3000:3000"
    volumes:
      - ./data.db:/app/data.db
      - ./uploads:/app/uploads
      - ./backups:/app/backups
    environment:
      - PORT=3000
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
```

## 联系支持

如遇到部署问题，请检查：
1. Docker 和 Docker Compose 版本是否兼容
2. 服务器资源是否充足
3. 网络连接是否正常
4. 防火墙和安全组配置
