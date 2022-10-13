import { JSX, Component, Show } from "solid-js";
import { styled } from "solid-styled-components";

interface Props {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  index: number;
  editorElm?: JSX.Element;
  editor?: string;
  onEditorMoved: (type: string, row: number, col: number) => void;
}

export const GridCell: Component<Props> = (props) => {
  const onDragStart = (e: DragEvent) => {
    e.dataTransfer?.setData("text", props.editor!);
    e.dataTransfer?.setDragImage((e.currentTarget as HTMLDivElement).parentElement!, 0, 0);
  };

  const onDragOverEvent = (e: DragEvent) => {
    (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "true");
    e.preventDefault();
  };

  const onDragLeaveEvent = (e: DragEvent) => {
    (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "");
    e.preventDefault();
  };

  const onDrop = (e: DragEvent) => {
    (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "");
    const data = e.dataTransfer?.getData("text");
    props.onEditorMoved(data!, props.rowStart, props.colStart);
  };

  const onDragEndEvent = (e: DragEvent) => {
    e.preventDefault();
  };

  return (
    <StyledContainer
      onDragOver={onDragOverEvent}
      onDragLeave={onDragLeaveEvent}
      onDragEnd={onDragEndEvent}
      onDrop={onDrop}
      style={{ "grid-area": `${props.rowStart} / ${props.colStart} / ${props.rowEnd} / ${props.colEnd}` }}
    >
      <Show when={props.editorElm}>
        <>
          <div class="dragger" draggable={true} onDragStart={onDragStart} />
          <div class="sizer sizerX" />
          <div class="sizer sizerY" />
          <div class="content">{props.editorElm}</div>
        </>
      </Show>
    </StyledContainer>
  );
};

const StyledContainer = styled.div`
  height: 100%;
  width: 100%;
  position: relative;

  .content {
    height: 100%;
    width: 100%;
    overflow: auto;
    padding: 5px;
    box-sizing: border-box;
  }

  &[drop-active="true"] {
    box-shadow: inset 0px 0px 0px 2px #00c;
  }

  .sizer {
    position: absolute;
    width: 10px;
    height: 10px;
    background: transparent;
  }
  .sizerX {
    right: -0;
    top: calc(50% - 5px);
  }
  .sizerY {
    right: calc(50% - 5px);
    bottom: -0;
  }
  &:hover .sizer {
    background: transparent;
    background: #3b5db4;
  }

  .dragger {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 5px;
    background: transparent;
  }

  &:hover .dragger {
    background: #3b5db4;
  }

  .card {
    width: 100%;
    height: 100%;
  }
`;
