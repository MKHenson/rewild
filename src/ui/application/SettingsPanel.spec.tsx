import 'rewild-ui/compiler/jsx';
import { QualitySettings } from 'rewild-renderer/lib/utils/QualitySettings';
import { Select, Tab } from 'rewild-ui';
import { flushMicrotasks } from 'rewild-ui/lib/test-utils';
import { SettingsPanel } from './SettingsPanel';

// No viewport is mounted, so getQualitySettings() falls back to a standalone
// QualitySettings — which reads and writes localStorage. That is what these
// tests seed and assert against, rather than mocking the accessor: it is the
// same path the main menu takes, where there is no renderer either.
const stored = () => new QualitySettings();

describe('SettingsPanel', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => document.body.replaceChildren());

  // Connected rather than just rendered: the Modal's own buttons only exist
  // once it has run its render, which connectedCallback is what triggers.
  function createPanel() {
    const onClose = jest.fn();
    const panel = (<SettingsPanel onClose={onClose} />) as SettingsPanel;
    document.body.appendChild(panel);
    return { panel, onClose };
  }

  /** The selects, in render order: overall tier first, then one per aspect. */
  const selectsOf = (panel: SettingsPanel) =>
    Array.from(panel.shadow!.querySelectorAll('x-select')) as Select[];

  /** Modal renders its own buttons into its shadow root, not the panel's. */
  const buttonLabelled = (panel: SettingsPanel, label: string) => {
    const modal = panel.shadow!.querySelector('x-modal') as HTMLElement & {
      shadow: ShadowRoot;
    };
    return Array.from(modal.shadow.querySelectorAll('x-button')).find(
      (button) => button.textContent?.trim() === label
    ) as HTMLElement;
  };

  async function change(select: Select, value: string) {
    select.props.onChange!(value);
    await flushMicrotasks();
  }

  it('renders a Display tab', () => {
    const { panel } = createPanel();

    const tab = panel.shadow!.querySelector('x-tab') as Tab;
    expect(tab.props.label).toBe('Display');
  });

  it('renders a select for the overall tier and one per aspect', () => {
    const { panel } = createPanel();

    // clouds, cloudShadows, godRays and bloom, plus the overall tier.
    expect(selectsOf(panel).length).toBe(5);
  });

  it('seeds the draft from the stored settings', () => {
    stored().apply('medium', { clouds: 'low' });
    const { panel } = createPanel();

    const [overall, clouds, cloudShadows] = selectsOf(panel);
    expect(overall.props.value).toBe('medium');
    expect(clouds.props.value).toBe('low');
    expect(cloudShadows.props.value).toBe('medium');
  });

  it('shows the overall tier for aspects that are not pinned', () => {
    stored().level = 'low';
    const { panel } = createPanel();

    expect(selectsOf(panel).map((s) => s.props.value)).toEqual([
      'low',
      'low',
      'low',
      'low',
      'low',
    ]);
  });

  describe('editing', () => {
    it('does not touch the live settings until Apply', async () => {
      const { panel } = createPanel();

      await change(selectsOf(panel)[0], 'low');

      expect(stored().level).toBe('high');
    });

    it('commits the overall tier on Apply', async () => {
      const { panel } = createPanel();

      await change(selectsOf(panel)[0], 'low');
      buttonLabelled(panel, 'Apply').click();

      expect(stored().level).toBe('low');
    });

    it('commits a per-aspect change on Apply', async () => {
      const { panel } = createPanel();

      await change(selectsOf(panel)[1], 'low');
      buttonLabelled(panel, 'Apply').click();

      expect(stored().aspect('clouds')).toBe('low');
      expect(stored().aspect('bloom')).toBe('high');
    });

    // The overall tier is the coarse control — it has to be able to undo
    // per-aspect tinkering the user can no longer see from that dropdown.
    it('resets every sub-section when the overall tier changes', async () => {
      const { panel } = createPanel();

      await change(selectsOf(panel)[1], 'low');
      await change(selectsOf(panel)[0], 'ultra');

      expect(selectsOf(panel).map((s) => s.props.value)).toEqual([
        'ultra',
        'ultra',
        'ultra',
        'ultra',
        'ultra',
      ]);
    });

    it('drops a pin set back to the overall tier', async () => {
      const { panel } = createPanel();

      await change(selectsOf(panel)[1], 'low');
      await change(selectsOf(panel)[1], 'high');
      buttonLabelled(panel, 'Apply').click();

      expect(stored().overrides).toEqual({});
    });
  });

  describe('closing', () => {
    it('reports Cancel to the owner without applying', async () => {
      const { panel, onClose } = createPanel();

      await change(selectsOf(panel)[0], 'low');
      buttonLabelled(panel, 'Cancel').click();

      expect(onClose).toHaveBeenCalled();
      expect(stored().level).toBe('high');
    });

    it('reports Apply to the owner too, so the dialog closes', () => {
      const { panel, onClose } = createPanel();

      buttonLabelled(panel, 'Apply').click();

      expect(onClose).toHaveBeenCalled();
    });

    // The owner drops this component when onClose fires, so the draft goes with
    // it — the next visit seeds from the stored settings rather than from
    // whatever was abandoned last time.
    it('leaves no draft behind for the next visit', async () => {
      const { panel } = createPanel();
      await change(selectsOf(panel)[0], 'low');
      buttonLabelled(panel, 'Cancel').click();
      panel.remove();

      const { panel: reopened } = createPanel();

      expect(selectsOf(reopened)[0].props.value).toBe('high');
    });

    it('picks up a change made elsewhere since the last visit', () => {
      stored().level = 'ultra';

      const { panel } = createPanel();

      expect(selectsOf(panel)[0].props.value).toBe('ultra');
    });
  });
});
