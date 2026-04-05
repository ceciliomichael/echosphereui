import { mkdir, access, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRootPath = path.resolve(__dirname, '..')
const executableName = process.platform === 'win32' ? 'rg.exe' : 'rg'

const sourcePath = path.join(path.dirname(require.resolve('@vscode/ripgrep/package.json')), 'bin', executableName)
const targetDirectoryPath = path.join(repoRootPath, 'resources', 'ripgrep')
const targetPath = path.join(targetDirectoryPath, executableName)

await access(sourcePath)
await mkdir(targetDirectoryPath, { recursive: true })
await copyFile(sourcePath, targetPath)

console.log(`Synced ripgrep binary to ${targetPath}`)
