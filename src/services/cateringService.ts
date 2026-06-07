import { CateringStatus, CateringVehicle, Flight } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { notifyCateringAlert, createNotification } from './notificationService';
import { NotificationType, NotificationTarget } from '@prisma/client';
import dayjs from 'dayjs';

interface RoutePoint {
  x: number;
  y: number;
  name: string;
}

export const calculateOptimalRoute = (
  vehicle: { xCoordinate: number; yCoordinate: number },
  pickup: { x: number; y: number },
  delivery: { x: number; y: number }
): { route: RoutePoint[]; distance: number; estimatedMinutes: number } => {
  const route: RoutePoint[] = [
    { x: vehicle.xCoordinate, y: vehicle.yCoordinate, name: '车辆当前位置' },
    { x: pickup.x, y: pickup.y, name: '航食配餐中心' },
    { x: delivery.x, y: delivery.y, name: '航班机位' },
  ];

  const d1 = Math.sqrt(
    Math.pow(pickup.x - vehicle.xCoordinate, 2) +
    Math.pow(pickup.y - vehicle.yCoordinate, 2)
  );
  const d2 = Math.sqrt(
    Math.pow(delivery.x - pickup.x, 2) +
    Math.pow(delivery.y - pickup.y, 2)
  );
  const totalDistance = d1 + d2;
  const estimatedMinutes = Math.ceil(totalDistance / 200) + 15;

  return { route, distance: totalDistance, estimatedMinutes };
};

export const findOptimalVehicle = async (
  pickupX: number,
  pickupY: number,
  deliveryX: number,
  deliveryY: number,
  mealCount: number,
  excludeVehicleIds: number[] = []
): Promise<{ vehicle: CateringVehicle; route: any; estimatedMinutes: number } | null> => {
  const availableVehicles = await prisma.cateringVehicle.findMany({
    where: {
      isAvailable: true,
      capacity: { gte: mealCount },
      id: { notIn: excludeVehicleIds },
    },
  });

  if (availableVehicles.length === 0) return null;

  let bestOption = null;
  let minTime = Infinity;

  for (const vehicle of availableVehicles) {
    const route = calculateOptimalRoute(
      { xCoordinate: vehicle.xCoordinate, yCoordinate: vehicle.yCoordinate },
      { x: pickupX, y: pickupY },
      { x: deliveryX, y: deliveryY }
    );

    if (route.estimatedMinutes < minTime) {
      minTime = route.estimatedMinutes;
      bestOption = { vehicle, route, estimatedMinutes: route.estimatedMinutes };
    }
  }

  return bestOption;
};

export const createCateringOrder = async (data: {
  flightId: number;
  mealCount: number;
  specialMeals?: number;
  pickupLocation: string;
  pickupX: number;
  pickupY: number;
}) => {
  const flight = await prisma.flight.findUnique({
    where: { id: data.flightId },
    include: {
      stand: true,
      airline: true,
    },
  });

  if (!flight) {
    throw new AppError('航班不存在', 404);
  }

  if (!flight.stand) {
    throw new AppError('航班尚未分配机位，无法安排航食配送', 400);
  }

  const deliveryX = Math.floor(Math.random() * 1000) + 500;
  const deliveryY = Math.floor(Math.random() * 1000) + 500;

  const deliveryStartTime = dayjs(flight.scheduledDeparture).subtract(90, 'minute').toDate();

  const optimalOption = await findOptimalVehicle(
    data.pickupX,
    data.pickupY,
    deliveryX,
    deliveryY,
    data.mealCount
  );

  if (!optimalOption) {
    throw new AppError('无可用航食配送车辆', 404);
  }

  const { vehicle, route, estimatedMinutes } = optimalOption;

  await prisma.cateringVehicle.update({
    where: { id: vehicle.id },
    data: { isAvailable: false },
  });

  const order = await prisma.cateringOrder.create({
    data: {
      flightId: data.flightId,
      vehicleId: vehicle.id,
      mealCount: data.mealCount,
      specialMeals: data.specialMeals || 0,
      pickupLocation: data.pickupLocation,
      pickupX: data.pickupX,
      pickupY: data.pickupY,
      deliveryStartTime,
      estimatedDuration: estimatedMinutes,
      status: CateringStatus.PENDING,
      routeJson: JSON.stringify(route),
    },
    include: {
      vehicle: true,
      flight: {
        include: { airline: true, stand: true },
      },
    },
  });

  await prisma.cateringDelivery.create({
    data: {
      orderId: order.id,
      checkpoint: 'ORDER_CREATED',
      timestamp: new Date(),
      temp: vehicle.currentTemp,
      status: 'CONFIRMED',
      notes: '订单已创建，等待发车',
    },
  });

  return {
    success: true,
    order,
    route,
    estimatedArrival: dayjs(deliveryStartTime).add(estimatedMinutes, 'minute').toDate(),
    vehicle: {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      capacity: vehicle.capacity,
      currentTemp: vehicle.currentTemp,
    },
  };
};

