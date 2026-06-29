# IT 资产台账系统 Docker 运维指南

## 代码更新

### 方式一：完整重新部署（推荐）

适用于重大更新或依赖变更：

```bash
#更新代码也可直接用
docker compose up -d --build

# 1. 停止并删除旧容器
docker compose down

# 2. 上传新的代码文件到服务器
# 使用 SCP、SFTP 或 FTP 客户端上传更新的文件

# 3. 重新构建镜像
docker compose build --no-cache

# 4. 启动新容器
docker compose up -d

# 5. 查看容器状态
docker compose ps

# 6. 查看日志确认启动成功
docker compose logs -f
```

### 方式二：快速更新（仅代码文件）

适用于小改动（如修改 server.js 或前端文件）：

```bash
# 1. 上传新的代码文件到服务器
# 只上传修改的文件，如 server.js、public/app.js 等

# 2. 重启容器（无需重新构建）
docker compose restart

# 3. 查看日志
docker compose logs -f
```

### 方式三：进入容器手动更新（调试用）

```bash
# 1. 进入容器
docker-compose exec app sh

# 2. 在容器内编辑文件（需要安装 vi 或 nano）
vi /app/server.js

# 3. 退出容器
exit

# 4. 重启容器
docker-compose restart
```

## 日常维护

### 查看容器状态

```bash
# 查看容器运行状态
docker compose ps

# 查看容器资源使用情况
docker stats it-ledger
```

### 查看日志

```bash
# 实时查看日志
docker compose logs -f

# 查看最近100行日志
docker compose logs --tail=100

# 查看特定时间的日志
docker compose logs --since="2024-01-01T00:00:00"
```

### 数据备份

#### 自动备份（通过系统设置）

1. 登录系统
2. 进入"系统设置"页面
3. 点击"导出数据备份"
4. 备份文件会保存到服务器的 `backups/` 目录

#### 手动备份数据库

```bash
# 备份数据库文件
cd /opt/it-ledger
cp data/data.db data/data.db.backup.$(date +%Y%m%d_%H%M%S)

# 压缩备份
gzip data/data.db.backup.$(date +%Y%m%d_%H%M%S)
```

#### 手动备份上传文件

```bash
# 备份上传文件
cd /opt/it-ledger
tar -czf uploads_backup_$(date +%Y%m%d_%H%M%S).tar.gz uploads/
```

#### 完整备份脚本

创建备份脚本 `backup.sh`：

```bash
#!/bin/bash
BACKUP_DIR="/opt/it-ledger/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# 创建备份目录
mkdir -p $BACKUP_DIR

# 备份数据库
cp /opt/it-ledger/data/data.db $BACKUP_DIR/data.db.$DATE
gzip $BACKUP_DIR/data.db.$DATE

# 备份上传文件
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /opt/it-ledger/uploads/

# 删除30天前的备份
find $BACKUP_DIR -type f -mtime +30 -delete

echo "备份完成: $DATE"
```

设置定时任务（每天凌晨2点备份）：

```bash
# 编辑 crontab
crontab -e

# 添加以下行
0 2 * * * /opt/it-ledger/backup.sh
```

### 数据恢复

#### 恢复数据库

```bash
# 1. 停止容器
docker-compose stop

# 2. 恢复数据库文件
cd /opt/it-ledger
cp data/data.db.backup.YYYYMMDD_HHMMSS data/data.db

# 3. 启动容器
docker-compose start

# 4. 验证数据
docker-compose logs -f
```

#### 通过系统设置恢复

1. 登录系统
2. 进入"系统设置"页面
3. 上传备份文件
4. 系统会自动恢复数据

### 清理旧数据

#### 清理旧备份文件

```bash
# 删除30天前的备份
find /opt/it-ledger/backups -type f -mtime +30 -delete
```

#### 清理Docker镜像和容器

```bash
# 清理未使用的镜像
docker image prune -a

# 清理未使用的容器
docker container prune

# 清理未使用的卷
docker volume prune

# 清理所有未使用的资源
docker system prune -a
```

## 故障处理

### 容器无法启动

#### 检查日志

```bash
docker-compose logs
```

#### 常见问题及解决方案

**1. 端口被占用**

```bash
# 查看端口占用
netstat -tlnp | grep 3000

# 修改 docker-compose.yml 中的端口映射
ports:
  - "8080:3000"  # 改为其他端口
```

**2. 数据库文件损坏**

```bash
# 停止容器
docker-compose stop

# 删除损坏的数据库
rm data/data.db

# 启动容器（会自动创建新的数据库）
docker-compose start
```

**3. 权限问题**

```bash
# 修复目录权限
chmod 755 /opt/it-ledger/uploads
chmod 755 /opt/it-ledger/backups
chmod 644 /opt/it-ledger/data.db
```

