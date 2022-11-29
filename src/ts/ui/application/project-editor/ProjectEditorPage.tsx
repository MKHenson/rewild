import { Component, onMount } from "solid-js";
import { styled } from "solid-styled-components";
import { Routes, Route, useNavigate } from "@solidjs/router";
import { Editor } from "./Editor";
import { GameManager } from "../../../core/GameManager";
import { UIEventManager } from "../../../core/UIEventManager";
import { ApplicationEventType } from "../../../../common/EventTypes";
import { ProjectSelector } from "./projectSelector/ProjectSelector";

interface Props {
  gameManager: GameManager;
  eventManager: UIEventManager;
  onQuit: () => void;
}

export const ProjectEditorPage: Component<Props> = (props) => {
  const navigate = useNavigate();
  const onHomeClick = () => {
    props.onQuit();
  };

  onMount(() => {
    props.eventManager.triggerUIEvent(ApplicationEventType.StartEditor);
  });

  return (
    <StyledContainer>
      <Routes>
        <Route
          path="/"
          element={<ProjectSelector onBack={onHomeClick} open onOpen={(uid) => navigate(`/editor/${uid}`)} />}
        />
        <Route path="/:project" element={<Editor onHome={onHomeClick} />} />
      </Routes>
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
