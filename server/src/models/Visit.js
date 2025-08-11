import mongoose from 'mongoose';



const VisitSchema = new mongoose.Schema({
  rep:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  location: { type: mongoose.Schema.Types.ObjectId, ref: 'Location', required: true },
  status:   { type: String, enum: ['open','submitted'], default: 'open' },

  // NEW
  outcome:  { type: String, enum: ['completed','partial','no_access','skipped'], default: null },
  note:     { type: String, trim: true, default: '' },

  startedAt:{ type: Date, default: Date.now },
  submittedAt: { type: Date },
}, { timestamps: true });

export default mongoose.model('Visit', VisitSchema);