**4. 磁盘空间不足**

```bash
# 检查磁盘空间
df -h

# 清理Docker资源
docker system prune -a

# 清理旧备份
find /opt/it-ledger/backups -type f -mtime +30 -delete
```

### 服务无法访问

#### 检查容器状态

```bash
docker-compose ps
```

#### 检查防火墙

```bash
# Ubuntu/Debian
sudo ufw status
sudo ufw allow 3000

# CentOS/RHEL
sudo firewall-cmd --list-all
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload
```

#### 检查Nginx配置（如果使用）

```bash
# 测试Nginx配置
sudo nginx -t

# 重载Nginx
sudo systemctl reload nginx
```

### 文件上传失败

#### 检查上传目录权限

```bash
ls -la /opt/it-ledger/uploads
chmod 755 /opt/it-ledger/uploads
```

#### 检查磁盘空间

```bash
df -h
```

#### 查看容器日志

```bash
docker-compose logs | grep -i upload
```

### 数据库连接问题

#### 检查数据库文件

```bash
ls -la /opt/it-ledger/data/data.db
```

#### 重启容器

```bash
docker-compose restart
```

## 性能监控

### 查看容器资源使用

```bash
# 实时查看资源使用
docker stats it-ledger

# 查看历史资源使用
docker stats --no-stream it-ledger
```

### 查看磁盘使用

```bash
# 查看项目目录磁盘使用
du -sh /opt/it-ledger/*

# 查看Docker磁盘使用
docker system df
```

### 监控日志大小

```bash
# 查看Docker日志大小
ls -lh /var/lib/docker/containers/*//*-json.log

# 限制日志大小（在 docker-compose.yml 中添加）
logging:
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"
```

## 安全维护

### 更新Docker镜像

```bash
# 拉取最新的基础镜像
docker pull node:18-alpine

# 重新构建应用镜像
docker-compose build --no-cache

# 重启容器
docker-compose up -d
```

### 检查安全更新

```bash
# 检查基础镜像安全漏洞
docker scan node:18-alpine

# 检查应用镜像
docker scan it-ledger
```

### 定期更改密码

建议每3个月更改一次管理员密码。

### 审查访问日志

```bash
# 查看系统登录日志
# 在系统设置页面查看"系统日志"
```

## 版本回滚

### 回滚到之前的代码版本

```bash
# 1. 停止容器
docker-compose down

# 2. 恢复之前的代码文件
# 从备份或Git中恢复

# 3. 重新构建
docker-compose build

# 4. 启动容器
docker-compose up -d
```

### 回滚数据库

```bash
# 1. 停止容器
docker-compose stop

# 2. 恢复数据库备份
cp data.db.backup.YYYYMMDD_HHMMSS data.db

# 3. 启动容器
docker-compose start
```

## 扩容和负载均衡

### 多实例部署

修改 `docker-compose.yml`：

```yaml
services:
  app:
    build: .
    deploy:
      replicas: 3  # 运行3个实例
    # ... 其他配置
```

### 使用Nginx负载均衡

修改Nginx配置：

```nginx
upstream it-ledger {
    server localhost:3001;
    server localhost:3002;
    server localhost:3003;
}

server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://it-ledger;
        # ... 其他配置
    }
}
```

## 监控和告警

### 使用Prometheus监控

安装Prometheus和Grafana进行容器监控。

### 简单的健康检查脚本

创建 `health_check.sh`：

```bash
#!/bin/bash
# 检查容器状态
if ! docker-compose ps | grep -q "Up"; then
    echo "容器未运行，尝试重启..."
    docker-compose restart
    # 发送告警邮件
    echo "IT资产台账系统容器已重启" | mail -s "系统告警" admin@example.com
fi

# 检查服务响应
if ! curl -f http://localhost:3000 > /dev/null 2>&1; then
    echo "服务无响应，尝试重启..."
    docker-compose restart
    # 发送告警邮件
    echo "IT资产台账系统服务无响应" | mail -s "系统告警" admin@example.com
fi
```

设置定时任务（每5分钟检查一次）：

```bash
crontab -e
*/5 * * * * /opt/it-ledger/health_check.sh
```

## 常用运维命令速查

```bash
# 启动服务
docker-compose up -d

# 停止服务
docker-compose stop

# 重启服务
docker-compose restart

# 查看状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 进入容器
docker-compose exec app sh

# 重新构建
docker-compose build

# 完全重建
docker-compose down && docker-compose build && docker-compose up -d

# 清理资源
docker system prune -a
```

## 联系支持

如遇到无法解决的问题，请收集以下信息：

1. 容器日志：`docker-compose logs`
2. 容器状态：`docker-compose ps`
3. 系统资源：`free -h`, `df -h`
4. Docker版本：`docker --version`, `docker-compose --version`
