import dotenv from 'dotenv';
import { connectDB } from './db.js';
import app from './app.js';

dotenv.config();
const PORT = process.env.PORT || 4000;

async function main() {
  console.log('Starting API...');
  await connectDB(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  app.listen(PORT, () => console.log(`API running on http://localhost:${PORT}`));
}

main().catch(err => {
  console.error('Failed to start server', err);
  process.exit(1);
});
