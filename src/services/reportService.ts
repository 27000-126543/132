import { FlightStatus, BaggageStatus } from '@prisma/client';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import dayjs from 'dayjs';
import { createObjectCsvWriter } from 'csv-writer';
import * as fs from 'fs';
import * as path from 'path';

interface DailyStats {
  reportDate: Date;
  totalFlights: number;
  onTimeFlights: number;
  onTimeRate: number;
  totalStandTurns: number;
  standTurnoverRate: number;
  totalBaggage: number;
  lostBaggage: number;
  baggageErrorRate: number;
  delayMinutes: number;
}

export const generateDailyReport = async (date: Date) => {
  const startOfDay = dayjs(date).startOf('day').toDate();
  const endOfDay = dayjs(date).endOf('day').toDate();

  const flights = await prisma.flight.findMany({
    where: {
      OR: [
        { scheduledDeparture: { gte: startOfDay, lte: endOfDay } },
        { scheduledArrival: { gte: startOfDay, lte: endOfDay } },
      ],
    },
    include: {
      airline: true,
      stand: true,
      gate: true,
      baggageItems: true,
      standAssignments: true,
    },
  });

  const totalFlights = flights.length;
  const onTimeFlights = flights.filter(f => f.delayMinutes <= 15).length;
  const onTimeRate = totalFlights > 0 ? (onTimeFlights / totalFlights) * 100 : 0;

  const totalStandTurns = flights.filter(f => f.standId).length;
  const availableStands = await prisma.stand.count({ where: { isAvailable: true } });
  const standTurnoverRate = availableStands > 0 ? totalStandTurns / availableStands : 0;

  const baggageItems = await prisma.baggageItem.findMany({
    where: {
      createdAt: { gte: startOfDay, lte: endOfDay },
    },
  });

  const totalBaggage = baggageItems.length;
  const lostBaggage = baggageItems.filter(b => b.status === BaggageStatus.LOST).length;
  const baggageErrorRate = totalBaggage > 0 ? (lostBaggage / totalBaggage) * 1000000 : 0;

  const totalDelayMinutes = flights.reduce((sum, f) => sum + f.delayMinutes, 0);

  const airlineStats = new Map<number, {
    airlineName: string;
    iataCode: string;
    totalFlights: number;
    onTimeFlights: number;
    onTimeRate: number;
    delayMinutes: number;
    totalBaggage: number;
    lostBaggage: number;
  }>();

  for (const flight of flights) {
    const existing = airlineStats.get(flight.airlineId) || {
      airlineName: flight.airline.name,
      iataCode: flight.airline.iataCode,
      totalFlights: 0,
      onTimeFlights: 0,
      onTimeRate: 0,
      delayMinutes: 0,
      totalBaggage: 0,
      lostBaggage: 0,
    };

    existing.totalFlights += 1;
    if (flight.delayMinutes <= 15) existing.onTimeFlights += 1;
    existing.delayMinutes += flight.delayMinutes;
    existing.totalBaggage += flight.baggageItems.length;
    existing.lostBaggage += flight.baggageItems.filter(b => b.status === BaggageStatus.LOST).length;

    airlineStats.set(flight.airlineId, existing);
  }

  const airlineStatsArray = Array.from(airlineStats.values()).map(a => ({
    ...a,
    onTimeRate: a.totalFlights > 0 ? parseFloat(((a.onTimeFlights / a.totalFlights) * 100).toFixed(2)) : 0,
  }));

  const delayReasons = await prisma.flight.groupBy({
    by: ['delayReason'],
    where: {
      delayMinutes: { gt: 0 },
      scheduledDeparture: { gte: startOfDay, lte: endOfDay },
    },
    _count: { delayReason: true },
    _sum: { delayMinutes: true },
  });

  const standUtilization = await prisma.standAssignment.findMany({
    where: {
      startTime: { gte: startOfDay, lte: endOfDay },
      isActive: true,
    },
    include: { stand: true },
  });

  const standStats = new Map<number, { code: string; count: number; totalMinutes: number }>();
  for (const assignment of standUtilization) {
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

  const reportData: DailyStats = {
    reportDate: startOfDay,
    totalFlights,
    onTimeFlights,
    onTimeRate: parseFloat(onTimeRate.toFixed(2)),
    totalStandTurns,
    standTurnoverRate: parseFloat(standTurnoverRate.toFixed(2)),
    totalBaggage,
    lostBaggage,
    baggageErrorRate: parseFloat(baggageErrorRate.toFixed(2)),
    delayMinutes: totalDelayMinutes,
  };

  const existingReport = await prisma.dailyReport.findUnique({
    where: { reportDate: startOfDay },
  });

  let report;
  if (existingReport) {
    report = await prisma.dailyReport.update({
      where: { id: existingReport.id },
      data: reportData,
    });
  } else {
    report = await prisma.dailyReport.create({
      data: reportData,
    });
  }

  return {
    report,
    summary: {
      date: dayjs(date).format('YYYY-MM-DD'),
      flights: {
        total: totalFlights,
        onTime: onTimeFlights,
        delayed: totalFlights - onTimeFlights,
        onTimeRate: `${onTimeRate.toFixed(2)}%`,
        avgDelayMinutes: totalFlights > 0 ? Math.round(totalDelayMinutes / totalFlights) : 0,
      },
      stands: {
        totalTurns: totalStandTurns,
        availableStands,
        turnoverRate: `${standTurnoverRate.toFixed(2)}`,
        utilization: Array.from(standStats.values()).sort((a, b) => b.count - a.count),
      },
      baggage: {
        total: totalBaggage,
        lost: lostBaggage,
        errorRatePerMillion: baggageErrorRate.toFixed(2),
      },
    },
    byAirline: airlineStatsArray.sort((a, b) => b.totalFlights - a.totalFlights),
    delayReasons: delayReasons.map(r => ({
      reason: r.delayReason,
      count: r._count.delayReason,
      totalMinutes: r._sum.delayMinutes || 0,
    })).filter(r => r.reason !== null),
  };
};

export const getReports = async (
  startDate?: Date,
  endDate?: Date,
  airlineId?: number,
  page: number = 1,
  pageSize: number = 30
) => {
  const where: any = {};

  if (startDate && endDate) {
    where.reportDate = { gte: startDate, lte: endDate };
  }

  const [reports, total] = await Promise.all([
    prisma.dailyReport.findMany({
      where,
      orderBy: { reportDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.dailyReport.count({ where }),
  ]);

  const avgStats = {
    avgOnTimeRate: total > 0
      ? parseFloat((reports.reduce((sum, r) => sum + r.onTimeRate, 0) / total).toFixed(2))
      : 0,
    avgStandTurnover: total > 0
      ? parseFloat((reports.reduce((sum, r) => sum + r.standTurnoverRate, 0) / total).toFixed(2))
      : 0,
    avgBaggageErrorRate: total > 0
      ? parseFloat((reports.reduce((sum, r) => sum + r.baggageErrorRate, 0) / total).toFixed(2))
      : 0,
    totalFlights: reports.reduce((sum, r) => sum + r.totalFlights, 0),
    totalDelayMinutes: reports.reduce((sum, r) => sum + r.delayMinutes, 0),
  };

  return {
    reports,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    periodSummary: avgStats,
  };
};

export const exportReportToCSV = async (
  startDate: Date,
  endDate: Date,
  airlineId?: number,
  exportType: 'summary' | 'byAirline' | 'delayReasons' = 'summary'
): Promise<string> => {
  const reports = [];
  let currentDate = dayjs(startDate);
  const end = dayjs(endDate);

  while (currentDate.isBefore(end) || currentDate.isSame(end, 'day')) {
    const report = await generateDailyReport(currentDate.toDate());
    reports.push(report);
    currentDate = currentDate.add(1, 'day');
  }

  const exportDir = path.join(process.cwd(), 'exports');
  if (!fs.existsSync(exportDir)) {
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const fileName = `report_${exportType}_${dayjs(startDate).format('YYYYMMDD')}_${dayjs(endDate).format('YYYYMMDD')}.csv`;
  const filePath = path.join(exportDir, fileName);

  if (exportType === 'summary') {
    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'date', title: '日期' },
        { id: 'totalFlights', title: '总航班数' },
        { id: 'onTimeFlights', title: '准点航班数' },
        { id: 'onTimeRate', title: '准点率(%)' },
        { id: 'standTurnovers', title: '廊桥周转次数' },
        { id: 'standTurnoverRate', title: '廊桥周转率' },
        { id: 'totalBaggage', title: '行李总数' },
        { id: 'lostBaggage', title: '丢失行李数' },
        { id: 'baggageErrorRate', title: '行李差错率(百万分比)' },
        { id: 'totalDelayMinutes', title: '总延误分钟数' },
      ],
    });

    const records = reports.map(r => ({
      date: dayjs(r.report.reportDate).format('YYYY-MM-DD'),
      totalFlights: r.summary.flights.total,
      onTimeFlights: r.summary.flights.onTime,
      onTimeRate: r.summary.flights.onTimeRate,
      standTurnovers: r.summary.stands.totalTurns,
      standTurnoverRate: r.summary.stands.turnoverRate,
      totalBaggage: r.summary.baggage.total,
      lostBaggage: r.summary.baggage.lost,
      baggageErrorRate: r.summary.baggage.errorRatePerMillion,
      totalDelayMinutes: r.report.delayMinutes,
    }));

    await csvWriter.writeRecords(records);
  } else if (exportType === 'byAirline') {
    const allAirlineData: any[] = [];
    for (const report of reports) {
      for (const airline of report.byAirline) {
        if (!airlineId || airline.iataCode === airlineId.toString()) {
          allAirlineData.push({
            date: dayjs(report.report.reportDate).format('YYYY-MM-DD'),
            airlineName: airline.airlineName,
            iataCode: airline.iataCode,
            totalFlights: airline.totalFlights,
            onTimeFlights: airline.onTimeFlights,
            onTimeRate: airline.onTimeRate + '%',
            totalDelayMinutes: airline.delayMinutes,
            totalBaggage: airline.totalBaggage,
            lostBaggage: airline.lostBaggage,
          });
        }
      }
    }

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'date', title: '日期' },
        { id: 'airlineName', title: '航空公司' },
        { id: 'iataCode', title: 'IATA代码' },
        { id: 'totalFlights', title: '航班数' },
        { id: 'onTimeFlights', title: '准点航班数' },
        { id: 'onTimeRate', title: '准点率' },
        { id: 'totalDelayMinutes', title: '延误分钟数' },
        { id: 'totalBaggage', title: '行李数' },
        { id: 'lostBaggage', title: '丢失行李数' },
      ],
    });

    await csvWriter.writeRecords(allAirlineData);
  } else if (exportType === 'delayReasons') {
    const allDelayData: any[] = [];
    for (const report of reports) {
      for (const reason of report.delayReasons) {
        allDelayData.push({
          date: dayjs(report.report.reportDate).format('YYYY-MM-DD'),
          reason: reason.reason,
          flightCount: reason.count,
          totalDelayMinutes: reason.totalMinutes,
          avgDelayPerFlight: Math.round(reason.totalMinutes / reason.count),
        });
      }
    }

    const csvWriter = createObjectCsvWriter({
      path: filePath,
      header: [
        { id: 'date', title: '日期' },
        { id: 'reason', title: '延误原因' },
        { id: 'flightCount', title: '影响航班数' },
        { id: 'totalDelayMinutes', title: '总延误分钟' },
        { id: 'avgDelayPerFlight', title: '平均延误分钟' },
      ],
    });

    await csvWriter.writeRecords(allDelayData);
  }

  return filePath;
};

