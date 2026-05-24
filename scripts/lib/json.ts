import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { DATA_DIR, RUNTIME_DIR } from './paths'

export async function readDataFile<T>(name: string, fallback: T): Promise<T> {
  const path = join(DATA_DIR, name)
  try {
    const content = await readFile(path, 'utf8')
    return JSON.parse(content) as T
  } catch (error) {
    if (isNotFound(error)) {
      return fallback
    }

    throw new Error(`Could not read ${name}: ${String(error)}`, { cause: error })
  }
}

export async function writeDataFile<T>(name: string, data: T): Promise<void> {
  const path = join(DATA_DIR, name)
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

export async function readRuntimeState<T>(name: string, fallback: T): Promise<T> {
  const path = join(RUNTIME_DIR, name)
  try {
    const content = await readFile(path, 'utf8')
    return JSON.parse(content) as T
  } catch (error) {
    if (isNotFound(error)) {
      return fallback
    }

    throw new Error(`Could not read runtime state ${name}: ${String(error)}`, { cause: error })
  }
}

export async function writeRuntimeState<T>(name: string, data: T): Promise<void> {
  const path = join(RUNTIME_DIR, name)
  await mkdir(RUNTIME_DIR, { recursive: true })
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  )
}
