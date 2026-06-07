import { CrewRole, CrewMember, Flight, DelayReason } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { notifyCrewAssignment, notifyDelay } from './notificationService';
import { config } from '../config';
import dayjs from 'dayjs';

const REQUIRED_CREW: Record<string, { role: CrewRole; count: number }[]> = {
  B737: [
    { role: CrewRole.CAPTAIN, count: 1 },
    { role: CrewRole.FIRST_OFFICER, count: 1 },
    { role: CrewRole.FLIGHT_ATTENDANT, count: 4 },
  ],
  A320: [
    { role: CrewRole.CAPTAIN, count: 1 },
    { role: CrewRole.FIRST_OFFICER, count: 1 },
    { role: CrewRole.FLIGHT_ATTENDANT, count: 4 },
  ],
  B787: [
    { role: CrewRole.CAPTAIN, count: 1 },
    { role: CrewRole.FIRST_OFFICER, count: 1 },
    { role: CrewRole.PURSER, count: 1 },
    { role: CrewRole.FLIGHT_ATTENDANT, count: 6 },
  ],
  A350: [
    { role: CrewRole.CAPTAIN, count: 1 },
    { role: CrewRole.FIRST_OFFICER, count: 1 },
    { role: CrewRole.PURSER, count: 1 },
    { role: CrewRole.FLIGHT_ATTENDANT, count: 6 },
  ],
  B777: [
    { role: CrewRole.CAPTAIN, count: 1 },
    { role: CrewRole.FIRST_OFFICER, count: 1 },
    { role: CrewRole.PURSER, count: 1 },
    { role: CrewRole.FLIGHT_ATTENDANT, count: 8 },
  ],
  B747: [
    { role: CrewRole.CAPTAIN, count: 1 },
    { role: CrewRole.FIRST_OFFICER, count: 1 },
    { role: CrewRole.ENGINEER, count: 1 },
    { role: CrewRole.PURSER, count: 1 },
    { role: CrewRole.FLIGHT_ATTENDANT, count: 10 },
  ],
  A380: [
    { role: CrewRole.CAPTAIN, count: 1 },
    { role: CrewRole.FIRST_OFFICER, count: 2 },
    { role: CrewRole.PURSER, count: 2 },
    { role: CrewRole.FLIGHT_ATTENDANT, count: 14 },
  ],
  A330: [
    { role: CrewRole.CAPTAIN, count: 1 },
    { role: CrewRole.FIRST_OFFICER, count: 1 },
    { role: CrewRole.PURSER, count: 1 },
    { role: CrewRole.FLIGHT_ATTENDANT, count: 6 },
  ],
};

export const checkCrewAvailability = async (
  crewId: number,
  flightStart: Date,
  flightEnd: Date,
  flightId?: number
): Promise<{ available: boolean; conflicts: string[] }> => {
  const crew = await prisma.crewMember.findUnique({
    where: { id: crewId },
    include: {
      assignments: {
        where: { isConfirmed: true },
        include: { flight: true },
      },
      restPeriods: {
        where: { isValid: true },
      },
    },
  });

  if (!crew) {
    return { available: false, conflicts: ['机组人员不存在'] };
  }

  const conflicts: string[] = [];

  if (!crew.isAvailable) {
    conflicts.push('该机组人员当前不可用');
  }

  const flightDuration = dayjs(flightEnd).diff(dayjs(flightStart), 'hour', true);
  if (crew.flightHoursToday + flightDuration > config.maxFlightHoursPerDay) {
    conflicts.push(`今日飞行时间将超过 ${config.maxFlightHoursPerDay} 小时限制`);
  }

  if (crew.lastFlightEnd) {
    const restHours = dayjs(flightStart).diff(dayjs(crew.lastFlightEnd), 'hour', true);
    if (restHours < config.minCrewRestHours) {
      conflicts.push(`休息时间不足，当前仅 ${restHours.toFixed(1)} 小时，需要至少 ${config.minCrewRestHours} 小时`);
    }
  }

  for (const assignment of crew.assignments) {
    if (flightId && assignment.flightId === flightId) continue;

    const existingStart = assignment.flight.scheduledDeparture;
    const existingEnd = assignment.flight.scheduledArrival;

    if (
      (flightStart >= existingStart && flightStart < existingEnd) ||
      (flightEnd > existingStart && flightEnd <= existingEnd) ||
      (flightStart <= existingStart && flightEnd >= existingEnd)
    ) {
      conflicts.push(`与航班 ${assignment.flight.flightNumber} 时间冲突`);
    }
  }

  for (const rest of crew.restPeriods) {
    if (
      (flightStart >= rest.startTime && flightStart < rest.endTime) ||
      (flightEnd > rest.startTime && flightEnd <= rest.endTime)
    ) {
      conflicts.push(`与已安排的休息期冲突（${dayjs(rest.startTime).format('YYYY-MM-DD HH:mm')} - ${dayjs(rest.endTime).format('YYYY-MM-DD HH:mm')}）`);
    }
  }

  return {
    available: conflicts.length === 0,
    conflicts,
  };
};

