import { Component, createSignal } from "solid-js";
import { styled } from "solid-styled-components";
import { GameManager } from "../../core/GameManager";
import { CircularProgress } from "../common/CircularProgress";

type Props = {
  gameManager: GameManager;
};

export const InGameUI: Component<Props> = (props) => {
  const [playerHealth, setPlayerHealth] = createSignal(100);
  const [playerHunger, setPlayerHunger] = createSignal(100);

  const onFrameUpdate = () => {
    if (props.gameManager.player.health !== playerHealth()) {
      setPlayerHealth(props.gameManager.player.health);
    }

    if (props.gameManager.player.hunger !== playerHunger()) {
      setPlayerHunger(props.gameManager.player.hunger);
    }
  };

  props.gameManager.updateCallbacks.push(onFrameUpdate);

  return (
    <StyledContainer>
      <StyledFooter>
        <CircularProgress size={120} value={playerHealth()} strokeSize={20} />
        <CircularProgress size={80} value={playerHunger()} strokeSize={14} />
      </StyledFooter>
    </StyledContainer>
  );
};

const StyledContainer = styled.div`
  width: 100%;
  height: 100%;
  position: absolute;
  pointer-events: none;
`;

const StyledFooter = styled.div`
  pointer-events: initial;
  width: 90%;
  height: 5%;
  min-height: 50px;
  position: absolute;
  bottom: 30px;
  margin: 0 0 0 5%;
  border-radius: 10px;
  box-sizing: border-box;
  color: white;
  justify-content: center;
  align-items: center;
  display: flex;

  > div {
    flex: 0 1 auto;
  }
`;
