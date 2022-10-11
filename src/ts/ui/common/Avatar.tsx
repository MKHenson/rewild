import { styled } from "solid-styled-components";
import { Component, Show } from "solid-js";
import { MaterialIcon } from "../common/MaterialIcon";

interface Props {
  src?: string;
  onClick?: (e: MouseEvent) => void;
}

export const Avatar: Component<Props> = (props) => {
  return (
    <StyledAvatar onClick={props.onClick} class="avatar">
      <Show
        when={props.src}
        fallback={
          <>
            <MaterialIcon icon="person" />
          </>
        }
      >
        <img src={props.src} />
      </Show>
    </StyledAvatar>
  );
};

const StyledAvatar = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 1.25rem;
  line-height: 1;
  border-radius: 50%;
  overflow: hidden;
  user-select: none;
  width: 56px;
  height: 56px;
  background-color: ${(e) => e.theme?.colors.secondary600};
  border: 4px solid ${(e) => e.theme?.colors.secondary400};
  color: ${(e) => e.theme?.colors.onSecondary600};

  img {
    width: 100%;
    height: 100%;
    text-align: center;
    object-fit: cover;
    color: transparent;
    text-indent: 10000px;
  }
`;
