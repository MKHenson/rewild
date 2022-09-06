import { Component, Show } from "solid-js";
import { Modal } from "../common/Modal";
import { Typography } from "../common/Typography";
import { styled } from "solid-styled-components";

export type ErrorType = "WGPU" | "OTHER";

type Props = {
  open: boolean;
  errorMsg: string;
  errorType: ErrorType;
};

export const StartError: Component<Props> = (props) => {
  return (
    <Modal
      hideConfirmButtons
      open={props.open}
      title={props.errorType === "WGPU" ? "WebGPU Not Supported" : "An Error Occurred"}
    >
      <StyledButtons>
        <Show when={props.errorType === "WGPU"} fallback={<Typography variant="body2">{props.errorMsg}</Typography>}>
          <Typography variant="body1">
            WebGPU is available for now in <a href="https://www.google.com/intl/en_ie/chrome/canary/">Chrome Canary</a>{" "}
            on desktop behind an experimental flag. You can enable with the following flag:
            <pre>chrome://flags/#enable-unsafe-webgpu</pre>
          </Typography>
          <Typography variant="body1">
            Work is also in progress in{" "}
            <a href="https://www.mozilla.org/en-US/firefox/channel/desktop/">Firefox Nightly</a>, enabled by the prefs
            below: <pre>dom.webgpu.enabled and gfx.webrender.all</pre>
          </Typography>
          <Typography variant="body1">The API is constantly changing and currently unsafe.</Typography>
        </Show>
      </StyledButtons>
    </Modal>
  );
};

const StyledButtons = styled.div`
  button {
    margin: 1rem 0 0 0;
  }
`;
