import { Component, register, Select } from 'rewild-ui';
import { levelsStore } from 'src/ui/stores/LevelsStore';
import { projectStore } from 'src/ui/stores/ProjectStore';

interface Props {
  readOnly?: boolean;
  value?: string;
  onChange?: (levelId: string) => void;
}

/** Picks one of the project's other levels, or none. */
@register('x-level-select')
export class LevelSelect extends Component<Props> {
  init() {
    this.on(levelsStore.dispatcher);

    return () => {
      const options = [
        { value: '', label: 'None' },
        ...levelsStore.levels
          .filter((level) => level.id !== projectStore.level?.id)
          .map((level) => ({ value: level.id, label: level.name })),
      ];

      return (
        <Select
          options={options}
          value={this.props.value || ''}
          disabled={this.props.readOnly}
          onChange={(levelId) => this.props.onChange?.(levelId as string)}
        />
      );
    };
  }
}
