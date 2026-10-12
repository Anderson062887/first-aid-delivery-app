import mongoose from 'mongoose';

const BoxItemSchema = new mongoose.Schema(
  {
    item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
    par: { type: Number, default: 0 }
  },
  { _id: false }
);

const BoxSchema = new mongoose.Schema(
  {
    label: { type: String, required: true, trim: true },
    location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
    size: { 
      type: String, 
      enum: ['S', 'M', 'L', 'XL'], 
      required: true 
    },
    items: [BoxItemSchema],
    // Retired boxes keep their delivery history but no longer need refilling
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

// Boxes that still need refilling (boxes created before `active` existed count as active)
export const ACTIVE_BOX = { active: { $ne: false } };

export default mongoose.model('Box', BoxSchema);
