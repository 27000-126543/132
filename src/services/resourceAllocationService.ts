import { DelayReason, ApprovalStatus, Flight } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { notifyResourceAllocation } from './notificationService';
import dayjs from 'dayjs';

interface ResourcePlan {
  additionalCounters: number;
  additionalCleaners: number;
  additionalStaff: number;
  estimatedCost: number;
  justification: string;
}

const DELAY_RESOURCE_MATRIX: Record<DelayReason, { counters: number; cleaners: number; staff: number; costPerUnit: number }> = {
  [DelayReason.WEATHER]: { counters: 3, cleaners: 4, staff: 2, costPerUnit: 500 },
  [DelayReason.MECHANICAL]: { counters: 1, cleaners: 2, staff: 3, costPerUnit: 800 },
  [DelayReason.CREW_SHORTAGE]: { counters: 2, cleaners: 2, staff: 4, costPerUnit: 600 },
  [DelayReason.PASSENGER]: { counters: 4, cleaners: 1, staff: 3, costPerUnit: 400 },
  [DelayReason.AIR_TRAFFIC_CONTROL]: { counters: 2, cleaners: 2, staff: 2, costPerUnit: 300 },
  [DelayReason.CATERING]: { counters: 1, cleaners: 3, staff: 1, costPerUnit: 350 },
  [DelayReason.BAGGAGE]: { counters: 1, cleaners: 2, staff: 4, costPerUnit: 450 },
  [DelayReason.SECURITY]: { counters: 2, cleaners: 1, staff: 5, costPerUnit: 650 },
  [DelayReason.OTHER]: { counters: 2, cleaners: 2, staff: 2, costPerUnit: 400 },
};

export const generateResourcePlan = async (
  flightId: number,
  delayMinutes: number,
  reason: DelayReason
): Promise<ResourcePlan> => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: { airline: true },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  const baseResources = DELAY_RESOURCE_MATRIX[reason] || DELAY_RESOURCE_MATRIX.OTHER;
  const delayMultiplier = Math.min(3, 1 + delayMinutes / 60);
  const passengerMultiplier = Math.min(2, 1 + flight.passengerCount / 300);

  const additionalCounters = Math.ceil(baseResources.counters * delayMultiplier * (flight.isInternational ? 1.2 : 1));
  const additionalCleaners = Math.ceil(baseResources.cleaners * delayMultiplier);
  const additionalStaff = Math.ceil(baseResources.staff * passengerMultiplier);

  const estimatedCost = (additionalCounters + additionalCleaners + additionalStaff) * baseResources.costPerUnit;

  const justifications = [
    `航班 ${flight.flightNumber} 延误 ${delayMinutes} 分钟`,
    `延误原因：${getDelayReasonName(reason)}`,
    `旅客人数：${flight.passengerCount} 人`,
    flight.isInternational ? '国际航班，需要更多值机支持' : '国内航班',
  ];

  return {
    additionalCounters,
    additionalCleaners,
    additionalStaff,
    estimatedCost,
    justification: justifications.join('；'),
  };
};

const getDelayReasonName = (reason: DelayReason): string => {
  const names: Record<DelayReason, string> = {
    [DelayReason.WEATHER]: '天气原因',
    [DelayReason.MECHANICAL]: '机械故障',
    [DelayReason.CREW_SHORTAGE]: '机组人员短缺',
    [DelayReason.PASSENGER]: '旅客原因',
    [DelayReason.AIR_TRAFFIC_CONTROL]: '空中交通管制',
    [DelayReason.CATERING]: '航食配餐',
    [DelayReason.BAGGAGE]: '行李处理',
    [DelayReason.SECURITY]: '安全检查',
    [DelayReason.OTHER]: '其他原因',
  };
  return names[reason];
};

export const createResourceRequest = async (
  flightId: number,
  requesterId: number,
  customPlan?: Partial<ResourcePlan>
) => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
    include: { airline: true },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  if (!flight.delayReason || flight.delayMinutes <= 0) {
    throw new AppError('该航班未报告延误，无法生成资源调配方案', 400);
  }

  const autoPlan = await generateResourcePlan(
    flightId,
    flight.delayMinutes,
    flight.delayReason
  );

  const finalPlan: ResourcePlan = {
    ...autoPlan,
    ...customPlan,
  };

  const existingRequest = await prisma.resourceAllocationRequest.findFirst({
    where: {
      flightId,
      approvalStatus: { in: [ApprovalStatus.PENDING, ApprovalStatus.APPROVED] },
    },
  });

  if (existingRequest) {
    throw new AppError('该航班已有待审批或已批准的资源调配请求', 400);
  }

  const request = await prisma.resourceAllocationRequest.create({
    data: {
      flightId,
      delayReason: flight.delayReason,
      additionalCounters: finalPlan.additionalCounters,
      additionalCleaners: finalPlan.additionalCleaners,
      additionalStaff: finalPlan.additionalStaff,
      estimatedCost: finalPlan.estimatedCost,
      justification: finalPlan.justification,
      requesterId,
      approvalStatus: ApprovalStatus.PENDING,
    },
    include: {
      flight: {
        include: { airline: true, stand: true, gate: true },
      },
      requester: {
        select: { id: true, username: true, department: true },
      },
    },
  });

  return {
    success: true,
    request,
    autoPlan,
    finalPlan,
    nextSteps: '等待主管审批',
    approvalUrl: `/api/resource-allocation/${request.id}/approve`,
  };
};

