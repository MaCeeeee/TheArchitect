import { useEffect, useRef } from 'react';

// ─── TheArchitect Documentation in Chinese ───────────────
const DOC_TEXT = [
  // Product overview
  '建筑师是一个人工智能原生的企业架构管理平台',
  '三维可视化引擎使用React Three Fiber和WebGPU渲染',
  '支持TOGAF第十版和ArchiMate三点二规范',
  '贝叶斯风险级联传播引擎自动计算跨层风险',
  '蒙特卡洛模拟使用Beta-PERT分布进行成本估算',
  // MiroFish
  '鱼群智能引擎是多代理模拟的核心组件',
  '每个代理使用独立的利益相关者角色进行辩论',
  '反幻觉层验证每个代理操作与Neo4j状态',
  '三因子疲劳指数测量并发负载和谈判阻力',
  '涌现追踪检测死锁共识联盟升级和疲劳',
  '首席技术官和首席信息官的角色模拟战略决策',
  '业务部门代理评估运营影响和预算约束',
  // AI Advisor
  '人工智能架构顾问包含十四个检测器',
  '健康评分综合风险合规性和成熟度指标',
  '主动洞察引擎扫描架构发现潜在问题',
  '差距修复引擎生成具体的修复建议',
  // Roadmap
  '转型路线图生成器创建基于波次的迁移计划',
  '三层成本模型分析基础设施应用和业务层',
  'P10 P50 P90置信区间替代传统点估算',
  '每个波次包含优先级排序的架构元素',
  // 3D Visualization
  '三维架构视图使用层平面和元素网格渲染',
  '飞行导航允许快速定位到任意架构元素',
  'WebSocket实时协作支持多个架构师同时工作',
  '连接光束显示元素之间的ArchiMate关系',
  '跨工作区连接使用金色虚线和更高的弧度',
  // Governance
  '基于角色的访问控制管理项目和元素权限',
  '审计日志记录所有变更包括用户IP和时间戳',
  '合规评估服务检查架构是否符合策略规则',
  '风险分析服务使用柯尔莫哥洛夫-斯米尔诺夫漂移检测',
  // Import & Standards
  '支持从BPMN二点零工作流导入架构数据',
  '支持n8n工作流解析和CSV批量导入',
  'ArchiMate三点二标准定义五十三种元素类型',
  '策略层包含能力价值流和行动方案',
  '业务层定义流程服务参与者和角色',
  '应用层描述组件服务和数据交互',
  '技术层涵盖基础设施平台和网络',
  // Security
  'JWT访问令牌和刷新令牌机制保护API',
  '多因素认证使用TOTP一次性密码',
  'OAuth集成支持Google GitHub和Microsoft',
  '密码要求至少八个字符包含大小写数字和特殊字符',
  '会话管理使用Redis存储和过期控制',
  // Deployment
  'Docker多阶段构建优化生产镜像大小',
  '支持客户基础设施上的本地Docker部署',
  'Caddy反向代理处理TLS证书终止',
  '内部Docker网络隔离容器间通信',
  // Workspace
  '工作区按导入源分组架构元素',
  '每个工作区使用独立的三维偏移定位',
  '工作区栏支持标签切换重命名和删除',
  '小地图显示工作区矩形支持点击导航',
  // Simulation details
  '模拟配置包括场景类型描述和最大轮数',
  '运行视图显示进度实时疲劳仪表和流式文本',
  '结果视图包含疲劳记分卡交通灯和预算风险',
  '每个代理的疲劳条显示三因子分解',
  '每个元素的瓶颈列表标识关键约束',
  '涌现指标卡片可视化系统级行为模式',
  '历史视图列出过去的运行和疲劳评级',
  // Compliance
  '标准管理器支持ISO ASPICE TOGAF和自定义标准',
  'PDF解析器提取章节结构和要求',
  '合规矩阵映射标准要求到架构元素',
  '评级量表包括合规部分覆盖差距和不适用',
  '人工智能建议自动生成映射推荐',
  // Philosophy
  '企业架构不应该是象牙塔里的理论练习',
  '架构分析必须到达决策层才能产生价值',
  '人工智能原生意味着AI是核心而不是插件',
  '自动化优先原则尽可能自动化分析和推荐',
  '单一事实来源每个组织一个权威架构库',
  '浏览器交付无需桌面安装即可运行',
].join('');

// ─── Matrix Rain Component ──────────────────────────────
export default function MatrixRain({
  opacity = 0.06,
  speed = 1,
  density = 0.92,
}: {
  opacity?: number;
  speed?: number;
  density?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    // Respect reduced motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let columns: number[] = [];
    let charIndex: number[] = [];
    const fontSize = 16;
    const chars = DOC_TEXT;

    function resize() {
      if (!canvas || !ctx) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.offsetWidth * dpr;
      canvas.height = canvas.offsetHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const colCount = Math.floor(canvas.offsetWidth / fontSize);
      columns = Array.from({ length: colCount }, () =>
        Math.random() * -canvas.offsetHeight / fontSize
      );
      charIndex = Array.from({ length: colCount }, () =>
        Math.floor(Math.random() * chars.length)
      );
    }

    resize();
    window.addEventListener('resize', resize);

    let frameCount = 0;

    function draw() {
      if (!ctx || !canvas) return;
      frameCount++;

      // Skip every other frame on mobile for performance
      if (window.innerWidth < 768 && frameCount % 2 !== 0) {
        animationId = requestAnimationFrame(draw);
        return;
      }

      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;

      // Fade trail
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < columns.length; i++) {
        const y = columns[i] * fontSize;
        const ci = charIndex[i] % chars.length;
        const char = chars[ci];

        // Head character (brighter)
        ctx.fillStyle = `rgba(0, 255, 65, ${Math.min(0.9, 0.4 + Math.random() * 0.5)})`;
        ctx.fillText(char, i * fontSize, y);

        // Trail character (dimmer)
        if (columns[i] > 1) {
          const prevChar = chars[(ci - 1 + chars.length) % chars.length];
          ctx.fillStyle = 'rgba(0, 255, 65, 0.15)';
          ctx.fillText(prevChar, i * fontSize, y - fontSize);
        }

        // Move column down
        columns[i] += speed * (0.5 + Math.random() * 0.5);
        charIndex[i]++;

        // Reset when off screen
        if (y > h && Math.random() > density) {
          columns[i] = 0;
          charIndex[i] = Math.floor(Math.random() * chars.length);
        }
      }

      animationId = requestAnimationFrame(draw);
    }

    animationId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', resize);
    };
  }, [speed, density]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity }}
    />
  );
}
