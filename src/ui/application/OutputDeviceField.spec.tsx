import 'rewild-ui/compiler/jsx';
import { Button, Select } from 'rewild-ui';
import { flushMicrotasks } from 'rewild-ui/lib/test-utils';
import { AUDIO_SETTINGS_KEY, OutputMedia } from 'rewild-audio';
import { audioSettings } from '../../core/audio/audio';
import { OutputDeviceField } from './OutputDeviceField';

function device(deviceId: string, label: string) {
  return {
    kind: 'audiooutput',
    deviceId,
    label,
    groupId: '',
  } as MediaDeviceInfo;
}

/** Media devices that hide their names until the microphone is allowed. */
function fakeMedia(devices: MediaDeviceInfo[], allow = true) {
  let revealed = false;
  const target = new EventTarget();
  const media = {
    enumerateDevices: async () => (revealed ? devices : [device('', '')]),
    getUserMedia: async () => {
      if (!allow) throw new DOMException('Denied', 'NotAllowedError');
      revealed = true;
      return { getTracks: () => [] } as unknown as MediaStream;
    },
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    reveal: () => (revealed = true),
    plug: (d: MediaDeviceInfo) => {
      devices = [...devices, d];
      target.dispatchEvent(new Event('devicechange'));
    },
  };
  return media as unknown as OutputMedia & typeof media;
}

const PHONES = device('phones', 'Phones');
const SPEAKERS = device('speakers', 'Speakers');

describe('OutputDeviceField', () => {
  afterEach(async () => {
    await audioSettings.setOutputDevice({ id: '', label: '' });
    localStorage.clear();
    document.body.replaceChildren();
  });

  async function mount(media: OutputMedia | null, supported = true) {
    const field = (
      <OutputDeviceField media={media} supported={supported} />
    ) as OutputDeviceField;
    document.body.appendChild(field);
    await flushMicrotasks();
    await flushMicrotasks();
    return field;
  }

  const selectOf = (field: OutputDeviceField) =>
    field.shadow!.querySelector('x-select') as Select;
  const buttonOf = (field: OutputDeviceField) =>
    field.shadow!.querySelector('x-button') as Button | null;
  const labels = (field: OutputDeviceField) =>
    selectOf(field).props.options.map((o) => o.label);

  it('says so when the browser cannot choose a device', async () => {
    const field = await mount(fakeMedia([PHONES]), false);
    expect(selectOf(field)).toBeNull();
    expect(field.shadow!.textContent).toContain('default device only');
  });

  it('lists the devices after the system default', async () => {
    const media = fakeMedia([PHONES, SPEAKERS]);
    media.reveal();
    const field = await mount(media);
    expect(labels(field)).toEqual(['System default', 'Phones', 'Speakers']);
    expect(buttonOf(field)).toBeNull();
  });

  it('asks to show the devices while the browser hides them', async () => {
    const field = await mount(fakeMedia([PHONES]));
    expect(labels(field)).toEqual(['System default']);

    buttonOf(field)!.props.onClick!(new MouseEvent('click'));
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(labels(field)).toEqual(['System default', 'Phones']);
  });

  it('keeps asking when refused', async () => {
    const field = await mount(fakeMedia([PHONES], false));
    buttonOf(field)!.props.onClick!(new MouseEvent('click'));
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();
    expect(field.shadow!.textContent).toContain('not allowed');
    expect(buttonOf(field)).not.toBeNull();
  });

  it('chooses a device and stores it with its name', async () => {
    const media = fakeMedia([PHONES]);
    media.reveal();
    const field = await mount(media);
    selectOf(field).props.onChange!('phones');
    await flushMicrotasks();
    expect(selectOf(field).props.value).toBe('phones');
    expect(audioSettings.outputDevice).toEqual({
      id: 'phones',
      label: 'Phones',
    });
    expect(
      JSON.parse(localStorage.getItem(AUDIO_SETTINGS_KEY)!).outputDevice.id
    ).toBe('phones');
  });

  it('shows a chosen device that is not connected, and finds it when plugged in', async () => {
    await audioSettings.setOutputDevice({ id: 'phones', label: 'Phones' });
    const media = fakeMedia([SPEAKERS]);
    media.reveal();
    const field = await mount(media);
    expect(labels(field)).toContain('Phones (not connected)');
    expect(selectOf(field).props.value).toBe('phones');

    media.plug(PHONES);
    await flushMicrotasks();
    await flushMicrotasks();
    expect(labels(field)).toEqual(['System default', 'Speakers', 'Phones']);
  });
});
