import mongoose from 'mongoose';

const DeliveryLineSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    // allow partial quantities (e.g., 0.5 case). Keep min small but > 0
    quantity: { type: Number, required: true, min: 0.01 },
    packaging: { type: String, enum: ['each', 'case'], required: true },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const DeliverySchema = new mongoose.Schema(
  {
    repName: { type: String, trim: true },
    deliveredAt: { type: Date, default: Date.now },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    box: { type: mongoose.Schema.Types.ObjectId, ref: 'Box', required: true },
    lines: [DeliveryLineSchema],
    subtotal: { type: Number, required: true, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    // keep visit field if you added it earlier
    visit: { type: mongoose.Schema.Types.ObjectId, ref: 'Visit' }
  },
  { timestamps: true }
);

export default mongoose.model('Delivery', DeliverySchema);

