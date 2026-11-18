/** A single 3D point in normalized image space (0–1, origin top-left, un-mirrored). z ≈ depth, same scale as x. */
export interface Pt {
  x: number
  y: number
  z: number
}

/** 21 MediaPipe hand landmarks for one hand. */
export type HandLandmarks = Pt[]

/** Upper-body points used for context (face/shoulder region) and overlay lines. */
export interface UpperBody {
  nose?: Pt
  lShoulder?: Pt
  rShoulder?: Pt
  lElbow?: Pt
  rElbow?: Pt
  lWrist?: Pt
  rWrist?: Pt
}

/** One processed input frame, from the webcam or from the demo simulator. */
export interface InputFrame {
  t: number
  hands: HandLandmarks[]
  body: UpperBody | null
  /** Source pixel size, used for aspect correction and overlay mapping. */
  width: number
  height: number
}

export type HandShape =
  | 'OPEN' // 5-hand
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'K'
  | 'L'
  | 'M'
  | 'N'
  | 'O'
  | 'P'
  | 'Q'
  | 'R'
  | 'S' // closed fist, thumb across
  | 'T'
  | 'U'
  | 'V'
  | 'W'
  | 'X'
  | 'Y'
  | 'A'
  | 'ILY'
  | 'INDEX' // index up, thumb tucked
  | 'POINT_OUT' // index pointing at the camera (you)
  | 'POINT_IN' // index pointing back at the signer (me)
  | 'THUMB_UP'
  | 'THUMB_DOWN'
  | 'UNKNOWN'

export type Letter =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'O' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'U' | 'V' | 'W' | 'X' | 'Y' | 'Z'

export type WordSignId =
  | 'KUMUSTA'
  | 'HELLO_SALUTE'
  | 'PAALAM'
  | 'SALAMAT'
  | 'WALANG_ANUMAN'
  | 'OO'
  | 'HINDI'
  | 'NO_SNAP'
  | 'PAKIUSAP'
  | 'PATAWAD'
  | 'TULONG'
  | 'MAHAL_KITA'
  | 'MAGALING'
  | 'MALI'
  | 'AKO'
  | 'IKAW'
  | 'GUSTO'
  | 'KAILANGAN'
  | 'SAAN'
  | 'ANO'
  | 'TUBIG'
  | 'KAIN'

export type SignId = WordSignId | Letter

export interface Detection {
  id: SignId
  confidence: number
}

/** Subtitle output language. */
export type SubtitleMode = 'FIL' | 'EN' | 'BI'

/** Which sign language's vocabulary/variants are active. */
export type Standard = 'FSL' | 'ASL' | 'BOTH'
