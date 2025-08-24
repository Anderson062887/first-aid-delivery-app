// server/scripts/seedAdmin.js
import 'dotenv/config'; // <-- loads server/.env
import { connectDB, disconnectDB } from '../src/db.js';
import User from '../src/models/User.js';
import bcrypt from 'bcryptjs';

async function main() {
  const email = process.argv[2];
  const password = process.argv[3];
  const name = process.argv[4] || 'Admin';

  if (!email || !password) {
    console.log('Usage: node scripts/seedAdmin.js <email> <password> [name]');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('ERROR: MONGODB_URI is not set. Create server/.env with your Atlas URI.');
    process.exit(1);
  }

  await connectDB();

  const existing = await User.findOne({ email: email.toLowerCase().trim() }).lean();
  if (existing) {
    console.log('User already exists:', existing.email);
    await disconnectDB();
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email: email.toLowerCase().trim(),
    passwordHash,
    roles: ['admin'],
    active: true
  });

  console.log('Admin created:', user.email, 'id=', user._id.toString());
  await disconnectDB();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('Seed failed:', err);
  try { await disconnectDB(); } catch {}
  process.exit(1);
});

