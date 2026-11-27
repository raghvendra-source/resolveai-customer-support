import dotenv from 'dotenv';
import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { User, Ticket } from './models.js';
import { createAiRouter } from './routes/ai.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env') });
const app = express();
const PORT = Number(process.env.PORT) || 5013;
const LOCAL_DB = 'mongodb://127.0.0.1:27017/resolveai';
const MONGO_URI = process.env.MONGODB_URI || (process.env.NODE_ENV === 'production' ? '' : LOCAL_DB);
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'resolveai-local-development-secret-change-this');
const allowedOrigins = new Set([process.env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean));

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin(origin, cb) { if (!origin || allowedOrigins.has(origin) || process.env.NODE_ENV !== 'production') return cb(null, true); return cb(new Error('Origin is not allowed by CORS.')); } }));
app.use(express.json({ limit: '40kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api/ai', rateLimit({ windowMs: 60_000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false }));

mongoose.connection.on('error', e => { console.error('MongoDB connection error:', e.name || 'connection failure'); });
if (MONGO_URI) mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 6000 }).then(() => { console.log(`MongoDB connected (${process.env.MONGODB_URI ? 'configured URI' : 'local development database'}).`); }).catch(e => { console.error('MongoDB unavailable:', e.name || 'connection failure'); });

const dbRequired = (req, res, next) => mongoose.connection.readyState === 1 ? next() : res.status(503).json({ error: 'Database is not connected. Check the local MongoDB service or backend MONGODB_URI.' });
const sign = user => jwt.sign({ sub: user._id.toString(), role: user.role }, JWT_SECRET, { expiresIn: '12h' });
const publicUser = u => ({ id: u._id, name: u.name, email: u.email, role: u.role, active: u.active, demo: u.demo });
const auth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token || !JWT_SECRET) return res.status(401).json({ error: 'Please sign in to continue.' });
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user?.active) return res.status(401).json({ error: 'This account is unavailable. Please contact an administrator.' });
    req.user = user; next();
  } catch { return res.status(401).json({ error: 'Your session expired. Please sign in again.' }); }
};
const roles = (...allowed) => (req, res, next) => allowed.includes(req.user.role) ? next() : res.status(403).json({ error: 'Your account does not have permission for this action.' });
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.use('/api/ai', createAiRouter({ dbRequired, auth, roles, asyncRoute }));

app.get('/api/health', (_req, res) => res.status(mongoose.connection.readyState === 1 ? 200 : 503).json({ status: mongoose.connection.readyState === 1 ? 'ok' : 'degraded', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected', databaseMode: process.env.MONGODB_URI ? 'configured' : process.env.NODE_ENV === 'production' ? 'missing' : 'local-development', aiConfigured: Boolean(process.env.GROQ_API_KEY), model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b' }));