export const checkQualification = (
  crew: CrewMember,
  role: CrewRole,
  aircraftType: string,
  isInternational: boolean
): { qualified: boolean; reasons: string[] } => {
  const reasons: string[] = [];

  if (crew.role !== role) {
    reasons.push(`角色不匹配：需要 ${role}，当前为 ${crew.role}`);
  }

  if (!crew.qualifications.includes(aircraftType)) {
    reasons.push(`无 ${aircraftType} 机型资质`);
  }

  if (isInternational && !crew.qualifications.includes('INTERNATIONAL')) {
    reasons.push('无国际航线资质');
  }

  return {
    qualified: reasons.length === 0,
    reasons,
  };
};

export const findAvailableCrew = async (
  role: CrewRole,
  aircraftType: string,
  isInternational: boolean,
  flightStart: Date,
  flightEnd: Date,
  flightId?: number
): Promise<{ crew: CrewMember; score: number }[]> => {
  const allCrew = await prisma.crewMember.findMany({
    where: {
      role,
      isAvailable: true,
    },
    include: {
      assignments: {
        where: { isConfirmed: true },
        include: { flight: true },
      },
      restPeriods: {
        where: { isValid: true },
      },
    },
  });

  const qualifiedCrew = [];

  for (const crew of allCrew) {
    const qualification = checkQualification(crew, role, aircraftType, isInternational);
    if (!qualification.qualified) continue;

    const availability = await checkCrewAvailability(crew.id, flightStart, flightEnd, flightId);
    if (!availability.available) continue;

    let score = 0;

    score += crew.qualifications.length * 5;

    const recentFlights = crew.assignments.filter(a =>
      dayjs(a.flight.scheduledDeparture).isAfter(dayjs().subtract(7, 'day'))
    ).length;
    score -= recentFlights * 2;

    if (crew.baseAirport === 'PEK') score += 10;

    qualifiedCrew.push({ crew, score });
  }

  return qualifiedCrew.sort((a, b) => b.score - a.score);
};

export const generateCrewSchedule = async (flightId: number) => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      airline: true,
      crewAssignments: {
        include: { crew: true },
      },
    },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  const crewRequirements = REQUIRED_CREW[flight.aircraftType] || REQUIRED_CREW.B737;
  const flightStart = flight.scheduledDeparture;
  const flightEnd = flight.scheduledArrival;

  const assignments = [];
  const conflicts = [];
  const alternatives = [];

  for (const req of crewRequirements) {
    for (let i = 0; i < req.count; i++) {
      const existingAssignment = flight.crewAssignments.find(
        a => a.role === req.role && a.hasConflict === false
      );

      if (existingAssignment) {
        const availability = await checkCrewAvailability(
          existingAssignment.crewId,
          flightStart,
          flightEnd,
          flightId
        );

        if (availability.available) {
          assignments.push({
            ...existingAssignment,
            isReused: true,
          });
          continue;
        }
      }

      const availableCrew = await findAvailableCrew(
        req.role,
        flight.aircraftType,
        flight.isInternational,
        flightStart,
        flightEnd,
        flightId
      );

      if (availableCrew.length > 0) {
        const selected = availableCrew[0];
        const assignment = await prisma.crewAssignment.create({
          data: {
            flightId,
            crewId: selected.crew.id,
            role: req.role,
            isConfirmed: true,
            hasConflict: false,
          },
          include: {
            crew: true,
          },
        });

        assignments.push(assignment);

        await notifyCrewAssignment(
          selected.crew.name,
          flight.flightNumber,
          req.role
        );

        await prisma.crewMember.update({
          where: { id: selected.crew.id },
          data: {
            lastFlightEnd: flightEnd,
            flightHoursToday: {
              increment: dayjs(flightEnd).diff(dayjs(flightStart), 'hour', true),
            },
          },
        });

        if (availableCrew.length > 1) {
          alternatives.push({
            role: req.role,
            alternatives: availableCrew.slice(1, 3).map(c => ({
              id: c.crew.id,
              name: c.crew.name,
              score: c.score,
            })),
          });
        }
      } else {
        conflicts.push({
          role: req.role,
          message: `无可用${getRoleName(req.role)}`,
        });
      }
    }
  }

  if (conflicts.length > 0) {
    const autoAdjusted = await autoAdjustCrew(flightId, conflicts);

    for (const conflict of conflicts) {
      await notifyCrewAssignment(
        '',
        flight.flightNumber,
        conflict.role,
        true
      );
    }

    return {
      success: false,
      flightId,
      flightNumber: flight.flightNumber,
      message: '部分机组排班存在冲突，已尝试自动调整',
      assignments,
      conflicts,
      autoAdjusted,
      alternatives,
    };
  }

  return {
    success: true,
    flightId,
    flightNumber: flight.flightNumber,
    assignments,
    alternatives,
    totalCrew: assignments.length,
    crewSummary: getCrewSummary(assignments),
  };
};

