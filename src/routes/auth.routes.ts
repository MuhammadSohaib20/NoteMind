import { Router } from 'express';
import {
  signup,
  login,
  updatePassword,
  signupSchema,
  loginSchema,
  updatePasswordSchema,
} from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/signup', validate(signupSchema), signup);
router.post('/login', validate(loginSchema), login);
router.put('/update-password', authenticate, validate(updatePasswordSchema), updatePassword);

export default router;

