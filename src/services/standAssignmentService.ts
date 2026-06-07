import { Stand, Flight, AircraftType, StandType, BridgeType } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { notifyStandChange, createNotification } from './notificationService';
import { NotificationTarget, NotificationType } from '@prisma/client';
import dayjs from 'dayjs';

const AIRCRAFT_SIZE_ORDER: AircraftType[] = [
  AircraftType.A320,
  AircraftType.B737,
  AircraftType.A330,
  AircraftType.B787,
  AircraftType.A350,
  AircraftType.B777,
  AircraftType.B747,
  AircraftType.A380,
];

const STAND_PREFERENCE_ORDER = {
  [StandType.CONTACT]: 1,
  [StandType.WIDE_BODY]: 2,
  [StandType.NARROW_BODY]: 3,
  [StandType.REMOTE]: 4,
  [StandType.CARGO]: 5,
};

interface AssignmentResult {
  stand: Stand;
  score: number;
  isOptimal: boolean;
  reasons: string[];
}

interface StandConflict {
  hasConflict: boolean;
  conflictType: string | null;
  conflictingFlight: Flight | null;
  details: string;
}

export const checkStandAvailability = async (
  standId: number,
  startTime: Date,
  endTime: Date,
  excludeFlightId?: number
): Promise<StandConflict> => {
  const overlappingAssignments = await prisma.standAssignment.findMany({
    where: {
      standId,
      isActive: true,
      flightId: excludeFlightId ? { not: excludeFlightId } : undefined,
      AND: [
        { startTime: { lt: endTime } },
        { endTime: { gt: startTime } },
      ],
    },
    include: {
      flight: true,
    },
  });

  if (overlappingAssignments.length > 0) {
    const conflicting = overlappingAssignments[0];
    return {
      hasConflict: true,
      conflictType: 'TIME_OVERLAP',
      conflictingFlight: conflicting.flight,
      details: `与航班 ${conflicting.flight.flightNumber} 时间冲突（${dayjs(conflicting.startTime).format('HH:mm')} - ${dayjs(conflicting.endTime).format('HH:mm')}）`,
    };
  }

  return {
    hasConflict: false,
    conflictType: null,
    conflictingFlight: null,
    details: '',
  };
};

export const checkAircraftCompatibility = async (
  stand: Stand,
  aircraftType: AircraftType
): Promise<{ compatible: boolean; reasons: string[] }> => {
  const reasons: string[] = [];

  const standSizeIndex = AIRCRAFT_SIZE_ORDER.indexOf(stand.maxAircraftSize);
  const aircraftSizeIndex = AIRCRAFT_SIZE_ORDER.indexOf(aircraftType);

  if (aircraftSizeIndex > standSizeIndex) {
    reasons.push(`机位 ${stand.code} 最大支持机型 ${stand.maxAircraftSize}，无法容纳 ${aircraftType}`);
  }

  const incompatible = await prisma.standAircraftCompatibility.findFirst({
    where: {
      standId: stand.id,
      aircraftType,
    },
  });

  if (incompatible) {
    reasons.push(`机位 ${stand.code} 与机型 ${aircraftType} 不兼容：${incompatible.reason}`);
  }

  if (stand.maintenanceDate && dayjs(stand.maintenanceDate).isAfter(dayjs())) {
    reasons.push(`机位 ${stand.code} 计划于 ${dayjs(stand.maintenanceDate).format('YYYY-MM-DD')} 进行维护`);
  }

  return {
    compatible: reasons.length === 0,
    reasons,
  };
};

export const calculateStandScore = (
  stand: Stand,
  flight: Flight,
  bridgeType?: BridgeType
): number => {
  let score = 0;

  score += (6 - STAND_PREFERENCE_ORDER[stand.type]) * 10;

  if (stand.hasBridge && bridgeType) {
    if (stand.bridgeType === bridgeType) {
      score += 30;
    } else {
      score += 15;
    }
  } else if (!stand.hasBridge) {
    score -= 20;
  }

  if (flight.isInternational) {
    if (stand.area === 'INTERNATIONAL') score += 15;
    if (stand.area === 'DOMESTIC') score -= 10;
  } else {
    if (stand.area === 'DOMESTIC') score += 15;
    if (stand.area === 'INTERNATIONAL') score -= 10;
  }

  if (stand.terminal === 'T1') score += 5;
  if (stand.terminal === 'T2') score += 3;

  return score;
};

