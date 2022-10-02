import { Component, createSignal } from "solid-js";
import { styled } from "solid-styled-components";
import { Button } from "../../common/Button";
import { Card } from "../../common/Card";
import { Typography } from "../../common/Typography";
import { Divider } from "../../common/Divider";
import { MaterialIcon } from "../../common/MaterialIcon";
import { GameManager } from "../../../core/GameManager";
import { UIEventManager } from "../../../core/UIEventManager";
import { ProjectSelector } from "./ProjectSelector";
import { Dynamic } from "solid-js/web";
interface Props {
  gameManager: GameManager;
  eventManager: UIEventManager;
  onQuit: () => void;
}

type ActiveMenu = "menu" | "editor";

export const Editor: Component<Props> = (props) => {
  const [activeMenu, setActiveMenu] = createSignal<ActiveMenu>("menu");

  const onHomeClick = () => {
    props.onQuit();
  };

  const options: { [key in ActiveMenu]: Component } = {
    menu: () => <ProjectSelector onBack={onHomeClick} open onOpen={(uid) => setActiveMenu("editor")} />,
    editor: () => (
      <>
        <StyledTools>
          <Card>
            <Button fullWidth onClick={onHomeClick}>
              <MaterialIcon icon="home" size="s" /> Home
            </Button>
            <Divider />
            <Typography variant="h3">Tools</Typography>
          </Card>
        </StyledTools>
        <StyledBody></StyledBody>
        <StyledProperties>
          <Card>
            <Typography variant="h3">Properties</Typography>
          </Card>
        </StyledProperties>
      </>
    ),
  };

  return (
    <StyledContainer>
      <Dynamic component={options[activeMenu()]}></Dynamic>
    </StyledContainer>
  );
};

const StyledContainer = styled.div`
  height: 100%;
  width: 100%;
  top: 0;
  left: 0;
  position: absolute;
  display: flex;
  box-sizing: border-box;
`;

const StyledTools = styled.div`
  flex: 1;
  max-width: 300px;
  box-sizing: border-box;
  padding: 1rem;

  .divider {
    margin: 1rem 0;
  }
`;

const StyledBody = styled.div`
  box-sizing: border-box;
  flex: 1;
`;

const StyledProperties = styled.div`
  flex: 1;
  max-width: 300px;
  padding: 1rem;
`;
