import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, trim: true },
    packaging: { type: String, enum: ['each', 'case'], default: 'each' },
    // Units in one case; prices per unit are pricePerPack / unitsPerPack
    unitsPerPack: {
      type: Number,
      default: 1,
      required: [true, 'unitsPerPack is required'],
      min: [1, 'unitsPerPack must be at least 1'],
      validate: { validator: Number.isInteger, message: 'unitsPerPack must be a whole number' }
    },
    pricePerPack: { type: Number, required: true, min: 0 },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export default mongoose.model('Item', ItemSchema);
