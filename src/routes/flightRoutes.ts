import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import dayjs from 'dayjs';
import { FlightStatus } from '@prisma/client';
import { generateResourcePlan } from '../services/resourceAllocationService';
import { generateCrewSchedule } from '../services/crewService';
import { assignOptimalStand } from '../services/standAssignmentService';
import { assignBaggageSlot } from '../services/baggageService';
import { createCateringOrder } from '../services/cateringService';
import { assignGate } from '../services/gateService';

const router = Router();

router.post('/', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await prisma.flight.create({
      data: {
        ...req.body,
        scheduledArrival: req.body.scheduledArrival ? new Date(req.body.scheduledArrival) : undefined,
        scheduledDeparture: req.body.scheduledDeparture ? new Date(req.body.scheduledDeparture) : undefined,
      },
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:flightId/auto-allocate', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const flightId = parseInt(req.params.flightId);
    const { passengerCount, mealCount } = req.body;

    const results: any = {};

    try {
      results.stand = await assignOptimalStand(flightId);
    } catch (e) {
      results.stand = { error: (e as Error).message };
    }

    try {
      results.gate = await assignGate(flightId);
    } catch (e) {
      results.gate = { error: (e as Error).message };
    }

    try {
      results.baggageSlot = await assignBaggageSlot(flightId);
    } catch (e) {
      results.baggageSlot = { error: (e as Error).message };
    }

    try {
      results.crew = await generateCrewSchedule(flightId);
    } catch (e) {
      results.crew = { error: (e as Error).message };
    }

    if (mealCount || passengerCount) {
      try {
        results.catering = await createCateringOrder({
          flightId,
          passengerCount: passengerCount || 0,
          mealCount: mealCount || 0,
          specialRequirements: req.body.specialRequirements,
        });
      } catch (e) {
        results.catering = { error: (e as Error).message };
      }
    }

    res.status(200).json({
      success: true,
      data: results,
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
    const { date, airline, status, direction, page, pageSize } = req.query;

    const where: any = {};

    if (date) {
      const dateStart = dayjs(date as string).startOf('day').toDate();
      const dateEnd = dayjs(date as string).endOf('day').toDate();
      where.scheduledDeparture = {
        gte: dateStart,
        lte: dateEnd,
      };
    }

    if (airline) {
      where.airline = airline as string;
    }

    if (status) {
      where.status = status as FlightStatus;
    }

    if (direction) {
      where.direction = direction as any;
    }

    const skip = (parseInt(page as string) || 1 - 1) * (parseInt(pageSize as string) || 50);
    const take = parseInt(pageSize as string) || 50;

    const [flights, total] = await Promise.all([
      prisma.flight.findMany({
        where,
        include: {
          stand: true,
          gate: true,
          crewAssignments: {
            include: {
              crewMember: true,
            },
          },
          baggageItems: {
            take: 5,
          },
        },
        skip,
        take,
        orderBy: { scheduledDeparture: 'asc' },
      }),
      prisma.flight.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        items: flights,
        total,
        page: parseInt(page as string) || 1,
        pageSize: take,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const flight = await prisma.flight.findUnique({
      where: { id: parseInt(req.params.flightId) },
      include: {
        stand: true,
        gate: true,
        crewAssignments: {
          include: {
            crewMember: true,
          },
        },
        baggageSlot: true,
        cateringOrders: true,
        resourceRequests: true,
        notifications: true,
      },
    });

    if (!flight) {
      return res.status(404).json({
        success: false,
        message: '航班不存在',
      });
    }

    res.status(200).json({
      success: true,
      data: flight,
    });
  } catch (error) {
    next(error);
  }
});

router.put('/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await prisma.flight.update({
      where: { id: parseInt(req.params.flightId) },
      data: {
        ...req.body,
        scheduledArrival: req.body.scheduledArrival ? new Date(req.body.scheduledArrival) : undefined,
        scheduledDeparture: req.body.scheduledDeparture ? new Date(req.body.scheduledDeparture) : undefined,
        actualArrival: req.body.actualArrival ? new Date(req.body.actualArrival) : undefined,
        actualDeparture: req.body.actualDeparture ? new Date(req.body.actualDeparture) : undefined,
      },
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.post('/:flightId/report-delay', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { delayMinutes, reason } = req.body;
    const flightId = parseInt(req.params.flightId);

    if (!delayMinutes || !reason) {
      return res.status(400).json({
        success: false,
        message: '请提供延误分钟数和延误原因',
      });
    }

    const flight = await prisma.flight.findUnique({
      where: { id: flightId },
    });

    if (!flight) {
      return res.status(404).json({
        success: false,
        message: '航班不存在',
      });
    }

    const newDeparture = dayjs(flight.scheduledDeparture)
      .add(parseInt(delayMinutes), 'minute')
      .toDate();

    const updatedFlight = await prisma.flight.update({
      where: { id: flightId },
      data: {
        delayMinutes: parseInt(delayMinutes),
        delayReason: reason,
        estimatedDeparture: newDeparture,
        status: 'DELAYED',
      },
    });

    const resourcePlan = await generateResourcePlan(
      flightId,
      parseInt(delayMinutes),
      reason
    );

    res.status(200).json({
      success: true,
      data: {
        flight: updatedFlight,
        resourcePlan,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:flightId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    await prisma.flight.delete({
      where: { id: parseInt(req.params.flightId) },
    });

    res.status(200).json({
      success: true,
      message: '航班已删除',
    });
  } catch (error) {
    next(error);
  }
});

export default router;