export const approveResourceRequest = async (
  requestId: number,
  approverId: number,
  approved: boolean,
  rejectionReason?: string,
  adjustments?: Partial<ResourcePlan>
) => {
  const request = await prisma.resourceAllocationRequest.findUnique({
    where: { id: requestId },
    include: {
      flight: { include: { airline: true } },
      requester: true,
    },
  });

  if (!request) {
    throw new AppError('资源调配请求不存在', 404);
  }

  if (request.approvalStatus !== ApprovalStatus.PENDING) {
    throw new AppError(`该请求已${getStatusName(request.approvalStatus)}，无法重复审批`, 400);
  }

  let finalCounters = request.additionalCounters;
  let finalCleaners = request.additionalCleaners;
  let finalStaff = request.additionalStaff;
  let finalCost = request.estimatedCost;

  if (approved && adjustments) {
    finalCounters = adjustments.additionalCounters ?? finalCounters;
    finalCleaners = adjustments.additionalCleaners ?? finalCleaners;
    finalStaff = adjustments.additionalStaff ?? finalStaff;

    if (
      adjustments.additionalCounters !== undefined ||
      adjustments.additionalCleaners !== undefined ||
      adjustments.additionalStaff !== undefined
    ) {
      const unitCost = request.estimatedCost / (request.additionalCounters + request.additionalCleaners + request.additionalStaff);
      finalCost = (finalCounters + finalCleaners + finalStaff) * unitCost;
    }
  }

  const updatedRequest = await prisma.resourceAllocationRequest.update({
    where: { id: requestId },
    data: {
      approvalStatus: approved ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
      approverId,
      approvedAt: approved ? new Date() : null,
      rejectionReason: approved ? null : rejectionReason,
      additionalCounters: finalCounters,
      additionalCleaners: finalCleaners,
      additionalStaff: finalStaff,
      estimatedCost: finalCost,
    },
    include: {
      flight: { include: { airline: true } },
      approver: { select: { id: true, username: true, department: true } },
    },
  });

  if (approved) {
    await executeResourceAllocation(requestId);

    await notifyResourceAllocation(
      request.flightId,
      request.flight.flightNumber,
      finalCounters,
      finalCleaners,
      '已批准并执行'
    );
  } else {
    await notifyResourceAllocation(
      request.flightId,
      request.flight.flightNumber,
      0,
      0,
      '已拒绝'
    );
  }

  return {
    success: true,
    approved,
    request: updatedRequest,
    adjustments: adjustments || null,
    message: approved
      ? '资源调配方案已批准，正在执行'
      : `资源调配方案已拒绝，原因：${rejectionReason}`,
  };
};

const getStatusName = (status: ApprovalStatus): string => {
  const names: Record<ApprovalStatus, string> = {
    [ApprovalStatus.PENDING]: '待审批',
    [ApprovalStatus.APPROVED]: '已批准',
    [ApprovalStatus.REJECTED]: '已拒绝',
    [ApprovalStatus.EXECUTED]: '已执行',
  };
  return names[status];
};

export const executeResourceAllocation = async (requestId: number) => {
  const request = await prisma.resourceAllocationRequest.findUnique({
    where: { id: requestId },
    include: { flight: true },
  });

  if (!request) {
    throw new AppError('资源调配请求不存在', 404);
  }

  if (request.approvalStatus !== ApprovalStatus.APPROVED) {
    throw new AppError('请求尚未批准，无法执行', 400);
  }

  await prisma.resourceAllocationRequest.update({
    where: { id: requestId },
    data: {
      approvalStatus: ApprovalStatus.EXECUTED,
      executedAt: new Date(),
    },
  });

  console.log(`[资源调配] 执行请求 #${requestId}：
    航班: ${request.flight.flightNumber}
    新增值机柜台: ${request.additionalCounters} 个
    新增保洁人员: ${request.additionalCleaners} 人
    新增工作人员: ${request.additionalStaff} 人
    预估费用: ¥${request.estimatedCost.toFixed(2)}
  `);

  return {
    success: true,
    executedAt: new Date(),
    actions: [
      `开放 ${request.additionalCounters} 个额外值机柜台`,
      `调配 ${request.additionalCleaners} 名保洁人员`,
      `增派 ${request.additionalStaff} 名工作人员`,
      `通知相关部门负责人`,
    ],
  };
};

