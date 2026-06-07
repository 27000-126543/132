import { Router, Request, Response, NextFunction } from 'express';
import {
  createBaggageItem,
  scanBaggage,
  getFlightBaggageStatus,
  getBaggageProgress,
  getBaggageByTag,
  getBaggageSlots,
  markBaggageLost,
  monitorBaggageDelays,
  assignBaggageSlot,
} from '../services/baggageService';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/item', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await createBaggageItem(req.body);
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/scan', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { bagTagNumber, scanPoint, location, scanResult } = req.body;

    if (!bagTagNumber || !scanPoint || !location) {
      return res.status(400).json({
        success: false,
        message: '请提供行李标签号、扫描点和位置',
      });
    }

    const result = await scanBaggage(bagTagNumber, scanPoint, location, scanResult);
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
    const result = await getFlightBaggageStatus(parseInt(req.params.flightId));
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/progress/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await getBaggageProgress(parseInt(req.params.flightId));
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/tag/:bagTagNumber', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await getBaggageByTag(req.params.bagTagNumber);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/slots', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { terminal } = req.query;
    const result = await getBaggageSlots(terminal as string);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/slot/assign/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await assignBaggageSlot(parseInt(req.params.flightId));
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/mark-lost', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { bagTagNumber, reason } = req.body;
    if (!bagTagNumber || !reason) {
      return res.status(400).json({
        success: false,
        message: '请提供行李标签号和丢失原因',
      });
    }

    const result = await markBaggageLost(bagTagNumber, reason);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/monitor-delays', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await monitorBaggageDelays();
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
