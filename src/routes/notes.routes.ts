import { Router } from 'express';
import multer from 'multer';
import {
  listNotes,
  getNoteById,
  createNote,
  uploadNoteFile,
  updateNote,
  deleteNote,
  createNoteSchema,
  updateNoteSchema,
} from '../controllers/notes.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
});

const router = Router();

router.use(authenticate);

router.get('/', listNotes);
router.get('/:id', getNoteById);
router.post('/', validate(createNoteSchema), createNote);
router.post('/upload', upload.single('file'), uploadNoteFile);
router.put('/:id', validate(updateNoteSchema), updateNote);
router.delete('/:id', deleteNote);

export default router;
