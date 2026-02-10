const { existsSync } = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const rootDir = path.resolve(__dirname, '..')
const fromDistMode = process.argv.includes('--from-dist')

/**
 * Launching through `open` detaches the app from the terminal process tree,
 * so users can close the shell without killing the Electron app window.
 */
const appCandidates = fromDistMode
  ? [path.join(rootDir, 'dist')]
  : [
      path.join(rootDir, 'release', 'mac-arm64', 'Pomodrone.app'),
      path.join(rootDir, 'release', 'mac', 'Pomodrone.app'),
      path.join(rootDir, 'release', 'mac-x64', 'Pomodrone.app'),
    ]

const appPath = appCandidates.find((candidate) => existsSync(candidate))

if (!appPath) {
  const tip = fromDistMode
    ? 'Run `npm run build` first to create the renderer output.'
    : 'Run `npm run release:mac` first to build a launchable macOS app bundle.'

  console.error(`No launch target found. ${tip}`)
  process.exit(1)
}

const args = fromDistMode ? ['-n', '--args', '.'] : ['-n', appPath]
const commandArgs = fromDistMode ? [path.join(rootDir, 'node_modules', '.bin', 'electron'), '.'] : [appPath]

if (fromDistMode) {
  const launchEnv = { ...process.env }
  delete launchEnv.ELECTRON_RUN_AS_NODE

  const child = spawn(commandArgs[0], [commandArgs[1]], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
    env: launchEnv,
  })
  child.unref()
  console.log('Pomodrone launched in detached mode from local build output.')
  process.exit(0)
}

const child = spawn('open', args, {
  detached: true,
  stdio: 'ignore',
})

child.unref()
console.log(`Pomodrone launched from ${appPath}`)
