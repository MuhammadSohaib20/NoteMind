import { Router } from 'express';
import {
  listTags,
  createTag,
  updateTag,
  deleteTag,
  createTagSchema,
  updateTagSchema,
} from '../controllers/tags.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.get('/', listTags);
router.post('/', validate(createTagSchema), createTag);
router.put('/:id', validate(updateTagSchema), updateTag);
router.delete('/:id', deleteTag);

export default router;
