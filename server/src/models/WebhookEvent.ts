import mongoose, { Schema, Document } from 'mongoose';

export interface IWebhookEvent extends Document {
  deliveryId: string;
  eventType: string;
  repositoryId?: string;
  repositoryFullName?: string;
  payload: Record<string, unknown>;
  processed: boolean;
  processingError?: string;
  receivedAt: Date;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>({
  deliveryId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, required: true },
  repositoryId: { type: String },
  repositoryFullName: { type: String },
  payload: { type: Schema.Types.Mixed },
  processed: { type: Boolean, default: false },
  processingError: { type: String },
  receivedAt: { type: Date, default: Date.now },
  processedAt: { type: Date }
}, { timestamps: true });

export const WebhookEvent = mongoose.model<IWebhookEvent>('WebhookEvent', WebhookEventSchema);
