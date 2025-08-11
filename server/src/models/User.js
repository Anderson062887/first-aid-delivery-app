import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name:   { type: String, required: true, trim: true },
  email:  { type: String, trim: true, lowercase: true },
  active: { type: Boolean, default: true },

  // CHANGED: roles instead of single role
roles: {
  type: [String],
  enum: ['rep', 'admin'],
  default: ['rep'],
  validate: {
    validator: (v) => Array.isArray(v) && v.length > 0,
    message: 'User must have at least one role.'
  }
}
}, { timestamps: true });

export default mongoose.model('User', UserSchema);
