import {
  CustomEditorType,
  IOption,
  IValueOptions,
  PropValueObject,
  PropValueType,
  Vector3,
} from 'models';
import {
  theme,
  Component,
  register,
  Switch,
  Select,
  Vec3,
  NumberInput,
} from 'rewild-ui';
import { CameraCapture } from './custom-value-editors/CameraCapture';

interface Props<T> {
  type: PropValueType;
  customEditor?: CustomEditorType;
  value?: T;
  options?: IOption[];
  valueOptions?: IValueOptions;
  readonly?: boolean;
  onChange?: (newValue: T) => void;
  refocus: boolean;
}

@register('x-property-value')
export class PropertyValue<T extends any> extends Component<Props<T>> {
  init() {
    const getEditor = (type: PropValueType) => {
      const value = this.props.value;
      const onChange = this.props.onChange;

      if (this.props.customEditor === 'camera-capture') {
        return (
          <CameraCapture
            readOnly={this.props.readonly}
            value={value as PropValueObject}
            onChange={(value) => onChange?.(value as T)}
          />
        );
      }

      switch (type) {
        case 'string':
          return (
            <input
              class="input-val"
              readOnly={this.props.readonly}
              value={(value as string) || ''}
              onblur={(e) => {
                onChange?.(e.currentTarget.value as T);
              }}
              onkeydown={(e) => {
                if (!onChange) return;
                if (e.key === 'Enter') onChange(e.currentTarget.value as T);
              }}
            />
          );
        case 'float':
          return (
            <NumberInput
              className="input-val"
              min={this.props.valueOptions?.min}
              max={this.props.valueOptions?.max}
              step={this.props.valueOptions?.step}
              precision={this.props.valueOptions?.precision}
              disabled={this.props.readonly}
              value={(value as number) || 0}
              onChange={(e) => {
                onChange?.(e as T);
              }}
            />
          );
        case 'boolean':
          return (
            <Switch
              checked={value as boolean}
              onClick={(e) => {
                if (!onChange) return;
                onChange(!value as boolean as T);
              }}
            />
          );
        case 'enum':
          return (
            <Select
              options={this.props.options || []}
              value={value as string}
              onChange={(e) => {
                if (!onChange) return;
                onChange(e as T);
              }}
            />
          );
        case 'vec3':
          return (
            <Vec3
              value={value as Vector3}
              autoFocus={this.props.refocus}
              onChange={(e) => {
                if (!onChange) return;
                onChange(e as T);
              }}
            />
          );
        default:
          return null;
      }
    };

    this.onMount = this.props.refocus
      ? () => {
          const input = this.shadow?.querySelector(
            '.input-val'
          ) as HTMLInputElement;
          if (input) {
            input.focus();
            input.select();
          }
        }
      : undefined;

    return () => [getEditor(this.props.type)];
  }

  getStyle() {
    return StyledPropValue;
  }
}

const StyledPropValue = cssStylesheet(css`
  .input-val {
    width: 100%;
    outline: none;
    border: none;
    box-sizing: border-box;
    height: 100%;
  }

  :host([readonly]) {
    background: ${theme.colors.subtle400};
  }
`);
