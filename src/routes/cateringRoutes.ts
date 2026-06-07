import { Router, Request, Response, NextFunction } from 'express';
import {
  createCateringOrder,
  recordTemperature,
  reassignCateringVehicle,
  updateDeliveryStatus,
  getCateringOrderDetails,
  getVehicleStatus,
  getActiveOrders,
  monitorTemperatures,
} from '../services/cateringService';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/order', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await createCateringOrder(req.body);
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/temperature', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { vehicleId, temperature, orderId } = req.body;

    if (!vehicleId || temperature === undefined) {
      return res.status(400).json({
        success: false,
        message: '请提供车辆ID和温度读数',
      });
    }

    const result = await recordTemperature(
      parseInt(vehicleId),
      parseFloat(temperature),
      orderId ? parseInt(orderId) : undefined
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/reassign/:orderId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await reassignCateringVehicle(parseInt(req.params.orderId));
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/status/:orderId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { checkpoint, status, notes } = req.body;

    if (!checkpoint || !status) {
      return res.status(400).json({
        success: false,
        message: '请提供检查点和状态',
      });
    }

    const result = await updateDeliveryStatus(
      parseInt(req.params.orderId),
      checkpoint,
      status,
      notes
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/order/:orderId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await getCateringOrderDetails(parseInt(req.params.orderId));
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/vehicle/:vehicleId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await getVehicleStatus(parseInt(req.params.vehicleId));
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/orders/active', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { page, pageSize } = req.query;
    const result = await getActiveOrders(
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

router.post('/monitor-temperatures', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await monitorTemperatures();
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
