import mongoose from 'mongoose';
import { log } from './logger';

export async function connectMongoDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/thearchitect';
  try {
    await mongoose.connect(uri);
    log.info('[MongoDB] Connected successfully');
  } catch (err) {
    log.error({ err }, '[MongoDB] Connection failed');
    throw err;
  }
}