export const recordTemperature = async (
  vehicleId: number,
  temperature: number,
  orderId?: number
) => {
  const vehicle = await prisma.cateringVehicle.findUnique({
    where: { id: vehicleId },
  });

  if (!vehicle) {
    throw new AppError('车辆不存在', 404);
  }

  const isAlert = temperature < vehicle.minTemp || temperature > vehicle.maxTemp;

  const log = await prisma.temperatureLog.create({
    data: {
      vehicleId,
      temp: temperature,
      isAlert,
    },
  });

  await prisma.cateringVehicle.update({
    where: { id: vehicleId },
    data: { currentTemp: temperature },
  });

  if (isAlert) {
    const activeOrder = await prisma.cateringOrder.findFirst({
      where: {
        vehicleId,
        status: { in: [CateringStatus.PENDING, CateringStatus.IN_TRANSIT] },
      },
      include: { flight: true },
    });

    if (activeOrder) {
      const message = temperature < vehicle.minTemp
        ? `航食车 ${vehicle.plateNumber} 温度过低：当前 ${temperature}°C，最低要求 ${vehicle.minTemp}°C`
        : `航食车 ${vehicle.plateNumber} 温度过高：当前 ${temperature}°C，最高要求 ${vehicle.maxTemp}°C`;

      await notifyCateringAlert(
        activeOrder.flightId,
        activeOrder.flight.flightNumber,
        vehicle.plateNumber,
        temperature,
        message
      );

      await prisma.cateringOrder.update({
        where: { id: activeOrder.id },
        data: {
          temperatureAlert: true,
          status: CateringStatus.TEMPERATURE_ALERT,
        },
      });

      await prisma.cateringDelivery.create({
        data: {
          orderId: activeOrder.id,
          checkpoint: 'TEMPERATURE_ALERT',
          timestamp: new Date(),
          temp: temperature,
          status: 'ALERT',
          notes: message,
        },
      });

      if (activeOrder.reassignAttempts < 3) {
        const reassigned = await reassignCateringVehicle(activeOrder.id);
        return {
          log,
          alert: true,
          message,
          reassigned,
        };
      }
    }

    return {
      log,
      alert: true,
      message: '温度异常告警已发送',
    };
  }

  if (orderId) {
    await prisma.cateringDelivery.create({
      data: {
        orderId,
        checkpoint: 'TEMPERATURE_CHECK',
        timestamp: new Date(),
        temp: temperature,
        status: 'NORMAL',
        notes: '温度正常',
      },
    });
  }

  return {
    log,
    alert: false,
    message: '温度记录正常',
  };
};

