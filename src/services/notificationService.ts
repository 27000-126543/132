import { NotificationType, NotificationTarget, Flight } from '@prisma/client';
import prisma from '../lib/prisma';
import { WebSocketServer } from 'ws';
import { config } from '../config';

let wss: WebSocketServer | null = null;

export const initWebSocket = () => {
  wss = new WebSocketServer({ port: config.wsPort });
  console.log(`WebSocket server running on port ${config.wsPort}`);

  wss.on('connection', (ws) => {
    console.log('New client connected to WebSocket');
    ws.on('close', () => {
      console.log('Client disconnected from WebSocket');
    });
  });

  return wss;
};

export const broadcastMessage = (message: any) => {
  if (!wss) return;
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(data);
    }
  });
};

interface CreateNotificationParams {
  type: NotificationType;
  target: NotificationTarget;
  flightId?: number;
  userId?: number;
  title: string;
  message: string;
  data?: any;
}

export const createNotification = async (params: CreateNotificationParams) => {
  const { type, target, flightId, userId, title, message, data } = params;

  const notification = await prisma.notification.create({
    data: {
      type,
      target,
      flightId,
      userId,
      title,
      message,
      dataJson: data ? JSON.stringify(data) : null,
    },
  });

  broadcastMessage({
    type: 'notification',
    data: {
      ...notification,
      data: data,
    },
  });

  await prisma.notification.update({
    where: { id: notification.id },
    data: { sentViaWs: true },
  });

  console.log(`[${target}] ${title}: ${message}`);

  return notification;
};

export const notifyStandChange = async (
  flight: Flight,
  oldStandCode: string | null,
  newStandCode: string,
  reason?: string
) => {
  const message = oldStandCode
    ? `航班 ${flight.flightNumber} 机位变更：${oldStandCode} → ${newStandCode}${reason ? `，原因：${reason}` : ''}`
    : `航班 ${flight.flightNumber} 分配机位：${newStandCode}`;

  await createNotification({
    type: NotificationType.STAND_CHANGE,
    target: NotificationTarget.GROUND_SERVICE,
    flightId: flight.id,
    title: '机位变更通知',
    message,
    data: {
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      oldStandCode,
      newStandCode,
      reason,
    },
  });

  await createNotification({
    type: NotificationType.STAND_CHANGE,
    target: NotificationTarget.TOWER,
    flightId: flight.id,
    title: '机位变更通知',
    message,
    data: {
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      oldStandCode,
      newStandCode,
      reason,
    },
  });

  await createNotification({
    type: NotificationType.STAND_CHANGE,
    target: NotificationTarget.AIRLINE_OPS,
    flightId: flight.id,
    title: '机位变更通知',
    message,
    data: {
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      oldStandCode,
      newStandCode,
      reason,
    },
  });
};

export const notifyGateChange = async (
  flight: Flight,
  oldGateCode: string,
  newGateCode: string,
  walkingTimeMinutes: number,
  needsShuttle: boolean
) => {
  const shuttleInfo = needsShuttle ? '，已自动调度摆渡车' : '';
  const message = `航班 ${flight.flightNumber} 登机口变更：${oldGateCode} → ${newGateCode}，步行时间约 ${walkingTimeMinutes} 分钟${shuttleInfo}`;

  await createNotification({
    type: NotificationType.GATE_CHANGE,
    target: NotificationTarget.GROUND_SERVICE,
    flightId: flight.id,
    title: '登机口变更通知',
    message,
    data: {
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      oldGateCode,
      newGateCode,
      walkingTimeMinutes,
      needsShuttle,
    },
  });

  await createNotification({
    type: NotificationType.GATE_CHANGE,
    target: NotificationTarget.AIRLINE_OPS,
    flightId: flight.id,
    title: '登机口变更通知',
    message,
    data: {
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      oldGateCode,
      newGateCode,
      walkingTimeMinutes,
      needsShuttle,
    },
  });
};

