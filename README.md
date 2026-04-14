# HUHA

HUHA 是一套面向运维场景的轻量化主机探针与后台管理系统，包含主控服务、跨平台探针、实时控制台和后台管理界面，适合用来统一接入服务器、观察在线状态、查看基础资源指标，并通过通知渠道接收关键事件告警。

当前仓库已经具备可直接运行的完整链路：

- `control-server`：Node.js + Fastify 主控服务
- `probe-go`：Go 编写的跨平台探针
- `web-console`：React + shadcn/ui 风格前端
- `mongodb`：状态、时序、通知配置与通知记录存储

## 项目亮点

- 控制台与后台管理完全分路由拆分
- 支持 Linux / macOS / Windows 探针接入
- 支持安装命令与卸载脚本分平台下发
- 支持 Windows 服务安装状态与运行状态展示
- 支持实时主机列表、单机详情、CPU/内存/上下行曲线
- 支持后台通知渠道配置、测试发送、历史记录与详情查看
- 支持登录通知、离线通知、恢复通知、3 分钟 / 10 分钟未恢复再次通知
- 支持 MongoDB 持久化通知提醒状态，避免服务重启后重复判定
- 支持 Docker Compose 一键构建与部署

## 功能完成情况

### 已完成

- [x] 初始化管理员账户与后台登录会话
- [x] 主控台 `/console` 与后台管理 `/admin/*` 路由拆分
- [x] 刷新子路径时通过 Nginx history fallback 避免 404
- [x] 主机管理页面重构为后台管理样式
- [x] 新增主机使用模态框操作
- [x] 主机详情使用模态框查看安装命令、卸载命令和更多信息
- [x] Linux / macOS / Windows 安装命令生成
- [x] Linux / macOS / Windows 卸载脚本展示与复制
- [x] Windows 服务状态回传与前端可视化展示
- [x] 主控台服务器列表展示 CPU、内存、上下行基础数据
- [x] 主控台服务器列表展示上下行迷你折线图
- [x] 单机详情展示 CPU、内存、上下行实时曲线
- [x] 顶部通知改为 shadcn 风格 Alert，右上角浮层显示，3 秒自动消失
- [x] 危险操作改为 shadcn 风格 Alert Dialog 二次确认，并带开关动画
- [x] 通知渠道配置支持邮件、企业微信 Webhook Bot、飞书 Webhook Bot、Telegram Bot、自定义 Webhook
- [x] 仅允许一个通知渠道为激活渠道
- [x] 每个通知渠道支持测试发送
- [x] 后台登录通知自动触发
- [x] 服务器离线立即通知自动触发
- [x] 服务器恢复立即通知自动触发
- [x] 服务器 3 分钟未恢复再次通知自动触发
- [x] 服务器 10 分钟未恢复再次通知自动触发
- [x] 通知发送记录、筛选、分页、最近一次发送结果、完整内容详情查看
- [x] Docker Compose 方式运行 `mongodb + control-server + web-console`

### 当前边界

- [ ] 多管理员、多角色权限体系
- [ ] 更细粒度的告警策略编排
- [ ] 更丰富的资源图表聚合查询能力
- [ ] 更完整的真实 Windows 生产环境联调验证
- [ ] 更细粒度的审计日志与操作追踪

## 仓库结构

```text
.
├─ apps/
│  ├─ control-server/
│  ├─ probe-go/
│  └─ web-console/
├─ packages/
│  └─ protocol/
├─ scripts/
├─ docker-compose.yml
└─ README.md
```

## 核心页面说明

### 主控台 `/console`

用于日常查看主机状态：

- 实时连接状态、主机数量、在线数量
- 服务器列表卡片
- CPU / 内存占用
- 下行 / 上行速率及迷你趋势线
- 点击主机后查看详情模态框
- 详情中查看系统信息、磁盘布局、实时曲线

### 后台管理 `/admin/*`

用于运维管理与配置：

- `/admin/servers`：主机接入、创建主机、查看安装与卸载信息、查看基础状态
- `/admin/settings`：系统设置、通知渠道配置、通知发送记录、提醒状态概览
- `/admin/profile`：管理员账户资料与密码维护

## 通知能力

### 支持的通知渠道

- 邮件
- 企业微信 Webhook Bot
- 飞书 Webhook Bot
- Telegram Bot
- 自定义 Webhook

### 支持的触发条件

- 后台管理系统登录通知
- 服务器离线立即通知
- 服务器恢复立即通知
- 服务器 3 分钟未恢复再次通知
- 服务器 10 分钟未恢复再次通知

### 通知限制

- 同一时间仅允许一个通知渠道处于激活状态
- 每个渠道都支持在后台直接发送测试通知
- 通知发送记录会持久化到 MongoDB

## 快速开始

### 环境要求

- Node.js `20+`
- pnpm `9+`
- Go `1.22+`
- Docker / Docker Compose

### 1. 安装依赖

