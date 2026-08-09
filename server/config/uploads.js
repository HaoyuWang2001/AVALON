// 上传文件存储目录（容器内 /app/uploads，宿主 ../uploads 经 docker volume 挂载）
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const AVATAR_DIR = path.join(UPLOAD_DIR, 'avatars');

module.exports = { UPLOAD_DIR, AVATAR_DIR };