export const getPendingRequests = async (
  department?: string,
  page: number = 1,
  pageSize: number = 20
) => {
  const where: any = { approvalStatus: ApprovalStatus.PENDING };

  if (department) {
    where.requester = { department };
  }

  const [requests, total] = await Promise.all([
    prisma.resourceAllocationRequest.findMany({
      where,
      include: {
        flight: {
          include: { airline: true, stand: true, gate: true },
        },
        requester: {
          select: { id: true, username: true, department: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.resourceAllocationRequest.count({ where }),
  ]);

  return {
    requests,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    awaitingApproval: total,
  };
};

export const getRequestHistory = async (
  flightId?: number,
  status?: ApprovalStatus,
  startDate?: Date,
  endDate?: Date,
  page: number = 1,
  pageSize: number = 20
) => {
  const where: any = {};

  if (flightId) where.flightId = flightId;
  if (status) where.approvalStatus = status;
  if (startDate && endDate) {
    where.createdAt = { gte: startDate, lte: endDate };
  }

  const [requests, total] = await Promise.all([
    prisma.resourceAllocationRequest.findMany({
      where,
      include: {
        flight: { include: { airline: true } },
        requester: { select: { id: true, username: true, department: true } },
        approver: { select: { id: true, username: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.resourceAllocationRequest.count({ where }),
  ]);

  const stats = {
    total,
    pending: requests.filter(r => r.approvalStatus === ApprovalStatus.PENDING).length,
    approved: requests.filter(r => r.approvalStatus === ApprovalStatus.APPROVED).length,
    rejected: requests.filter(r => r.approvalStatus === ApprovalStatus.REJECTED).length,
    executed: requests.filter(r => r.approvalStatus === ApprovalStatus.EXECUTED).length,
    totalCost: requests
      .filter(r => r.approvalStatus !== ApprovalStatus.REJECTED)
      .reduce((sum, r) => sum + r.estimatedCost, 0),
  };

  return {
    requests,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    stats,
  };
};

export const getResourceUtilization = async (date: Date) => {
  const startOfDay = dayjs(date).startOf('day').toDate();
  const endOfDay = dayjs(date).endOf('day').toDate();

  const executedRequests = await prisma.resourceAllocationRequest.findMany({
    where: {
      approvalStatus: ApprovalStatus.EXECUTED,
      executedAt: { gte: startOfDay, lte: endOfDay },
    },
    include: {
      flight: { include: { airline: true } },
    },
  });

  const stats = {
    totalRequests: executedRequests.length,
    totalCounters: executedRequests.reduce((sum, r) => sum + r.additionalCounters, 0),
    totalCleaners: executedRequests.reduce((sum, r) => sum + r.additionalCleaners, 0),
    totalStaff: executedRequests.reduce((sum, r) => sum + r.additionalStaff, 0),
    totalCost: executedRequests.reduce((sum, r) => sum + r.estimatedCost, 0),
    byReason: {} as Record<string, { count: number; cost: number }>,
  };

  for (const request of executedRequests) {
    const reason = request.delayReason;
    if (!stats.byReason[reason]) {
      stats.byReason[reason] = { count: 0, cost: 0 };
    }
    stats.byReason[reason].count += 1;
    stats.byReason[reason].cost += request.estimatedCost;
  }

  return {
    date,
    stats,
    details: executedRequests,
  };
};

export const handleFlightDelay = async (
  flightId: number,
  delayMinutes: number,
  reason: DelayReason,
  reporterId: number
) => {
  const flight = await prisma.flight.findUnique({
    where: { id: flightId },
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

  const resourcePlan = await generateResourcePlan(flightId, delayMinutes, reason);

  return {
    success: true,
    flightId,
    delayMinutes,
    reason: getDelayReasonName(reason),
    newSchedule: {
      departure: newDeparture,
      arrival: newArrival,
    },
    recommendedResources: resourcePlan,
    nextStep: delayMinutes >= 30
      ? {
          action: 'CREATE_REQUEST',
          message: '延误超过30分钟，建议创建资源调配请求',
          createRequestUrl: `/api/resource-allocation/create`,
          payload: { flightId, reporterId },
        }
      : {
          action: 'MONITOR',
          message: '延误不足30分钟，继续监控',
        },
  };
};
