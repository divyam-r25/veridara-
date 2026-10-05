import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  githubUserId: string;
  username: string;
  email?: string;
  avatarUrl?: string;
  githubAccessToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>({
  githubUserId: { type: String, required: true, unique: true, index: true },
  username: { type: String, required: true },
  email: { type: String },
  avatarUrl: { type: String },
  githubAccessToken: { type: String, select: false } // Never returned by default
}, { timestamps: true });

export const User = mongoose.model<IUser>('User', UserSchema);
