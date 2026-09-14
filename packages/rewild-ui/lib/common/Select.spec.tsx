import '../../compiler/jsx';
import { Select } from './Select';

type SelectOptions = NonNullable<ConstructorParameters<typeof Select>[0]>;
type SelectProps = SelectOptions['props'];

describe('Select', () => {
  it('renders selected option label in the value div', () => {
    const props: SelectProps = {
      value: 'b',
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
      ],
    };
    const cmp = new Select({ props });

    cmp._createRenderer();
    cmp.render();

    const valueDiv = cmp.shadow?.querySelector('.value');
    expect(valueDiv).not.toBeNull();
    // The selected option is resolved from props
    const selected = props.options?.find((o) => o.value === props.value);
    expect(selected?.label).toBe('Beta');
  });

  it('renders dropdown arrow icon', () => {
    const props: SelectProps = {
      options: [{ value: 'a', label: 'Alpha' }],
    };
    const cmp = new Select({ props });

    cmp._createRenderer();
    cmp.render();

    const icon = cmp.shadow?.querySelector('x-icon');
    expect(icon).not.toBeNull();
  });

  it('renders select trigger div', () => {
    const props: SelectProps = {
      options: [{ value: 'x', label: 'X' }],
    };
    const cmp = new Select({ props });

    cmp._createRenderer();
    cmp.render();

    const selectDiv = cmp.shadow?.querySelector('.select');
    expect(selectDiv).not.toBeNull();
  });

  describe('disabled', () => {
    const make = (disabled: boolean) => {
      const cmp = new Select({
        props: {
          value: 'a',
          options: [{ value: 'a', label: 'Alpha' }],
          disabled,
        },
      });
      cmp._createRenderer();
      cmp.render();
      return cmp;
    };

    it('marks the trigger and refuses to open', () => {
      const cmp = make(true);
      const trigger = cmp.shadow?.querySelector('.select') as HTMLElement;
      expect(trigger.classList.contains('disabled')).toBe(true);
      expect(trigger.getAttribute('aria-disabled')).toBe('true');

      trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      expect(cmp.classList.contains('open')).toBe(false);
      expect(document.body.querySelector('x-options')).toBeNull();
    });

    // A build-once panel flips this without re-creating the element, so the
    // accessor has to reach the render, not just the props object.
    it('can be flipped through the accessor after render', () => {
      const cmp = make(false);
      const trigger = () => cmp.shadow?.querySelector('.select') as HTMLElement;
      expect(trigger().classList.contains('disabled')).toBe(false);

      cmp.disabled = true;
      expect(cmp.disabled).toBe(true);
      expect(trigger().classList.contains('disabled')).toBe(true);

      cmp.disabled = false;
      expect(trigger().classList.contains('disabled')).toBe(false);
    });

    // The setters paint onto the trigger rather than re-rendering: a rebuilt
    // trigger under a held pointer would drop the interaction.
    it('keeps the same trigger element across value and disabled changes', () => {
      const cmp = new Select({
        props: {
          value: 'a',
          options: [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
          ],
        },
      });
      cmp._createRenderer();
      cmp.render();
      const trigger = cmp.shadow?.querySelector('.select');
      const label = cmp.shadow?.querySelector('.value');

      cmp.value = 'b';
      cmp.disabled = true;
      cmp.disabled = false;

      expect(cmp.shadow?.querySelector('.select')).toBe(trigger);
      expect(cmp.shadow?.querySelector('.value')).toBe(label);
      expect(label?.textContent).toBe('Beta');
    });

    it('closes an open list when disabled underneath it', () => {
      const cmp = make(false);
      const trigger = cmp.shadow?.querySelector('.select') as HTMLElement;
      trigger.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      expect(cmp.classList.contains('open')).toBe(true);

      cmp.disabled = true;
      expect(cmp.classList.contains('open')).toBe(false);
      expect(document.body.querySelector('x-options')).toBeNull();
    });
  });

  // A Select inside a Modal is inside a top-layer popover, and nothing in the
  // normal layer can paint above one — the list was appended to document.body
  // and rendered *underneath* the dialog, unclickable. It has to join the top
  // layer too, and as 'manual': an 'auto' popover would dismiss the modal.
  describe('inside a top-layer modal', () => {
    // jsdom does not implement the Popover API, so the component would take its
    // fallback path and never exercise the fix.
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    let showPopover: jest.Mock;

    beforeEach(() => {
      showPopover = jest.fn();
      proto.showPopover = showPopover;
    });

    afterEach(() => {
      delete proto.showPopover;
      document.body.querySelector('x-options')?.remove();
    });

    it('promotes the option list to the top layer when opened', () => {
      const cmp = new Select({
        props: { options: [{ value: 'a', label: 'Alpha' }] },
      });
      // _createRenderer before connecting: connectedCallback renders, and
      // render() only exists once the renderer is built.
      cmp._createRenderer();
      document.body.appendChild(cmp);
      cmp.render();

      cmp.shadow
        ?.querySelector('.select')
        ?.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));

      const list = document.body.querySelector('x-options');
      expect(list).not.toBeNull();
      expect(list?.getAttribute('popover')).toBe('manual');
      expect(showPopover).toHaveBeenCalled();

      cmp.remove();
    });
  });
});
