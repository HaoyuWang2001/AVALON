# AVALON游戏服务器部署指南

本文档提供AVALON游戏服务器的完整部署步骤，包含MySQL数据库集成。

## 环境要求

### 服务器要求
- **操作系统**: Ubuntu 20.04+ / CentOS 7+
- **Node.js**: v22.22.2
- **MySQL**: 8.0+ 
- **内存**: 2GB+ RAM
- **磁盘空间**: 10GB+

## 部署步骤

### 1. 服务器环境准备

#### 1.1 安装Node.js 22.22.2
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version  # 应该显示 v22.22.2
```

#### 1.2 安装MySQL
```bash
sudo apt install -y mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql
sudo mysql_secure_installation
```

#### 1.3 创建项目目录
```bash
mkdir -p /home/lighthouse/AVALON
cd /home/lighthouse/AVALON
```

### 2. 应用配置

#### 2.1 克隆代码
```bash
cd /home/lighthouse/AVALON
git clone https://github.com/haoyu-wang141/AVALON.git AVALON
cd AVALON
```

#### 2.2 环境变量配置
```bash
cp .env.example .env
nano .env
```

`.env`文件内容：
```env
PORT=8082
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=avalon_user
DB_PASS=your_secure_password_here
DB_NAME=avalon_db
NODE_ENV=production
```

#### 2.3 安装依赖
```bash
cd server
npm install
```

### 3. 数据库配置

#### 3.1 创建数据库和用户
```sql
CREATE DATABASE avalon_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'avalon_user'@'localhost' IDENTIFIED BY 'your_secure_password_here';
GRANT ALL PRIVILEGES ON avalon_db.* TO 'avalon_user'@'localhost';
FLUSH PRIVILEGES;
```

#### 3.2 初始化数据库结构
```bash
cd /home/lighthouse/AVALON/AVALON/server
# 使用root用户初始化数据库结构
mysql -u root -p avalon_db < database/DDL.sql
```

### 4. 启动服务

#### 4.1 开发模式测试
```bash
npm run dev
# 测试接口
curl http://localhost:8082/hello
```

#### 4.2 生产模式部署
```bash
npm install -g pm2
pm2 start index.js --name "avalon-server"
pm2 startup
pm2 save
```

### 5. GitHub Actions自动部署

项目使用GitHub Actions实现CI/CD，当代码推送到`main`分支时自动部署。

#### 5.1 服务器端准备
```bash
# 配置GitHub Actions SSH访问
# 在GitHub仓库Settings → Secrets and variables → Actions中添加：
# - SERVER_HOST: 服务器IP
# - SERVER_USER: lighthouse
# - SERVER_SSH_KEY: SSH私钥
```

#### 5.2 手动触发部署测试
```bash
cd /home/lighthouse/AVALON/AVALON
git pull origin main
cd server
npm install
npm install -g pkg
pkg index.js -t node22-linux-x64 -o ../avalon-server
cd /home/lighthouse/AVALON
chmod +x avalon-server
pm2 restart avalon-server
```

### 6. 服务验证
```bash
curl http://localhost:8082/hello
curl http://localhost:8082/api/health
pm2 logs avalon-server
```

## 高级配置

### Nginx反向代理（推荐）
```bash
sudo apt install -y nginx
sudo nano /etc/nginx/sites-available/avalon
```

配置示例：
```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location / {
        proxy_pass http://localhost:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
    }
    
    location /socket.io/ {
        proxy_pass http://localhost:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### SSL证书
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 数据库备份
```bash
# 创建备份目录
mkdir -p /home/lighthouse/backups

# 备份脚本（手动执行）
mysqldump -u avalon_user -p avalon_db > /home/lighthouse/backups/avalon_$(date +%Y%m%d).sql

# 定时任务（crontab -e添加）
0 2 * * * mysqldump -u avalon_user -p avalon_db > /home/lighthouse/backups/avalon_$(date +\%Y\%m\%d).sql 2>/dev/null
```

## 故障排除

### 数据库连接失败
```bash
sudo systemctl status mysql
mysql -u avalon_user -p -e "SELECT 1;"
```

### 应用启动失败
```bash
cd /home/lighthouse/AVALON/AVALON/server
node index.js  # 查看错误
```

### 服务状态检查
```bash
pm2 status avalon-server
pm2 logs avalon-server --lines 50
```

---

**部署完成！** 访问地址：
- http://your-server-ip:8082/hello
- WebSocket连接: ws://your-server-ip:8082