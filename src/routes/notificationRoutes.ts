import { Router, Request, Response, NextFunction } from 'express';
import {
  broadcastMessage,
  createNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  notifyStandChange,
  notifyGateChange,
  notifyDelay,
} from '../services/notificationService';
import { authenticate, AuthRequest } from '../middleware/auth';
import { NotificationType, RecipientType } from '@prisma/client';

const router = Router();

router.post('/send', authenticate, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { type, title, content, recipientTypes, flightId, metadata } = req.body;

    if (!type || !title || !content || !recipientTypes) {
      return res.status(400).json({
        success: false,
        message: '请提供通知类型、标题、内容和接收人类型',
      });
    }

    const result = await createNotification(
      type as NotificationType,
      title,
      content,
      recipientTypes as RecipientType[],
      flightId ? parseInt(flightId) : undefined,
      metadata
    );

    broadcastMessage({
      type: type as NotificationType,
      flightId: flightId ? parseInt(flightId) : undefined,
      title,
      content,
      timestamp: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticate, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { read, type, page, pageSize } = req.query;
    const result = await getNotifications(
      req.user!.id,
      req.user!.role,
      req.user!.department,
      read === 'true' ? true : read === 'false' ? false : undefined,
      type as NotificationType,
      parseInt(page as string) || 1,
      parseInt(pageSize as string) || 20
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/unread-count', authenticate, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await getUnreadCount(
      req.user!.id,
      req.user!.role,
      req.user!.department
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/read/:notificationId', authenticate, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await markAsRead(
      parseInt(req.params.notificationId),
      req.user!.id
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/read-all', authenticate, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await markAllAsRead(
      req.user!.id,
      req.user!.role,
      req.user!.department
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/notify-stand-change/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { oldStandId, newStandId, reason } = req.body;

    if (!oldStandId || !newStandId || !reason) {
      return res.status(400).json({
        success: false,
        message: '请提供原机位ID、新机位ID和变更原因',
      });
    }

    const result = await notifyStandChange(
      parseInt(req.params.flightId),
      parseInt(oldStandId),
      parseInt(newStandId),
      reason
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/notify-gate-change/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { oldGateId, newGateId, reason, walkingTimeMinutes, shuttleRequired } = req.body;

    if (!oldGateId || !newGateId || !reason) {
      return res.status(400).json({
        success: false,
        message: '请提供原登机口ID、新登机口ID和变更原因',
      });
    }

    const result = await notifyGateChange(
      parseInt(req.params.flightId),
      parseInt(oldGateId),
      parseInt(newGateId),
      reason,
      walkingTimeMinutes ? parseInt(walkingTimeMinutes) : undefined,
      shuttleRequired === 'true'
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/notify-delay/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { delayMinutes, reason, estimatedDeparture, resourceActions } = req.body;

    if (!delayMinutes || !reason) {
      return res.status(400).json({
        success: false,
        message: '请提供延误分钟数和延误原因',
      });
    }

    const result = await notifyDelay(
      parseInt(req.params.flightId),
      parseInt(delayMinutes),
      reason,
      estimatedDeparture,
      resourceActions
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
