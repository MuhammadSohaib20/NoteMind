import { Router } from 'express';
import multer from 'multer';
import {
  listNotes,
  getNoteById,
  getNoteFile,
  createNote,
  uploadNoteFile,
  updateNote,
  deleteNote,
  listTrashedNotes,
  restoreNote,
  permanentlyDeleteNote,
  createNoteSchema,
  updateNoteSchema,
  indexNotes,
  indexNotesSchema,
} from '../controllers/notes.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { MAX_NOTE_FILE_SIZE_BYTES } from '../constants/noteFiles';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_NOTE_FILE_SIZE_BYTES },
});

const router = Router();

router.use(authenticate);

router.get('/trash', listTrashedNotes);
router.get('/', listNotes);
router.get('/:id/file', getNoteFile);
router.get('/:id', getNoteById);
router.post('/', validate(createNoteSchema), createNote);
router.post('/index', validate(indexNotesSchema), indexNotes);
router.post('/upload', upload.single('file'), uploadNoteFile);
router.put('/:id', validate(updateNoteSchema), updateNote);
router.post('/:id/restore', restoreNote);
router.delete('/:id/permanent', permanentlyDeleteNote);
router.delete('/:id', deleteNote);

export default router;