export const getOnTimePerformance = async (
  startDate: Date,
  endDate: Date,
  airlineId?: number
) => {
  const where: any = {
    scheduledDeparture: { gte: startDate, lte: endDate },
  };
  if (airlineId) where.airlineId = airlineId;

  const flights = await prisma.flight.findMany({
    where,
    include: { airline: true },
  });

  const total = flights.length;
  const onTime = flights.filter(f => f.delayMinutes <= 15).length;
  const minorDelay = flights.filter(f => f.delayMinutes > 15 && f.delayMinutes <= 60).length;
  const majorDelay = flights.filter(f => f.delayMinutes > 60 && f.delayMinutes <= 180).length;
  const severeDelay = flights.filter(f => f.delayMinutes > 180).length;

  const byHour: Record<number, { total: number; onTime: number }> = {};
  for (let i = 0; i < 24; i++) {
    byHour[i] = { total: 0, onTime: 0 };
  }

  for (const flight of flights) {
    const hour = dayjs(flight.scheduledDeparture).hour();
    byHour[hour].total += 1;
    if (flight.delayMinutes <= 15) byHour[hour].onTime += 1;
  }

  return {
    period: { startDate, endDate },
    summary: {
      totalFlights: total,
      onTime,
      onTimeRate: total > 0 ? parseFloat(((onTime / total) * 100).toFixed(2)) : 0,
      minorDelay,
      majorDelay,
      severeDelay,
      averageDelay: total > 0
        ? parseFloat((flights.reduce((sum, f) => sum + f.delayMinutes, 0) / total).toFixed(1))
        : 0,
    },
    byHour: Object.entries(byHour).map(([hour, data]) => ({
      hour: parseInt(hour),
      total: data.total,
      onTime: data.onTime,
      onTimeRate: data.total > 0 ? parseFloat(((data.onTime / data.total) * 100).toFixed(2)) : 0,
    })),
  };
};