export const findAlternativeStands = async (
  flight: Flight,
  startTime: Date,
  endTime: Date,
  bridgeType?: BridgeType,
  excludeStandIds: number[] = []
): Promise<AssignmentResult[]> => {
  const availableStands = await prisma.stand.findMany({
    where: {
      isAvailable: true,
      id: { notIn: excludeStandIds },
    },
    include: {
      incompatibleAircrafts: true,
    },
  });

  const results: AssignmentResult[] = [];

  for (const stand of availableStands) {
    const { compatible, reasons } = await checkAircraftCompatibility(stand, flight.aircraftType);
    if (!compatible) continue;

    const availability = await checkStandAvailability(stand.id, startTime, endTime, flight.id);
    if (availability.hasConflict) continue;

    const score = calculateStandScore(stand, flight, bridgeType);
    results.push({
      stand,
      score,
      isOptimal: false,
      reasons,
    });
  }

  return results.sort((a, b) => b.score - a.score);
};

export const assignOptimalStand = async (
  flightId: number,
  preferredBridgeType?: BridgeType
) => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      stand: true,
      airline: true,
    },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  const startTime = dayjs(flight.scheduledArrival).subtract(30, 'minute').toDate();
  const endTime = dayjs(flight.scheduledDeparture).toDate();

  const allStands = await prisma.stand.findMany({
    where: { isAvailable: true },
    include: {
      incompatibleAircrafts: true,
    },
  });

  const candidates: AssignmentResult[] = [];
  const conflictDetails: string[] = [];

  for (const stand of allStands) {
    const { compatible, reasons } = await checkAircraftCompatibility(stand, flight.aircraftType);
    if (!compatible) {
      conflictDetails.push(`机位 ${stand.code}: ${reasons.join(', ')}`);
      continue;
    }

    const availability = await checkStandAvailability(stand.id, startTime, endTime, flight.id);
    if (availability.hasConflict) {
      conflictDetails.push(`机位 ${stand.code}: ${availability.details}`);
      continue;
    }

    const score = calculateStandScore(stand, flight, preferredBridgeType);
    candidates.push({
      stand,
      score,
      isOptimal: false,
      reasons: [],
    });
  }

  if (candidates.length === 0) {
    const alternatives = await findAlternativeStands(
      flight,
      startTime,
      endTime,
      preferredBridgeType
    );

    await createNotification({
      type: NotificationType.STAND_CHANGE,
      target: NotificationTarget.MAINTENANCE,
      flightId: flight.id,
      title: '机位分配冲突告警',
      message: `航班 ${flight.flightNumber} 无法分配可用机位，冲突详情：${conflictDetails.join('; ')}`,
      data: {
        flightId: flight.id,
        flightNumber: flight.flightNumber,
        conflicts: conflictDetails,
        alternatives: alternatives.slice(0, 5).map(a => ({
          standCode: a.stand.code,
          score: a.score,
          reasons: a.reasons,
        })),
      },
    });

    return {
      success: false,
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      message: '无可用机位，已通知机务部门',
      conflicts: conflictDetails,
      recommendedAlternatives: alternatives.slice(0, 5).map(a => ({
        standCode: a.stand.code,
        standType: a.stand.type,
        hasBridge: a.stand.hasBridge,
        score: a.score,
      })),
    };
  }

  candidates.sort((a, b) => b.score - a.score);
  candidates[0].isOptimal = true;

  const optimalStand = candidates[0].stand;
  const oldStandCode = flight.stand?.code || null;

  if (flight.standId) {
    await prisma.standAssignment.updateMany({
      where: {
        flightId: flight.id,
        standId: flight.standId,
        isActive: true,
      },
      data: { isActive: false },
    });
  }

  const assignment = await prisma.standAssignment.create({
    data: {
      flightId: flight.id,
      standId: optimalStand.id,
      startTime,
      endTime,
      isActive: true,
      isConflict: false,
      alternativeStandId: candidates.length > 1 ? candidates[1].stand.id : null,
    },
    include: {
      stand: true,
    },
  });

  await prisma.flight.update({
    where: { id: flight.id },
    data: { standId: optimalStand.id },
  });

  await notifyStandChange(flight, oldStandCode, optimalStand.code);

  return {
    success: true,
    flightId: flight.id,
    flightNumber: flight.flightNumber,
    assignedStand: {
      id: optimalStand.id,
      code: optimalStand.code,
      type: optimalStand.type,
      hasBridge: optimalStand.hasBridge,
      bridgeType: optimalStand.bridgeType,
      terminal: optimalStand.terminal,
    },
    assignment,
    score: candidates[0].score,
    alternatives: candidates.slice(1, 4).map(c => ({
      standCode: c.stand.code,
      score: c.score,
      standType: c.stand.type,
    })),
    effectiveTime: {
      startTime,
      endTime,
    },
  };
};

