import '../../compiler/jsx';
import { Breadcrumbs, BreadcrumbItem } from './Breadcrumbs';

function renderCrumbs(items: BreadcrumbItem[]) {
  const crumbs = new Breadcrumbs({ props: { items } });
  crumbs._createRenderer();
  crumbs.render();
  return crumbs;
}

describe('Breadcrumbs', () => {
  it('renders earlier crumbs with a handler as buttons', () => {
    const onClick = jest.fn();
    const crumbs = renderCrumbs([
      { label: 'Admin', onClick },
      { label: 'Users', onClick },
      { label: 'Jane' },
    ]);

    const buttons = crumbs.shadow!.querySelectorAll('button');
    expect(buttons.length).toBe(2);
    buttons[0].click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('marks the last crumb as the current page even with a handler', () => {
    const crumbs = renderCrumbs([
      { label: 'Admin', onClick: () => {} },
      { label: 'Jane', onClick: () => {} },
    ]);

    const current = crumbs.shadow!.querySelector('[aria-current="page"]');
    expect(current?.textContent).toBe('Jane');
    expect(current?.tagName).toBe('SPAN');
  });

  it('separates crumbs without trailing a separator', () => {
    const crumbs = renderCrumbs([
      { label: 'A', onClick: () => {} },
      { label: 'B', onClick: () => {} },
      { label: 'C' },
    ]);

    expect(crumbs.shadow!.querySelectorAll('x-icon').length).toBe(2);
  });
});
