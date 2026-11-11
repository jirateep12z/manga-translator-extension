export function WaitAnimationFrames(frame_count: number): Promise<void> {
  return new Promise(resolve => {
    let remaining_frames = frame_count;
    const OnFrame = () => {
      remaining_frames--;

      if (remaining_frames <= 0) resolve();
      else requestAnimationFrame(OnFrame);
    };

    requestAnimationFrame(OnFrame);
  });
}
