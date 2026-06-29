# 使用官方 Node.js 镜像
FROM node:18-bookworm-slim

# 设置工作目录
WORKDIR /app

# 复制 package.json 和 package-lock.json
COPY package*.json ./

# 安装依赖
RUN npm ci --omit=dev

# 复制应用代码
COPY . .

# 创建必要的目录
RUN mkdir -p data uploads backups

# 暴露端口
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]