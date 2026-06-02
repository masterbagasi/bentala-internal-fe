import { Composition } from 'remotion'
import { StorylineVideo, type StorylineProps, defaultStoryline } from './compositions/StorylineVideo'

// Root holds all compositions known to Remotion. Each <Composition> is a
// renderable target that the studio (preview), Player (embedded), and CLI
// (render) all reference by `id`.
export function RemotionRoot() {
  return (
    <>
      <Composition
        id="StorylineVideo"
        component={StorylineVideo}
        durationInFrames={defaultStoryline.scenes.reduce((sum, s) => sum + s.durationInFrames, 0)}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={defaultStoryline}
        // Allow the durationInFrames to be calculated from props at render time
        // so different storylines (4 scenes, 7 scenes, etc.) render correctly
        // without recompiling the composition.
        calculateMetadata={({ props }) => {
          const total = props.scenes.reduce((sum, s) => sum + s.durationInFrames, 0)
          return { durationInFrames: Math.max(total, 30) }
        }}
      />
    </>
  )
}
