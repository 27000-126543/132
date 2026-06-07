import { Router } from 'express';
import authRoutes from './authRoutes';
import flightRoutes from './flightRoutes';
import standRoutes from './standRoutes';
import baggageRoutes from './baggageRoutes';
import gateRoutes from './gateRoutes';
import cateringRoutes from './cateringRoutes';
import crewRoutes from './crewRoutes';
import resourceRoutes from './resourceRoutes';
import reportRoutes from './reportRoutes';
import notificationRoutes from './notificationRoutes';

const router = Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: '航空枢纽地面服务与航班保障调度系统 API 运行正常',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
  });
});

router.use('/auth', authRoutes);
router.use('/flights', flightRoutes);
router.use('/stands', standRoutes);
router.use('/baggage', baggageRoutes);
router.use('/gates', gateRoutes);
router.use('/catering', cateringRoutes);
router.use('/crew', crewRoutes);
router.use('/resources', resourceRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);

router.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API 路径不存在: ${req.method} ${req.originalUrl}`,
  });
});

export default router;
