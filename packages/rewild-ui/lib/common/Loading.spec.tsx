import '../../compiler/jsx';
import { Loading } from './Loading';
import { createNautilusGeometry } from '../utils/nautilus';

const mount = (props?: Record<string, unknown>) => {
  const loading = new Loading();
  loading._createRenderer();
  if (props) loading.props = { ...loading.props, ...props } as any;
  else loading.render();
  return loading;
};

describe('Loading', () => {
  it('draws one path per nautilus chamber', () => {
    const loading = mount();
    const shell = loading.shadow?.querySelector('svg.shell');

    expect(shell).not.toBeNull();
    expect(shell?.getAttribute('viewBox')).toBe(createNautilusGeometry().viewBox);
    expect(loading.shadow?.querySelectorAll('path.chamber').length).toBe(
      createNautilusGeometry().chambers.length
    );
  });

  it('staggers the chambers so the highlight sweeps outwards', () => {
    const loading = mount();
    const delays = Array.from(
      loading.shadow?.querySelectorAll('path.chamber') ?? []
    ).map((path) =>
      parseFloat(path.getAttribute('style')!.replace('animation-delay:', ''))
    );

    expect(delays[0]).toBe(0);
    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeLessThan(delays[i - 1]);
    }
  });

  it('sizes the shell from the size prop', () => {
    const shell = mount({ size: 48 }).shadow?.querySelector('svg.shell');

    expect(shell?.getAttribute('width')).toBe('48');
    expect(shell?.getAttribute('height')).toBe('48');
  });

  it('omits the caption unless a label is given', () => {
    expect(mount().shadow?.querySelector('.label')).toBeNull();
  });

  it('renders an animated caption for the label variant', () => {
    const loading = mount({ label: 'Loading' });
    const label = loading.shadow?.querySelector('.label');

    expect(label?.textContent).toBe('Loading...');
    expect(label?.querySelectorAll('.dot').length).toBe(3);
    expect(loading.getAttribute('aria-label')).toBe('Loading');
  });

  it('marks itself as an overlay only when asked', () => {
    expect(mount().hasAttribute('overlay')).toBe(false);
    expect(mount({ overlay: true }).hasAttribute('overlay')).toBe(true);
  });
});
