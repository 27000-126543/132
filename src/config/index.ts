import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  wsPort: parseInt(process.env.WS_PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || 'default-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  baggageDelayThreshold: parseInt(process.env.BAGGAGE_DELAY_THRESHOLD_MINUTES || '10', 10),
  walkingTimeThreshold: parseInt(process.env.WALKING_TIME_THRESHOLD_MINUTES || '15', 10),
  minCrewRestHours: parseInt(process.env.MIN_CREW_REST_HOURS || '10', 10),
  maxFlightHoursPerDay: parseInt(process.env.MAX_FLIGHT_HOURS_PER_DAY || '8', 10),
  databaseUrl: process.env.DATABASE_URL,
};
