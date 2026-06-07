import { Router, Request, Response, NextFunction } from 'express';
import {
  generateResourcePlan,
  createResourceRequest,
  approveResourceRequest,
  rejectResourceRequest,
  executeResourceAllocation,
  getResourceRequests,
  getResourceRequestDetails,
  getResourceAvailability,
} from '../services/resourceAllocationService';
import { authenticate, AuthRequest, requireRole, requireDepartment } from '../middleware/auth';
import dayjs from 'dayjs';
import { DelayReason, ResourceType, Department } from '@prisma/client';

const router = Router();

router.post('/plan/:flightId', authenticate, async (
  req: Request,
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

    const result = await generateResourcePlan(
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

router.post('/request', authenticate, async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { resourceType, quantity, priority, justification } = req.body;

    if (!resourceType || !quantity || !justification) {
      return res.status(400).json({
        success: false,
        message: '请提供资源类型、数量和理由',
      });
    }

    const result = await createResourceRequest(
      req.user!.id,
      resourceType as ResourceType,
      parseInt(quantity),
      priority || 'NORMAL',
      justification,
      req.body.flightId ? parseInt(req.body.flightId) : undefined
    );

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/approve/:requestId', authenticate, requireRole('SUPERVISOR'), async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { notes } = req.body;
    const result = await approveResourceRequest(
      parseInt(req.params.requestId),
      req.user!.id,
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

router.post('/reject/:requestId', authenticate, requireRole('SUPERVISOR'), async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const { rejectionReason } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        message: '请提供拒绝原因',
      });
    }

    const result = await rejectResourceRequest(
      parseInt(req.params.requestId),
      req.user!.id,
      rejectionReason
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/execute/:requestId', authenticate, requireDepartment(Department.OPERATIONS), async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await executeResourceAllocation(
      parseInt(req.params.requestId),
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

router.get('/requests', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { status, type, startDate, endDate, page, pageSize } = req.query;

    const result = await getResourceRequests(
      status as string,
      type as ResourceType,
      startDate ? dayjs(startDate as string).toDate() : undefined,
      endDate ? dayjs(endDate as string).toDate() : undefined,
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

router.get('/request/:requestId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await getResourceRequestDetails(parseInt(req.params.requestId));
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/availability', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { type, date } = req.query;
    const result = await getResourceAvailability(
      type as ResourceType,
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

export default router;
