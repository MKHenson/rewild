import { Component, createResource, Show } from "solid-js";
import { Modal } from "../common/Modal";
import { Button } from "../common/Button";
import { Typography } from "../common/Typography";
import { MaterialIcon } from "../common/MaterialIcon";
import { styled } from "solid-styled-components";
import { createClient } from "@urql/core";
import gql from "graphql-tag";
import { System } from "server/models";

const client = createClient({
  url: "http://127.0.0.1:4000/graphql",
});

const QUERY = gql`
  query {
    system {
      status
    }
  }
`;

const [serverActive] = createResource<{ system: System } | null>(() => {
  return client
    .query<{ system: System }>(QUERY, {})
    .toPromise()
    .then((resp) => resp.data || null)
    .catch((err) => null);
});

type Props = {
  open: boolean;
  onStart: () => void;
  onEditor: () => void;
};

export const MainMenu: Component<Props> = (props) => {
  const onOptionsClick = () => {};

  return (
    <Modal hideConfirmButtons open={props.open} title="Rewild">
      <Show when={serverActive.loading}>Loading...</Show>
      <Typography variant="body2">
        Welcome to rewild. A game about exploration, natural history and saving
        the planet
      </Typography>
      <StyledButtons>
        <Button onClick={props.onStart} fullWidth>
          New Game
        </Button>
        <Button onClick={onOptionsClick} fullWidth disabled>
          Options
        </Button>
        <Show when={serverActive()?.system.status === "OK"}>
          <Button onClick={props.onEditor} fullWidth>
            <MaterialIcon icon="build_circle" /> Editor
          </Button>
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