export const getStandTurnoverAnalysis = async (
  startDate: Date,
  endDate: Date
) => {
  const assignments = await prisma.standAssignment.findMany({
    where: {
      startTime: { gte: startDate, lte: endDate },
      isActive: true,
    },
    include: { stand: true, flight: { include: { airline: true } } },
  });

  const standStats = new Map<number, {
    code: string;
    type: string;
    totalTurns: number;
    totalMinutes: number;
    avgTurnTime: number;
    flights: any[];
  }>();

  for (const assignment of assignments) {
    const duration = dayjs(assignment.endTime).diff(dayjs(assignment.startTime), 'minute');
    const existing = standStats.get(assignment.standId) || {
      code: assignment.stand.code,
      type: assignment.stand.type,
      totalTurns: 0,
      totalMinutes: 0,
      avgTurnTime: 0,
      flights: [],
    };

    existing.totalTurns += 1;
    existing.totalMinutes += duration;
    existing.flights.push({
      flightNumber: assignment.flight.flightNumber,
      airline: assignment.flight.airline.name,
      duration,
    });

    standStats.set(assignment.standId, existing);
  }

  const standStatsArray = Array.from(standStats.values()).map(s => ({
    ...s,
    avgTurnTime: s.totalTurns > 0 ? Math.round(s.totalMinutes / s.totalTurns) : 0,
    utilizationRate: parseFloat(((s.totalMinutes / (dayjs(endDate).diff(dayjs(startDate), 'minute') + 1440)) * 100).toFixed(2)),
  })).sort((a, b) => b.totalTurns - a.totalTurns);

  const totalDays = dayjs(endDate).diff(dayjs(startDate), 'day') + 1;
  const totalStands = await prisma.stand.count({ where: { isAvailable: true } });

  return {
    period: { startDate, endDate, totalDays },
    summary: {
      totalStandTurns: assignments.length,
      totalStands,
      avgTurnsPerStand: parseFloat((assignments.length / totalStands).toFixed(2)),
      avgTurnTime: assignments.length > 0
        ? Math.round(assignments.reduce((sum, a) => sum + dayjs(a.endTime).diff(dayjs(a.startTime), 'minute'), 0) / assignments.length)
        : 0,
    },
    byStand: standStatsArray,
  };
};

