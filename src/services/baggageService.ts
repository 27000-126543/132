import { BaggageStatus, BaggageItem, Flight } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { notifyBaggageAlert } from './notificationService';
import { config } from '../config';
import dayjs from 'dayjs';

interface SlotAssignmentResult {
  slotId: number;
  slotCode: string;
  carouselNumber: number;
  terminal: string;
  assignedAt: Date;
}

export const assignBaggageSlot = async (
  flightId: number
): Promise<SlotAssignmentResult> => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      airline: true,
      baggageItems: {
        where: { status: { not: BaggageStatus.DELIVERED } },
      },
    },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  const expectedArrival = dayjs(flight.scheduledArrival);
  const slotStartTime = expectedArrival.add(10, 'minute').toDate();
  const slotEndTime = expectedArrival.add(60, 'minute').toDate();

  const availableSlots = await prisma.baggageSlot.findMany({
    where: {
      isActive: true,
      terminal: flight.isInternational ? 'T2' : 'T1',
    },
    include: {
      baggageItems: {
        where: {
          status: { in: [BaggageStatus.WAITING, BaggageStatus.IN_TRANSIT, BaggageStatus.ARRIVED] },
          expectedTime: {
            gte: dayjs().subtract(2, 'hour').toDate(),
          },
        },
      },
    },
  });

  const occupiedSlotIds = new Set<number>();

  for (const slot of availableSlots) {
    if (slot.currentFlightId && slot.currentFlightId !== flightId) {
      const currentFlight = await prisma.flight.findUnique({
        where: { id: slot.currentFlightId },
        select: { scheduledArrival: true, actualArrival: true },
      });

      if (currentFlight) {
        const currentSlotEnd = dayjs(currentFlight.actualArrival || currentFlight.scheduledArrival).add(60, 'minute');
        if (currentSlotEnd.isAfter(slotStartTime)) {
          occupiedSlotIds.add(slot.id);
        }
      }
    }
  }

  const freeSlots = availableSlots.filter(slot => !occupiedSlotIds.has(slot.id));

  if (freeSlots.length === 0) {
    const minOccupied = availableSlots.reduce((min, slot) => {
      return slot.baggageItems.length < min.baggageItems.length ? slot : min;
    }, availableSlots[0]);

    return {
      slotId: minOccupied.id,
      slotCode: minOccupied.code,
      carouselNumber: minOccupied.carouselNumber,
      terminal: minOccupied.terminal,
      assignedAt: new Date(),
    };
  }

  const optimalSlot = freeSlots.reduce((best, slot) => {
    return slot.baggageItems.length <= best.baggageItems.length ? slot : best;
  }, freeSlots[0]);

  await prisma.baggageSlot.update({
    where: { id: optimalSlot.id },
    data: {
      currentFlightId: flightId,
      flightAssignedAt: new Date(),
    },
  });

  return {
    slotId: optimalSlot.id,
    slotCode: optimalSlot.code,
    carouselNumber: optimalSlot.carouselNumber,
    terminal: optimalSlot.terminal,
    assignedAt: new Date(),
  };
};

