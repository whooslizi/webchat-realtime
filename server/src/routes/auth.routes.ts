import { Router } from 'express';
import { register, login, me, logout, logoutAll } from '../controllers/auth.controller.js';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../lib/async-handler.js';
import { rateLimit } from '../middlewares/rate-limit.js';
import { requireTurnstile, turnstileConfig } from '../middlewares/turnstile.js';

const router = Router();

router.get('/turnstile', turnstileConfig);
router.post('/register', rateLimit('register'), asyncHandler(requireTurnstile), asyncHandler(register));
router.post('/login', rateLimit('loginFailures'), asyncHandler(requireTurnstile), asyncHandler(login));
router.get('/me', authMiddleware, asyncHandler(me));
router.post('/logout', asyncHandler(logout));
router.post('/logout-all', authMiddleware, asyncHandler(logoutAll));

export default router;
