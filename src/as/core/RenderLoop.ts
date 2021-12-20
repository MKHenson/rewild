export type RenderLoopCallback = (delta: f32, totalTime: u32, fps: u32) => void;

/**
 * A class to encapsulate a rate limited render loop
 */
export class RenderLoop {
  private callback: RenderLoopCallback;
  private msLastFrame: u32;
  private msFpsLimit: u32;
  private isFPSLimited: boolean;
  private totalTime: u32;

  constructor(callback: RenderLoopCallback, fps: u32 = 0) {
    this.msLastFrame = 0;
    this.callback = callback;
    this.totalTime = 0;
    this.msFpsLimit = 0;
    this.isFPSLimited = false;

    // Check if we need to limit the FPS
    if (fps && fps > 0) {
      this.isFPSLimited = true;

      // Calc how many milliseconds per frame in one second of time.
      this.msFpsLimit = 1000 / fps;
    }
  }

  onFrame(now: u32): RenderLoop {
    const msDelta: u32 = now - this.msLastFrame;
    this.totalTime += msDelta;

    // Check if we need to limit the FPS
    if (this.isFPSLimited) {
      // What fraction of a single second is the delta time
      const deltaTime: f32 = f32(msDelta) / 1000.0;

      // Now execute frame since the time has elapsed.
      if (msDelta >= this.msFpsLimit) {
        const fps: f32 = Mathf.floor(1 / deltaTime);
        this.msLastFrame = now;
        this.callback(deltaTime, this.totalTime, u32(fps));
      }
    } else {
      // Calculate Deltatime between frames and the FPS currently.
      // ms between frames, Then / by 1 second to get the fraction of a second.
      let deltaTime: f32 = f32(now - this.msLastFrame) / 1000.0;

      if (deltaTime == 0) return this;

      // Now execute frame since the time has elapsed.
      // Time it took to generate one frame, divide 1 by that to get how many frames in one second.
      const fps: f32 = Mathf.floor(1 / deltaTime);
      this.msLastFrame = now;
      this.callback(deltaTime, this.totalTime, u32(fps));
    }

    return this;
  }
}
