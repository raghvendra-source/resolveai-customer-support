import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { User, Ticket } from './models.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env') });
const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/resolveai';
const demoPassword = 'ResolveAI-Demo-2026!';
await mongoose.connect(uri, { serverSelectionTimeoutMS: 7000 });
const accounts = [
  ['Olivia Carter', 'admin@resolveai.demo', 'admin'],
  ['Jordan Lee', 'agent@resolveai.demo', 'agent'],
  ['Sam Rivera', 'agent2@resolveai.demo', 'agent'],
  ['Maya Patel', 'maya@resolveai.demo', 'customer'],
  ['Noah Williams', 'noah@resolveai.demo', 'customer'],
  ['Ava Thompson', 'ava@resolveai.demo', 'customer']
];
const users = {};
for (const [name, email, role] of accounts) {
  let user = await User.findOne({ email });
  if (!user) user = await User.create({ name, email, role, passwordHash: await bcrypt.hash(demoPassword, 12), demo: true });
  users[email] = user;
}
if (!await Ticket.exists({ demo: true })) {
  const examples = [
    ['Unable to access my workspace', 'I reset my password twice but the workspace still returns an access error. This is blocking my team from reviewing the weekly report.', 'Account & Billing', 'High', 'Open', 'maya@resolveai.demo', 'agent@resolveai.demo'],
    ['Invoice has an unexpected seat charge', 'Our latest invoice includes two extra seats. We reduced the team before the billing date and would appreciate help checking the adjustment.', 'Account & Billing', 'Medium', 'In Progress', 'noah@resolveai.demo', 'agent2@resolveai.demo'],
    ['Dashboard export is timing out', 'CSV exports for date ranges over one month time out. Smaller exports work. Browser and app are both up to date.', 'Technical Issue', 'Urgent', 'Open', 'ava@resolveai.demo', null],
    ['Can I invite a read-only reviewer?', 'A partner needs to view project updates without editing them. Is there a viewer permission we can enable?', 'Product Question', 'Low', 'Pending', 'maya@resolveai.demo', 'agent@resolveai.demo'],
    ['Request: add saved report filters', 'We run the same weekly report each Monday. Saved filters would make it easier to keep the team report consistent.', 'Feature Request', 'Medium', 'Resolved', 'noah@resolveai.demo', 'agent2@resolveai.demo'],
    ['Mobile notifications arrive late', 'Push notifications sometimes appear several minutes after the event on Android 15. Email notifications are timely.', 'Technical Issue', 'High', 'In Progress', 'ava@resolveai.demo', 'agent@resolveai.demo']
  ];
  for (const [subject, description, category, priority, status, customerEmail, agentEmail] of examples) {
    const customer = users[customerEmail], agent = agentEmail ? users[agentEmail] : null;
    await Ticket.create({ customer: customer._id, customerName: customer.name, subject, description, category, priority, status, assignedTo: agent?._id || null, assignedName: agent?.name || 'Unassigned', demo: true, messages: [{ author: customer._id, authorName: customer.name, body: description }, ...(status === 'In Progress' ? [{ author: agent._id, authorName: agent.name, body: 'Thanks for the details. I’m reviewing this now and will follow up with the next steps.' }] : [])] });
  }
}
console.log(`Safe seed complete: ${accounts.length} demo accounts available, demo tickets added only if none existed. Shared demo password: ${demoPassword}`);
await mongoose.disconnect();
