# Life K-Line Insight - RackNerd VPS 部署指南

本指南将指导你如何将 Life K-Line Insight 全栈应用部署到 RackNerd VPS (或其他 Linux 服务器) 上。

## 1. 准备工作

*   **一台 VPS 服务器** (推荐 Ubuntu 20.04/22.04 LTS 或 Debian 11/12)。
*   **SSH 连接工具** (如 Terminal, PuTTY, Xshell)。
*   **域名** (可选，如果需要通过域名访问)。

## 2. 环境搭建

通过 SSH 登录你的服务器：
```bash
ssh root@your_server_ip
```

### 2.1 安装 Node.js (使用 NVM)
推荐使用 NVM (Node Version Manager) 安装 Node.js，便于管理版本。

```bash
# 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# 重新加载 shell 配置
source ~/.bashrc

# 安装 Node.js (推荐 v20 LTS 或 v22)
nvm install 20
nvm use 20

# 验证安装
node -v
npm -v
```

### 2.2 安装 PM2 (进程管理器)
PM2 用于在后台运行 Node.js 服务，并在崩溃或重启后自动恢复。

```bash
npm install -g pm2
```

## 3. 部署代码

### 3.1 上传代码
你可以通过 `git clone` (推荐) 或 `SCP/SFTP` 上传代码。

**方式 A: 使用 Git (需将代码推送到 GitHub/GitLab)**
```bash
# 安装 git
apt update && apt install git -y

# 克隆仓库
git clone https://github.com/your-username/life-k-line-insight.git
cd life-k-line-insight
```

**方式 B: 本地直接上传 (SCP)**
在**本地电脑**执行：
```bash
# 压缩项目 (排除 node_modules)
tar -czvf project.tar.gz --exclude=node_modules .

# 上传
scp project.tar.gz root@your_server_ip:/root/life-k-line-insight.tar.gz

# 登录服务器解压
ssh root@your_server_ip
mkdir -p life-k-line-insight
tar -xzvf life-k-line-insight.tar.gz -C life-k-line-insight
cd life-k-line-insight
```

### 3.2 安装依赖
```bash
npm install
```

## 4. 构建与配置

### 4.1 配置环境变量
复制每环境示例文件或直接创建 `.env`。

```bash
nano .env
```
写入以下内容 (根据实际情况修改)：
```env
# 核心配置
DEEPSEEK_API_KEY=sk-your_deepseek_key_here

# 端口 (默认 3001)
PORT=3001

# JWT 密钥 (修改为复杂的随机字符串)
JWT_SECRET=your_complex_jwt_secret_key_here
```
*按 `Ctrl+O` 回车保存，`Ctrl+X` 退出*。

**同时**创建/修改前端配置 (如果需要):
Vite 在构建时会读取环境变量。确保 DeepSeek Key 在服务端配置即可，前端主要通过 API 通信。如果前端有直接调用 API 的部分，确保 `.env` 里包含 `VITE_` 前缀的变量 (本项目主要是后端调用，所以重点是 server 端配置)。

### 4.2 构建前端
编译 React 前端代码，生成静态文件到 `dist/` 目录。Node.js 后端会自动托管这些文件。

```bash
npm run build
```

## 5. 启动服务

使用 PM2 启动后端服务。后端服务 (`server/index.js`) 已经配置为同时提供 API 接口和托管前端静态文件。

```bash
# 启动服务，命名为 life-kline
pm2 start server/index.js --name "life-kline"

# 保存当前进程列表，确保开机自启
pm2 save
pm2 startup
# (执行 pm2 startup 提示的命令)
```

现在，你的服务应该在 `http://your_server_ip:3001` 上运行了！

## 6. (可选) 配置 Nginx 反向代理与域名

为了使用 80 端口 (无端口号访问) 和 HTTPS，建议配置 Nginx。

### 6.1 安装 Nginx
```bash
apt install nginx -y
```

### 6.2 配置站点
```bash
nano /etc/nginx/sites-available/life-kline
```
写入配置 (替换 `your_domain.com`):
```nginx
server {
    listen 80;
    server_name your_domain.com www.your_domain.com; # 或者填写服务器 IP

    location / {
        proxy_pass http://localhost:3001; # 转发到 Node 服务
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

启用配置：
```bash
ln -s /etc/nginx/sites-available/life-kline /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default # 移除默认配置 (可选)
nginx -t # 测试配置
systemctl restart nginx
```

现在你可以通过 `http://your_domain.com` 访问了。

### 6.3 配置 SSL (HTTPS)
使用 Certbot 免费申请证书。
```bash
apt install certbot python3-certbot-nginx -y
certbot --nginx -d your_domain.com
```
按照提示操作即可开启 HTTPS。

## 7. 维护与更新

当你有新代码更新时：
1. 拉取新代码: `git pull`
2. 重新安装依赖 (如果有变动): `npm install`
3. 重新构建前端: `npm run build`
4. 重启 PM2 服务: `pm2 restart life-kline`