app.post('/api/auth/register', dbRequired, asyncRoute(async (req, res) => {
  const { name, email, password } = req.body || {};
  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 80) return res.status(400).json({ error: 'Name must be 2–80 characters.' });
  if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  if (typeof password !== 'string' || password.length < 8 || password.length > 100) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  if (await User.exists({ email: email.toLowerCase().trim() })) return res.status(409).json({ error: 'An account with that email already exists.' });
  const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), passwordHash: await bcrypt.hash(password, 12), role: 'customer' });
  return res.status(201).json({ token: sign(user), user: publicUser(user) });
}));
app.post('/api/auth/login', dbRequired, asyncRoute(async (req, res) => {
  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Email and password are required.' });
  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash');
  if (!user || !await bcrypt.compare(password, user.passwordHash)) return res.status(401).json({ error: 'Email or password is incorrect.' });
  if (!user.active) return res.status(403).json({ error: 'This account has been disabled.' });
  return res.json({ token: sign(user), user: publicUser(user) });
}));
app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get('/api/stats', dbRequired, auth, roles('agent', 'admin'), asyncRoute(async (req, res) => {
  const scope = req.user.role === 'agent' ? { assignedTo: req.user._id } : {};
  const [total, statuses, priorities, categories, recent] = await Promise.all([
    Ticket.countDocuments(scope),
    Ticket.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Ticket.aggregate([{ $match: scope }, { $group: { _id: '$priority', count: { $sum: 1 } } }]),
    Ticket.aggregate([{ $match: scope }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
    Ticket.find(scope).sort({ updatedAt: -1 }).limit(5).lean()
  ]);
  const map = rows => Object.fromEntries(rows.map(x => [x._id, x.count]));
  res.json({ total, statuses: map(statuses), priorities: map(priorities), categories: map(categories), recent });
}));

app.get('/api/tickets', dbRequired, auth, asyncRoute(async (req, res) => {
  const filter = {};
  if (req.user.role === 'customer') filter.customer = req.user._id;
  if (req.user.role === 'agent') filter.$or = [{ assignedTo: req.user._id }, { assignedTo: null }];
  if (req.query.status && req.query.status !== 'All') filter.status = req.query.status;
  if (req.query.priority && req.query.priority !== 'All') filter.priority = req.query.priority;
  const search = typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 100) : '';
  if (search) filter.$and = [...(filter.$and || []), { $or: [{ subject: { $regex: search, $options: 'i' } }, { number: { $regex: search, $options: 'i' } }, { customerName: { $regex: search, $options: 'i' } }] }];
  const tickets = await Ticket.find(filter).sort({ priority: -1, updatedAt: -1 }).limit(150).lean();
  return res.json({ tickets });
}));
app.post('/api/tickets', dbRequired, auth, asyncRoute(async (req, res) => {
  const { subject, description, category = 'Other', priority = 'Medium' } = req.body || {};
  if (typeof subject !== 'string' || subject.trim().length < 4 || subject.trim().length > 160) return res.status(400).json({ error: 'Subject must be 4–160 characters.' });
  if (typeof description !== 'string' || description.trim().length < 10 || description.trim().length > 8000) return res.status(400).json({ error: 'Describe the issue in 10–8,000 characters.' });
  const categories = ['Account & Billing', 'Technical Issue', 'Product Question', 'Feature Request', 'Other'];
  const priorities = ['Low', 'Medium', 'High', 'Urgent'];
  if (!categories.includes(category)) return res.status(400).json({ error: 'Select a valid ticket category.' });
  const safePriority = req.user.role === 'customer' ? 'Medium' : priorities.includes(priority) ? priority : 'Medium';
  const ticket = await Ticket.create({ customer: req.user._id, customerName: req.user.name, subject: subject.trim(), description: description.trim(), category, priority: safePriority, messages: [{ author: req.user._id, authorName: req.user.name, body: description.trim() }] });
  return res.status(201).json({ ticket });
}));
app.get('/api/tickets/:id', dbRequired, auth, asyncRoute(async (req, res) => {
  const ticket = await Ticket.findById(req.params.id).populate('messages.author', 'name role');
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  if (req.user.role === 'customer' && !ticket.customer.equals(req.user._id)) return res.status(404).json({ error: 'Ticket not found.' });
  if (req.user.role === 'agent' && ticket.assignedTo && !ticket.assignedTo.equals(req.user._id)) return res.status(403).json({ error: 'This ticket is assigned to another agent.' });
  return res.json({ ticket });
}));
app.patch('/api/tickets/:id', dbRequired, auth, roles('agent', 'admin'), asyncRoute(async (req, res) => {
  const allowed = {};
  if (req.body.status && ['Open', 'In Progress', 'Pending', 'Resolved'].includes(req.body.status)) allowed.status = req.body.status;
  if (req.body.priority && ['Low', 'Medium', 'High', 'Urgent'].includes(req.body.priority)) allowed.priority = req.body.priority;
  if (Object.hasOwn(req.body, 'assignedTo')) {
    if (!req.body.assignedTo) { allowed.assignedTo = null; allowed.assignedName = 'Unassigned'; }
    else { const agent = await User.findById(req.body.assignedTo); if (!agent || !['agent', 'admin'].includes(agent.role)) return res.status(400).json({ error: 'Choose an active agent or administrator.' }); allowed.assignedTo = agent._id; allowed.assignedName = agent.name; }
  }
  const ticket = await Ticket.findByIdAndUpdate(req.params.id, allowed, { new: true, runValidators: true });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  return res.json({ ticket });
}));
app.post('/api/tickets/:id/messages', dbRequired, auth, asyncRoute(async (req, res) => {
  const { body, kind = 'reply' } = req.body || {};
  if (typeof body !== 'string' || body.trim().length < 1 || body.length > 5000) return res.status(400).json({ error: 'Reply must be between 1 and 5,000 characters.' });
  if (kind === 'internal' && !['agent', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Only support staff can add internal notes.' });
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  if (req.user.role === 'customer' && !ticket.customer.equals(req.user._id)) return res.status(404).json({ error: 'Ticket not found.' });
  ticket.messages.push({ author: req.user._id, authorName: req.user.name, body: body.trim(), kind });
  if (req.user.role === 'customer' && ticket.status === 'Resolved') ticket.status = 'Open';
  await ticket.save();
  return res.status(201).json({ ticket });
}));

app.get('/api/users', dbRequired, auth, roles('admin'), asyncRoute(async (_req, res) => {
  const users = await User.find().sort({ createdAt: -1 }).limit(500);
  return res.json({ users: users.map(publicUser) });
}));
app.patch('/api/users/:id', dbRequired, auth, roles('admin'), asyncRoute(async (req, res) => {
  const allowed = {};
  if (['customer', 'agent', 'admin'].includes(req.body.role)) allowed.role = req.body.role;
  if (typeof req.body.active === 'boolean') allowed.active = req.body.active;
  if (!Object.keys(allowed).length) return res.status(400).json({ error: 'Provide a valid role or active state.' });
  const user = await User.findByIdAndUpdate(req.params.id, allowed, { new: true, runValidators: true });
  return user ? res.json({ user: publicUser(user) }) : res.status(404).json({ error: 'User not found.' });
}));

app.use('/api', (_req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((err, _req, res, _next) => { console.error(err.name || 'RequestError'); if (err.code === 11000) return res.status(409).json({ error: 'That email address already exists.' }); return res.status(err.status || 500).json({ error: err.status && err.status < 500 ? err.message : 'Something went wrong. Check the server logs.' }); });

app.listen(PORT, () => console.log(`ResolveAI API listening on http://localhost:${PORT}`));
