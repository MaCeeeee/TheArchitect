================================================================================
  TheArchitect - 企业架构管理平台
================================================================================

  3D可视化 | TOGAF 10 | ArchiMate 3.2 | AI助手 | 治理工作流

================================================================================


项目简介

  TheArchitect 是一个全栈企业架构管理（EAM）平台，帮助企业在交互式3D环境中
  对IT和业务架构进行建模、可视化和治理。

  平台遵循 TOGAF 10 方法论和 ArchiMate 3.2 标记语言，支持8个架构层级的60种
  元素类型：动机层、战略层、业务层、数据层、应用层、技术层、物理层、实施与迁移层。

  在线演示：https://thearchitect.site


核心功能

  3D架构可视化
    - 基于 Three.js 的交互式3D场景，包含8个分层平面
    - 元素以3D节点呈现，按层级进行颜色编码
    - 连接线展示元素间关系（组合、服务、流程等）
    - 支持2D和3D视图模式、X-Ray透视、成本重力可视化

  蓝图生成器（AI驱动）
    - 通过自然语言业务描述自动生成完整的企业架构
    - 6张引导式问卷卡片（无需架构专业知识）
    - 支持上传文档自动填充（PDF、Excel、PowerPoint）
    - 两阶段AI生成：先生成元素，再生成连接关系
    - SSE流式传输，实时反馈生成进度
    - 预览、编辑并导入项目

  AI助手
    - 上下文感知助手，理解您的架构模型
    - 提问、获取建议、分析依赖关系
    - 双LLM支持：OpenAI 和 Anthropic（自动切换）

  转型路线图
    - 定义架构高原（当前状态、目标状态、过渡阶段）
    - 工作包含成本估算和时间线
    - 架构状态间的差距分析
    - 3D视图中的高原导航可视化

  合规性管道
    - 上传行业标准（TOGAF、ISO 27001、GDPR等）
    - 7阶段文档解析与需求提取
    - AI驱动的需求与架构元素匹配
    - 合规矩阵，含评分和差距识别

  治理工作流
    - 策略管理与审批流程
    - 架构评审委员会
    - 变更请求跟踪
    - 所有修改的审计追踪

  随机模拟（Mirofish）
    - 架构决策的蒙特卡洛模拟
    - 风险拓扑可视化
    - 基于代理的涌现追踪

  模板市场
    - 共享和导入架构模板
    - 预构建的行业特定架构


技术栈

  前端         React 18、TypeScript、Three.js / React Three Fiber、
               Zustand（状态管理）、Tailwind CSS、Vite

  后端         Express.js、TypeScript、Passport.js（认证）、Socket.IO（实时通信）

  数据库       MongoDB（文档存储）、Neo4j（图数据库/依赖关系）、
               Redis（会话/缓存）、MinIO（文件存储）

  单体仓库     npm workspaces + Turborepo
               packages/shared  - 共享类型、常量、接口
               packages/server  - Express API、模型、路由、WebSocket
               packages/client  - React SPA 与3D可视化

  部署         Docker 多阶段构建、Caddy 反向代理（自动HTTPS）


认证与安全

  - JWT 访问令牌 + 刷新令牌，自动轮换
  - 多因素认证（TOTP）
  - OAuth 2.0：Google、GitHub、Microsoft
  - 基于角色的访问控制（RBAC），包含7个角色：
    首席架构师、企业架构师、解决方案架构师、领域架构师、
    业务分析师、开发人员、查看者
  - 权限层级体系，支持项目级访问控制
  - API密钥采用SHA-256哈希（仅创建时显示一次）
  - 完整的审计日志，记录IP和用户代理
  - 基于Redis的会话管理