export const reassignStand = async (
  flightId: number,
  reason: string,
  preferredBridgeType?: BridgeType
) => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      stand: true,
      standAssignments: {
        where: { isActive: true },
        include: { stand: true },
      },
    },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  if (flight.standAssignments.length > 0) {
    await prisma.standAssignment.update({
      where: { id: flight.standAssignments[0].id },
      data: {
        isActive: false,
        isConflict: true,
        conflictDetails: reason,
      },
    });
  }

  const result = await assignOptimalStand(flightId, preferredBridgeType);

  if (result.success && flight.stand) {
    await notifyStandChange(
      flight,
      flight.stand.code,
      result.assignedStand.code,
      reason
    );
  }

  return result;
};

export const getStandAssignments = async (
  date?: Date,
  terminal?: string,
  page: number = 1,
  pageSize: number = 50
) => {
  const where: any = {};

  if (date) {
    const startOfDay = dayjs(date).startOf('day').toDate();
    const endOfDay = dayjs(date).endOf('day').toDate();
    where.startTime = { gte: startOfDay };
    where.endTime = { lte: endOfDay };
  }

  const [assignments, total] = await Promise.all([
    prisma.standAssignment.findMany({
      where,
      include: {
        flight: {
          include: {
            airline: { select: { name: true, iataCode: true } },
          },
        },
        stand: true,
      },
      orderBy: { startTime: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.standAssignment.count({ where }),
  ]);

  return {
    assignments,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};

export const getStandSchedule = async (standId: number, date: Date) => {
  const startOfDay = dayjs(date).startOf('day').toDate();
  const endOfDay = dayjs(date).endOf('day').toDate();

  const stand = await prisma.stand.findUnique({
    where: { id: standId },
    include: {
      assignments: {
        where: {
          isActive: true,
          AND: [
            { startTime: { gte: startOfDay } },
            { endTime: { lte: endOfDay } },
          ],
        },
        include: {
          flight: {
            include: { airline: { select: { name: true } } },
          },
        },
        orderBy: { startTime: 'asc' },
      },
    },
  });

  if (!stand) {
    throw new AppError('机位不存在', 404);
  }

  return stand;
};

export const getStandOccupancyStats = async (date: Date) => {
  const startOfDay = dayjs(date).startOf('day').toDate();
  const endOfDay = dayjs(date).endOf('day').toDate();

  const assignments = await prisma.standAssignment.findMany({
    where: {
      isActive: true,
      AND: [
        { startTime: { gte: startOfDay } },
        { endTime: { lte: endOfDay } },
      ],
    },
    include: { stand: true },
  });

  const standStats = new Map<number, { code: string; count: number; totalMinutes: number }>();

  for (const assignment of assignments) {
    const duration = dayjs(assignment.endTime).diff(dayjs(assignment.startTime), 'minute');
    const existing = standStats.get(assignment.standId) || {
      code: assignment.stand.code,
      count: 0,
      totalMinutes: 0,
    };
    existing.count += 1;
    existing.totalMinutes += duration;
    standStats.set(assignment.standId, existing);
  }

  const totalStands = await prisma.stand.count({ where: { isAvailable: true } });
  const totalTurns = assignments.length;
  const avgTurnsPerStand = totalTurns / Math.max(totalStands, 1);

  return {
    date,
    totalStands,
    totalTurns,
    avgTurnsPerStand: parseFloat(avgTurnsPerStand.toFixed(2)),
    standDetails: Array.from(standStats.values()).sort((a, b) => b.count - a.count),
  };
};