export const notifyDelay = async (
  flight: Flight,
  delayMinutes: number,
  reason: string
) => {
  const message = `航班 ${flight.flightNumber} 延误 ${delayMinutes} 分钟，原因：${reason}`;

  await createNotification({
    type: NotificationType.FLIGHT_DELAY,
    target: NotificationTarget.GROUND_SERVICE,
    flightId: flight.id,
    title: '航班延误通知',
    message,
    data: {
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      delayMinutes,
      reason,
    },
  });

  await createNotification({
    type: NotificationType.FLIGHT_DELAY,
    target: NotificationTarget.TOWER,
    flightId: flight.id,
    title: '航班延误通知',
    message,
    data: {
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      delayMinutes,
      reason,
    },
  });

  await createNotification({
    type: NotificationType.FLIGHT_DELAY,
    target: NotificationTarget.AIRLINE_OPS,
    flightId: flight.id,
    title: '航班延误通知',
    message,
    data: {
      flightId: flight.id,
      flightNumber: flight.flightNumber,
      delayMinutes,
      reason,
    },
  });
};

export const notifyBaggageAlert = async (
  flightId: number,
  flightNumber: string,
  bagTagNumber: string,
  delayMinutes: number
) => {
  const message = `航班 ${flightNumber} 行李 ${bagTagNumber} 延误 ${delayMinutes} 分钟，请地服关注处理`;

  await createNotification({
    type: NotificationType.BAGGAGE_ALERT,
    target: NotificationTarget.GROUND_SERVICE,
    flightId,
    title: '行李延误预警',
    message,
    data: {
      flightId,
      flightNumber,
      bagTagNumber,
      delayMinutes,
    },
  });
};

export const notifyCateringAlert = async (
  flightId: number,
  flightNumber: string,
  plateNumber: string,
  currentTemp: number,
  message: string
) => {
  await createNotification({
    type: NotificationType.CATERING_ALERT,
    target: NotificationTarget.CATERING,
    flightId,
    title: '航食温度告警',
    message,
    data: {
      flightId,
      flightNumber,
      plateNumber,
      currentTemp,
    },
  });
};

export const notifyCrewAssignment = async (
  crewName: string,
  flightNumber: string,
  role: string,
  hasConflict: boolean = false
) => {
  const title = hasConflict ? '机组排班冲突通知' : '机组排班通知';
  const message = hasConflict
    ? `机组 ${crewName} 与航班 ${flightNumber} ${role} 任务存在冲突，已自动调整`
    : `机组 ${crewName} 已分配航班 ${flightNumber} ${role} 任务`;

  await createNotification({
    type: NotificationType.CREW_ASSIGNMENT,
    target: NotificationTarget.CREW,
    title,
    message,
    data: {
      crewName,
      flightNumber,
      role,
      hasConflict,
    },
  });
};

export const notifyResourceAllocation = async (
  flightId: number,
  flightNumber: string,
  additionalCounters: number,
  additionalCleaners: number,
  status: string
) => {
  const message = `航班 ${flightNumber} 资源调配方案${status}：新增值机柜台 ${additionalCounters} 个，保洁人员 ${additionalCleaners} 人`;

  await createNotification({
    type: NotificationType.RESOURCE_ALLOCATION,
    target: NotificationTarget.GROUND_SERVICE,
    flightId,
    title: '资源调配通知',
    message,
    data: {
      flightId,
      flightNumber,
      additionalCounters,
      additionalCleaners,
      status,
    },
  });
};

export const getNotifications = async (
  target?: NotificationTarget,
  page: number = 1,
  pageSize: number = 20
) => {
  const where = target ? { target } : {};
  const [notifications, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        flight: {
          select: {
            flightNumber: true,
            airline: { select: { name: true } },
          },
        },
      },
    }),
    prisma.notification.count({ where }),
  ]);

  return {
    notifications,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};

export const markNotificationRead = async (id: number) => {
  return prisma.notification.update({
    where: { id },
    data: { isRead: true, readAt: new Date() },
  });
};
