import { Router, Request, Response, NextFunction } from 'express';
import {
  assignOptimalStand,
  reassignStand,
  getStandAssignments,
  getStandSchedule,
  getStandOccupancyStats,
  checkStandAvailability,
} from '../services/standAssignmentService';
import { authenticate, AuthRequest } from '../middleware/auth';
import dayjs from 'dayjs';

const router = Router();

router.post('/assign/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { flightId } = req.params;
    const { preferredBridgeType } = req.body;

    const result = await assignOptimalStand(
      parseInt(flightId),
      preferredBridgeType
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reassign/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { flightId } = req.params;
    const { reason, preferredBridgeType } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: '请提供重新分配原因',
      });
    }

    const result = await reassignStand(
      parseInt(flightId),
      reason,
      preferredBridgeType
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/assignments', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { date, terminal, page, pageSize } = req.query;

    const result = await getStandAssignments(
      date ? dayjs(date as string).toDate() : undefined,
      terminal as string,
      parseInt(page as string) || 1,
      parseInt(pageSize as string) || 50
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/schedule/:standId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { standId } = req.params;
    const { date } = req.query;

    const result = await getStandSchedule(
      parseInt(standId),
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

router.get('/stats/occupancy', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { date } = req.query;

    const result = await getStandOccupancyStats(
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

router.get('/check-availability/:standId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { standId } = req.params;
    const { startTime, endTime, excludeFlightId } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: '请提供开始时间和结束时间',
      });
    }

    const result = await checkStandAvailability(
      parseInt(standId),
      dayjs(startTime as string).toDate(),
      dayjs(endTime as string).toDate(),
      excludeFlightId ? parseInt(excludeFlightId as string) : undefined
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
