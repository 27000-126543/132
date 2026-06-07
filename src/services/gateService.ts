import { Gate, GateType, Flight } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { notifyGateChange } from './notificationService';
import { config } from '../config';
import dayjs from 'dayjs';

const WALKING_SPEED_METERS_PER_MINUTE = 60;

export const calculateWalkingTime = (
  gate1: { xCoordinate: number; yCoordinate: number },
  gate2: { xCoordinate: number; yCoordinate: number }
): number => {
  const distance = Math.sqrt(
    Math.pow(gate2.xCoordinate - gate1.xCoordinate, 2) +
    Math.pow(gate2.yCoordinate - gate1.yCoordinate, 2)
  );
  return Math.ceil(distance / WALKING_SPEED_METERS_PER_MINUTE);
};

export const findAvailableGate = async (
  flight: Flight,
  excludeGateId?: number
): Promise<Gate | null> => {
  const startTime = dayjs(flight.scheduledDeparture).subtract(90, 'minute').toDate();
  const endTime = dayjs(flight.scheduledDeparture).toDate();

  const gateType = flight.isInternational
    ? { in: [GateType.INTERNATIONAL, GateType.MIXED] }
    : { in: [GateType.DOMESTIC, GateType.MIXED] };

  const allGates = await prisma.gate.findMany({
    where: {
      isAvailable: true,
      type: gateType,
      maxCapacity: { gte: flight.passengerCount },
      id: excludeGateId ? { not: excludeGateId } : undefined,
    },
  });

  for (const gate of allGates) {
    const overlappingFlights = await prisma.flight.findMany({
      where: {
        gateId: gate.id,
        id: { not: flight.id },
        status: { in: ['SCHEDULED', 'DELAYED', 'BOARDING'] },
        AND: [
          { scheduledDeparture: { gt: startTime } },
          { scheduledDeparture: { lt: endTime } },
        ],
      },
    });

    if (overlappingFlights.length === 0) {
      return gate;
    }
  }

  return null;
};

export const assignGate = async (flightId: number, gateId?: number) => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      gate: true,
      airline: true,
    },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  let targetGate: Gate | null;

  if (gateId) {
    targetGate = await prisma.gate.findUnique({
      where: { id: gateId, isAvailable: true },
    });

    if (!targetGate) {
      throw new AppError('指定登机口不可用', 400);
    }
  } else {
    targetGate = await findAvailableGate(flight);
    if (!targetGate) {
      throw new AppError('无可用登机口', 404);
    }
  }

  const oldGateId = flight.gateId;
  const oldGateCode = flight.gate?.code || null;

  await prisma.flight.update({
    where: { id: flightId },
    data: { gateId: targetGate.id },
  });

  if (oldGateId && oldGateCode && oldGateId !== targetGate.id) {
    const walkingTime = calculateWalkingTime(flight.gate!, targetGate);
    const needsShuttle = walkingTime > config.walkingTimeThreshold;

    const gateChange = await prisma.gateChange.create({
      data: {
        flightId: flight.id,
        oldGateId,
        newGateId: targetGate.id,
        walkingTimeMinutes: walkingTime,
        needsShuttle,
        changeReason: '系统自动分配',
      },
      include: {
        oldGate: true,
        newGate: true,
      },
    });

    let shuttleInfo = null;
    if (needsShuttle) {
      shuttleInfo = await dispatchShuttle(flight.id, gateChange.id);
    }

    await notifyGateChange(
      flight,
      oldGateCode,
      targetGate.code,
      walkingTime,
      needsShuttle
    );

    return {
      success: true,
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      oldGate: oldGateCode,
      newGate: targetGate.code,
      walkingTimeMinutes: walkingTime,
      needsShuttle,
      shuttleInfo,
      gateChange,
    };
  }

  return {
    success: true,
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    gate: {
      id: targetGate.id,
      code: targetGate.code,
      type: targetGate.type,
      terminal: targetGate.terminal,
    },
    isInitialAssignment: !oldGateId,
  };
};

