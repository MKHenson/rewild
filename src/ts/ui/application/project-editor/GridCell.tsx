import { EditorType } from "models";
import { JSX, Component, Show } from "solid-js";
import { styled } from "solid-styled-components";
import { IDragData, getDragData, getDraggedData, setDragData } from "./hooks/useGlobalDragDrop";

interface Props {
  rowStart: number;
  rowEnd: number;
  colStart: number;
  colEnd: number;
  hasElement?: boolean;
  editorElm?: JSX.Element;
  editor?: EditorType;
  onEditorMoved: (type: EditorType, rowStart: number, colStart: number, rowEnd: number, colEnd: number) => void;
}

interface DragData extends IDragData {
  editor: EditorType;
  sizeX: number;
  sizeY: number;
}

export const GridCell: Component<Props> = (props) => {
  const onDragStart = (e: DragEvent) => {
    const dragData: DragData = {
      editor: props.editor!,
      sizeX: props.colEnd - props.colStart,
      sizeY: props.rowEnd - props.rowStart,
      type: "gridcell",
    } as DragData;
    setDragData(e, dragData);
    e.dataTransfer?.setDragImage((e.currentTarget as HTMLDivElement).parentElement!, 0, 0);
  };

  const onDragOverEvent = (e: DragEvent) => {
    const data = getDraggedData();
    if (data?.type === "gridcell") {
      (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "true");
      e.preventDefault();
    }
  };

  const onDragLeaveEvent = (e: DragEvent) => {
    (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "");
    e.preventDefault();
  };

  const onDrop = (e: DragEvent) => {
    const data = getDragData(e) as DragData;
    if (!data || data.type !== "gridcell") return;

    (e.currentTarget as HTMLDivElement).setAttribute("drop-active", "");
    const rowEnd = props.rowStart + data.sizeY;
    const colEnd = props.colStart + data.sizeX;

    props.onEditorMoved(
      data.editor,
      props.rowStart,
      props.colStart,
      rowEnd < props.rowEnd ? props.rowEnd : rowEnd,
      colEnd < props.colEnd ? props.colEnd : colEnd
    );
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
      <Show when={props.hasElement}>
        <div class="content">
          {props.editorElm}
          <div class="dragger" draggable={true} onDragStart={onDragStart} />
          <div
            class="sizer sizerRight_shrink"
            onClick={(e) =>
              props.onEditorMoved(props.editor!, props.rowStart, props.colStart, props.rowEnd, props.colEnd - 1)
            }
          >
            -
          </div>
          <div
            class="sizer sizerRight_expand"
            onClick={(e) =>
              props.onEditorMoved(props.editor!, props.rowStart, props.colStart, props.rowEnd, props.colEnd + 1)
            }
          >
            +
          </div>
          <div
            class="sizer sizerHeight_shrink"
            onClick={(e) =>
              props.onEditorMoved(props.editor!, props.rowStart, props.colStart, props.rowEnd - 1, props.colEnd)
            }
          >
            -
          </div>
          <div
            class="sizer sizerHeight_expand"
            onClick={(e) =>
              props.onEditorMoved(props.editor!, props.rowStart, props.colStart, props.rowEnd + 1, props.colEnd)
            }
          >
            +
          </div>
        </div>
      </Show>
    </StyledContainer>
  );
};

const StyledContainer = styled.div`
  height: 100%;
  width: 100%;
  background: transparent;

  .content {
    height: 100%;
    width: 100%;
    overflow: auto;
    padding: 0 5px 5px 5px;
    box-sizing: border-box;
    position: relative;
  }

  &[drop-active="true"] {
    background: #1e5ebf7f;
  }

  .sizer {
    transition: 0.3s width, 0.3s height, 0.3s opacity;
    position: absolute;
    width: 0px;
    height: 0px;
    background: transparent;
    cursor: pointer;
    overflow: hidden;
    color: #fff;
    font-size: 12px;
    text-align: center;
    line-height: 12px;
    border-radius: 50%;
    opacity: 0;
    transform: scale(1);
  }

  .sizer:active {
    transform: scale(0.8);
  }

  .sizerRight_shrink {
    right: -0;
    top: calc(50% - 8px);
  }
  .sizerRight_expand {
    right: -0;
    top: calc(50% + 8px);
  }

  .sizerHeight_shrink {
    right: calc(50% + 8px);
    bottom: -0;
  }
  .sizerHeight_expand {
    right: calc(50% - 8px);
    bottom: -0;
  }

  .content:hover .sizer {
    background: transparent;
    background: #3b5db4;
    width: 12px;
    height: 12px;
    opacity: 1;
  }

  .content:hover .sizer:hover {
    background: #213464;
  }

  .dragger {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 5px;
    background: transparent;
    cursor: move;
  }

  .content:hover .dragger {
    background: #3b5db4;
  }

  .content:hover .dragger:hover {
    background: #213464;
  }

  .card {
    width: 100%;
    height: 100%;
  }
`;
