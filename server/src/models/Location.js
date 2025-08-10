import mongoose from 'mongoose';

const AddressSchema = new mongoose.Schema(
  {
    street: String,
    city: String,
    state: String,
    zip: String
  },
  { _id: false }
);

const LocationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    address: AddressSchema,
    notes: String
  },
  { timestamps: true }
);

export default mongoose.model('Location', LocationSchema);
