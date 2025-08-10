import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    packaging: { type: String, enum: ['each', 'case'], default: 'each' },
    unitsPerPack: { type: Number, default: 1 },
    pricePerPack: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model('Item', ItemSchema);
