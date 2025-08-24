import mongoose from 'mongoose';

// server/src/db.js


export async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) {
    throw new Error(
      'MONGODB_URI is not set. Create server/.env with MONGODB_URI=... (Atlas connection string).'
    );
  }
  // Optional: allow db override via env
  const dbName = process.env.MONGODB_DB || undefined;

  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName });
  console.log('[db] connected', dbName ? `db=${dbName}` : '');
}

export function disconnectDB() {
  return mongoose.disconnect();
}


// export async function connectDB(uri) {
//   mongoose.set('strictQuery', true);
//   await mongoose.connect(uri);
//   console.log('Connected to MongoDB');
// }
