import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const PROJECT_ROOT = join(__dirname, '..', '..')
export const DATA_DIR = join(PROJECT_ROOT, 'public', 'data')
export const RUNTIME_DIR = join(PROJECT_ROOT, '.runtime')
