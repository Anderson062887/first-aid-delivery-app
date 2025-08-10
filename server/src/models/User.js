import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  role: { type: String, enum: ['admin','rep'], default: 'rep' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
