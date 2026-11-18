export interface TourStep {
  /** CSS selector of the element to spotlight. */
  target: string
  title: string
  body: string
  /** Show the hand framing guide on the video while this step is open. */
  guide?: boolean
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: '[data-tour="source"]',
    title: 'Choose an input',
    body: 'Use your live camera, upload a sign language video, or capture another tab such as a YouTube video or a video call. Demo Mode plays a built-in signer if you just want to look around.',
  },
  {
    target: '[data-tour="frame"]',
    title: 'Frame your hand',
    body: 'Keep your signing hand inside the dashed hand zone, around chest height, with the whole hand visible. Light from the front matters more than camera quality.',
    guide: true,
  },
  {
    target: '[data-tour="lock"]',
    title: 'Watch the ring fill',
    body: 'When a sign is recognized, its name appears here and the ring starts to fill. Hold a still sign, or keep a moving sign going, until the ring closes. That locks the sign in.',
  },
  {
    target: '[data-tour="transcript"]',
    title: 'String signs into sentences',
    body: 'Locked signs collect as gloss tokens and are rewritten into natural Filipino and English. Pause for two seconds to finish a sentence, then copy it or download an .srt subtitle file.',
  },
]
