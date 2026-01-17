import express, { RequestHandler } from 'express';
import { me } from '@/controllers/userController';

const router = express.Router();

router.get('/me', me as RequestHandler);

export default router;