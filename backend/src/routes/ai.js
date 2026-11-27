import express from 'express';
import Groq from 'groq-sdk';
import { Ticket } from '../models.js';

export function createAiRouter({ dbRequired, auth, roles, asyncRoute }) {
  const router = express.Router();
  router.post('/analyze', dbRequired, auth, roles('agent', 'admin'), asyncRoute(async (req, res) => {
    if (!process.env.GROQ_API_KEY) return res.status(503).json({ error: 'AI is not configured. Add GROQ_API_KEY to backend/.env and restart the backend. No AI response was generated.' });
    const { ticketId } = req.body || {};
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
    const completion = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b', temperature: 0.25, max_tokens: 700, response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are a customer-support copilot. Analyze the provided ticket and return JSON only, with keys: category (one of Account & Billing, Technical Issue, Product Question, Feature Request, Other), priority (Low, Medium, High, Urgent), summary (under 60 words), suggestedReply (professional, empathetic, under 120 words), urgentReason (one short sentence or an empty string). Never claim an action was taken or fabricate company policies. Mark urgency based on customer impact and time sensitivity.' },
        { role: 'user', content: JSON.stringify({ subject: ticket.subject, description: ticket.description, category: ticket.category, priority: ticket.priority, recentMessages: ticket.messages.slice(-6).map(m => ({ author: m.authorName, body: m.body, kind: m.kind })) }) }
      ]
    });
    const content = completion.choices?.[0]?.message?.content;
    if (!content) return res.status(502).json({ error: 'Groq returned no analysis. No reply was sent.' });
    let analysis; try { analysis = JSON.parse(content); } catch { return res.status(502).json({ error: 'Groq returned an unreadable response. No reply was sent.' }); }
    return res.json({ analysis, model: completion.model, provider: 'Groq' });
  }));
  return router;
}