export const reassignCateringVehicle = async (orderId: number) => {
  const order = await prisma.cateringOrder.findUnique({
    where: { id: orderId },
    include: {
      vehicle: true,
      flight: { include: { stand: true, airline: true } },
    },
  });

  if (!order) {
    throw new AppError('订单不存在', 404);
  }

  if (order.vehicleId) {
    await prisma.cateringVehicle.update({
      where: { id: order.vehicleId },
      data: { isAvailable: true },
    });
  }

  const deliveryX = Math.floor(Math.random() * 1000) + 500;
  const deliveryY = Math.floor(Math.random() * 1000) + 500;

  const optimalOption = await findOptimalVehicle(
    order.pickupX,
    order.pickupY,
    deliveryX,
    deliveryY,
    order.mealCount,
    order.vehicleId ? [order.vehicleId] : []
  );

  if (!optimalOption) {
    await createNotification({
      type: NotificationType.CATERING_ALERT,
      target: NotificationTarget.CATERING,
      flightId: order.flightId,
      title: '航食配送紧急告警',
      message: `航班 ${order.flight.flightNumber} 航食配送无可用替换车辆，请紧急处理`,
      data: {
        orderId,
        flightNumber: order.flight.flightNumber,
        originalVehicle: order.vehicle?.plateNumber,
      },
    });

    return {
      success: false,
      message: '无可用替换车辆，已发送紧急告警',
    };
  }

  const { vehicle, route, estimatedMinutes } = optimalOption;

  await prisma.cateringVehicle.update({
    where: { id: vehicle.id },
    data: { isAvailable: false },
  });

  await prisma.cateringOrder.update({
    where: { id: orderId },
    data: {
      vehicleId: vehicle.id,
      status: CateringStatus.IN_TRANSIT,
      temperatureAlert: false,
      reassignAttempts: { increment: 1 },
      routeJson: JSON.stringify(route),
      estimatedDuration: estimatedMinutes,
    },
  });

  await prisma.cateringDelivery.create({
    data: {
      orderId,
      checkpoint: 'VEHICLE_REASSIGNED',
      timestamp: new Date(),
      temp: vehicle.currentTemp,
      status: 'REASSIGNED',
      notes: `已重新分配车辆 ${vehicle.plateNumber}`,
    },
  });

  return {
    success: true,
    message: '已成功重新分配配送车辆',
    newVehicle: {
      id: vehicle.id,
      plateNumber: vehicle.plateNumber,
      currentTemp: vehicle.currentTemp,
    },
    newRoute: route,
    newEstimatedArrival: dayjs(order.deliveryStartTime).add(estimatedMinutes, 'minute').toDate(),
  };
};

export const updateDeliveryStatus = async (
  orderId: number,
  checkpoint: string,
  status: string,
  notes?: string
) => {
  const order = await prisma.cateringOrder.findUnique({
    where: { id: orderId },
    include: { vehicle: true, flight: true },
  });

  if (!order) {
    throw new AppError('订单不存在', 404);
  }

  let orderStatus = order.status;
  if (checkpoint === 'VEHICLE_DEPARTED') {
    orderStatus = CateringStatus.IN_TRANSIT;
  } else if (checkpoint === 'DELIVERED') {
    orderStatus = CateringStatus.DELIVERED;
    if (order.vehicleId) {
      await prisma.cateringVehicle.update({
        where: { id: order.vehicleId },
        data: { isAvailable: true },
      });
    }
  }

  const delivery = await prisma.cateringDelivery.create({
    data: {
      orderId,
      checkpoint,
      timestamp: new Date(),
      temp: order.vehicle?.currentTemp || 0,
      status,
      notes,
    },
  });

  await prisma.cateringOrder.update({
    where: { id: orderId },
    data: { status: orderStatus },
  });

  return {
    delivery,
    orderStatus,
    progress: getDeliveryProgress(checkpoint),
  };
};

const getDeliveryProgress = (checkpoint: string): number => {
  const progressMap: Record<string, number> = {
    'ORDER_CREATED': 0,
    'VEHICLE_ASSIGNED': 10,
    'VEHICLE_DEPARTED': 25,
    'PICKUP_ARRIVED': 40,
    'LOADING_COMPLETE': 55,
    'EN_ROUTE': 70,
    'NEAR_DESTINATION': 85,
    'DELIVERED': 100,
  };
  return progressMap[checkpoint] || 0;
};

