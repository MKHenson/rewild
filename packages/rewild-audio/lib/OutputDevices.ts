export interface OutputDevice {
  id: string;
  label: string;
}

/** The parts of `navigator.mediaDevices` the output devices need. */
export type OutputMedia = Pick<
  MediaDevices,
  | 'enumerateDevices'
  | 'getUserMedia'
  | 'addEventListener'
  | 'removeEventListener'
>;

/** Device ids that stand for another device rather than being one. */
const ALIASES = ['default', 'communications'];

/** Whether this browser can send an AudioContext to a chosen device. */
export function canChooseOutputDevice(): boolean {
  return (
    typeof AudioContext !== 'undefined' && 'setSinkId' in AudioContext.prototype
  );
}

/**
 * The named audio outputs, apart from the system default. Chrome hides the
 * names, and lists no device, until the page has had microphone permission;
 * `revealOutputDevices` asks for it.
 */
export async function listOutputDevices(
  media: OutputMedia
): Promise<OutputDevice[]> {
  const devices = await media.enumerateDevices();
  return devices
    .filter(
      (d) =>
        d.kind === 'audiooutput' &&
        d.deviceId &&
        d.label &&
        !ALIASES.includes(d.deviceId)
    )
    .map((d) => ({ id: d.deviceId, label: d.label }));
}

/**
 * Asks for microphone permission, which is what Chrome gates output device
 * names on, then lets the microphone go at once. False if refused.
 */
export async function revealOutputDevices(
  media: OutputMedia
): Promise<boolean> {
  try {
    const stream = await media.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
    return true;
  } catch {
    return false;
  }
}
