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
    // Who the delivery counts for: the visit's rep, or whoever recorded it.
    // Older deliveries may only have repName.
    rep: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    repName: { type: String, trim: true },
    // Random id the app sends with each new delivery. A retry of the same
    // request (e.g. the reply was lost and the offline queue resent it) carries
    // the same id, so the server can return the first delivery instead of
    // creating a second one.
    clientId: { type: String, trim: true, unique: true, sparse: true },
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

