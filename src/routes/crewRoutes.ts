import { Router, Request, Response, NextFunction } from 'express';
import {
  generateCrewSchedule,
  getCrewSchedule,
  addRestPeriod,
  getAllCrew,
  checkCrewAvailability,
  reportFlightDelay,
} from '../services/crewService';
import { authenticate, AuthRequest, requireRole } from '../middleware/auth';
import dayjs from 'dayjs';
import { CrewRole, DelayReason } from '@prisma/client';

const router = Router();

router.post('/schedule/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await generateCrewSchedule(parseInt(req.params.flightId));
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:crewId/schedule', authenticate, async (
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

    const result = await getCrewSchedule(
      parseInt(req.params.crewId),
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

router.post('/rest-period/:crewId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startTime, endTime, reason } = req.body;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: '请提供开始时间和结束时间',
      });
    }

    const result = await addRestPeriod(
      parseInt(req.params.crewId),
      dayjs(startTime).toDate(),
      dayjs(endTime).toDate(),
      reason
    );

    res.status(201).json({
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
    const { role, availableOnly } = req.query;
    const result = await getAllCrew(
      role as CrewRole,
      availableOnly === 'true'
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/check-availability/:crewId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startTime, endTime, flightId } = req.query;

    if (!startTime || !endTime) {
      return res.status(400).json({
        success: false,
        message: '请提供开始时间和结束时间',
      });
    }

    const result = await checkCrewAvailability(
      parseInt(req.params.crewId),
      dayjs(startTime as string).toDate(),
      dayjs(endTime as string).toDate(),
      flightId ? parseInt(flightId as string) : undefined
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/report-delay/:flightId', authenticate, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { delayMinutes, reason } = req.body;

    if (!delayMinutes || !reason) {
      return res.status(400).json({
        success: false,
        message: '请提供延误分钟数和延误原因',
      });
    }

    const result = await reportFlightDelay(
      parseInt(req.params.flightId),
      parseInt(delayMinutes),
      reason as DelayReason
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
