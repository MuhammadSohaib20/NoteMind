import { Router } from 'express';
import {
  listCollections,
  getCollectionById,
  createCollection,
  updateCollection,
  deleteCollection,
  createCollectionSchema,
  updateCollectionSchema,
} from '../controllers/collections.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.use(authenticate);

router.get('/', listCollections);
router.get('/:id', getCollectionById);
router.post('/', validate(createCollectionSchema), createCollection);
router.put('/:id', validate(updateCollectionSchema), updateCollection);
router.delete('/:id', deleteCollection);

export default router;
