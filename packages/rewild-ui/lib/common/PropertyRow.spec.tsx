import '../../compiler/jsx';
import { PropertyRow } from './PropertyRow';

describe('PropertyRow', () => {
  it('renders the label beside a value slot', () => {
    const row = new PropertyRow({ props: { label: 'Email' } });
    row._createRenderer();
    row.render();

    expect(row.shadow!.querySelector('.label')?.textContent).toBe('Email');
    expect(row.shadow!.querySelector('.value slot')).not.toBeNull();
  });
});
