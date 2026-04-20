# AVALON游戏服务器部署指南

本文档提供AVALON游戏服务器的完整部署步骤，包含MySQL数据库集成。

## 环境要求

### 1. 服务器要求
- **操作系统**: Ubuntu 20.04+ / CentOS 7+ / Windows Server 2019+
- **内存**: 至少2GB RAM
- **磁盘空间**: 至少10GB可用空间
- **网络**: 开放端口 8083（HTTP）和 8086（备用）

### 2. 软件依赖
- **Node.js**: v16.0.0 或更高版本
- **MySQL**: 8.0 或更高版本
- **npm**: 8.0.0 或更高版本
- **Git**: 版本控制工具

## 部署步骤

### 步骤1：准备服务器环境

#### 1.1 更新系统包
```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y

# CentOS/RHEL
sudo yum update -y
```

#### 1.2 安装Node.js
```bash
# 使用NodeSource安装Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 验证安装
node --version  # 应该显示 v18.x.x
npm --version   # 应该显示 8.x.x 或更高
```

#### 1.3 安装MySQL
```bash
# Ubuntu/Debian
sudo apt install -y mysql-server

# CentOS/RHEL
sudo yum install -y mysql-server
sudo systemctl start mysqld
sudo systemctl enable mysqld
```

#### 1.4 配置MySQL
```bash
# 运行安全安装脚本
sudo mysql_secure_installation

# 按照提示设置root密码和其他安全选项
```

### 步骤2：部署应用程序

#### 2.1 克隆代码仓库
```bash
# 创建项目目录
sudo mkdir -p /opt/avalon
sudo chown $USER:$USER /opt/avalon
cd /opt/avalon

# 克隆代码（如果使用Git）
git clone <your-repository-url> .

# 或者直接上传代码到服务器
```

#### 2.2 安装依赖
```bash
cd /opt/avalon/server
npm install
```

### 步骤3：配置MySQL数据库

#### 3.1 登录MySQL
```bash
sudo mysql -u root -p
# 输入之前设置的root密码
```

#### 3.2 创建数据库和用户
```sql
-- 创建数据库
CREATE DATABASE avalon_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建专用用户（推荐）
CREATE USER 'avalon_user'@'localhost' IDENTIFIED BY 'your_secure_password_here';

-- 授予权限
GRANT ALL PRIVILEGES ON avalon_db.* TO 'avalon_user'@'localhost';

-- 刷新权限
FLUSH PRIVILEGES;

-- 退出
EXIT;
```

#### 3.3 初始化数据库结构
```bash
# 使用初始化脚本
cd /opt/avalon/server
node scripts/init-database.js

# 或者手动执行SQL文件
mysql -u root -p avalon_db < database/DDL.sql
```

### 步骤4：配置应用程序

#### 4.1 创建环境配置文件
```bash
cd /opt/avalon
cp .env.example .env
```

#### 4.2 编辑.env文件
```bash
nano .env
```

配置文件内容示例：
```env
# 服务器端口
PORT=8083

# MySQL 数据库配置
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=avalon_user
DB_PASS=your_secure_password_here
DB_NAME=avalon_db

# 数据库连接池配置
DB_POOL_MAX=10
DB_POOL_MIN=2

# 服务器配置
NODE_ENV=production
LOG_LEVEL=info

# 游戏配置
MAX_ROOMS=1000
MAX_PLAYERS_PER_ROOM=12
```

### 步骤5：测试应用程序

#### 5.1 启动开发服务器测试
```bash
cd /opt/avalon/server
npm run dev
```

#### 5.2 验证服务运行
```bash
# 检查服务状态
curl http://localhost:8083/api/health

# 预期返回类似：
# {
#   "status": "ok",
#   "timestamp": 1234567890,
#   "database": {
#     "connected": true,
#     "initialized": true
#   }
# }
```

### 步骤6：生产环境部署

#### 6.1 使用PM2进程管理
```bash
# 安装PM2
sudo npm install -g pm2

# 启动应用
cd /opt/avalon/server
pm2 start index.js --name "avalon-server"

# 设置开机自启
pm2 startup
pm2 save
```

#### 6.2 配置Nginx反向代理（可选但推荐）
```bash
# 安装Nginx
sudo apt install -y nginx

# 创建Nginx配置
sudo nano /etc/nginx/sites-available/avalon
```

