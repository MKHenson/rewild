import '../../compiler/jsx';
import { SplitPane } from './SplitPane';

type SplitPaneOptions = NonNullable<ConstructorParameters<typeof SplitPane>[0]>;
type SplitPaneProps = SplitPaneOptions['props'];

describe('SplitPane', () => {
  it('renders both panes', () => {
    const pane1 = document.createElement('div');
    const pane2 = document.createElement('div');
    const props: SplitPaneProps = { pane1, pane2 };
    const sp = new SplitPane({ props });

    sp._createRenderer();
    sp.render();

    const left = sp.shadow?.querySelector('.left');
    const right = sp.shadow?.querySelector('.right');
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
  });

  it('hides divider and second pane when pane2 is not provided', () => {
    const pane1 = document.createElement('div');
    const props: SplitPaneProps = { pane1 };
    const sp = new SplitPane({ props });

    sp._createRenderer();
    sp.render();

    const divider = sp.shadow?.querySelector('.divider') as HTMLElement;
    const right = sp.shadow?.querySelector('.right') as HTMLElement;
    expect(divider?.style.display).toBe('none');
    expect(right?.style.display).toBe('none');
  });

  it('applies vertical class for default vertical mode', () => {
    const pane1 = document.createElement('div');
    const props: SplitPaneProps = { pane1 };
    const sp = new SplitPane({ props });

    sp._createRenderer();
    sp.render();

    const rootDiv = sp.shadow?.firstElementChild as HTMLElement;
    expect(rootDiv?.classList.contains('vertical')).toBe(true);
  });

  it('applies horizontal class when mode is horizontal', () => {
    const pane1 = document.createElement('div');
    const props: SplitPaneProps = { pane1, mode: 'horizontal' };
    const sp = new SplitPane({ props });

    sp._createRenderer();
    sp.render();

    const rootDiv = sp.shadow?.querySelector('div');
    expect(rootDiv?.classList.contains('horizontal')).toBe(true);
  });

  it('displays pane titles in tabs', () => {
    const pane1 = document.createElement('div');
    const pane2 = document.createElement('div');
    const props: SplitPaneProps = {
      pane1,
      pane2,
      pane1Title: 'Editor',
      pane2Title: 'Preview',
    };
    const sp = new SplitPane({ props });

    sp._createRenderer();
    sp.render();

    const tabs = sp.shadow?.querySelectorAll('.tab');
    expect(tabs?.length).toBe(2);
    expect(tabs?.[0].textContent).toBe('Editor');
    expect(tabs?.[1].textContent).toBe('Preview');
  });

  it('hides empty tabs', () => {
    const pane1 = document.createElement('div');
    const pane2 = document.createElement('div');
    const props: SplitPaneProps = { pane1, pane2 };
    const sp = new SplitPane({ props });

    sp._createRenderer();
    sp.render();

    const tabs = sp.shadow?.querySelectorAll('.tab');
    expect(tabs?.[0].hasAttribute('empty')).toBe(true);
    expect(tabs?.[1].hasAttribute('empty')).toBe(true);
  });
});
