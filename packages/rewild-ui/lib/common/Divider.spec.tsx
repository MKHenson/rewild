import '../../compiler/jsx';
import { Divider } from './Divider';

describe('Divider', () => {
  it('returns a divider element with expected class', () => {
    const divider = Divider() as HTMLDivElement;

    expect(divider.tagName).toBe('DIV');
    expect(divider.className).toBe('divider');
  });

  it('applies inline border style', () => {
    const divider = Divider() as HTMLDivElement;

    const style = divider.getAttribute('style') || '';
    expect(style).toContain('width: 100%');
    expect(style).toContain('height: 1px');
  });
});
