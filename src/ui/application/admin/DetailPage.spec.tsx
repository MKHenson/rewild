import 'rewild-ui/compiler/jsx';
import { DetailPage } from './DetailPage';

describe('DetailPage', () => {
  it('renders breadcrumbs, an actions slot and a content slot', () => {
    const page = new DetailPage({
      props: { breadcrumbs: [{ label: 'Users', onClick: () => {} }, { label: 'Jane' }] },
    });
    page._createRenderer();
    page.render();

    const shadow = page.shadow!;
    const crumbs = shadow.querySelector('header x-breadcrumbs') as any;
    expect(crumbs.props.items.map((i: any) => i.label)).toEqual(['Users', 'Jane']);
    expect(shadow.querySelector('header slot[name="actions"]')).not.toBeNull();
    expect(shadow.querySelector('.content slot:not([name])')).not.toBeNull();
  });
});
