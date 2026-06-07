-- CreateEnum
CREATE TYPE "FlightStatus" AS ENUM ('SCHEDULED', 'DELAYED', 'BOARDING', 'DEPARTED', 'ARRIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "StandType" AS ENUM ('REMOTE', 'CONTACT', 'WIDE_BODY', 'NARROW_BODY', 'CARGO');

-- CreateEnum
CREATE TYPE "BridgeType" AS ENUM ('SINGLE', 'DUAL', 'WIDE_BODY', 'NARROW_BODY');

-- CreateEnum
CREATE TYPE "AircraftType" AS ENUM ('B737', 'B747', 'B777', 'B787', 'A320', 'A330', 'A350', 'A380');

-- CreateEnum
CREATE TYPE "BaggageStatus" AS ENUM ('WAITING', 'IN_TRANSIT', 'ARRIVED', 'DELAYED', 'LOST', 'DELIVERED');

-- CreateEnum
CREATE TYPE "GateType" AS ENUM ('DOMESTIC', 'INTERNATIONAL', 'MIXED');

-- CreateEnum
CREATE TYPE "CateringStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'TEMPERATURE_ALERT');

-- CreateEnum
CREATE TYPE "CrewRole" AS ENUM ('CAPTAIN', 'FIRST_OFFICER', 'PURSER', 'FLIGHT_ATTENDANT', 'ENGINEER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('STAND_CHANGE', 'GATE_CHANGE', 'FLIGHT_DELAY', 'BAGGAGE_ALERT', 'CREW_ASSIGNMENT', 'CATERING_ALERT', 'RESOURCE_ALLOCATION');

-- CreateEnum
CREATE TYPE "NotificationTarget" AS ENUM ('GROUND_SERVICE', 'TOWER', 'AIRLINE_OPS', 'MAINTENANCE', 'CATERING', 'CREW');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXECUTED');

-- CreateEnum
CREATE TYPE "DelayReason" AS ENUM ('WEATHER', 'MECHANICAL', 'CREW_SHORTAGE', 'PASSENGER', 'AIR_TRAFFIC_CONTROL', 'CATERING', 'BAGGAGE', 'SECURITY', 'OTHER');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Airline" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "iataCode" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Airline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Flight" (
    "id" SERIAL NOT NULL,
    "flightNumber" TEXT NOT NULL,
    "airlineId" INTEGER NOT NULL,
    "aircraftType" "AircraftType" NOT NULL,
    "aircraftReg" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "scheduledArrival" TIMESTAMP(3) NOT NULL,
    "scheduledDeparture" TIMESTAMP(3) NOT NULL,
    "actualArrival" TIMESTAMP(3),
    "actualDeparture" TIMESTAMP(3),
    "status" "FlightStatus" NOT NULL DEFAULT 'SCHEDULED',
    "passengerCount" INTEGER NOT NULL,
    "isInternational" BOOLEAN NOT NULL DEFAULT false,
    "hasSpecialNeeds" BOOLEAN NOT NULL DEFAULT false,
    "specialNotes" TEXT,
    "delayReason" "DelayReason",
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "standId" INTEGER,
    "gateId" INTEGER,
    "dailyReportId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stand" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" "StandType" NOT NULL,
    "terminal" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "maxAircraftSize" "AircraftType" NOT NULL,
    "hasBridge" BOOLEAN NOT NULL DEFAULT true,
    "bridgeType" "BridgeType",
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "maintenanceDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandAircraftCompatibility" (
    "id" SERIAL NOT NULL,
    "standId" INTEGER NOT NULL,
    "aircraftType" "AircraftType" NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StandAircraftCompatibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StandAssignment" (
    "id" SERIAL NOT NULL,
    "flightId" INTEGER NOT NULL,
    "standId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isConflict" BOOLEAN NOT NULL DEFAULT false,
    "conflictDetails" TEXT,
    "alternativeStandId" INTEGER,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StandAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gate" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" "GateType" NOT NULL,
    "terminal" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "maxCapacity" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "xCoordinate" INTEGER NOT NULL,
    "yCoordinate" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Gate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GateChange" (
    "id" SERIAL NOT NULL,
    "flightId" INTEGER NOT NULL,
    "oldGateId" INTEGER NOT NULL,
    "newGateId" INTEGER NOT NULL,
    "walkingTimeMinutes" INTEGER NOT NULL,
    "needsShuttle" BOOLEAN NOT NULL DEFAULT false,
    "shuttleDispatched" BOOLEAN NOT NULL DEFAULT false,
    "shuttleId" INTEGER,
    "changeReason" TEXT,
    "notifiedPassengers" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GateChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaggageItem" (
    "id" SERIAL NOT NULL,
    "flightId" INTEGER NOT NULL,
    "bagTagNumber" TEXT NOT NULL,
    "passengerName" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "isTransfer" BOOLEAN NOT NULL DEFAULT false,
    "transferFlightId" INTEGER,
    "slotId" INTEGER,
    "status" "BaggageStatus" NOT NULL DEFAULT 'WAITING',
    "arrivalScanTime" TIMESTAMP(3),
    "deliveryTime" TIMESTAMP(3),
    "expectedTime" TIMESTAMP(3) NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "isAlertSent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaggageItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaggageSlot" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "terminal" TEXT NOT NULL,
    "carouselNumber" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentFlightId" INTEGER,
    "flightAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BaggageSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BaggageScan" (
    "id" SERIAL NOT NULL,
    "baggageId" INTEGER NOT NULL,
    "scanPoint" TEXT NOT NULL,
    "scanTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "location" TEXT NOT NULL,
    "scanResult" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BaggageScan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CateringVehicle" (
    "id" SERIAL NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "currentTemp" DOUBLE PRECISION NOT NULL,
    "minTemp" DOUBLE PRECISION NOT NULL,
    "maxTemp" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "lastMaintenance" TIMESTAMP(3),
    "currentLocation" TEXT NOT NULL,
    "xCoordinate" INTEGER NOT NULL,
    "yCoordinate" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CateringVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CateringOrder" (
    "id" SERIAL NOT NULL,
    "flightId" INTEGER NOT NULL,
    "vehicleId" INTEGER,
    "mealCount" INTEGER NOT NULL,
    "specialMeals" INTEGER NOT NULL DEFAULT 0,
    "pickupLocation" TEXT NOT NULL,
    "pickupX" INTEGER NOT NULL,
    "pickupY" INTEGER NOT NULL,
    "deliveryStartTime" TIMESTAMP(3) NOT NULL,
    "estimatedDuration" INTEGER NOT NULL,
    "status" "CateringStatus" NOT NULL DEFAULT 'PENDING',
    "routeJson" TEXT,
    "temperatureAlert" BOOLEAN NOT NULL DEFAULT false,
    "reassignAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CateringOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CateringDelivery" (
    "id" SERIAL NOT NULL,
    "orderId" INTEGER NOT NULL,
    "checkpoint" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "temp" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT,

    CONSTRAINT "CateringDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemperatureLog" (
    "id" SERIAL NOT NULL,
    "vehicleId" INTEGER NOT NULL,
    "temp" DOUBLE PRECISION NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isAlert" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "TemperatureLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewMember" (
    "id" SERIAL NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "CrewRole" NOT NULL,
    "qualifications" TEXT[],
    "baseAirport" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "lastFlightEnd" TIMESTAMP(3),
    "restHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "flightHoursToday" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrewMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewRestPeriod" (
    "id" SERIAL NOT NULL,
    "crewId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "duration" DOUBLE PRECISION NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrewRestPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrewAssignment" (
    "id" SERIAL NOT NULL,
    "flightId" INTEGER NOT NULL,
    "crewId" INTEGER NOT NULL,
    "role" "CrewRole" NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "hasConflict" BOOLEAN NOT NULL DEFAULT false,
    "conflictDetails" TEXT,
    "alternativeCrewId" INTEGER,
    "notified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrewAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAllocationRequest" (
    "id" SERIAL NOT NULL,
    "flightId" INTEGER NOT NULL,
    "delayReason" "DelayReason" NOT NULL,
    "additionalCounters" INTEGER NOT NULL DEFAULT 0,
    "additionalCleaners" INTEGER NOT NULL DEFAULT 0,
    "additionalStaff" INTEGER NOT NULL DEFAULT 0,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "justification" TEXT NOT NULL,
    "requesterId" INTEGER NOT NULL,
    "approverId" INTEGER,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceAllocationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "type" "NotificationType" NOT NULL,
    "target" "NotificationTarget" NOT NULL,
    "flightId" INTEGER,
    "userId" INTEGER,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "dataJson" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "sentViaWs" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" SERIAL NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "totalFlights" INTEGER NOT NULL,
    "onTimeFlights" INTEGER NOT NULL,
    "onTimeRate" DOUBLE PRECISION NOT NULL,
    "totalStandTurns" INTEGER NOT NULL,
    "standTurnoverRate" DOUBLE PRECISION NOT NULL,
    "totalBaggage" INTEGER NOT NULL,
    "lostBaggage" INTEGER NOT NULL,
    "baggageErrorRate" DOUBLE PRECISION NOT NULL,
    "delayMinutes" INTEGER NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShuttleBus" (
    "id" SERIAL NOT NULL,
    "plateNumber" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "currentLocation" TEXT NOT NULL,
    "driverName" TEXT,
    "driverPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShuttleBus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Airline_code_key" ON "Airline"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Stand_code_key" ON "Stand"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StandAircraftCompatibility_standId_aircraftType_key" ON "StandAircraftCompatibility"("standId", "aircraftType");

-- CreateIndex
CREATE UNIQUE INDEX "Gate_code_key" ON "Gate"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BaggageItem_bagTagNumber_key" ON "BaggageItem"("bagTagNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BaggageSlot_code_key" ON "BaggageSlot"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CateringVehicle_plateNumber_key" ON "CateringVehicle"("plateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CrewMember_employeeId_key" ON "CrewMember"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_reportDate_key" ON "DailyReport"("reportDate");

-- CreateIndex
CREATE UNIQUE INDEX "ShuttleBus_plateNumber_key" ON "ShuttleBus"("plateNumber");

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_airlineId_fkey" FOREIGN KEY ("airlineId") REFERENCES "Airline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_standId_fkey" FOREIGN KEY ("standId") REFERENCES "Stand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flight" ADD CONSTRAINT "Flight_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "DailyReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandAircraftCompatibility" ADD CONSTRAINT "StandAircraftCompatibility_standId_fkey" FOREIGN KEY ("standId") REFERENCES "Stand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandAssignment" ADD CONSTRAINT "StandAssignment_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StandAssignment" ADD CONSTRAINT "StandAssignment_standId_fkey" FOREIGN KEY ("standId") REFERENCES "Stand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateChange" ADD CONSTRAINT "GateChange_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateChange" ADD CONSTRAINT "GateChange_oldGateId_fkey" FOREIGN KEY ("oldGateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GateChange" ADD CONSTRAINT "GateChange_newGateId_fkey" FOREIGN KEY ("newGateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaggageItem" ADD CONSTRAINT "BaggageItem_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaggageItem" ADD CONSTRAINT "BaggageItem_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "BaggageSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BaggageScan" ADD CONSTRAINT "BaggageScan_baggageId_fkey" FOREIGN KEY ("baggageId") REFERENCES "BaggageItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CateringOrder" ADD CONSTRAINT "CateringOrder_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CateringOrder" ADD CONSTRAINT "CateringOrder_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "CateringVehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CateringDelivery" ADD CONSTRAINT "CateringDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "CateringOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemperatureLog" ADD CONSTRAINT "TemperatureLog_vehicleId_fkey" FOREIGN KEY ("vehicleId") REFERENCES "CateringVehicle"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewRestPeriod" ADD CONSTRAINT "CrewRestPeriod_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "CrewMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewAssignment" ADD CONSTRAINT "CrewAssignment_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrewAssignment" ADD CONSTRAINT "CrewAssignment_crewId_fkey" FOREIGN KEY ("crewId") REFERENCES "CrewMember"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAllocationRequest" ADD CONSTRAINT "ResourceAllocationRequest_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAllocationRequest" ADD CONSTRAINT "ResourceAllocationRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAllocationRequest" ADD CONSTRAINT "ResourceAllocationRequest_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "Flight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