export const changeGate = async (
  flightId: number,
  newGateId: number,
  reason: string
) => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      gate: true,
      airline: true,
    },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  if (!flight.gateId) {
    throw new AppError('航班尚未分配登机口', 400);
  }

  const newGate = await prisma.gate.findUnique({
    where: { id: newGateId, isAvailable: true },
  });

  if (!newGate) {
    throw new AppError('目标登机口不可用', 400);
  }

  const oldGate = flight.gate!;
  const walkingTime = calculateWalkingTime(oldGate, newGate);
  const needsShuttle = walkingTime > config.walkingTimeThreshold;

  const gateChange = await prisma.gateChange.create({
    data: {
      flightId: flight.id,
      oldGateId: flight.gateId,
      newGateId: newGate.id,
      walkingTimeMinutes: walkingTime,
      needsShuttle,
      changeReason: reason,
    },
    include: {
      oldGate: true,
      newGate: true,
    },
  });

  await prisma.flight.update({
    where: { id: flightId },
    data: { gateId: newGate.id },
  });

  let shuttleInfo = null;
  if (needsShuttle) {
    shuttleInfo = await dispatchShuttle(flight.id, gateChange.id);
  }

  await notifyGateChange(
    flight,
    oldGate.code,
    newGate.code,
    walkingTime,
    needsShuttle
  );

  return {
    success: true,
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    oldGate: {
      id: oldGate.id,
      code: oldGate.code,
    },
    newGate: {
      id: newGate.id,
      code: newGate.code,
      terminal: newGate.terminal,
    },
    walkingTimeMinutes: walkingTime,
    needsShuttle,
    shuttleInfo,
    reason,
    gateChange,
    passengerNotification: {
      message: `您的航班 ${flight.flightNumber} 登机口已变更为 ${newGate.code}`,
      walkingTime,
      shuttleService: needsShuttle ? '已为您安排摆渡车服务' : '请步行前往新登机口',
    },
  };
};

export const dispatchShuttle = async (flightId: number, gateChangeId: number) => {
  const availableShuttles = await prisma.shuttleBus.findMany({
    where: { isAvailable: true },
  });

  if (availableShuttles.length === 0) {
    return {
      success: false,
      message: '无可用摆渡车，请联系调度中心',
    };
  }

  const shuttle = availableShuttles[0];

  await prisma.shuttleBus.update({
    where: { id: shuttle.id },
    data: { isAvailable: false },
  });

  await prisma.gateChange.update({
    where: { id: gateChangeId },
    data: {
      shuttleDispatched: true,
      shuttleId: shuttle.id,
    },
  });

  setTimeout(async () => {
    await prisma.shuttleBus.update({
      where: { id: shuttle.id },
      data: { isAvailable: true },
    });
  }, 60 * 60 * 1000);

  return {
    success: true,
    shuttle: {
      id: shuttle.id,
      plateNumber: shuttle.plateNumber,
      capacity: shuttle.capacity,
      driverName: shuttle.driverName,
      driverPhone: shuttle.driverPhone,
    },
    estimatedDeparture: dayjs().add(5, 'minute').toDate(),
    estimatedArrival: dayjs().add(20, 'minute').toDate(),
  };
};

export const getFlightGateInfo = async (flightId: number) => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      gate: true,
      airline: true,
      gateChanges: {
        include: {
          oldGate: true,
          newGate: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
    },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  const nextFlight = await prisma.flight.findFirst({
    where: {
      gateId: flight.gateId,
      id: { not: flight.id },
      scheduledDeparture: {
        gt: flight.scheduledDeparture,
      },
      status: { in: ['SCHEDULED', 'DELAYED'] },
    },
    orderBy: { scheduledDeparture: 'asc' },
    select: {
      flightNumber: true,
      scheduledDeparture: true,
      airline: { select: { name: true } },
    },
  });

  return {
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    currentGate: flight.gate,
    gateStatus: flight.status === 'BOARDING' ? 'BOARDING' :
      flight.status === 'DEPARTED' ? 'CLOSED' : 'OPEN',
    boardingTime: dayjs(flight.scheduledDeparture).subtract(45, 'minute').toDate(),
    closingTime: dayjs(flight.scheduledDeparture).subtract(15, 'minute').toDate(),
    gateChangeHistory: flight.gateChanges,
    nextFlightAtGate: nextFlight,
    nearbyGates: await getNearbyGates(flight.gateId || 0, 5),
  };
};

