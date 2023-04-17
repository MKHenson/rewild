import { Typography } from "./Typography";
import { Component, register } from "../Component";
import { theme } from "../theme";
import { MaterialIcon } from "./MaterialIcon";

interface Props {
  variant: "info" | "error";
  title: string;
  required?: boolean;
}

@register("x-info-box")
export class InfoBox extends Component<Props> {
  init() {
    return () => (
      <div class={this.props.variant}>
        <div class="icon">
          {this.props.variant === "info" ? (
            <MaterialIcon icon="info" style={`color: ${theme.colors.onPrimary600};`} />
          ) : (
            <MaterialIcon icon="error" style={`color: ${theme.colors.onError600};`} />
          )}
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
