import { resolveColor } from './color';
import { parseCssColor, themeVariable, UITheme } from './theme';

describe('themeVariable', () => {
  it('names the custom property in style.css', () => {
    expect(themeVariable('surface')).toBe('--surface');
    expect(themeVariable('onSurfaceLight')).toBe('--on-surface-light');
    expect(themeVariable('primary400')).toBe('--primary-400');
    expect(themeVariable('glassEdge')).toBe('--glass-edge');
  });
});

describe('parseCssColor', () => {
  it('parses hex', () => {
    expect(parseCssColor(' #ff0033')).toEqual([1, 0, 0.2, 1]);
    expect(parseCssColor('#fff')).toEqual([1, 1, 1, 1]);
  });

  it('parses rgb and rgba, with commas or spaces', () => {
    expect(parseCssColor('rgb(255, 0, 51)')).toEqual([1, 0, 0.2, 1]);
    expect(parseCssColor('rgba(0, 0, 0, 0.18)')).toEqual([0, 0, 0, 0.18]);
    expect(parseCssColor('rgb(0 0 0 / 25%)')).toEqual([0, 0, 0, 0.25]);
  });

  it('gives null for anything else', () => {
    expect(parseCssColor('')).toBeNull();
    expect(parseCssColor('60%')).toBeNull();
    expect(parseCssColor('red')).toBeNull();
    expect(parseCssColor('#12')).toBeNull();
  });
});

describe('resolveColor', () => {
  const theme = new UITheme();
  theme.set({ surface: [0.1, 0.2, 0.3, 1] });

  it('reads a theme colour by name', () => {
    expect(resolveColor('surface', theme)).toEqual([0.1, 0.2, 0.3, 1]);
  });

  it('scales a theme colour by its alpha', () => {
    expect(resolveColor({ theme: 'surface', alpha: 0.6 }, theme)).toEqual([
      0.1, 0.2, 0.3, 0.6,
    ]);
  });

  it('gives transparent for a theme colour that is not set, or no theme', () => {
    expect(resolveColor('glassEdge', theme)).toEqual([0, 0, 0, 0]);
    expect(resolveColor('surface', null)).toEqual([0, 0, 0, 0]);
  });

  it('parses a hex colour with no theme', () => {
    expect(resolveColor('#ff0000', null)).toEqual([1, 0, 0, 1]);
  });
});

describe('UITheme', () => {
  it('counts each change, so surfaces draw again', () => {
    const theme = new UITheme();
    const before = theme.revision;
    theme.set({ surface: [1, 1, 1, 1] });
    expect(theme.revision).toBe(before + 1);
  });
});