快速开始

  前置条件：
    - Node.js >= 22
    - MongoDB、Neo4j、Redis（或使用Docker）
    - OpenAI 或 Anthropic API密钥（用于AI功能）

  1. 克隆仓库
     git clone https://github.com/MaCeeeee/TheArchitect.git
     cd TheArchitect

  2. 安装依赖
     npm install

  3. 配置环境变量
     cp .env.example .env
     # 编辑 .env 文件，填入数据库URI和API密钥

  4. 启动开发模式
     npm run dev

  5. 打开 http://localhost:5173


构建与部署

  构建所有包：
    npm run build

  Docker（生产环境）：
    docker compose -f docker-compose.prod.yml up -d --build

  Docker环境包含：应用服务、MongoDB、Neo4j、Redis、MinIO、Caddy


项目结构

  TheArchitect/
  |-- packages/
  |   |-- shared/          共享类型、常量、接口
  |   |-- server/          Express API 后端
  |   |   |-- src/
  |   |   |   |-- config/        数据库连接配置
  |   |   |   |-- middleware/    认证、RBAC、审计、限流
  |   |   |   |-- models/       Mongoose 数据模型
  |   |   |   |-- routes/       API 端点
  |   |   |   |-- services/     业务逻辑、AI、文档解析
  |   |-- client/          React 前端
  |   |   |-- src/
  |   |   |   |-- components/
  |   |   |   |   |-- 3d/           Three.js 场景、节点、连接
  |   |   |   |   |-- blueprint/    蓝图生成器向导
  |   |   |   |   |-- analytics/    路线图、成本分析
  |   |   |   |   |-- compliance/   标准管道、合规矩阵
  |   |   |   |   |-- copilot/      AI 助手
  |   |   |   |   |-- governance/   策略管理
  |   |   |   |   |-- simulation/   Mirofish 随机引擎
  |   |   |   |   |-- dashboard/    总览、指标
  |   |   |   |   |-- settings/     用户、项目、管理员设置
  |   |   |   |   |-- security/     认证、MFA、会话
  |   |   |   |-- stores/       Zustand 状态管理
  |   |   |   |-- services/     API 客户端
  |-- Dockerfile
  |-- docker-compose.prod.yml


ArchiMate 3.2 合规性

  8个层级，60种元素类型：

  动机层       stakeholder（干系人）、driver（驱动力）、assessment（评估）、
               goal（目标）、outcome（成果）、principle（原则）、
               requirement（需求）、constraint（约束）、meaning（含义）、
               value（价值）
  战略层       business_capability（业务能力）、value_stream（价值流）、
               resource（资源）、course_of_action（行动方案）
  业务层       business_actor（业务参与者）、business_role（业务角色）、
               process（流程）、function（功能）、service（服务）、
               business_object（业务对象）、contract（合同）、
               product（产品）、representation（表示）、event（事件）、
               interaction（交互）、collaboration（协作）
  数据层       data_object（数据对象）
  应用层       application_component（应用组件）、application_service（应用服务）、
               application_function（应用功能）、application_interaction（应用交互）、
               application_collaboration（应用协作）、application_interface（应用接口）、
               application_event（应用事件）、application_process（应用流程）
  技术层       node（节点）、device（设备）、system_software（系统软件）、
               technology_service（技术服务）、technology_function（技术功能）、
               technology_interface（技术接口）、technology_interaction（技术交互）、
               technology_collaboration（技术协作）、technology_event（技术事件）、
               technology_process（技术流程）、artifact（制品）、
               communication_network（通信网络）、path（路径）
  物理层       equipment（设备）、facility（设施）、
               distribution_network（分销网络）、material（材料）
  实施迁移层   work_package（工作包）、deliverable（交付物）、
               plateau（高原）、gap（差距）、implementation_event（实施事件）

  11种连接类型：
    composition（组合）、aggregation（聚合）、assignment（分配）、
    realization（实现）、serving（服务）、access（访问）、
    influence（影响）、triggering（触发）、flow（流）、
    specialization（特化）、association（关联）


许可证

  私有仓库，保留所有权利。


================================================================================
  基于 Three.js、React、Neo4j 构建，倾注大量心血。
================================================================================
