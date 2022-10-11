import { Component, createResource, Show } from "solid-js";
import { useParams } from "@solidjs/router";
import { styled } from "solid-styled-components";
import { Button } from "../../common/Button";
import { Card } from "../../common/Card";
import { Typography } from "../../common/Typography";
import { Divider } from "../../common/Divider";
import { MaterialIcon } from "../../common/MaterialIcon";
import { Loading } from "../../common/Loading";
import { getProject } from "./ProjectSelectorUtils";

interface Props {
  onHome: () => void;
}

export const Editor: Component<Props> = (props) => {
  const { project: projectId } = useParams<{ project: string }>();
  const [project] = createResource(projectId, getProject);

  return (
    <StyledContainer>
      <StyledTools>
        <Card>
          <Button fullWidth onClick={props.onHome}>
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
          <Show when={!project.loading} fallback={<Loading />}>
            <>
              <Typography variant="h2">{project()?.name}</Typography>
              <Typography variant="light">{project()?.description}</Typography>
            </>
          </Show>
        </Card>
      </StyledProperties>
    </StyledContainer>
  );
};

const StyledContainer = styled.div`
  height: 100%;
  width: 100%;
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
