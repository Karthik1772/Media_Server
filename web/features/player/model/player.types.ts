export interface PlayerPreferences {
  volume: number;
  muted: boolean;
  speed: number;
  subSize: number;
  subColor: string;
}

export interface PlayerHudState {
  big: string;
  small?: string;
  bar?: number;
  n: number;
}

export interface PlayerGestureState {
  id: number;
  x: number;
  y: number;
  touch: boolean;
  mode: "" | "pan" | "seek" | "bright" | "vol";
  zx: number;
  zy: number;
  t0: number;
  v0: number;
  b0: number;
  target?: number;
}

export interface PlayerPinchState {
  d0: number;
  s0: number;
  mx0: number;
  my0: number;
  x0: number;
  y0: number;
}
