import {
  Button,
  Component,
  Field,
  register,
  Select,
  Typography,
} from 'rewild-ui';
import {
  OutputDevice,
  OutputMedia,
  canChooseOutputDevice,
  listOutputDevices,
  revealOutputDevices,
} from 'rewild-audio';
import { audioSettings } from '../../core/audio/audio';

type Props = {
  /** The browser's media devices; `navigator.mediaDevices` when left out. */
  media?: OutputMedia | null;
  /** Whether the browser can choose a device; asks the browser when left out. */
  supported?: boolean;
};

const DEFAULT_LABEL = 'System default';

/** Picks the device the game plays through, applied and stored at once. */
@register('x-output-device')
export class OutputDeviceField extends Component<Props> {
  init() {
    const media =
      this.props.media !== undefined
        ? this.props.media
        : typeof navigator !== 'undefined'
        ? navigator.mediaDevices ?? null
        : null;
    const supported =
      !!media && (this.props.supported ?? canChooseOutputDevice());
    const [devices, setDevices] = this.useState<OutputDevice[] | null>(null);
    const [asked, setAsked] = this.useState<'no' | 'allowed' | 'refused'>('no');
    const [chosenId, setChosenId] = this.useState(
      audioSettings.outputDevice.id
    );

    const refresh = async () => {
      if (!media) return;
      try {
        setDevices(await listOutputDevices(media));
      } catch {
        setDevices([]);
      }
    };

    const reveal = async () => {
      if (!media) return;
      setAsked((await revealOutputDevices(media)) ? 'allowed' : 'refused');
      await refresh();
    };

    const onChange = (id: string) => {
      const chosen = audioSettings.outputDevice;
      const label =
        devices()?.find((d) => d.id === id)?.label ??
        (id === chosen.id ? chosen.label : '');
      audioSettings.setOutputDevice({ id, label });
      setChosenId(id);
    };

    if (supported) {
      this.onMount = () => {
        media!.addEventListener('devicechange', refresh);
        refresh();
      };
      this.onCleanup = () =>
        media!.removeEventListener('devicechange', refresh);
    }

    return () => {
      if (!supported)
        return (
          <div class="section">
            <Field label="Output device">
              <Typography variant="light">
                This browser plays through the system's default device only.
              </Typography>
            </Field>
          </div>
        );

      const list = devices() ?? [];
      const chosen = audioSettings.outputDevice;
      const options = [
        { value: '', label: DEFAULT_LABEL },
        ...list.map((d) => ({ value: d.id, label: d.label })),
      ];
      if (chosen.id && !list.some((d) => d.id === chosen.id))
        options.push({
          value: chosen.id,
          label: `${chosen.label || 'Chosen device'} (not connected)`,
        });

      return (
        <div class="section">
          <Field label="Output device">
            <Select value={chosenId()} options={options} onChange={onChange} />
          </Field>
          {devices() && !list.length && asked() === 'allowed' ? (
            <Typography variant="light">
              No other devices are connected.
            </Typography>
          ) : devices() && !list.length ? (
            <div class="reveal">
              <Typography variant="light">
                {asked() === 'refused'
                  ? 'The browser was not allowed to name your devices.'
                  : 'Your browser names your devices only once the game may use the microphone. The game never records.'}
              </Typography>
              <Button size="s" variant="outlined" onClick={reveal}>
                Show devices
              </Button>
            </div>
          ) : (
            <Typography variant="info">
              Speakers or headphones to play the game through.
            </Typography>
          )}
        </div>
      );
    };
  }

  getStyle() {
    return css`
      .section {
        margin: 0 0 1.25rem 0;
      }
      .section x-typography {
        margin: 6px 0 0 0;
      }
      .reveal {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }
    `;
  }
}
