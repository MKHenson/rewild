import { Typography } from './Typography';
import { Component, register } from '../Component';
import { theme } from '../theme';
import { IconType, MaterialIcon } from './MaterialIcon';

interface Props {
  variant: 'info' | 'error' | 'warning';
  title: string;
  required?: boolean;
}

@register('x-info-box')
export class InfoBox extends Component<Props> {
  init() {
    return () => {
      const variant = this.props.variant;

      const getIcon = (): IconType => {
        switch (variant) {
          case 'info':
            return 'info';
          case 'error':
            return 'error';
          case 'warning':
            return 'warning';
        }
      };

      const getMaterialIconColor = (): string => {
        switch (variant) {
          case 'info':
            return theme.colors.onPrimary600;
          case 'error':
            return theme.colors.onError600;
          case 'warning':
            return theme.colors.warning600;
        }
      };

      return (
        <div class={variant}>
          <div class="icon">
            <MaterialIcon
              icon={getIcon()}
              style={`color: ${getMaterialIconColor()};`}
            />
          </div>
          <div class="content">
            <Typography variant="label">{this.props.title}</Typography>
            <div>
              <Typography variant="body1">
                <slot></slot>
              </Typography>
            </div>
          </div>
        </div>
      );
    };
  }

  getStyle() {
    return StyledInfoBox;
  }
}

const StyledInfoBox = cssStylesheet(css`
  :host {
    width: 100%;
    display: block;
  }

  .info {
    color: ${theme!.colors.onPrimary600};
    background: ${theme!.colors.primary400};
  }

  .error {
    color: ${theme!.colors.onError600};
    background: ${theme!.colors.error400};
  }

  .warning {
    color: ${theme!.colors.onWarning600};
    background: ${theme!.colors.warning400};
  }

  :host > div {
    display: flex;
    padding: 1rem;
  }

  .icon {
    flex: 0 1 content;
    padding: 0 1rem 0 0;
  }

  .content {
    flex: 1;
  }
`);
