import '../../compiler/jsx';
import { Autocomplete, AutocompleteProps } from './Autocomplete';

type Item = { id: string; name: string };

const flush = () => new Promise((r) => setTimeout(r, 0));

function renderAutocomplete(props: Partial<AutocompleteProps<Item>>) {
  const onSelect = jest.fn();
  const cmp = new Autocomplete<Item>({
    props: {
      search: async () => [],
      renderItem: (item) => <span>{item.name}</span>,
      onSelect,
      debounce: 0,
      ...props,
    },
  });
  cmp._createRenderer();
  document.body.appendChild(cmp);
  return { cmp, onSelect };
}

const input = (cmp: Autocomplete<Item>) => cmp.shadow!.querySelector('input')!;
const list = (cmp: Autocomplete<Item>) => cmp.shadow!.querySelector('.list')!;
const rows = (cmp: Autocomplete<Item>) => Array.from(list(cmp).querySelectorAll('.item')) as HTMLElement[];

async function type(cmp: Autocomplete<Item>, value: string) {
  input(cmp).value = value;
  input(cmp).dispatchEvent(new Event('input'));
  for (let i = 0; i < 3; i++) await flush();
}

function key(cmp: Autocomplete<Item>, name: string) {
  input(cmp).dispatchEvent(new KeyboardEvent('keydown', { key: name }));
}

const items: Item[] = [
  { id: '1', name: 'Ada' },
  { id: '2', name: 'Adam' },
];

describe('Autocomplete', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('searches with the trimmed query and lists the results', async () => {
    const search = jest.fn().mockResolvedValue(items);
    const { cmp } = renderAutocomplete({ search });

    await type(cmp, '  ad ');

    expect(search).toHaveBeenCalledWith('ad');
    expect(list(cmp).classList.contains('open')).toBe(true);
    expect(rows(cmp).map((r) => r.textContent)).toEqual(['Ada', 'Adam']);
  });

  it('turns off browser autofill on the field', () => {
    const { cmp } = renderAutocomplete({});

    expect(input(cmp).type).toBe('search');
    expect(input(cmp).getAttribute('autocomplete')).toBe('off');
    expect(input(cmp).hasAttribute('data-1p-ignore')).toBe(true);
  });

  it('does not search below the minimum length', async () => {
    const search = jest.fn().mockResolvedValue(items);
    const { cmp } = renderAutocomplete({ search, minLength: 2 });

    await type(cmp, 'a');

    expect(search).not.toHaveBeenCalled();
    expect(list(cmp).classList.contains('open')).toBe(false);
  });

  it('selects a clicked result and clears the field', async () => {
    const { cmp, onSelect } = renderAutocomplete({ search: async () => items });

    await type(cmp, 'ad');
    rows(cmp)[1].click();

    expect(onSelect).toHaveBeenCalledWith(items[1]);
    expect(input(cmp).value).toBe('');
    expect(list(cmp).classList.contains('open')).toBe(false);
  });

  it('moves through the results with the arrow keys and selects with Enter', async () => {
    const { cmp, onSelect } = renderAutocomplete({ search: async () => items });

    await type(cmp, 'ad');
    expect(rows(cmp)[0].classList.contains('active')).toBe(true);
    key(cmp, 'ArrowDown');
    expect(rows(cmp)[1].classList.contains('active')).toBe(true);
    key(cmp, 'ArrowDown');
    expect(rows(cmp)[0].classList.contains('active')).toBe(true);
    key(cmp, 'ArrowUp');
    key(cmp, 'Enter');

    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it('closes on Escape', async () => {
    const { cmp } = renderAutocomplete({ search: async () => items });

    await type(cmp, 'ad');
    key(cmp, 'Escape');

    expect(list(cmp).classList.contains('open')).toBe(false);
  });

  it('shows the empty message when nothing matches', async () => {
    const { cmp } = renderAutocomplete({ emptyMessage: 'Nobody here' });

    await type(cmp, 'zz');

    expect(list(cmp).textContent).toBe('Nobody here');
  });

  it('shows a failed search as a message', async () => {
    const { cmp } = renderAutocomplete({
      search: async () => {
        throw new Error('Search is down');
      },
    });

    await type(cmp, 'ad');

    expect(list(cmp).textContent).toBe('Search is down');
  });

  it('drops a reply that arrives after a newer query', async () => {
    let resolveFirst!: (value: Item[]) => void;
    const search = jest
      .fn()
      .mockReturnValueOnce(new Promise<Item[]>((r) => (resolveFirst = r)))
      .mockResolvedValueOnce([items[1]]);
    const { cmp } = renderAutocomplete({ search });

    await type(cmp, 'ad');
    await type(cmp, 'adam');
    resolveFirst([items[0]]);
    await flush();

    expect(rows(cmp).map((r) => r.textContent)).toEqual(['Adam']);
  });

  it('waits for typing to pause before searching', async () => {
    jest.useFakeTimers();
    try {
      const search = jest.fn().mockResolvedValue(items);
      const { cmp } = renderAutocomplete({ search, debounce: 250 });

      input(cmp).value = 'ad';
      input(cmp).dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(200);
      input(cmp).value = 'ada';
      input(cmp).dispatchEvent(new Event('input'));
      jest.advanceTimersByTime(250);

      expect(search).toHaveBeenCalledTimes(1);
      expect(search).toHaveBeenCalledWith('ada');
    } finally {
      jest.useRealTimers();
    }
  });
});
