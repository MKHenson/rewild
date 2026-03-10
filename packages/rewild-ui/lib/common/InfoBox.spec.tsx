import '../../compiler/jsx';
import { InfoBox } from './InfoBox';

type InfoBoxOptions = NonNullable<ConstructorParameters<typeof InfoBox>[0]>;
type InfoBoxProps = InfoBoxOptions['props'];
type MaterialIconElement = HTMLElement & {
  _props?: {
    icon?: string;
    style?: string;
  };
};
type TypographyElement = HTMLElement & {
  _props?: {
    variant?: string;
    children?: unknown[];
  };
};

describe('InfoBox', () => {
  it('applies variant class to root content', () => {
    const props: InfoBoxProps = {
      variant: 'error',
      title: 'Failure',
    };
    const infoBox = new InfoBox({ props });

    infoBox._createRenderer();
    infoBox.render();

    const root = infoBox.shadow?.querySelector('div.error');
    expect(root).not.toBeNull();

    const titleTypography = infoBox.shadow?.querySelector(
      '.content > x-typography'
    ) as TypographyElement | null;
    expect(titleTypography).not.toBeNull();
    expect(titleTypography?._props?.children?.[0]).toBe('Failure');
  });

  it('selects warning icon for warning variant', () => {
    const props: InfoBoxProps = {
      variant: 'warning',
      title: 'Heads up',
    };
    const infoBox = new InfoBox({ props });

    infoBox._createRenderer();
    infoBox.render();

    const icon = infoBox.shadow?.querySelector(
      'x-material-icon'
    ) as MaterialIconElement | null;
    expect(icon).not.toBeNull();
    expect(icon?._props?.icon).toBe('warning');
  });
});
