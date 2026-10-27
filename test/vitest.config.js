import { defineConfig } from 'vitest/config';

// тест на сотни случайных проектов считает долго: запас по времени
export default defineConfig({ test: { testTimeout: 60000 } });
