import '../../compiler/jsx';
import { PropertyGroup } from './PropertyGroup';

function renderGroup(title?: string) {
  const group = new PropertyGroup({ props: { title } });
  group._createRenderer();
  group.render();
  return group;
}

describe('PropertyGroup', () => {
  it('renders the title above a slot for rows', () => {
    const group = renderGroup('Account');
    expect(group.shadow!.querySelector('h4')?.textContent).toBe('Account');
    expect(group.shadow!.querySelector('.rows slot')).not.toBeNull();
  });

  it('omits the heading without a title', () => {
    expect(renderGroup().shadow!.querySelector('h4')).toBeNull();
  });
});