export const createBaggageItem = async (data: {
  flightId: number;
  bagTagNumber: string;
  passengerName: string;
  origin: string;
  destination: string;
  isTransfer?: boolean;
  transferFlightId?: number;
}) => {
  const existing = await prisma.baggageItem.findUnique({
    where: { bagTagNumber: data.bagTagNumber },
  });

  if (existing) {
    throw new AppError('行李标签号已存在', 400);
  }

  const flight = await prisma.flight.findUnique({
    where: { id: data.flightId },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  const expectedTime = dayjs(flight.scheduledArrival).add(20, 'minute').toDate();

  const slotAssignment = await assignBaggageSlot(data.flightId);

  const baggage = await prisma.baggageItem.create({
    data: {
      ...data,
      expectedTime,
      slotId: slotAssignment.slotId,
      status: BaggageStatus.WAITING,
    },
    include: {
      slot: true,
      flight: {
        include: { airline: true },
      },
    },
  });

  return {
    baggage,
    slotAssignment,
  };
};

export const scanBaggage = async (
  bagTagNumber: string,
  scanPoint: string,
  location: string,
  scanResult: string = 'NORMAL'
) => {
  const baggage = await prisma.baggageItem.findUnique({
    where: { bagTagNumber },
    include: {
      flight: true,
      slot: true,
    },
  });

  if (!baggage) {
    throw new AppError('行李不存在', 404);
  }

  const scanTime = new Date();

  let newStatus = baggage.status;
  let delayMinutes = baggage.delayMinutes;
  let arrivalScanTime = baggage.arrivalScanTime;

  if (scanPoint === 'BELT_LOADING') {
    newStatus = BaggageStatus.IN_TRANSIT;
  } else if (scanPoint === 'BELT_UNLOADING') {
    newStatus = BaggageStatus.ARRIVED;
    arrivalScanTime = scanTime;

    delayMinutes = Math.max(
      0,
      dayjs(scanTime).diff(dayjs(baggage.expectedTime), 'minute')
    );

    if (delayMinutes > config.baggageDelayThreshold && !baggage.isAlertSent) {
      await notifyBaggageAlert(
        baggage.flightId,
        baggage.flight.flightNumber,
        bagTagNumber,
        delayMinutes
      );

      await prisma.baggageItem.update({
        where: { id: baggage.id },
        data: { isAlertSent: true },
      });

      newStatus = BaggageStatus.DELAYED;
    }
  } else if (scanPoint === 'PASSENGER_PICKUP') {
    newStatus = BaggageStatus.DELIVERED;
  }

  const scan = await prisma.baggageScan.create({
    data: {
      baggageId: baggage.id,
      scanPoint,
      scanTime,
      location,
      scanResult,
    },
  });

  await prisma.baggageItem.update({
    where: { id: baggage.id },
    data: {
      status: newStatus,
      delayMinutes,
      arrivalScanTime,
    },
  });

  return {
    scan,
    baggage: {
      ...baggage,
      status: newStatus,
      delayMinutes,
      arrivalScanTime,
    },
    isDelayed: delayMinutes > config.baggageDelayThreshold,
    alertSent: delayMinutes > config.baggageDelayThreshold && !baggage.isAlertSent,
  };
};

export const getFlightBaggageStatus = async (flightId: number) => {
  const baggageItems = await prisma.baggageItem.findMany({
    where: { flightId },
    include: {
      slot: true,
      scans: {
        orderBy: { scanTime: 'desc' },
        take: 5,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const stats = {
    total: baggageItems.length,
    waiting: baggageItems.filter(b => b.status === BaggageStatus.WAITING).length,
    inTransit: baggageItems.filter(b => b.status === BaggageStatus.IN_TRANSIT).length,
    arrived: baggageItems.filter(b => b.status === BaggageStatus.ARRIVED).length,
    delayed: baggageItems.filter(b => b.status === BaggageStatus.DELAYED).length,
    lost: baggageItems.filter(b => b.status === BaggageStatus.LOST).length,
    delivered: baggageItems.filter(b => b.status === BaggageStatus.DELIVERED).length,
    avgDelayMinutes: baggageItems.length > 0
      ? baggageItems.reduce((sum, b) => sum + b.delayMinutes, 0) / baggageItems.length
      : 0,
  };

  const delayedItems = baggageItems
    .filter(b => b.delayMinutes > config.baggageDelayThreshold)
    .slice(0, 10);

  return {
    flightId,
    stats,
    baggageItems,
    delayedItems,
    slotInfo: baggageItems[0]?.slot || null,
  };
};

export const getBaggageProgress = async (flightId: number) => {
  const result = await getFlightBaggageStatus(flightId);

  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    select: {
      flightNumber: true,
      scheduledArrival: true,
      actualArrival: true,
      status: true,
    },
  });

  const firstScan = await prisma.baggageScan.findFirst({
    where: {
      baggage: { flightId },
      scanPoint: 'BELT_UNLOADING',
    },
    orderBy: { scanTime: 'asc' },
  });

  const lastScan = await prisma.baggageScan.findFirst({
    where: {
      baggage: { flightId },
      scanPoint: 'BELT_UNLOADING',
    },
    orderBy: { scanTime: 'desc' },
  });

  const estimatedCompletion = firstScan
    ? dayjs(firstScan.scanTime).add(40, 'minute').toDate()
    : null;

  const progressPercent = result.stats.total > 0
    ? Math.round(((result.stats.arrived + result.stats.delivered) / result.stats.total) * 100)
    : 0;

  const isBehindSchedule = estimatedCompletion
    ? dayjs().isAfter(dayjs(flight?.scheduledArrival).add(30, 'minute')) && progressPercent < 80
    : false;

  return {
    flight,
    progress: {
      percent: progressPercent,
      totalBags: result.stats.total,
      processed: result.stats.arrived + result.stats.delivered,
      remaining: result.stats.waiting + result.stats.inTransit,
      firstBagTime: firstScan?.scanTime || null,
      lastBagTime: lastScan?.scanTime || null,
      estimatedCompletion,
      isBehindSchedule,
    },
    stats: result.stats,
    alerts: result.delayedItems.map(b => ({
      bagTagNumber: b.bagTagNumber,
      passengerName: b.passengerName,
      delayMinutes: b.delayMinutes,
      status: b.status,
    })),
  };
};

export const monitorBaggageDelays = async () => {
  const thresholdTime = dayjs()
    .subtract(config.baggageDelayThreshold, 'minute')
    .toDate();

  const delayedBaggage = await prisma.baggageItem.findMany({
    where: {
      status: { in: [BaggageStatus.WAITING, BaggageStatus.IN_TRANSIT] },
      expectedTime: { lt: thresholdTime },
      isAlertSent: false,
    },
    include: {
      flight: {
        include: { airline: true },
      },
    },
  });

  const alerts = [];

  for (const baggage of delayedBaggage) {
    const delayMinutes = dayjs().diff(dayjs(baggage.expectedTime), 'minute');

    await notifyBaggageAlert(
      baggage.flightId,
      baggage.flight.flightNumber,
      baggage.bagTagNumber,
      delayMinutes
    );

    await prisma.baggageItem.update({
      where: { id: baggage.id },
      data: {
        isAlertSent: true,
        status: BaggageStatus.DELAYED,
        delayMinutes,
      },
    });

    alerts.push({
      bagTagNumber: baggage.bagTagNumber,
      flightNumber: baggage.flight.flightNumber,
      delayMinutes,
    });
  }

  return {
    checkedAt: new Date(),
    thresholdMinutes: config.baggageDelayThreshold,
    alertsGenerated: alerts.length,
    alerts,
  };
};

export const getBaggageByTag = async (bagTagNumber: string) => {
  const baggage = await prisma.baggageItem.findUnique({
    where: { bagTagNumber },
    include: {
      flight: {
        include: { airline: true, stand: true, gate: true },
      },
      slot: true,
      scans: {
        orderBy: { scanTime: 'asc' },
      },
    },
  });

  if (!baggage) {
    throw new AppError('行李不存在', 404);
  }

  const currentLocation = baggage.scans.length > 0
    ? baggage.scans[baggage.scans.length - 1].location
    : '待分拣';

  return {
    baggage,
    currentLocation,
    estimatedDelivery: baggage.status === BaggageStatus.DELIVERED
      ? baggage.deliveryTime
      : dayjs(baggage.expectedTime).toDate(),
    delayStatus: baggage.delayMinutes > config.baggageDelayThreshold
      ? { delayed: true, minutes: baggage.delayMinutes }
      : { delayed: false, minutes: 0 },
  };
};

export const getBaggageSlots = async (terminal?: string) => {
  const where = terminal ? { terminal, isActive: true } : { isActive: true };

  const slots = await prisma.baggageSlot.findMany({
    where,
    include: {
      baggageItems: {
        where: {
          status: { in: [BaggageStatus.WAITING, BaggageStatus.IN_TRANSIT, BaggageStatus.ARRIVED] },
        },
        include: {
          flight: { select: { flightNumber: true, airline: { select: { name: true } } } },
        },
      },
    },
    orderBy: { carouselNumber: 'asc' },
  });

  return slots.map(slot => ({
    ...slot,
    utilization: slot.baggageItems.length,
    currentFlight: slot.baggageItems[0]?.flight || null,
  }));
};

export const markBaggageLost = async (bagTagNumber: string, reason: string) => {
  const baggage = await prisma.baggageItem.findUnique({
    where: { bagTagNumber },
    include: { flight: true },
  });

  if (!baggage) {
    throw new AppError('行李不存在', 404);
  }

  return prisma.baggageItem.update({
    where: { id: baggage.id },
    data: {
      status: BaggageStatus.LOST,
      specialNotes: reason,
    },
  });
};
