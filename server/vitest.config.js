import { defineConfig } from 'vitest/config';

// тесты делят одну БД и чистят её перед каждым случаем — файлы идут по очереди
export default defineConfig({ test: { fileParallelism: false, testTimeout: 20000 } });