const getRoleName = (role: CrewRole): string => {
  const names: Record<CrewRole, string> = {
    [CrewRole.CAPTAIN]: '机长',
    [CrewRole.FIRST_OFFICER]: '副驾驶',
    [CrewRole.PURSER]: '乘务长',
    [CrewRole.FLIGHT_ATTENDANT]: '乘务员',
    [CrewRole.ENGINEER]: '飞行工程师',
  };
  return names[role];
};

const getCrewSummary = (assignments: any[]) => {
  const summary: Record<string, number> = {};
  for (const a of assignments) {
    const role = a.role || a.crew?.role;
    summary[role] = (summary[role] || 0) + 1;
  }
  return summary;
};

export const autoAdjustCrew = async (
  flightId: number,
  conflicts: { role: CrewRole; message: string }[]
) => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: { crewAssignments: { include: { crew: true } } },
  });

  if (!flight) return [];

  const adjusted = [];

  for (const conflict of conflicts) {
    const allCrew = await prisma.crewMember.findMany({
      where: {
        role: conflict.role,
        isAvailable: true,
      },
      include: {
        assignments: {
          where: { isConfirmed: true, flightId: { not: flightId } },
          include: { flight: true },
        },
      },
    });

    for (const crew of allCrew) {
      const qualification = checkQualification(
        crew,
        conflict.role,
        flight.aircraftType,
        flight.isInternational
      );
      if (!qualification.qualified) continue;

      const overlappingAssignment = crew.assignments.find(a => {
        return (
          flight.scheduledDeparture < a.flight.scheduledArrival &&
          flight.scheduledArrival > a.flight.scheduledDeparture
        );
      });

      if (overlappingAssignment) {
        const otherFlight = overlappingAssignment.flight;
        const alternativeCrew = await findAvailableCrew(
          crew.role,
          otherFlight.aircraftType,
          otherFlight.isInternational,
          otherFlight.scheduledDeparture,
          otherFlight.scheduledArrival,
          otherFlight.id
        );

        if (alternativeCrew.length > 0) {
          const replacement = alternativeCrew[0];

          await prisma.crewAssignment.update({
            where: { id: overlappingAssignment.id },
            data: {
              crewId: replacement.crew.id,
              hasConflict: false,
            },
          });

          const newAssignment = await prisma.crewAssignment.create({
            data: {
              flightId,
              crewId: crew.id,
              role: conflict.role,
              isConfirmed: true,
              hasConflict: false,
            },
            include: { crew: true },
          });

          adjusted.push({
            originalCrew: crew.name,
            originalRole: conflict.role,
            swappedFlight: otherFlight.flightNumber,
            replacementCrew: replacement.crew.name,
          });

          break;
        }
      }
    }
  }

  return adjusted;
};

