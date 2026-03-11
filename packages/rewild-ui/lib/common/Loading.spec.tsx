import '../../compiler/jsx';
import { Loading } from './Loading';

describe('Loading', () => {
  it('renders a loading container with two child divs', () => {
    const loading = new Loading();

    loading._createRenderer();
    loading.render();

    const container = loading.shadow?.querySelector('div.loading');
    expect(container).not.toBeNull();

    const children = container?.querySelectorAll('div');
    expect(children?.length).toBe(2);
  });
});
