import { build } from 'vite';
import { z } from 'zod';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = await mkdtemp(join(tmpdir(), 'salu-backup-schema-'));
try {
  await build({
    configFile: false,
    build: {
      lib: {
        entry: 'src/prototype/storage-model.ts',
        formats: ['cjs'],
        fileName: () => 'model.cjs',
      },
      outDir: directory,
      minify: false,
    },
  });
  const { bundleSchema } = await import(pathToFileURL(join(directory, 'model.cjs')));
  await writeFile(
    '../backend/src/main/resources/personal-backup-schema.json',
    `${JSON.stringify(z.toJSONSchema(bundleSchema), null, 2)}\n`,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