export const getNearbyGates = async (gateId: number, count: number = 5) => {
  const gate = await prisma.gate.findUnique({ where: { id: gateId } });
  if (!gate) return [];

  const allGates = await prisma.gate.findMany({
    where: {
      isAvailable: true,
      terminal: gate.terminal,
      id: { not: gateId },
    },
  });

  const withDistance = allGates.map(g => ({
    ...g,
    distance: Math.sqrt(
      Math.pow(g.xCoordinate - gate.xCoordinate, 2) +
      Math.pow(g.yCoordinate - gate.yCoordinate, 2)
    ),
    walkingTimeMinutes: calculateWalkingTime(gate, g),
  }));

  return withDistance
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count);
};

export const getGateSchedule = async (gateId: number, date: Date) => {
  const startOfDay = dayjs(date).startOf('day').toDate();
  const endOfDay = dayjs(date).endOf('day').toDate();

  const gate = await prisma.gate.findUnique({
    where: { id: gateId },
  });

  if (!gate) {
    throw new AppError('登机口不存在', 404);
  }

  const flights = await prisma.flight.findMany({
    where: {
      gateId,
      OR: [
        { scheduledDeparture: { gte: startOfDay, lte: endOfDay } },
        { scheduledArrival: { gte: startOfDay, lte: endOfDay } },
      ],
    },
    include: {
      airline: { select: { name: true, iataCode: true } },
    },
    orderBy: { scheduledDeparture: 'asc' },
  });

  const gateChanges = await prisma.gateChange.findMany({
    where: {
      OR: [
        { oldGateId: gateId },
        { newGateId: gateId },
      ],
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
    include: {
      flight: { select: { flightNumber: true } },
      oldGate: true,
      newGate: true,
    },
  });

  return {
    gate,
    date,
    flights,
    gateChanges,
    utilizationRate: Math.min(100, (flights.length * 90) / (24 * 60) * 100),
  };
};

export const getAllGates = async (terminal?: string, type?: GateType) => {
  const where: any = { isAvailable: true };
  if (terminal) where.terminal = terminal;
  if (type) where.type = type;

  const gates = await prisma.gate.findMany({
    where,
    include: {
      flights: {
        where: {
          status: { in: ['SCHEDULED', 'DELAYED', 'BOARDING'] },
        },
        include: {
          airline: { select: { name: true } },
        },
        orderBy: { scheduledDeparture: 'asc' },
        take: 3,
      },
    },
    orderBy: [{ terminal: 'asc' }, { code: 'asc' }],
  });

  return gates.map(gate => ({
    ...gate,
    currentFlight: gate.flights[0] || null,
    upcomingFlights: gate.flights.slice(1),
    status: gate.flights.length > 0 ? 'OCCUPIED' : 'AVAILABLE',
  }));
};

export const getGateUsageStats = async (startDate: Date, endDate: Date) => {
  const gates = await prisma.gate.findMany({
    where: { isAvailable: true },
  });

  const stats = [];

  for (const gate of gates) {
    const flights = await prisma.flight.findMany({
      where: {
        gateId: gate.id,
        scheduledDeparture: { gte: startDate, lte: endDate },
      },
    });

    const changes = await prisma.gateChange.count({
      where: {
        OR: [{ oldGateId: gate.id }, { newGateId: gate.id }],
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    const totalUsageMinutes = flights.length * 90;
    const totalMinutes = dayjs(endDate).diff(dayjs(startDate), 'minute');

    stats.push({
      gateId: gate.id,
      gateCode: gate.code,
      terminal: gate.terminal,
      type: gate.type,
      flightCount: flights.length,
      changeCount: changes,
      utilizationRate: parseFloat(((totalUsageMinutes / totalMinutes) * 100).toFixed(2)),
    });
  }

  return {
    period: { startDate, endDate },
    totalGates: gates.length,
    totalFlights: stats.reduce((sum, s) => sum + s.flightCount, 0),
    totalChanges: stats.reduce((sum, s) => sum + s.changeCount, 0),
    averageUtilization: parseFloat(
      (stats.reduce((sum, s) => sum + s.utilizationRate, 0) / Math.max(stats.length, 1)).toFixed(2)
    ),
    gateStats: stats.sort((a, b) => b.utilizationRate - a.utilizationRate),
  };
};
