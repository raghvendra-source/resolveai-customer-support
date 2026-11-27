import express from 'express';

export function createAiRouter() {
  const router = express.Router();
  router.post('/analyze', (_req, res) => res.status(503).json({ error: 'Groq copilot integration is not configured yet.' }));
  return router;
}
