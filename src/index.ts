import express, { Express, Request, Response, NextFunction } from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import { config } from './config';
import { errorHandler, AppError } from './middleware/errorHandler';
import { initWebSocket } from './services/notificationService';
import { initScheduler } from './services/schedulerService';
import routes from './routes';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.tz.setDefault('Asia/Shanghai');

const app: Express = express();
const server = http.createServer(app);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(morgan('combined', {
  skip: (req) => req.path === '/health',
}));

app.use((req: Request, res: Response, next: NextFunction) => {
  (req as any).requestTime = new Date();
  res.setHeader('X-Powered-By', 'Airport Hub Scheduling System');
  next();
});

app.use('/api', routes);

app.get('/', (req: Request, res: Response) => {
  res.json({
    name: '航空枢纽地面服务与航班保障调度系统',
    version: process.env.npm_package_version || '1.0.0',
    description: '大型航空枢纽地面服务与航班保障调度系统后端API',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth/*',
      flights: '/api/flights/*',
      stands: '/api/stands/*',
      baggage: '/api/baggage/*',
      gates: '/api/gates/*',
      catering: '/api/catering/*',
      crew: '/api/crew/*',
      resources: '/api/resources/*',
      reports: '/api/reports/*',
      notifications: '/api/notifications/*',
    },
    websocket: `ws://localhost:${config.wsPort}`,
    timezone: dayjs.tz.guess(),
    serverTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
  });
});

app.all('*', (req: Request, res: Response, next: NextFunction) => {
  if (req.path.startsWith('/api/')) {
    next();
  } else {
    throw new AppError(`路径不存在: ${req.method} ${req.originalUrl}`, 404);
  }
});

app.use(errorHandler);

const PORT = config.port;
const WS_PORT = config.wsPort;

const startServer = async () => {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('🚀 航空枢纽地面服务与航班保障调度系统 - 服务启动中...');
    console.log('='.repeat(80) + '\n');

    initWebSocket(server);

    initScheduler();

    server.listen(PORT, () => {
      console.log(`\n✅ HTTP 服务已启动`);
      console.log(`   - 服务地址: http://localhost:${PORT}`);
      console.log(`   - API 根路径: http://localhost:${PORT}/api`);
      console.log(`   - 健康检查: http://localhost:${PORT}/api/health`);
      console.log(`   - WebSocket: ws://localhost:${WS_PORT}`);
      console.log(`   - 时区: ${dayjs.tz.guess()}`);
      console.log(`   - 启动时间: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n`);

      console.log('📋 系统阈值配置:');
      console.log(`   - 行李延误预警阈值: ${config.baggageDelayThreshold} 分钟`);
      console.log(`   - 步行时间摆渡车阈值: ${config.walkingTimeThreshold} 分钟`);
      console.log(`   - 机组最小休息时间: ${config.minCrewRestHours} 小时`);
      console.log(`   - 餐车温度范围: ${config.cateringMinTemp}°C ~ ${config.cateringMaxTemp}°C`);
      console.log(`   - JWT 过期时间: ${config.jwtExpiresIn}\n`);

      console.log('🔔 实时消息推送系统就绪，支持向以下目标推送:');
      console.log(`   - 地服人员 (GROUND_SERVICE)`);
      console.log(`   - 塔台管制 (TOWER)`);
      console.log(`   - 航司运控中心 (AIRLINE_OPS)\n`);

      console.log('='.repeat(80));
      console.log('✨ 系统启动完成，等待请求...');
      console.log('='.repeat(80) + '\n');
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 收到 SIGTERM 信号，正在优雅关闭服务...');
      server.close(() => {
        console.log('✅ 服务已关闭');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\n🛑 收到 SIGINT 信号，正在优雅关闭服务...');
      server.close(() => {
        console.log('✅ 服务已关闭');
        process.exit(0);
      });
    });

    process.on('unhandledRejection', (reason: Error, promise: Promise<any>) => {
      console.error('❌ 未处理的 Promise 拒绝:', reason);
      console.error('   Promise:', promise);
    });

    process.on('uncaughtException', (error: Error) => {
      console.error('❌ 未捕获的异常:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ 服务启动失败:', error);
    process.exit(1);
  }
};

startServer();

export default app;
