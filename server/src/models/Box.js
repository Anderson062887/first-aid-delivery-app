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
    items: [BoxItemSchema]
  },
  { timestamps: true }
);

export default mongoose.model('Box', BoxSchema);
