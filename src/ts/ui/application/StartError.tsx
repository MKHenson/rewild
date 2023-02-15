import { Modal } from "../common/Modal";
import { Typography } from "../common/Typography";
import { Component, register } from "../Component";

export type ErrorType = "WGPU" | "OTHER";

type Props = {
  open: boolean;
  errorMsg: string;
  errorType: ErrorType;
};

@register("x-start-error")
export class StartError extends Component<Props> {
  init() {
    return () => {
      return (
        <Modal
          hideConfirmButtons
          open={this.props.open}
          title={this.props.errorType === "WGPU" ? "WebGPU Not Supported" : "An Error Occurred"}
        >
          <div>
            {this.props.errorType === "WGPU" ? (
              <div>
                <Typography variant="body1">
                  WebGPU is available for now in{" "}
                  <a href="https://www.google.com/intl/en_ie/chrome/canary/">Chrome Canary</a> on desktop behind an
                  experimental flag. You can enable with the following flag:
                  <pre>chrome://flags/#enable-unsafe-webgpu</pre>
                </Typography>
                <Typography variant="body1">
                  Work is also in progress in{" "}
                  <a href="https://www.mozilla.org/en-US/firefox/channel/desktop/">Firefox Nightly</a>, enabled by the
                  prefs below: <pre>dom.webgpu.enabled and gfx.webrender.all</pre>
                </Typography>
                <Typography variant="body1">The API is constantly changing and currently unsafe.</Typography>
              </div>
            ) : (
              <Typography variant="body2">{this.props.errorMsg}</Typography>
            )}
          </div>
        </Modal>
      );
    };
  }

  css() {
    return css`
      button {
        margin: 1rem 0 0 0;
      }
    `;
  }
}