export const reportFlightDelay = async (
  flightId: number,
  delayMinutes: number,
  reason: DelayReason
) => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: {
      airline: true,
      crewAssignments: { include: { crew: true } },
    },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  const newDeparture = dayjs(flight.scheduledDeparture).add(delayMinutes, 'minute').toDate();
  const newArrival = dayjs(flight.scheduledArrival).add(delayMinutes, 'minute').toDate();

  await prisma.flight.update({
    where: { id: flightId },
    data: {
      delayMinutes: { increment: delayMinutes },
      delayReason: reason,
      scheduledDeparture: newDeparture,
      scheduledArrival: newArrival,
    },
  });

  const crewConflicts = [];
  for (const assignment of flight.crewAssignments) {
    const availability = await checkCrewAvailability(
      assignment.crewId,
      newDeparture,
      newArrival,
      flightId
    );

    if (!availability.available) {
      crewConflicts.push({
        crewId: assignment.crewId,
        crewName: assignment.crew.name,
        role: assignment.role,
        conflicts: availability.conflicts,
      });

      await prisma.crewAssignment.update({
        where: { id: assignment.id },
        data: {
          hasConflict: true,
          conflictDetails: availability.conflicts.join('; '),
        },
      });
    }
  }

  if (crewConflicts.length > 0) {
    const schedule = await generateCrewSchedule(flightId);
    return {
      success: true,
      flightId,
      flightNumber: flight.flightNumber,
      delayMinutes,
      reason,
      newDeparture,
      newArrival,
      crewConflicts,
      crewReassigned: schedule,
    };
  }

  await notifyDelay(flight, delayMinutes, reason.toString());

  return {
    success: true,
    flightId,
    flightNumber: flight.flightNumber,
    delayMinutes,
    reason,
    newDeparture,
    newArrival,
    crewStatus: '所有机组时间冲突已检查，无冲突',
  };
};

export const getCrewSchedule = async (crewId: number, startDate: Date, endDate: Date) => {
  const crew = await prisma.crewMember.findUnique({
    where: { id: crewId },
    include: {
      assignments: {
        where: {
          flight: {
            scheduledDeparture: { gte: startDate, lte: endDate },
          },
        },
        include: {
          flight: {
            include: { airlineRelation: true, stand: true, gate: true },
          },
        },
        orderBy: { flight: { scheduledDeparture: 'asc' } },
      },
      restPeriods: {
        where: {
          startTime: { gte: startDate },
          endTime: { lte: endDate },
          isValid: true,
        },
      },
    },
  });

  if (!crew) {
    throw new AppError('机组人员不存在', 404);
  }

  const totalFlightHours = crew.assignments.reduce((sum, a) => {
    const duration = dayjs(a.flight.scheduledArrival).diff(
      dayjs(a.flight.scheduledDeparture),
      'hour',
      true
    );
    return sum + duration;
  }, 0);

  const totalRestHours = crew.restPeriods.reduce((sum, r) => sum + r.duration, 0);

  return {
    crew,
    period: { startDate, endDate },
    assignments: crew.assignments,
    restPeriods: crew.restPeriods,
    stats: {
      totalFlights: crew.assignments.length,
      totalFlightHours: parseFloat(totalFlightHours.toFixed(1)),
      totalRestHours: parseFloat(totalRestHours.toFixed(1)),
      avgRestBetweenFlights: crew.assignments.length > 1
        ? calculateAvgRest(crew.assignments)
        : 0,
      hasConflict: crew.assignments.some(a => a.hasConflict),
    },
  };
};

const calculateAvgRest = (assignments: any[]): number => {
  if (assignments.length < 2) return 0;

  let totalRest = 0;
  for (let i = 1; i < assignments.length; i++) {
    const rest = dayjs(assignments[i].flight.scheduledDeparture).diff(
      dayjs(assignments[i - 1].flight.scheduledArrival),
      'hour',
      true
    );
    totalRest += Math.max(0, rest);
  }
  return parseFloat((totalRest / (assignments.length - 1)).toFixed(1));
};

export const addRestPeriod = async (
  crewId: number,
  startTime: Date,
  endTime: Date,
  reason?: string
) => {
  const crew = await prisma.crewMember.findUnique({ where: { id: crewId } });
  if (!crew) {
    throw new AppError('机组人员不存在', 404);
  }

  const duration = dayjs(endTime).diff(dayjs(startTime), 'hour', true);
  if (duration <= 0) {
    throw new AppError('结束时间必须晚于开始时间', 400);
  }

  return prisma.crewRestPeriod.create({
    data: {
      crewId,
      startTime,
      endTime,
      duration,
      isValid: true,
    },
  });
};

export const getAllCrew = async (role?: CrewRole, availableOnly?: boolean) => {
  const where: any = {};
  if (role) where.role = role;
  if (availableOnly) where.isAvailable = true;

  const crew = await prisma.crewMember.findMany({
    where,
    include: {
      assignments: {
        where: { isConfirmed: true },
        include: { flight: { select: { flightNumber: true, scheduledDeparture: true } } },
        take: 3,
      },
    },
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });

  return crew;
};
