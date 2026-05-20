import mongoose from 'mongoose';
import { config } from '../config';

let isConnected = false;

export async function connectMongo(): Promise<void> {
  if (isConnected) return;
  await mongoose.connect(config.MONGODB_URI, {
    serverSelectionTimeoutMS: 5000,
    maxPoolSize: 5,
  });
  isConnected = true;
}

export async function disconnectMongo(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
}

export function mongoConnectionState(): { connected: boolean; readyState: number } {
  return {
    connected: isConnected && mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
  };
}