export const getBaggagePerformance = async (
  startDate: Date,
  endDate: Date,
  airlineId?: number
) => {
  const where: any = {
    createdAt: { gte: startDate, lte: endDate },
  };

  if (airlineId) {
    where.flight = { airlineId };
  }

  const baggageItems = await prisma.baggageItem.findMany({
    where,
    include: {
      flight: { include: { airline: true } },
      scans: true,
    },
  });

  const statusBreakdown = {
    waiting: baggageItems.filter(b => b.status === BaggageStatus.WAITING).length,
    inTransit: baggageItems.filter(b => b.status === BaggageStatus.IN_TRANSIT).length,
    arrived: baggageItems.filter(b => b.status === BaggageStatus.ARRIVED).length,
    delayed: baggageItems.filter(b => b.status === BaggageStatus.DELAYED).length,
    lost: baggageItems.filter(b => b.status === BaggageStatus.LOST).length,
    delivered: baggageItems.filter(b => b.status === BaggageStatus.DELIVERED).length,
  };

  const avgDeliveryTime = baggageItems
    .filter(b => b.arrivalScanTime)
    .map(b => dayjs(b.arrivalScanTime!).diff(dayjs(b.expectedTime), 'minute'))
    .filter(t => t > 0);

  const delayDistribution = {
    '0-10min': baggageItems.filter(b => b.delayMinutes > 0 && b.delayMinutes <= 10).length,
    '10-30min': baggageItems.filter(b => b.delayMinutes > 10 && b.delayMinutes <= 30).length,
    '30-60min': baggageItems.filter(b => b.delayMinutes > 30 && b.delayMinutes <= 60).length,
    '60min+': baggageItems.filter(b => b.delayMinutes > 60).length,
  };

  return {
    period: { startDate, endDate },
    summary: {
      totalBaggage: baggageItems.length,
      delivered: statusBreakdown.delivered,
      inProgress: statusBreakdown.waiting + statusBreakdown.inTransit + statusBreakdown.arrived,
      delayed: statusBreakdown.delayed,
      lost: statusBreakdown.lost,
      errorRatePerMillion: baggageItems.length > 0
        ? parseFloat(((statusBreakdown.lost / baggageItems.length) * 1000000).toFixed(2))
        : 0,
      avgDelayMinutes: avgDeliveryTime.length > 0
        ? parseFloat((avgDeliveryTime.reduce((a, b) => a + b, 0) / avgDeliveryTime.length).toFixed(1))
        : 0,
    },
    statusBreakdown,
    delayDistribution,
    delayedItems: baggageItems
      .filter(b => b.delayMinutes > 10)
      .sort((a, b) => b.delayMinutes - a.delayMinutes)
      .slice(0, 20)
      .map(b => ({
        bagTagNumber: b.bagTagNumber,
        passengerName: b.passengerName,
        flightNumber: b.flight.flightNumber,
        delayMinutes: b.delayMinutes,
        status: b.status,
      })),
  };
};

