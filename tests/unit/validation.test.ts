import { createNoteSchema, updateNoteSchema } from '../../src/controllers/notes.controller';
import { createCollectionSchema, updateCollectionSchema } from '../../src/controllers/collections.controller';
import { createTagSchema, updateTagSchema } from '../../src/controllers/tags.controller';
import { signupSchema, loginSchema, updatePasswordSchema } from '../../src/controllers/auth.controller';

describe('Zod Validation Schemas Unit Tests', () => {
  describe('Auth Validation', () => {
    it('should validate valid signup payload', async () => {
      const payload = { body: { email: 'test@notemind.ai', password: 'password123' } };
      await expect(signupSchema.parseAsync(payload)).resolves.toEqual(payload);
    });

    it('should reject invalid email for signup', async () => {
      const payload = { body: { email: 'invalid-email', password: 'password123' } };
      await expect(signupSchema.parseAsync(payload)).rejects.toThrow();
    });

    it('should reject short password (< 6 chars)', async () => {
      const payload = { body: { email: 'test@notemind.ai', password: '123' } };
      await expect(signupSchema.parseAsync(payload)).rejects.toThrow();
    });

    it('should validate valid update password payload', async () => {
      const payload = { body: { currentPassword: 'oldSecret123', newPassword: 'newSecret456' } };
      await expect(updatePasswordSchema.parseAsync(payload)).resolves.toEqual(payload);
    });

    it('should reject update password payload with newPassword < 6 chars', async () => {
      const payload = { body: { currentPassword: 'oldSecret123', newPassword: '123' } };
      await expect(updatePasswordSchema.parseAsync(payload)).rejects.toThrow();
    });
  });

  describe('Note Validation', () => {
    it('should validate create note payload', async () => {
      const payload = {
        body: {
          title: 'My Note',
          content: 'Some note content',
          tags: ['prisma', 'express'],
        },
      };
      await expect(createNoteSchema.parseAsync(payload)).resolves.toEqual(payload);
    });

    it('should reject empty title for create note', async () => {
      const payload = { body: { title: '', content: 'Content' } };
      await expect(createNoteSchema.parseAsync(payload)).rejects.toThrow();
    });
  });

  describe('Collection Validation', () => {
    it('should validate create collection payload', async () => {
      const payload = { body: { name: 'Work Project' } };
      await expect(createCollectionSchema.parseAsync(payload)).resolves.toEqual(payload);
    });

    it('should reject empty collection name', async () => {
      const payload = { body: { name: '' } };
      await expect(createCollectionSchema.parseAsync(payload)).rejects.toThrow();
    });
  });

  describe('Tag Validation', () => {
    it('should validate create tag payload', async () => {
      const payload = { body: { name: 'postgresql' } };
      await expect(createTagSchema.parseAsync(payload)).resolves.toEqual(payload);
    });

    it('should reject empty tag name', async () => {
      const payload = { body: { name: '' } };
      await expect(createTagSchema.parseAsync(payload)).rejects.toThrow();
    });
  });
});
