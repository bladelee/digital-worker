# 数字员工 Mattermost 插件

让用户在 Mattermost 中直接管理数字员工。

## 功能

- 侧边栏面板显示数字员工列表
- 创建/删除数字员工
- 激活/停用数字员工
- 一键创建频道并添加数字员工

## 安装

1. 构建插件：
   ```bash
   # 构建 Webapp
   cd webapp
   npm install
   npm run build

   # 构建 Server
   cd ../server
   go build -o dist/plugin-linux-amd64

   # 打包
   cd ..
   tar -czvf com.openclaw.digital-worker.tar.gz plugin.json webapp/dist server/dist
   ```

2. 上传到 Mattermost：
   - 系统控制台 → 插件 → 管理插件 → 上传插件
   - 或将 tar.gz 放到 Mattermost 的 `plugins` 目录

3. 配置插件：
   - 系统控制台 → 插件 → 数字员工
   - 设置平台 API 地址（例如：`http://localhost:3000`）

4. 激活插件

## 开发

### 前端

```bash
cd webapp
npm install
npm run dev  # 开发模式，监听文件变化
```

### 后端

```bash
cd server
go mod tidy
go build
```

## API 依赖

插件需要调用以下平台 API：

- `POST /api/auth/mattermost` - Mattermost 认证
- `GET /api/workers?teamId=xxx` - 获取数字员工列表
- `POST /api/workers` - 创建数字员工
- `POST /api/workers/:id/activate` - 激活数字员工
- `DELETE /api/workers/:id` - 删除数字员工
- `POST /api/workers/:id/create-channel` - 创建频道

## 技术栈

- **前端**: React + TypeScript + Webpack
- **后端**: Go + Mattermost Plugin SDK
- **样式**: CSS（使用 Mattermost CSS 变量）

## 文件结构

```
mm-plugin-digital-worker/
├── plugin.json           # 插件配置
├── README.md             # 说明文档
├── server/               # Go 后端
│   ├── main.go
│   ├── plugin.go
│   ├── configuration.go
│   └── go.mod
└── webapp/               # React 前端
    ├── package.json
    ├── tsconfig.json
    ├── webpack.config.js
    └── src/
        ├── index.tsx
        ├── types/
        ├── actions/
        └── components/
```

## Mattermost 版本要求

- Mattermost 7.0+
