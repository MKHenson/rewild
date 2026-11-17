import { requestUIDevice, UIFont, UIIcons } from '../lib';
import './examples';
import { Inspector } from './Inspector';
import { registry } from './registry';
import { loadSettings } from './settings';

async function start() {
  const main = document.getElementById('examples')!;
  let device: GPUDevice;
  let font: UIFont;
  let icons: UIIcons;
  try {
    device = await requestUIDevice();
    [font, icons] = await Promise.all([
      UIFont.load(device, '/fonts/roboto-msdf.json'),
      UIIcons.load(device, '/icons/lucide-icons.json'),
    ]);
  } catch (error) {
    main.textContent = (error as Error).message;
    return;
  }

  device.lost.then((info) => {
    main.textContent = `The GPU device was lost: ${info.message}`;
  });

  new Inspector(
    device,
    font,
    icons,
    registry,
    loadSettings(),
    document.getElementById('parts')!,
    document.getElementById('tools')!,
    main
  );
}

start();
