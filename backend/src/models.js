import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['customer', 'agent', 'admin'], default: 'customer' },
  active: { type: Boolean, default: true },
  demo: { type: Boolean, default: false }
}, { timestamps: true });

const messageSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  authorName: { type: String, required: true },
  body: { type: String, required: true, trim: true, maxlength: 5000 },
  kind: { type: String, enum: ['reply', 'internal'], default: 'reply' }
}, { timestamps: true });

const ticketSchema = new mongoose.Schema({
  number: { type: String, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerName: { type: String, required: true },
  subject: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 8000 },
  category: { type: String, enum: ['Account & Billing', 'Technical Issue', 'Product Question', 'Feature Request', 'Other'], default: 'Other' },
  priority: { type: String, enum: ['Low', 'Medium', 'High', 'Urgent'], default: 'Medium' },
  status: { type: String, enum: ['Open', 'In Progress', 'Pending', 'Resolved'], default: 'Open' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  assignedName: { type: String, default: 'Unassigned' },
  messages: [messageSchema],
  demo: { type: Boolean, default: false }
}, { timestamps: true });

ticketSchema.pre('save', function () {
  if (!this.number) this.number = `RA-${Date.now().toString().slice(-8)}-${Math.floor(100 + Math.random() * 900)}`;
});
ticketSchema.index({ subject: 'text', description: 'text', number: 'text' });
ticketSchema.index({ status: 1, priority: -1, createdAt: -1 });

export const User = mongoose.models.User || mongoose.model('User', userSchema);
export const Ticket = mongoose.models.Ticket || mongoose.model('Ticket', ticketSchema);
