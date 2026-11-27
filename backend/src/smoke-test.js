import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { Ticket, User } from './models.js';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(here, '..', '.env') });
const api = (process.env.API_URL || `http://localhost:${process.env.PORT || 5013}/api`).replace(/\/$/, '');
let testUserId, testTicketId, passed = 0;
async function call(route, token, method = 'GET', body) {
  const res = await fetch(`${api}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}
function check(condition, label) { if (!condition) throw new Error(`FAIL ${label}`); passed++; console.log(`PASS ${label}`); }
try {
  const health = await call('/health');
  check(health.status === 200 && health.data.database === 'connected', 'API health and MongoDB connection');
  const email = `p13-smoke-${Date.now()}@example.com`, password = 'Test-Only-Password-2026';
  const registration = await call('/auth/register', null, 'POST', { name: 'Smoke Test Customer', email, password });
  check(registration.status === 201, 'customer registration and password hashing');
  testUserId = registration.data.user?.id;
  const login = await call('/auth/login', null, 'POST', { email, password });
  check(login.status === 200 && login.data.token, 'login and JWT authentication');
  const customer = login.data.token;
  const created = await call('/tickets', customer, 'POST', { subject: 'Smoke test: export issue', category: 'Technical Issue', description: 'Verifying Mongo ticket persistence and customer conversations.' });
  check(created.status === 201 && created.data.ticket?._id, 'customer ticket creation in MongoDB');
  testTicketId = created.data.ticket._id;
  const agentLogin = await call('/auth/login', null, 'POST', { email: 'agent@resolveai.demo', password: 'ResolveAI-Demo-2026!' });
  check(agentLogin.status === 200, 'demo support agent sign in');
  const agent = agentLogin.data.token;
  const assignedQueue = await call('/tickets', agent);
  check(assignedQueue.data.tickets?.some(t => t._id === testTicketId), 'agent queue includes the new unassigned ticket');
  const forbidden = await call(`/tickets/${testTicketId}`, customer, 'PATCH', { status: 'Resolved' });
  check(forbidden.status === 403, 'customer cannot change staff-only ticket status');
  const update = await call(`/tickets/${testTicketId}`, agent, 'PATCH', { status: 'In Progress', priority: 'High' });
  check(update.status === 200 && update.data.ticket.status === 'In Progress', 'agent updates ticket status and priority');
  const reply = await call(`/tickets/${testTicketId}/messages`, agent, 'POST', { body: 'We are reviewing this issue now.' });
  check(reply.status === 201, 'agent replies to ticket conversation');
  const adminLogin = await call('/auth/login', null, 'POST', { email: 'admin@resolveai.demo', password: 'ResolveAI-Demo-2026!' });
  check(adminLogin.status === 200, 'demo admin sign in');
  const admin = adminLogin.data.token;
  const [stats, users] = await Promise.all([call('/stats', admin), call('/users', admin)]);
  check(stats.status === 200 && stats.data.total >= 6, 'admin analytics use database ticket counts');
  check(users.status === 200 && users.data.users.length >= 6, 'admin can view/manage workspace users');
  if (!process.env.GROQ_API_KEY) {
    const ai = await call('/ai/analyze', agent, 'POST', { ticketId: testTicketId });
    check(ai.status === 503 && String(ai.data.error).includes('GROQ_API_KEY'), 'AI clearly reports missing key without fabricated output');
  } else console.log('SKIP live AI request (it may consume provider usage).');
  console.log(`API smoke check complete: ${passed} checks passed.`);
} catch (error) {
  console.error(error.message || 'Smoke test failed.');
  process.exitCode = 1;
} finally {
  try {
    if (mongoose.connection.readyState !== 1) await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/resolveai', { serverSelectionTimeoutMS: 5000 });
    if (testTicketId) await Ticket.deleteOne({ _id: testTicketId });
    if (testUserId) await User.deleteOne({ _id: testUserId });
    await mongoose.disconnect();
  } catch (error) { console.error('Could not clean up temporary smoke records.'); process.exitCode = 1; }
}