Nginx配置示例：
```nginx
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名
    
    location / {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    
    # WebSocket支持
    location /socket.io/ {
        proxy_pass http://localhost:8083;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

启用配置：
```bash
sudo ln -s /etc/nginx/sites-available/avalon /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 6.3 配置SSL证书（推荐）
```bash
# 使用Certbot获取免费SSL证书
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com

# 自动续期
sudo certbot renew --dry-run
```

### 步骤7：防火墙配置

```bash
# 开放必要端口
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 8083/tcp    # 应用端口（如果直接暴露）

# 启用防火墙
sudo ufw enable
```

## 监控和维护

### 1. 监控应用状态
```bash
# 查看PM2状态
pm2 status

# 查看日志
pm2 logs avalon-server

# 监控资源使用
pm2 monit
```

### 2. 数据库备份
```bash
# 创建备份脚本 /opt/avalon/backup.sh
#!/bin/bash
BACKUP_DIR="/opt/avalon/backups"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/avalon_db_$DATE.sql"

mkdir -p $BACKUP_DIR
mysqldump -u avalon_user -p'your_password' avalon_db > $BACKUP_FILE

# 保留最近7天备份
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete

# 添加定时任务（每天凌晨2点备份）
# crontab -e
# 0 2 * * * /opt/avalon/backup.sh
```

### 3. 应用更新流程
```bash
# 1. 备份当前版本
cd /opt/avalon
tar -czf backup_$(date +%Y%m%d).tar.gz .

# 2. 拉取最新代码
git pull origin main

# 3. 更新依赖
cd server
npm install

# 4. 重启应用
pm2 restart avalon-server

# 5. 验证更新
curl http://localhost:8083/api/health
```

## 故障排除

### 常见问题

#### 1. 数据库连接失败
```bash
# 检查MySQL服务状态
sudo systemctl status mysql

# 检查数据库用户权限
mysql -u root -p -e "SHOW GRANTS FOR 'avalon_user'@'localhost';"

# 测试数据库连接
mysql -u avalon_user -p -e "SELECT 1;"
```

#### 2. 应用启动失败
```bash
# 查看详细错误日志
cd /opt/avalon/server
node index.js  # 直接运行查看错误

# 检查端口占用
sudo netstat -tlnp | grep :8083

# 检查环境变量
cat .env
```

#### 3. WebSocket连接问题
```bash
# 检查Nginx配置中的WebSocket支持
# 确保有正确的proxy_set_header配置

# 检查防火墙设置
sudo ufw status
```

#### 4. 性能问题
```bash
# 查看系统资源
top
htop

# 查看数据库连接数
mysql -u root -p -e "SHOW STATUS LIKE 'Threads_connected';"

# 调整数据库连接池配置
# 修改.env中的DB_POOL_MAX和DB_POOL_MIN
```

## 安全建议

### 1. 数据库安全
- 使用强密码
- 定期更改数据库密码
- 限制数据库用户权限
- 启用SSL连接（如果远程访问）

### 2. 应用安全
- 保持Node.js和npm更新
- 定期检查依赖漏洞：`npm audit`
- 使用HTTPS
- 实施速率限制

### 3. 服务器安全
- 定期更新操作系统
- 使用SSH密钥认证
- 配置fail2ban防止暴力破解
- 定期审查日志

## 扩展和优化

### 1. 高可用部署
- 使用负载均衡器
- 数据库主从复制
- 多实例PM2集群

### 2. 性能优化
- Redis缓存会话数据
- CDN静态资源
- 数据库查询优化
- WebSocket连接复用

### 3. 监控告警
- 集成Prometheus + Grafana
- 设置关键指标告警
- 日志聚合（ELK Stack）

## 联系支持

如有问题，请：
1. 检查日志文件：`/opt/avalon/server/logs/`
2. 查看PM2日志：`pm2 logs avalon-server`
3. 提交Issue到项目仓库

---

**部署完成！** 现在可以通过以下地址访问服务：
- HTTP: http://your-domain.com 或 http://server-ip:8083
- 健康检查: http://your-domain.com/api/health
- 数据库状态: http://your-domain.com/api/debug/db/stats (仅开发环境)