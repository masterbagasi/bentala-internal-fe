import { Config } from '@remotion/cli/config'

// Tell the CLI where the entry file lives. `npx remotion preview` and
// `npx remotion render` both read this. Anything imported from `remotion/index.ts`
// gets bundled into the studio.
Config.setEntryPoint('./remotion/index.ts')
Config.setVideoImageFormat('jpeg')
Config.setOverwriteOutput(true)

// Use H.264 / MP4 by default — broadly compatible with social platforms.
Config.setCodec('h264')

// Concurrency: Remotion auto-detects, but we cap it so server renders don't
// pin every CPU on a shared dev machine.
Config.setConcurrency(2)
