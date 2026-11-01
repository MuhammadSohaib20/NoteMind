import { Router } from 'express';
import { askNotes, askRagSchema, askRagStream } from '../controllers/rag.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.post('/ask', validate(askRagSchema), askNotes);
router.post('/ask/stream', validate(askRagSchema), askRagStream);

export default router;
