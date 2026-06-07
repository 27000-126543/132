import cron from 'node-cron';
import dayjs from 'dayjs';
import { generateDailyReport } from './reportService';
import { monitorBaggageDelays } from './baggageService';
import { monitorTemperatures } from './cateringService';
import { autoAdjustCrew } from './crewService';
import config from '../config';

export const initScheduler = () => {
  console.log('📅 初始化定时任务调度器...');

  const baggageMonitorTask = cron.schedule('*/5 * * * *', async () => {
    console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 执行行李延误监控...`);
    try {
      const result = await monitorBaggageDelays();
      console.log(`   监控完成，发现 ${result.length} 个延误行李`);
    } catch (error) {
      console.error(`   行李延误监控执行失败: ${(error as Error).message}`);
    }
  });
  console.log('✅ 行李延误监控任务已启动（每5分钟）');

  const temperatureMonitorTask = cron.schedule('*/2 * * * *', async () => {
    console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 执行餐车温度监控...`);
    try {
      const result = await monitorTemperatures();
      console.log(`   监控完成，发现 ${result.length} 个温度异常`);
    } catch (error) {
      console.error(`   餐车温度监控执行失败: ${(error as Error).message}`);
    }
  });
  console.log('✅ 餐车温度监控任务已启动（每2分钟）');

  const crewAdjustTask = cron.schedule('0 * * * *', async () => {
    console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 执行机组排班自动调整...`);
    try {
      const result = await autoAdjustCrew();
      console.log(`   调整完成，调整了 ${result.length} 个机组排班`);
    } catch (error) {
      console.error(`   机组排班调整执行失败: ${(error as Error).message}`);
    }
  });
  console.log('✅ 机组排班自动调整任务已启动（每小时）');

  const dailyReportTask = cron.schedule('0 1 * * *', async () => {
    console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 生成每日运行保障报表...`);
    try {
      const yesterday = dayjs().subtract(1, 'day').toDate();
      const result = await generateDailyReport(yesterday);
      console.log(`   报表生成完成，报表ID: ${result.id}`);
    } catch (error) {
      console.error(`   每日报表生成失败: ${(error as Error).message}`);
    }
  });
  console.log('✅ 每日报表生成任务已启动（每天凌晨1点）');

  const healthCheckTask = cron.schedule('*/30 * * * *', () => {
    console.log(`[${dayjs().format('YYYY-MM-DD HH:mm:ss')}] 定时任务调度器运行正常`);
  });
  console.log('✅ 调度器健康检查任务已启动（每30分钟）');

  console.log('✅ 所有定时任务初始化完成');

  return {
    baggageMonitorTask,
    temperatureMonitorTask,
    crewAdjustTask,
    dailyReportTask,
    healthCheckTask,
    stopAll: () => {
      baggageMonitorTask.stop();
      temperatureMonitorTask.stop();
      crewAdjustTask.stop();
      dailyReportTask.stop();
      healthCheckTask.stop();
      console.log('🛑 所有定时任务已停止');
    },
  };
};

export default {
  initScheduler,
};
