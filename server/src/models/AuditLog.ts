import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  userId?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  userId: { type: String, index: true },
  action: { type: String, required: true, index: true },
  resourceType: { type: String },
  resourceId: { type: String },
  metadata: { type: Schema.Types.Mixed },
  ip: { type: String },
  userAgent: { type: String }
}, { timestamps: true });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
