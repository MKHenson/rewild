import {
  OutputMedia,
  listOutputDevices,
  revealOutputDevices,
} from './OutputDevices';

function device(kind: MediaDeviceKind, deviceId: string, label: string) {
  return { kind, deviceId, label, groupId: '' } as MediaDeviceInfo;
}

function media(devices: MediaDeviceInfo[], allow = true) {
  const stopped: string[] = [];
  const fake = {
    stopped,
    enumerateDevices: async () => devices,
    getUserMedia: async () => {
      if (!allow) throw new DOMException('Denied', 'NotAllowedError');
      return {
        getTracks: () => [{ stop: () => stopped.push('mic') }],
      } as unknown as MediaStream;
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  return fake as unknown as OutputMedia & { stopped: string[] };
}

describe('listOutputDevices', () => {
  it('lists the named outputs, apart from the default and the aliases', async () => {
    const list = await listOutputDevices(
      media([
        device('audiooutput', 'default', 'Default - Speakers'),
        device('audiooutput', 'communications', 'Communications - Phones'),
        device('audiooutput', 'speakers', 'Speakers'),
        device('audiooutput', 'phones', 'Phones'),
        device('audioinput', 'mic', 'Microphone'),
      ])
    );
    expect(list).toEqual([
      { id: 'speakers', label: 'Speakers' },
      { id: 'phones', label: 'Phones' },
    ]);
  });

  it('lists nothing while the browser hides the names', async () => {
    const list = await listOutputDevices(
      media([device('audiooutput', '', '')])
    );
    expect(list).toEqual([]);
  });
});

describe('revealOutputDevices', () => {
  it('asks for the microphone and lets it go at once', async () => {
    const m = media([]);
    expect(await revealOutputDevices(m)).toBe(true);
    expect(m.stopped).toEqual(['mic']);
  });

  it('is false when refused', async () => {
    expect(await revealOutputDevices(media([], false))).toBe(false);
  });
});
