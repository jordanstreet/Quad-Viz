import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    modulePreload: false,
    license: { fileName: 'dependency-licenses.json' },
  },
});