```bash
pnpm install
cd apps/probe-go && go mod tidy
```

如果当前网络环境访问 GitHub 不稳定，可以使用仓库里的代理配置：

```bash
GIT_CONFIG_GLOBAL=/Volumes/Samsung2T/PJFiles/huha/.gitconfig.proxy GOPROXY=direct GOSUMDB=off go mod tidy
```

### 2. 使用 Docker Compose 启动

```bash
docker compose up -d --build
```

默认访问地址：

- 前端控制台：[http://localhost:4173](http://localhost:4173)
- 控制服务 API：[http://localhost:4000](http://localhost:4000)
- MongoDB：`mongodb://localhost:27017`

首次启动说明：

1. 第一次访问时会先进入初始化流程
2. 创建唯一管理员账户后才能进入系统
3. 初始化完成后，后台管理与主控台都需要管理员会话

## 本地开发

### 启动 MongoDB

```bash
docker compose up -d mongodb
```

### 启动主控服务

```bash
pnpm dev:control-server
```

默认端口：

- HTTP：`http://localhost:4000`
- Agent WS：`ws://localhost:4000/ws/agent`
- Dashboard WS：`ws://localhost:4000/ws/dashboard`

### 启动前端

```bash
pnpm dev:web-console
```

默认地址：

- `http://localhost:5173`

### 启动探针

```bash
cd apps/probe-go
HUHA_SERVER_URL=ws://localhost:4000/ws/agent go run ./cmd/probe
```

## 安装与卸载

主控服务会提供多平台探针下载与脚本能力。

### 安装脚本

- `GET /install/huha.sh`
- `GET /install/huha.ps1`

### 卸载脚本

- `GET /install/huha-uninstall.sh`
- `GET /install/huha-uninstall.ps1`

### Probe 下载

- `GET /downloads/probes/:filename`

说明：

- Docker 部署时，`control-server` 会自动构建多平台 probe 产物
- `probe-go` 默认不放进 `docker-compose.yml`，因为探针更适合运行在宿主机
- 如果只做链路联调，也可以单独构建 `apps/probe-go/Dockerfile`

## 环境变量

示例文件：[`./.env.example`](./.env.example)

### 服务端核心变量

- `HUHA_HTTP_PORT`
- `HUHA_HTTP_HOST`
- `HUHA_MONGODB_URI`
- `HUHA_MONGODB_DB`
- `HUHA_ADMIN_SESSION_TTL_HOURS`
- `HUHA_AGENT_OFFLINE_AFTER_MS`
- `HUHA_PUBLIC_SERVER_URL`
- `HUHA_PUBLIC_DASHBOARD_WS_URL`
- `HUHA_PROBE_DOWNLOAD_BASE_URL`

### 前端变量

- `VITE_HUHA_API_BASE_URL`
- `VITE_HUHA_DASHBOARD_WS_URL`

### Probe 变量

- `HUHA_SERVER_URL`
- `HUHA_AGENT_ID`
- `HUHA_PROBE_VERSION`
- `HUHA_FAST_INTERVAL`
- `HUHA_SLOW_INTERVAL`
- `HUHA_INFO_INTERVAL`
- `HUHA_RECONNECT_WAIT`

## 已实现接口

### HTTP

- `GET /health`
- `GET /api/setup/status`
- `POST /api/setup/admin`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/logout`
- `GET /api/agents`
- `GET /api/agents/:agentId`
- `GET /api/agents/:agentId/timeseries`
- `GET /api/ingestion/schema`
- `GET /api/installers`
- `GET /api/notifications/settings`
- `PUT /api/notifications/settings`
- `POST /api/notifications/test`
- `GET /api/notifications/activity`
- `GET /install/huha.sh`
- `GET /install/huha.ps1`
- `GET /install/huha-uninstall.sh`
- `GET /install/huha-uninstall.ps1`
- `GET /downloads/probes/:filename`

### WebSocket

- `/ws/agent`
- `/ws/dashboard`

## 技术栈

- 后端：Fastify、MongoDB、WebSocket、Nodemailer
- 探针：Go
- 前端：React 19、Vite、Tailwind CSS、shadcn/ui 风格组件、Lucide Icons
- 部署：Docker Compose、Nginx

## 后续建议

1. 增加多用户、角色与权限模型
2. 增加更灵活的通知策略与告警静默规则
3. 增加更完整的历史报表与聚合查询
4. 增加批量主机操作与筛选能力
5. 增加更细致的审计日志、变更记录与安全控制

## 注意事项

- 当前为单管理员模型，不支持多管理员协同
- 当前探针消息没有做签名与设备级鉴权
- 当前前端使用的是 shadcn/ui 风格基础组件，不是完整 CLI 生成物
- Docker 部署时会自动构建 `darwin/linux/windows` 的 `amd64/arm64` probe 产物
- 本地非 Docker 开发时，可执行 `pnpm build:probes` 生成多平台 probe 产物
