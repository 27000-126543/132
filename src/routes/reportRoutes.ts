import { Router, Request, Response, NextFunction } from 'express';
import {
  generateDailyReport,
  exportReportToCSV,
  getOnTimePerformance,
  getStandTurnoverAnalysis,
  getBaggagePerformance,
  getReports,
  getReportDetails,
  deleteReport,
} from '../services/reportService';
import { authenticate, requireRole } from '../middleware/auth';
import dayjs from 'dayjs';

const router = Router();

router.post('/generate/:date', authenticate, requireRole('SUPERVISOR'), async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await generateDailyReport(dayjs(req.params.date).toDate());
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/export/:reportId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await exportReportToCSV(parseInt(req.params.reportId));

    if (!result) {
      return res.status(404).json({
        success: false,
        message: '报表不存在',
      });
    }

    const filename = `report_${result.reportId}_${dayjs().format('YYYYMMDDHHmmss')}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    const BOM = '\uFEFF';
    res.send(BOM + result.csvContent);
  } catch (error) {
    next(error);
  }
});

router.get('/on-time-performance', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate, airline } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '请提供开始日期和结束日期',
      });
    }

    const result = await getOnTimePerformance(
      dayjs(startDate as string).toDate(),
      dayjs(endDate as string).toDate(),
      airline as string
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/stand-turnover', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate, terminal } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '请提供开始日期和结束日期',
      });
    }

    const result = await getStandTurnoverAnalysis(
      dayjs(startDate as string).toDate(),
      dayjs(endDate as string).toDate(),
      terminal as string
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/baggage-performance', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { startDate, endDate, airline } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: '请提供开始日期和结束日期',
      });
    }

    const result = await getBaggagePerformance(
      dayjs(startDate as string).toDate(),
      dayjs(endDate as string).toDate(),
      airline as string
    );

    res.status(200).json({
      success: true,
      data: result,
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
    const { startDate, endDate, airline, page, pageSize } = req.query;

    const result = await getReports(
      startDate ? dayjs(startDate as string).toDate() : undefined,
      endDate ? dayjs(endDate as string).toDate() : undefined,
      airline as string,
      parseInt(page as string) || 1,
      parseInt(pageSize as string) || 20
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.get('/:reportId', authenticate, async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await getReportDetails(parseInt(req.params.reportId));

    if (!result) {
      return res.status(404).json({
        success: false,
        message: '报表不存在',
      });
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/:reportId', authenticate, requireRole('ADMIN'), async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const result = await deleteReport(parseInt(req.params.reportId));
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
