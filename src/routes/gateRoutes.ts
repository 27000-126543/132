import { Router, Request, Response, NextFunction } from 'express';
import {
  assignGate,
  changeGate,
  getFlightGateInfo,
  getGateSchedule,
  getAllGates,
  getGateUsageStats,
  getNearbyGates,
} from '../services/gateService';
import { authenticate } from '../middleware/auth';
import dayjs from 'dayjs';
import { GateType } from '@prisma/client';

const router = Router();

router.post('/assign/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { gateId } = req.body;
    const result = await assignGate(
      parseInt(req.params.flightId),
      gateId ? parseInt(gateId) : undefined
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/change/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { newGateId, reason } = req.body;

    if (!newGateId || !reason) {
      return res.status(400).json({
        success: false,
        message: '请提供新登机口ID和变更原因',
      });
    }

    const result = await changeGate(
      parseInt(req.params.flightId),
      parseInt(newGateId),
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

router.get('/flight/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await getFlightGateInfo(parseInt(req.params.flightId));
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/schedule/:gateId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { date } = req.query;
    const result = await getGateSchedule(
      parseInt(req.params.gateId),
      date ? dayjs(date as string).toDate() : new Date()
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { terminal, type } = req.query;
    const result = await getAllGates(
      terminal as string,
      type as GateType
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stats/usage', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '请提供开始日期和结束日期',
      });
    }

    const result = await getGateUsageStats(
      dayjs(startDate as string).toDate(),
      dayjs(endDate as string).toDate()
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/nearby/:gateId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { count } = req.query;
    const result = await getNearbyGates(
      parseInt(req.params.gateId),
      count ? parseInt(count as string) : 5
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