export const getDelayAnalysis = async (
  startDate: Date,
  endDate: Date,
  airlineId?: number
) => {
  const where: any = {
    scheduledDeparture: { gte: startDate, lte: endDate },
    delayMinutes: { gt: 0 },
  };
  if (airlineId) where.airlineId = airlineId;

  const delayedFlights = await prisma.flight.findMany({
    where,
    include: { airline: true },
  });

  const reasonStats = await prisma.flight.groupBy({
    by: ['delayReason'],
    where,
    _count: { delayReason: true },
    _sum: { delayMinutes: true },
    _avg: { delayMinutes: true },
  });

  const byDayOfWeek: Record<number, { count: number; totalMinutes: number }> = {};
  for (let i = 0; i < 7; i++) {
    byDayOfWeek[i] = { count: 0, totalMinutes: 0 };
  }

  for (const flight of delayedFlights) {
    const dow = dayjs(flight.scheduledDeparture).day();
    byDayOfWeek[dow].count += 1;
    byDayOfWeek[dow].totalMinutes += flight.delayMinutes;
  }

  const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  return {
    period: { startDate, endDate },
    summary: {
      totalDelayedFlights: delayedFlights.length,
      totalDelayMinutes: delayedFlights.reduce((sum, f) => sum + f.delayMinutes, 0),
      avgDelayMinutes: delayedFlights.length > 0
        ? parseFloat((delayedFlights.reduce((sum, f) => sum + f.delayMinutes, 0) / delayedFlights.length).toFixed(1))
        : 0,
    },
    byReason: reasonStats
      .filter(r => r.delayReason !== null)
      .map(r => ({
        reason: r.delayReason,
        count: r._count.delayReason,
        percentage: delayedFlights.length > 0
          ? parseFloat(((r._count.delayReason / delayedFlights.length) * 100).toFixed(2))
          : 0,
        totalMinutes: r._sum.delayMinutes || 0,
        avgMinutes: parseFloat((r._avg.delayMinutes || 0).toFixed(1)),
      }))
      .sort((a, b) => b.count - a.count),
    byDayOfWeek: Object.entries(byDayOfWeek).map(([dow, data]) => ({
      day: dayNames[parseInt(dow)],
      dayOfWeek: parseInt(dow),
      count: data.count,
      totalMinutes: data.totalMinutes,
      avgMinutes: data.count > 0 ? Math.round(data.totalMinutes / data.count) : 0,
    })),
  };
};