export const getCateringOrderDetails = async (orderId: number) => {
  const order = await prisma.cateringOrder.findUnique({
    where: { id: orderId },
    include: {
      vehicle: true,
      flight: {
        include: { airline: true, stand: true, gate: true },
      },
      deliveries: {
        orderBy: { timestamp: 'asc' },
      },
    },
  });

  if (!order) {
    throw new AppError('订单不存在', 404);
  }

  const lastCheckpoint = order.deliveries.length > 0
    ? order.deliveries[order.deliveries.length - 1]
    : null;

  return {
    order,
    currentProgress: lastCheckpoint ? getDeliveryProgress(lastCheckpoint.checkpoint) : 0,
    lastCheckpoint,
    estimatedArrival: dayjs(order.deliveryStartTime).add(order.estimatedDuration, 'minute').toDate(),
    isDelayed: dayjs().isAfter(dayjs(order.deliveryStartTime).add(order.estimatedDuration, 'minute')) && order.status !== CateringStatus.DELIVERED,
    temperatureStatus: {
      currentTemp: order.vehicle?.currentTemp,
      minTemp: order.vehicle?.minTemp,
      maxTemp: order.vehicle?.maxTemp,
      hasAlert: order.temperatureAlert,
    },
  };
};

export const getVehicleStatus = async (vehicleId: number) => {
  const vehicle = await prisma.cateringVehicle.findUnique({
    where: { id: vehicleId },
    include: {
      orders: {
        where: {
          status: { in: [CateringStatus.PENDING, CateringStatus.IN_TRANSIT, CateringStatus.TEMPERATURE_ALERT] },
        },
        include: { flight: { include: { airline: true } } },
      },
      temperatureLogs: {
        orderBy: { timestamp: 'desc' },
        take: 10,
      },
    },
  });

  if (!vehicle) {
    throw new AppError('车辆不存在', 404);
  }

  const avgTemp = vehicle.temperatureLogs.length > 0
    ? vehicle.temperatureLogs.reduce((sum, l) => sum + l.temp, 0) / vehicle.temperatureLogs.length
    : 0;

  return {
    vehicle,
    currentOrder: vehicle.orders[0] || null,
    temperatureStats: {
      current: vehicle.currentTemp,
      average: parseFloat(avgTemp.toFixed(1)),
      min: vehicle.minTemp,
      max: vehicle.maxTemp,
      alerts: vehicle.temperatureLogs.filter(l => l.isAlert).length,
    },
  };
};

export const getActiveOrders = async (page: number = 1, pageSize: number = 20) => {
  const [orders, total] = await Promise.all([
    prisma.cateringOrder.findMany({
      where: {
        status: { not: CateringStatus.DELIVERED },
      },
      include: {
        vehicle: true,
        flight: { include: { airline: true, stand: true } },
        deliveries: {
          orderBy: { timestamp: 'desc' },
          take: 1,
        },
      },
      orderBy: { deliveryStartTime: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.cateringOrder.count({
      where: { status: { not: CateringStatus.DELIVERED } },
    }),
  ]);

  return {
    orders: orders.map(order => ({
      ...order,
      currentProgress: order.deliveries.length > 0
        ? getDeliveryProgress(order.deliveries[0].checkpoint)
        : 0,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
};

export const monitorTemperatures = async () => {
  const activeVehicles = await prisma.cateringVehicle.findMany({
    where: { isAvailable: false },
    include: {
      orders: {
        where: { status: { in: [CateringStatus.IN_TRANSIT, CateringStatus.TEMPERATURE_ALERT] } },
        take: 1,
      },
    },
  });

  const alerts = [];

  for (const vehicle of activeVehicles) {
    if (vehicle.currentTemp < vehicle.minTemp || vehicle.currentTemp > vehicle.maxTemp) {
      const order = vehicle.orders[0];
      if (order && !order.temperatureAlert) {
        alerts.push({
          vehicleId: vehicle.id,
          plateNumber: vehicle.plateNumber,
          currentTemp: vehicle.currentTemp,
          orderId: order.id,
          flightId: order.flightId,
        });
      }
    }
  }

  return {
    checkedAt: new Date(),
    activeVehicles: activeVehicles.length,
    alertsGenerated: alerts.length,
    alerts,
  };
};
