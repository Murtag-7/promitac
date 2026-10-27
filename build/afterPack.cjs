// Ad-hoc code signature for macOS builds (no paid Apple certificate).
// Apple Silicon refuses to run unsigned binaries; an ad-hoc signature ("-") is enough
// once the user confirms the Gatekeeper prompt (see docs/INSTALL.md).
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appName = `${context.packager.appInfo.productFilename}.app`
  const appPath = path.join(context.appOutDir, appName)
  console.log(`[afterPack] ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--verbose', appPath], { stdio: 'inherit' })
}
