import mongoose from 'mongoose';

export async function connectMongoDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
  try {
    await mongoose.connect(uri);
    console.log('[MongoDB] Connected successfully');
  } catch (err) {
    console.error('[MongoDB] Connection failed:', err);
    throw err;
  }
}
