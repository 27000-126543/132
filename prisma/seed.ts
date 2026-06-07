import { PrismaClient, UserRole, Department, StandType, BridgeType, GateType, BaggageSlotStatus, CateringVehicleStatus, CrewRole, CrewStatus, ResourceType } from '@prisma/client';
import bcrypt from 'bcrypt';
import dayjs from 'dayjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 开始填充种子数据...\n');

  console.log('👤 创建用户账户...');
  const passwordHash = await bcrypt.hash('password123', 10);

  const users = await prisma.user.createMany({
    data: [
      { username: 'admin', passwordHash, fullName: '系统管理员', email: 'admin@airport.com', phone: '13800138000', role: UserRole.ADMIN, department: Department.IT, isActive: true },
      { username: 'supervisor', passwordHash, fullName: '值班主任', email: 'supervisor@airport.com', phone: '13800138001', role: UserRole.SUPERVISOR, department: Department.OPERATIONS, isActive: true },
      { username: 'ground_service', passwordHash, fullName: '地服人员', email: 'ground@airport.com', phone: '13800138002', role: UserRole.USER, department: Department.GROUND_SERVICE, isActive: true },
      { username: 'tower', passwordHash, fullName: '塔台管制员', email: 'tower@airport.com', phone: '13800138003', role: UserRole.USER, department: Department.TOWER, isActive: true },
      { username: 'baggage_agent', passwordHash, fullName: '行李分拣员', email: 'baggage@airport.com', phone: '13800138004', role: UserRole.USER, department: Department.BAGGAGE, isActive: true },
      { username: 'catering_agent', passwordHash, fullName: '航食调度员', email: 'catering@airport.com', phone: '13800138005', role: UserRole.USER, department: Department.CATERING, isActive: true },
      { username: 'crew_agent', passwordHash, fullName: '机组调度员', email: 'crew@airport.com', phone: '13800138006', role: UserRole.USER, department: Department.CREW_SCHEDULING, isActive: true },
      { username: 'airline_ops', passwordHash, fullName: '航司运控', email: 'ops@airchina.com', phone: '13800138007', role: UserRole.USER, department: Department.AIRLINE_OPS, isActive: true },
    ],
    skipDuplicates: true,
  });
  console.log(`✅ 创建了 ${users.count} 个用户账户\n`);

  console.log('✈️ 创建停机位...');
  const stands = await prisma.stand.createMany({
    data: [
      { standNumber: 'T1-101', terminal: 'T1', standType: StandType.REMOTE, bridgeType: BridgeType.NONE, maxAircraftType: 'B737', xCoordinate: 10.5, yCoordinate: 25.3, distanceToBaggage: 800, currentStatus: 'AVAILABLE', isActive: true },
      { standNumber: 'T1-102', terminal: 'T1', standType: StandType.CONTACT, bridgeType: BridgeType.SINGLE, maxAircraftType: 'B737', xCoordinate: 15.2, yCoordinate: 30.1, distanceToBaggage: 300, currentStatus: 'AVAILABLE', isActive: true },
      { standNumber: 'T1-103', terminal: 'T1', standType: StandType.CONTACT, bridgeType: BridgeType.DUAL, maxAircraftType: 'A330', xCoordinate: 20.8, yCoordinate: 35.7, distanceToBaggage: 250, currentStatus: 'AVAILABLE', isActive: true },
      { standNumber: 'T1-104', terminal: 'T1', standType: StandType.CONTACT, bridgeType: BridgeType.SINGLE, maxAircraftType: 'B737', xCoordinate: 25.3, yCoordinate: 40.2, distanceToBaggage: 280, currentStatus: 'AVAILABLE', isActive: true },
      { standNumber: 'T1-105', terminal: 'T1', standType: StandType.REMOTE, bridgeType: BridgeType.NONE, maxAircraftType: 'A380', xCoordinate: 30.1, yCoordinate: 45.8, distanceToBaggage: 1200, currentStatus: 'AVAILABLE', isActive: true },
      { standNumber: 'T2-201', terminal: 'T2', standType: StandType.CONTACT, bridgeType: BridgeType.DUAL, maxAircraftType: 'B777', xCoordinate: 50.2, yCoordinate: 25.3, distanceToBaggage: 220, currentStatus: 'AVAILABLE', isActive: true },
      { standNumber: 'T2-202', terminal: 'T2', standType: StandType.CONTACT, bridgeType: BridgeType.SINGLE, maxAircraftType: 'A320', xCoordinate: 55.8, yCoordinate: 30.7, distanceToBaggage: 260, currentStatus: 'AVAILABLE', isActive: true },
      { standNumber: 'T2-203', terminal: 'T2', standType: StandType.REMOTE, bridgeType: BridgeType.NONE, maxAircraftType: 'B787', xCoordinate: 60.3, yCoordinate: 35.2, distanceToBaggage: 950, currentStatus: 'AVAILABLE', isActive: true },
      { standNumber: 'T2-204', terminal: 'T2', standType: StandType.CONTACT, bridgeType: BridgeType.TRIPLE, maxAircraftType: 'A380', xCoordinate: 65.1, yCoordinate: 40.5, distanceToBaggage: 180, currentStatus: 'AVAILABLE', isActive: true },
      { standNumber: 'T2-205', terminal: 'T2', standType: StandType.CONTACT, bridgeType: BridgeType.SINGLE, maxAircraftType: 'B737', xCoordinate: 70.7, yCoordinate: 45.3, distanceToBaggage: 290, currentStatus: 'AVAILABLE', isActive: true },
    ],
    skipDuplicates: true,
  });
  console.log(`✅ 创建了 ${stands.count} 个停机位\n`);

  console.log('🚪 创建登机口...');
  const gates = await prisma.gate.createMany({
    data: [
      { gateNumber: 'G101', terminal: 'T1', gateType: GateType.DOMESTIC, xCoordinate: 100, yCoordinate: 150, maxCapacity: 200, currentStatus: 'AVAILABLE', isActive: true },
      { gateNumber: 'G102', terminal: 'T1', gateType: GateType.DOMESTIC, xCoordinate: 130, yCoordinate: 160, maxCapacity: 180, currentStatus: 'AVAILABLE', isActive: true },
      { gateNumber: 'G103', terminal: 'T1', gateType: GateType.INTERNATIONAL, xCoordinate: 160, yCoordinate: 170, maxCapacity: 250, currentStatus: 'AVAILABLE', isActive: true },
      { gateNumber: 'G104', terminal: 'T1', gateType: GateType.DOMESTIC, xCoordinate: 190, yCoordinate: 180, maxCapacity: 200, currentStatus: 'AVAILABLE', isActive: true },
      { gateNumber: 'G105', terminal: 'T1', gateType: GateType.INTERNATIONAL, xCoordinate: 220, yCoordinate: 190, maxCapacity: 300, currentStatus: 'AVAILABLE', isActive: true },
      { gateNumber: 'G201', terminal: 'T2', gateType: GateType.DOMESTIC, xCoordinate: 300, yCoordinate: 150, maxCapacity: 220, currentStatus: 'AVAILABLE', isActive: true },
      { gateNumber: 'G202', terminal: 'T2', gateType: GateType.INTERNATIONAL, xCoordinate: 330, yCoordinate: 160, maxCapacity: 280, currentStatus: 'AVAILABLE', isActive: true },
      { gateNumber: 'G203', terminal: 'T2', gateType: GateType.DOMESTIC, xCoordinate: 360, yCoordinate: 170, maxCapacity: 180, currentStatus: 'AVAILABLE', isActive: true },
      { gateNumber: 'G204', terminal: 'T2', gateType: GateType.INTERNATIONAL, xCoordinate: 390, yCoordinate: 180, maxCapacity: 320, currentStatus: 'AVAILABLE', isActive: true },
      { gateNumber: 'G205', terminal: 'T2', gateType: GateType.DOMESTIC, xCoordinate: 420, yCoordinate: 190, maxCapacity: 200, currentStatus: 'AVAILABLE', isActive: true },
    ],
    skipDuplicates: true,
  });
  console.log(`✅ 创建了 ${gates.count} 个登机口\n`);

  console.log('🧳 创建行李分拣槽位...');
  const baggageSlots = await prisma.baggageSlot.createMany({
    data: [
      { slotCode: 'B1-01', terminal: 'T1', carouselNumber: 1, status: BaggageSlotStatus.AVAILABLE, maxBags: 150 },
      { slotCode: 'B1-02', terminal: 'T1', carouselNumber: 1, status: BaggageSlotStatus.AVAILABLE, maxBags: 150 },
      { slotCode: 'B1-03', terminal: 'T1', carouselNumber: 2, status: BaggageSlotStatus.AVAILABLE, maxBags: 150 },
      { slotCode: 'B1-04', terminal: 'T1', carouselNumber: 2, status: BaggageSlotStatus.AVAILABLE, maxBags: 150 },
      { slotCode: 'B1-05', terminal: 'T1', carouselNumber: 3, status: BaggageSlotStatus.AVAILABLE, maxBags: 200 },
      { slotCode: 'B2-01', terminal: 'T2', carouselNumber: 4, status: BaggageSlotStatus.AVAILABLE, maxBags: 180 },
      { slotCode: 'B2-02', terminal: 'T2', carouselNumber: 4, status: BaggageSlotStatus.AVAILABLE, maxBags: 180 },
      { slotCode: 'B2-03', terminal: 'T2', carouselNumber: 5, status: BaggageSlotStatus.AVAILABLE, maxBags: 180 },
      { slotCode: 'B2-04', terminal: 'T2', carouselNumber: 5, status: BaggageSlotStatus.AVAILABLE, maxBags: 180 },
      { slotCode: 'B2-05', terminal: 'T2', carouselNumber: 6, status: BaggageSlotStatus.AVAILABLE, maxBags: 200 },
    ],
    skipDuplicates: true,
  });
  console.log(`✅ 创建了 ${baggageSlots.count} 个行李分拣槽位\n`);

  console.log('🚛 创建航食配送车辆...');
  const cateringVehicles = await prisma.cateringVehicle.createMany({
    data: [
      { plateNumber: '京A12345', vehicleType: 'HOT_MEAL', capacity: 200, currentLocation: 'T1航食中心', status: CateringVehicleStatus.AVAILABLE, minTemp: 60, maxTemp: 85, currentTemp: 72, lastMaintenance: dayjs().subtract(7, 'day').toDate() },
      { plateNumber: '京A12346', vehicleType: 'HOT_MEAL', capacity: 200, currentLocation: 'T1航食中心', status: CateringVehicleStatus.AVAILABLE, minTemp: 60, maxTemp: 85, currentTemp: 70, lastMaintenance: dayjs().subtract(5, 'day').toDate() },
      { plateNumber: '京A12347', vehicleType: 'COLD_MEAL', capacity: 150, currentLocation: 'T1航食中心', status: CateringVehicleStatus.AVAILABLE, minTemp: 2, maxTemp: 8, currentTemp: 5, lastMaintenance: dayjs().subtract(3, 'day').toDate() },
      { plateNumber: '京A12348', vehicleType: 'COLD_MEAL', capacity: 150, currentLocation: 'T2航食中心', status: CateringVehicleStatus.AVAILABLE, minTemp: 2, maxTemp: 8, currentTemp: 4, lastMaintenance: dayjs().subtract(10, 'day').toDate() },
      { plateNumber: '京A12349', vehicleType: 'BEVERAGE', capacity: 300, currentLocation: 'T2航食中心', status: CateringVehicleStatus.AVAILABLE, minTemp: 4, maxTemp: 10, currentTemp: 7, lastMaintenance: dayjs().subtract(8, 'day').toDate() },
      { plateNumber: '京A12350', vehicleType: 'MULTI_PURPOSE', capacity: 250, currentLocation: 'T2航食中心', status: CateringVehicleStatus.AVAILABLE, minTemp: 0, maxTemp: 90, currentTemp: 65, lastMaintenance: dayjs().subtract(2, 'day').toDate() },
    ],
    skipDuplicates: true,
  });
  console.log(`✅ 创建了 ${cateringVehicles.count} 辆航食配送车\n`);

  console.log('👨‍✈️ 创建机组人员...');
  const crewMembers = await prisma.crewMember.createMany({
    data: [
      { employeeId: 'CA-P001', name: '张建国', role: CrewRole.CAPTAIN, status: CrewStatus.AVAILABLE, baseAirport: 'PEK', qualifications: ['A320', 'A330', 'B737'], totalFlightHours: 12500, dateOfHire: dayjs().subtract(15, 'year').toDate(), contactPhone: '13900139001', contactEmail: 'zhangjianguo@airchina.com' },
      { employeeId: 'CA-P002', name: '李淑芬', role: CrewRole.FIRST_OFFICER, status: CrewStatus.AVAILABLE, baseAirport: 'PEK', qualifications: ['A320', 'B737'], totalFlightHours: 6800, dateOfHire: dayjs().subtract(8, 'year').toDate(), contactPhone: '13900139002', contactEmail: 'lishufen@airchina.com' },
      { employeeId: 'CA-P003', name: '王建华', role: CrewRole.CAPTAIN, status: CrewStatus.AVAILABLE, baseAirport: 'PEK', qualifications: ['B777', 'B787', 'A350'], totalFlightHours: 15200, dateOfHire: dayjs().subtract(18, 'year').toDate(), contactPhone: '13900139003', contactEmail: 'wangjianhua@airchina.com' },
      { employeeId: 'CA-F001', name: '陈美玲', role: CrewRole.FLIGHT_ATTENDANT, status: CrewStatus.AVAILABLE, baseAirport: 'PEK', qualifications: ['国际航线', '国内航线', '头等舱服务'], totalFlightHours: 4500, dateOfHire: dayjs().subtract(6, 'year').toDate(), contactPhone: '13900139004', contactEmail: 'chenmeiling@airchina.com' },
      { employeeId: 'CA-F002', name: '刘伟', role: CrewRole.FLIGHT_ATTENDANT, status: CrewStatus.AVAILABLE, baseAirport: 'PEK', qualifications: ['国际航线', '国内航线'], totalFlightHours: 3200, dateOfHire: dayjs().subtract(4, 'year').toDate(), contactPhone: '13900139005', contactEmail: 'liuwei@airchina.com' },
      { employeeId: 'CA-F003', name: '赵丽娜', role: CrewRole.PURSER, status: CrewStatus.AVAILABLE, baseAirport: 'PEK', qualifications: ['国际航线', '国内航线', '乘务长资质'], totalFlightHours: 8900, dateOfHire: dayjs().subtract(10, 'year').toDate(), contactPhone: '13900139006', contactEmail: 'zhaolina@airchina.com' },
      { employeeId: 'CA-P004', name: '孙明', role: CrewRole.FIRST_OFFICER, status: CrewStatus.AVAILABLE, baseAirport: 'PEK', qualifications: ['A330', 'B777'], totalFlightHours: 5600, dateOfHire: dayjs().subtract(7, 'year').toDate(), contactPhone: '13900139007', contactEmail: 'sunming@airchina.com' },
      { employeeId: 'CA-F004', name: '周小红', role: CrewRole.FLIGHT_ATTENDANT, status: CrewStatus.AVAILABLE, baseAirport: 'PEK', qualifications: ['国内航线'], totalFlightHours: 1800, dateOfHire: dayjs().subtract(2, 'year').toDate(), contactPhone: '13900139008', contactEmail: 'zhouxiaohong@airchina.com' },
    ],
    skipDuplicates: true,
  });
  console.log(`✅ 创建了 ${crewMembers.count} 名机组人员\n`);

  console.log('✈️ 创建示例航班...');
  const now = dayjs();
  const flights = await prisma.flight.createMany({
    data: [
      { flightNumber: 'CA1234', airline: '中国国航', aircraftType: 'A320', direction: 'DEPARTURE', origin: '北京首都', destination: '上海浦东', scheduledDeparture: now.add(3, 'hour').toDate(), scheduledArrival: now.add(5, 'hour').toDate(), passengerCount: 156, status: 'SCHEDULED' },
      { flightNumber: 'CA5678', airline: '中国国航', aircraftType: 'B737', direction: 'ARRIVAL', origin: '广州白云', destination: '北京首都', scheduledDeparture: now.subtract(1, 'hour').toDate(), scheduledArrival: now.add(2, 'hour').toDate(), passengerCount: 138, status: 'IN_FLIGHT' },
      { flightNumber: 'MU2345', airline: '东方航空', aircraftType: 'A330', direction: 'DEPARTURE', origin: '北京首都', destination: '成都双流', scheduledDeparture: now.add(5, 'hour').toDate(), scheduledArrival: now.add(8, 'hour').toDate(), passengerCount: 245, status: 'SCHEDULED' },
      { flightNumber: 'CZ3456', airline: '南方航空', aircraftType: 'B787', direction: 'DEPARTURE', origin: '北京首都', destination: '深圳宝安', scheduledDeparture: now.add(7, 'hour').toDate(), scheduledArrival: now.add(10, 'hour').toDate(), passengerCount: 278, status: 'SCHEDULED' },
      { flightNumber: 'HU4567', airline: '海南航空', aircraftType: 'A350', direction: 'ARRIVAL', origin: '西安咸阳', destination: '北京首都', scheduledDeparture: now.add(1, 'hour').toDate(), scheduledArrival: now.add(3, 'hour').toDate(), passengerCount: 312, status: 'SCHEDULED' },
    ],
    skipDuplicates: true,
  });
  console.log(`✅ 创建了 ${flights.count} 个示例航班\n`);

  console.log('📦 创建示例资源...');
  const resources = await prisma.resource.createMany({
    data: [
      { resourceType: ResourceType.CHECKIN_COUNTER, resourceCode: 'CK-T1-01', name: 'T1值机柜台1', location: 'T1航站楼', status: 'AVAILABLE', capacity: 1 },
      { resourceType: ResourceType.CHECKIN_COUNTER, resourceCode: 'CK-T1-02', name: 'T1值机柜台2', location: 'T1航站楼', status: 'AVAILABLE', capacity: 1 },
      { resourceType: ResourceType.CHECKIN_COUNTER, resourceCode: 'CK-T1-03', name: 'T1值机柜台3', location: 'T1航站楼', status: 'AVAILABLE', capacity: 1 },
      { resourceType: ResourceType.CHECKIN_COUNTER, resourceCode: 'CK-T2-01', name: 'T2值机柜台1', location: 'T2航站楼', status: 'AVAILABLE', capacity: 1 },
      { resourceType: ResourceType.CHECKIN_COUNTER, resourceCode: 'CK-T2-02', name: 'T2值机柜台2', location: 'T2航站楼', status: 'AVAILABLE', capacity: 1 },
      { resourceType: ResourceType.CLEANING_CREW, resourceCode: 'CL-001', name: '保洁班组1', location: 'T1航站楼', status: 'AVAILABLE', capacity: 6 },
      { resourceType: ResourceType.CLEANING_CREW, resourceCode: 'CL-002', name: '保洁班组2', location: 'T2航站楼', status: 'AVAILABLE', capacity: 6 },
      { resourceType: ResourceType.CLEANING_CREW, resourceCode: 'CL-003', name: '保洁班组3', location: 'T1航站楼', status: 'AVAILABLE', capacity: 4 },
      { resourceType: ResourceType.SHUTTLE_BUS, resourceCode: 'SB-001', name: '摆渡车1', location: 'T1停车场', status: 'AVAILABLE', capacity: 50 },
      { resourceType: ResourceType.SHUTTLE_BUS, resourceCode: 'SB-002', name: '摆渡车2', location: 'T2停车场', status: 'AVAILABLE', capacity: 50 },
      { resourceType: ResourceType.BAGGAGE_CART, resourceCode: 'BC-001', name: '行李车组1', location: 'T1行李区', status: 'AVAILABLE', capacity: 10 },
      { resourceType: ResourceType.PASSENGER_ASSIST, resourceCode: 'PA-001', name: '旅客协助组1', location: 'T1航站楼', status: 'AVAILABLE', capacity: 3 },
    ],
    skipDuplicates: true,
  });
  console.log(`✅ 创建了 ${resources.count} 个资源\n`);

  console.log('\n' + '='.repeat(60));
  console.log('🎉 种子数据填充完成！');
  console.log('='.repeat(60));
  console.log('\n📋 默认账户:');
  console.log('   - 管理员: admin / password123');
  console.log('   - 值班主任: supervisor / password123');
  console.log('   - 地服人员: ground_service / password123');
  console.log('   - 塔台管制: tower / password123');
  console.log('   - 行李分拣: baggage_agent / password123');
  console.log('   - 航食调度: catering_agent / password123');
  console.log('   - 机组调度: crew_agent / password123');
  console.log('   - 航司运控: airline_ops / password123\n');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ 种子数据填充失败:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
