// Standalone seed script. Prisma 7 requires a Driver Adapter when
// constructing `PrismaClient`, so we wire up the same `PrismaPg` adapter
// used by the runtime client.
//
// Run with:
//   npm run prisma:seed
//
// Required env: DATABASE_URL.

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';

if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL is not set. Aborting seed.');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DEFAULT_PERMISSIONS = [
  { name: 'cargo:create', description: 'Permission to create new cargo records' },
  { name: 'cargo:read', description: 'Permission to view cargo records' },
  { name: 'cargo:update', description: 'Permission to update cargo records and add status updates' },
  { name: 'cargo:delete', description: 'Permission to delete cargo records' },
  { name: 'users:create', description: 'Permission to create internal users' },
  { name: 'users:read', description: 'Permission to view users' },
  { name: 'users:update', description: 'Permission to update users' },
  { name: 'users:delete', description: 'Permission to delete users' },
  { name: 'permissions:manage', description: 'Permission to manage permissions and assign them to users' },
  { name: 'customers:read', description: 'Permission to view customer accounts' },
];

async function main(): Promise<void> {
  console.log('Starting database seeding...');

  console.log('-> Seeding permissions...');
  const permissionMap = new Map<string, string>();
  for (const perm of DEFAULT_PERMISSIONS) {
    const upserted = await prisma.permission.upsert({
      where: { name: perm.name },
      update: { description: perm.description },
      create: perm,
    });
    permissionMap.set(perm.name, upserted.id);
  }
  console.log(`  ${permissionMap.size} permissions ready`);

  console.log('-> Seeding default admin user...');
  const adminEmail = 'admin@example.com';
  const adminPassword = 'Admin@12345';
  const hashedAdminPassword = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      password: hashedAdminPassword,
      role: 'ADMIN',
      isActive: true,
      name: 'System Administrator',
    },
    create: {
      name: 'System Administrator',
      email: adminEmail,
      password: hashedAdminPassword,
      role: 'ADMIN',
      isActive: true,
    },
  });

  console.log('-> Assigning all permissions to admin...');
  for (const [, permId] of permissionMap) {
    await prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId: admin.id,
          permissionId: permId,
        },
      },
      update: {},
      create: {
        userId: admin.id,
        permissionId: permId,
      },
    });
  }
  console.log(`  Admin user ready: ${adminEmail} / ${adminPassword}`);

  console.log('-> Seeding sample staff user...');
  const staffEmail = 'staff@example.com';
  const staffPassword = 'Staff@12345';
  const hashedStaffPassword = await bcrypt.hash(staffPassword, 12);

  const staff = await prisma.user.upsert({
    where: { email: staffEmail },
    update: {
      password: hashedStaffPassword,
      role: 'STAFF',
      isActive: true,
    },
    create: {
      name: 'Sample Staff',
      email: staffEmail,
      password: hashedStaffPassword,
      contact: '+1-555-0100',
      role: 'STAFF',
      isActive: true,
    },
  });

  const staffPerms = ['cargo:create', 'cargo:read', 'cargo:update', 'customers:read'];
  for (const permName of staffPerms) {
    const permId = permissionMap.get(permName);
    if (!permId) continue;
    await prisma.userPermission.upsert({
      where: {
        userId_permissionId: {
          userId: staff.id,
          permissionId: permId,
        },
      },
      update: {},
      create: {
        userId: staff.id,
        permissionId: permId,
      },
    });
  }
  console.log(`  Staff user ready: ${staffEmail} / ${staffPassword}`);

  console.log('-> Seeding sample customer...');
  const customerEmail = 'customer@example.com';
  const customerPassword = 'Customer@12345';
  const hashedCustomerPassword = await bcrypt.hash(customerPassword, 12);

  const customer = await prisma.user.upsert({
    where: { email: customerEmail },
    update: {
      password: hashedCustomerPassword,
      role: 'CUSTOMER',
      isActive: true,
    },
    create: {
      name: 'John Customer',
      email: customerEmail,
      password: hashedCustomerPassword,
      contact: '+1-555-0200',
      role: 'CUSTOMER',
      isActive: true,
    },
  });
  console.log(`  Customer user ready: ${customerEmail} / ${customerPassword}`);

  console.log('-> Seeding sample cargo...');
  const existingCargo = await prisma.cargo.findUnique({
    where: { trackingNumber: 'CT-DEMO-001' },
  });

  if (!existingCargo) {
    const cargo = await prisma.cargo.create({
      data: {
        trackingNumber: 'CT-DEMO-001',
        title: 'Sample Electronics Shipment',
        description: 'A demo shipment containing electronics from New York to Los Angeles',
        weight: 12.5,
        senderName: 'Tech Corp',
        receiverName: 'John Customer',
        receiverEmail: customer.email,
        receiverContact: '+1-555-0200',
        origin: 'New York, NY',
        destination: 'Los Angeles, CA',
        currentStatus: 'IN_TRANSIT',
        entryDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        customerId: customer.id,
        createdById: admin.id,
      },
    });

    await prisma.cargoStatusUpdate.createMany({
      data: [
        {
          cargoId: cargo.id,
          status: 'PENDING',
          note: 'Shipment created and awaiting pickup',
          updatedById: admin.id,
        },
        {
          cargoId: cargo.id,
          status: 'PICKED_UP',
          note: 'Package picked up from sender',
          latitude: 40.7128,
          longitude: -74.006,
          locationText: 'New York, NY',
          updatedById: admin.id,
        },
        {
          cargoId: cargo.id,
          status: 'IN_TRANSIT',
          note: 'Package is on its way to the destination',
          latitude: 39.7392,
          longitude: -104.9903,
          locationText: 'Denver, CO (Hub)',
          updatedById: admin.id,
        },
      ],
    });
    console.log(`  Sample cargo created: ${cargo.trackingNumber}`);
  }

  console.log('\nDatabase seeding complete!');
  console.log('\nDefault credentials:');
  console.log(`  Admin:    ${adminEmail} / ${adminPassword}`);
  console.log(`  Staff:    staff@example.com / Staff@12345`);
  console.log(`  Customer: customer@example.com / Customer@12345`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
